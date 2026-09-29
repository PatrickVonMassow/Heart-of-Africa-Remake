#!/usr/bin/env node
// The only writer for the cloud offload switch (point 1230).
//
//   node scripts/cloud-switch.mjs --status
//   node scripts/cloud-switch.mjs --venue          the routing read: where authoring delegations start
//   node scripts/cloud-switch.mjs --record-probe <ref> [--credit-confirmed "<user quote>"]
//   node scripts/cloud-switch.mjs --unreachable "<what failed>"   a cloud launch failed: route local
//   node scripts/cloud-switch.mjs --on  --reason "<user instruction>"
//   node scripts/cloud-switch.mjs --off --reason "<user instruction>"
//
// --record-probe reads docs/probes/1230-cloud-marker.txt from the pushed probe branch and
// compares its host with this container; --on refuses until that probe passed.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { dirname, sep as sep_ } from 'node:path'
import { writeJsonAtomic } from './atomic-write.mjs'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { statePathFrom } from './fable-switch-core.mjs'
import {
  STATE_FILE_NAME,
  authoringVenue,
  readState,
  recordProbe,
  recordUnreachable,
  statusReport,
  venueInstruction,
  writeState,
} from './cloud-switch-core.mjs'

export const PROBE_FILE = 'docs/probes/1230-cloud-marker.txt'

const git = (args) =>
  spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    // Bounded: the session-start hook imports this module; a stuck git must not stall orientation.
    timeout: 10000,
  })

export const STATE_FILE =
  process.env.CLOUD_SWITCH_FILE ||
  statePathFrom(git(['rev-parse', '--path-format=absolute', '--git-common-dir']).stdout ?? '', REPO_ROOT, {
    sep: sep_,
  }).replace(/fable-switch\.json$/, STATE_FILE_NAME)

/** Read afresh on every call, so a flip is visible to every reader at once. */
export function currentCloudState(file = STATE_FILE) {
  try {
    return readState(existsSync(file) ? readFileSync(file, 'utf8') : null)
  } catch (error) {
    return {
      ok: false,
      state: null,
      probe: null,
      problem: `the cloud switch state is unreadable (${error.message})`,
    }
  }
}

/** The routing read every authoring delegation consults. */
export function currentVenue(file = STATE_FILE) {
  return authoringVenue(currentCloudState(file))
}

function setterIdentity() {
  if (String(process.env.CLOUD_SWITCH_SET_BY ?? '').trim()) return process.env.CLOUD_SWITCH_SET_BY.trim()
  return String(git(['config', 'user.name']).stdout ?? '').trim() || String(process.env.USER ?? '').trim()
}

function localMachineId() {
  try {
    return readFileSync('/etc/machine-id', 'utf8').trim()
  } catch {
    return ''
  }
}

/** Parse the `label: value` lines the cloud author wrote. */
export function parseMarker(text) {
  const field = (label) =>
    (String(text ?? '').match(new RegExp(`^${label}:[ \\t]*(\\S[^\\r\\n]*)$`, 'm'))?.[1] ?? '').trim()
  const machineId = field('machine-id')
  return {
    remoteHost: field('hostname'),
    remoteMachineId: machineId === 'absent' ? '' : machineId,
  }
}

function recordProbeFrom(ref, creditConfirmed) {
  const remoteRef = ref.startsWith('origin/') ? ref : `origin/${ref}`
  git(['fetch', '--quiet', 'origin', ref.replace(/^origin\//, '')])
  const shown = git(['show', `${remoteRef}:${PROBE_FILE}`])
  if (shown.status !== 0) throw new Error(`no ${PROBE_FILE} on ${remoteRef}: ${String(shown.stderr ?? '').trim()}`)
  const current = currentCloudState()
  const probe = {
    branch: remoteRef,
    ...parseMarker(shown.stdout),
    localHost: hostname(),
    localMachineId: localMachineId(),
    creditConfirmed,
    at: Date.now(),
  }
  save(recordProbe(current.ok ? current : null, probe, { by: setterIdentity() }))
}

function save(record, file = STATE_FILE) {
  mkdirSync(dirname(file), { recursive: true })
  writeJsonAtomic(file, record)
}

export const usage = () =>
  'usage: node scripts/cloud-switch.mjs --status | --venue | --record-probe <ref> [--credit-confirmed "<user quote>"] | ' +
  '--unreachable "<what failed>" | --on --reason "<user instruction>" | --off --reason "<user instruction>"'

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  try {
    if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
      console.log(usage())
      process.exit(0)
    }
    if (argv.length === 1 && argv[0] === '--status') {
      console.log(statusReport(currentCloudState()))
      process.exit(0)
    }
    if (argv.length === 1 && argv[0] === '--venue') {
      const route = currentVenue()
      console.log(`${route.venue}\n${venueInstruction(route)}`)
      process.exit(0)
    }
    if (
      argv[0] === '--record-probe' &&
      argv[1] &&
      (argv.length === 2 || (argv.length === 4 && argv[2] === '--credit-confirmed'))
    ) {
      recordProbeFrom(argv[1], argv[3] ?? '')
      console.log(statusReport(currentCloudState()))
      process.exit(0)
    }
    if (argv.length === 2 && argv[0] === '--unreachable') {
      save(recordUnreachable(currentCloudState(), argv[1], { by: setterIdentity() }))
      console.log(statusReport(currentCloudState()))
      process.exit(0)
    }
    const direction = argv[0] === '--on' ? 'on' : argv[0] === '--off' ? 'off' : ''
    if (!direction || argv.length !== 3 || argv[1] !== '--reason') {
      console.error(usage())
      process.exit(2)
    }
    const current = currentCloudState()
    save(
      writeState(current.ok ? current : null, direction, {
        reason: argv[2],
        by: setterIdentity(),
      }),
    )
    console.log(statusReport(currentCloudState()))
    process.exit(0)
  } catch (error) {
    console.error(`cloud-switch: ${String((error && error.message) || error).replace(/^cloud-switch: /, '')}`)
    process.exit(1)
  }
}
