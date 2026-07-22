// Dependency audit gate (CLAUDE.md §7.1 pt.18). `npm audit` fails the whole run
// on ANY vulnerability, including ones with NO upstream fix — which then blocks
// CI indefinitely. The rule is: a vulnerability with no upstream fix is RECORDED
// here with its advisory ID (not silently ignored), while every NEW advisory
// still fails loudly. This wraps `npm audit --json`, tolerates the recorded
// allowlist, and exits non-zero for anything else.
import { execSync } from 'node:child_process'

// KNOWN + ACCEPTED advisories (no upstream fix). Re-check periodically for a fix.
const ALLOW = new Map([
  [
    'GHSA-f88m-g3jw-g9cj',
    'sharp/libvips (CVE-2026-33327/33328/35590/35591): a TRANSITIVE Node dep of ' +
      'kokoro-js (@huggingface/transformers). sharp is NOT in the browser bundle ' +
      '(the client TTS runs on onnxruntime/WASM) and is not run at build time, so ' +
      'it is not exploitable in the shipped game. No upstream fix as of 22.07.2026.',
  ],
])

let json
try {
  const out = execSync('npm audit --json', { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  json = JSON.parse(out)
} catch (e) {
  // npm audit exits non-zero when vulnerabilities exist; the JSON is still stdout.
  try {
    json = JSON.parse(e.stdout)
  } catch {
    console.error('audit-check: could not run/parse `npm audit --json`')
    process.exit(1)
  }
}

const advisories = new Map() // GHSA id -> { name, severity, url }
for (const v of Object.values(json.vulnerabilities ?? {})) {
  for (const via of v.via ?? []) {
    if (via && typeof via === 'object' && via.url) {
      const id = (via.url.match(/GHSA-[\w-]+/) ?? [via.url])[0]
      advisories.set(id, { name: via.name, severity: via.severity, url: via.url })
    }
  }
}

const accepted = [...advisories.keys()].filter((id) => ALLOW.has(id))
const unexpected = [...advisories.entries()].filter(([id]) => !ALLOW.has(id))

for (const id of accepted) console.log(`audit-check: ACCEPTED (no upstream fix, recorded) ${id} — ${ALLOW.get(id)}`)

if (unexpected.length > 0) {
  console.error(`\naudit-check: ${unexpected.length} unaccepted advisory(ies) — FAIL:`)
  for (const [id, a] of unexpected) console.error(`  ${id} — ${a.severity} in ${a.name} (${a.url})`)
  console.error('\nFix them (npm audit fix / upgrade), or — only if truly unfixable — add the ID to ALLOW in scripts/audit-check.mjs with a written justification.')
  process.exit(1)
}

console.log(`audit-check: OK — no unaccepted vulnerabilities (${accepted.length} known-accepted, recorded).`)
process.exit(0)
