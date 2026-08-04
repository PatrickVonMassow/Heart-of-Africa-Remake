#!/usr/bin/env node
// ADDITIVE allowlist top-up for the dev container's egress firewall.
//
// WHY THIS EXISTS (incident 04.08.2026): the only tool the session had for "one
// more host has to be reachable" was `sudo /usr/local/bin/init-firewall.sh` —
// the container's full rebuild. That script FLUSHES every chain and destroys the
// ipset at the top while the default policies stay DROP (a flush clears rules,
// never policies), so from its first line until its last the container is
// sealed. The Bash tool's two-minute default timeout killed one such run at
// exit 143 and the session died with ConnectionRefused: no network, no way to
// ask for help, nothing left to run.
//
// This script is the answer to the common case. It NEVER flushes, NEVER
// destroys, NEVER touches a policy or a chain — it only adds addresses to the
// existing `allowed-domains` ipset. Every failure mode therefore leaves the
// firewall exactly as it was: an add that fails adds nothing. It cannot seal the
// container, which is the whole reason it is a separate script rather than a
// flag on the rebuild.
//
//   node scripts/firewall-allow.mjs cdn.example.com
//   node scripts/firewall-allow.mjs 1.2.3.4 10.0.0.0/8
//   node scripts/firewall-allow.mjs storage.googleapis.com --cidr24
//   node scripts/firewall-allow.mjs api.example.com --dry-run
//
// `--cidr24` adds the /24 around each resolved address, for the rotating CDN
// pools where the address resolved now is not the one the download lands on
// minutes later (the reason init-firewall.sh already does this for
// storage.googleapis.com).
//
// A top-up is NOT persistent: the ipset lives in the kernel and a container
// restart re-runs init-firewall.sh from scratch. A host that is needed on every
// boot belongs in the domain list of `.devcontainer/init-firewall.sh` — this
// script says so when it succeeds, so a one-off does not quietly become the
// permanent arrangement.
import { execFileSync } from 'node:child_process'
import { promises as dns } from 'node:dns'
import { isMainModule } from './is-main.mjs'

/** The ipset init-firewall.sh creates and the OUTPUT chain matches against. */
export const DEFAULT_SET = 'allowed-domains'

/** Per-command ceiling. An `ipset add` is instant; anything slower is stuck. */
export const COMMAND_TIMEOUT_MS = 10_000

/** DNS ceiling. The firewall permits port 53 unconditionally, so this is fast. */
export const RESOLVE_TIMEOUT_MS = 15_000

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
const IPV4_CIDR = /^(?:\d{1,3}\.){3}\d{1,3}\/(?:3[0-2]|[12]?\d)$/
const DOMAIN = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i

/** Is every octet in range? A regex alone lets 999.1.1.1 through. */
export function isIpv4(token) {
  if (!IPV4.test(String(token ?? ''))) return false
  return String(token).split('.').every((o) => Number(o) <= 255 && String(Number(o)) === o)
}

/** An IPv4 CIDR block, octets and prefix both in range. */
export function isIpv4Cidr(token) {
  const s = String(token ?? '')
  if (!IPV4_CIDR.test(s)) return false
  return isIpv4(s.split('/')[0])
}

/** A resolvable host name — deliberately strict, so a typo'd flag is not one. */
export function isDomain(token) {
  return DOMAIN.test(String(token ?? ''))
}

/** The /24 an address sits in: 34.5.6.7 → 34.5.6.0/24. */
export function to24(ip) {
  const parts = String(ip).split('.')
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
}

/**
 * Split the argv into targets and options, and REJECT anything that is neither a
 * domain, an address nor a known flag. A silently ignored target would be the
 * worst outcome here: the caller would believe a host was opened and debug the
 * wrong layer for an hour.
 */
export function parseArgs(argv = []) {
  const targets = []
  const unknown = []
  const opts = { cidr24: false, dryRun: false, set: DEFAULT_SET }
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i])
    if (a === '--cidr24') opts.cidr24 = true
    else if (a === '--dry-run' || a === '-n') opts.dryRun = true
    else if (a === '--set') opts.set = String(argv[++i] ?? DEFAULT_SET)
    else if (a.startsWith('-')) unknown.push(a)
    else if (isIpv4(a) || isIpv4Cidr(a) || isDomain(a)) targets.push(a)
    else unknown.push(a)
  }
  return { targets, opts, unknown }
}

/**
 * The ipset arguments for one entry. The ONLY mutating command this script ever
 * builds, and `add … -exist` is idempotent — re-running it is a no-op, never a
 * change of state that some later step has to undo.
 */
