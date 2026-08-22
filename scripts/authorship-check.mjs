#!/usr/bin/env node
// Check an artefact's claimed author against per-message session metadata.
//
//   node scripts/authorship-check.mjs --artifact <file> --at <ISO timestamp> \
//       --transcript <session.jsonl> [--claimed <model>] [--json]
//
// `--claimed` is for line-list/derived artefacts with no heading; otherwise the
// JSON `model` field or first markdown heading is read. A missing transcript is
// reported as UNVERIFIED, never accepted as agreement. A disagreement exits 1;
// unreadable/unclaimed evidence exits 2.
import { readFileSync } from 'node:fs'
import { isMainModule } from './is-main.mjs'
import {
  checkAuthorship,
  claimedModelFromArtifact,
  formatAuthorship,
} from './authorship-check-core.mjs'

export const FLAG_SPEC = Object.freeze({
  '--artifact': true,
  '--at': true,
  '--transcript': true,
  '--claimed': true,
  '--json': false,
})

export function parseArgs(argv = []) {
  const values = {}
  const errors = []
  const seen = new Set()
  const args = (Array.isArray(argv) ? argv : []).map(String)
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]
    if (!Object.hasOwn(FLAG_SPEC, flag)) {
      errors.push(`unknown argument "${flag}"`)
      continue
    }
    if (seen.has(flag)) {
      errors.push(`${flag} given more than once`)
      if (FLAG_SPEC[flag] && args[i + 1] !== undefined && !args[i + 1].startsWith('--')) i++
      continue
    }
    seen.add(flag)
    const key = flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    if (!FLAG_SPEC[flag]) {
      values[key] = true
      continue
    }
    const value = args[i + 1]
    if (value === undefined || value.startsWith('--')) {
      errors.push(`${flag} expects a value`)
      continue
    }
    values[key] = value
    i++
  }
  if (!values.artifact) errors.push('--artifact names the file whose author is claimed')
  if (!values.at) errors.push('--at names when the artefact was produced (ISO timestamp or epoch ms)')
  return { ok: errors.length === 0, values, errors }
}

export const usage = () =>
  'usage: node scripts/authorship-check.mjs --artifact <file> --at <ISO timestamp> \\\n' +
  '           [--transcript <session.jsonl>] [--claimed <model>] [--json]\n' +
  '\nThe comparison uses message.model at the artefact timestamp, per message and including\n' +
  'delegated sidechains. A missing transcript is printed as UNVERIFIED, never agreement.'

export function readOptional(path) {
  if (!String(path ?? '').trim()) return null
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

if (isMainModule(import.meta.url)) {
  const parsed = parseArgs(process.argv.slice(2))
  if (!parsed.ok) {
    for (const error of parsed.errors) console.error(`authorship-check: ${error}`)
    console.error(`\n${usage()}`)
    process.exit(2)
  }
  const { artifact, at, transcript = '', claimed = '', json = false } = parsed.values
  let artifactText
  try {
    artifactText = readFileSync(artifact, 'utf8')
  } catch (error) {
    console.error(`authorship-check: cannot read ${artifact}: ${(error && error.message) || error}`)
    process.exit(2)
  }
  const result = checkAuthorship({
    claimedModel: claimed || claimedModelFromArtifact(artifactText),
    artifactAt: at,
    transcriptText: readOptional(transcript),
  })
  console.log(json ? JSON.stringify({ artifact, transcript: transcript || null, ...result }, null, 2) : formatAuthorship(result, artifact))
  process.exit(result.status === 'agreement' ? 0 : result.status === 'disagreement' ? 1 : 2)
}
