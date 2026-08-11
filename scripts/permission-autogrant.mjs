#!/usr/bin/env node
// PermissionRequest hook: grants what the harness would otherwise ask the user about.
// The reasoning, and why this cannot overrule a guard, is in permission-autogrant-core.mjs.
//
// Fail-open by construction: every error path exits 0 with no output, which leaves the
// decision to the harness (it asks). A broken hook costs a prompt, never a silent grant.

import { decide, render } from './permission-autogrant-core.mjs'

function readStdin() {
  return new Promise((resolve) => {
    let raw = ''
    // No input at all (a manual invocation, a harness that pipes nothing): do not hang.
    const done = setTimeout(() => resolve(raw), 2000)
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      raw += chunk
    })
    process.stdin.on('end', () => {
      clearTimeout(done)
      resolve(raw)
    })
    process.stdin.on('error', () => {
      clearTimeout(done)
      resolve(raw)
    })
  })
}

try {
  const raw = await readStdin()
  let input = null
  try {
    input = JSON.parse(raw)
  } catch {
    input = null
  }
  const out = render(decide(input))
  if (out) process.stdout.write(out)
} catch {
  // Deliberately silent: see the fail-open note above.
}
process.exit(0)