export function addArgs(set, entry) {
  return ['ipset', 'add', set, entry, '-exist']
}

/**
 * Which entries a target contributes. Pure, so the expansion is testable without
 * a resolver: `resolved` is the address list DNS gave for a domain.
 */
export function entriesFor(target, resolved = [], { cidr24 = false } = {}) {
  if (isIpv4Cidr(target)) return [target]
  if (isIpv4(target)) return cidr24 ? [to24(target)] : [target]
  const out = []
  for (const ip of resolved) {
    if (!isIpv4(ip)) continue
    out.push(cidr24 ? to24(ip) : ip)
  }
  return [...new Set(out)]
}

/** Run one command, capture its output, never inherit a shell. */
function run(args, { timeout = COMMAND_TIMEOUT_MS } = {}) {
  return execFileSync('sudo', ['-n', ...args], {
    encoding: 'utf8',
    timeout,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/**
 * Does the ipset exist? `ipset list -n` only NAMES the sets — read-only and
 * instant, no member dump.
 *
 * A missing set is not something this script repairs. Creating it would produce
 * a set nothing matches against (the OUTPUT rule referencing it is gone too),
 * i.e. a silent no-op dressed as success. A missing set means the firewall
 * itself is gone, and the answer to that is the rebuild.
 */
export function setExists(set) {
  try {
    const out = run(['ipset', 'list', '-n'], { timeout: COMMAND_TIMEOUT_MS })
    return out.split('\n').some((line) => line.trim() === set)
  } catch {
    return false
  }
}

/** Resolve a host to IPv4 addresses, bounded. */
async function resolve4(host) {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`DNS timeout for ${host}`)), RESOLVE_TIMEOUT_MS).unref(),
  )
  return Promise.race([dns.resolve4(host), timer])
}

async function main(argv) {
  const { targets, opts, unknown } = parseArgs(argv)
  if (unknown.length) {
    console.error(`firewall-allow: not a host, address or known flag: ${unknown.join(', ')}`)
    console.error('usage: node scripts/firewall-allow.mjs <domain|ip|cidr>… [--cidr24] [--dry-run] [--set <name>]')
    return 1
  }
  if (!targets.length) {
    console.error('usage: node scripts/firewall-allow.mjs <domain|ip|cidr>… [--cidr24] [--dry-run] [--set <name>]')
    console.error('Adds to the existing allowlist. It never flushes and never rebuilds —')
    console.error('for a full rebuild use: node scripts/firewall-rebuild.mjs --run')
    return 1
  }

  if (!opts.dryRun && !setExists(opts.set)) {
    console.error(
      `firewall-allow: ipset "${opts.set}" does not exist. That means the firewall is not up at all,\n` +
        'not that a host is missing from it — adding to a set nothing matches against would look like\n' +
        'success and change nothing. Rebuild instead:\n' +
        '  node scripts/firewall-rebuild.mjs --run',
    )
    return 2
  }

  const planned = []
  for (const target of targets) {
    let resolved = []
    if (isDomain(target)) {
      try {
        resolved = await resolve4(target)
      } catch (e) {
        console.error(`firewall-allow: could not resolve ${target}: ${e && e.message}`)
        return 3
      }
      if (!resolved.length) {
        console.error(`firewall-allow: ${target} resolved to no IPv4 address`)
        return 3
      }
    }
    for (const entry of entriesFor(target, resolved, opts)) planned.push({ target, entry })
  }

  let added = 0
  for (const { target, entry } of planned) {
    const args = addArgs(opts.set, entry)
    if (opts.dryRun) {
      console.log(`would run: sudo -n ${args.join(' ')}   # ${target}`)
      continue
    }
    try {
      run(args)
      added++
      console.log(`added ${entry} for ${target}`)
    } catch (e) {
      // Additive by construction: a failed add left the firewall untouched, so
      // there is nothing to roll back and no reason to abandon the rest.
      console.error(`firewall-allow: could not add ${entry} for ${target}: ${e && e.message}`)
    }
  }

  if (opts.dryRun) {
    console.log(`\n${planned.length} entr${planned.length === 1 ? 'y' : 'ies'} planned — nothing was changed.`)
    return 0
  }
  console.log(`\n${added}/${planned.length} entries added to "${opts.set}".`)
  console.log(
    'This is a RUNTIME top-up: the ipset lives in the kernel and a container restart re-runs\n' +
      'init-firewall.sh from scratch. A host needed on every boot belongs in the domain list of\n' +
      '.devcontainer/init-firewall.sh.',
  )
  return added === planned.length ? 0 : 4
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(`firewall-allow: ${e && e.message}`)
      process.exit(1)
    })
}
