// PostToolUse[Bash] hook (user mandate 21.07.2026): AUTO-ARM the waiting-time
// prep guard so the guarantee does not depend on the assistant remembering to
// arm it. When a Bash call launches a background VALIDATION/REGRESSION
// (run_in_background + a verify/regression command), write the wait-prep marker
// as {prepped:false}. The Stop hook `prep-guard.mjs` then BLOCKS yielding until
// the assistant records prep (--prepped). Never blocks or errors — observe only.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const R = (p) => fileURLToPath(new URL(p, import.meta.url))
const MARKER = R('../.claude/wait-prep.json')

// A background run we WAIT on for a result: the verify runner or the npm test
// gates. Excludes the dev server (npm run dev) and syntax checks (node --check).
const WAIT_CMD = /(run-all\.mjs|scripts[/\\]verify[/\\][\w.-]+\.mjs|npm\s+(run\s+)?test)/
const NOT_WAIT = /(run\s+dev|--check)/

async function main() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    process.exit(0)
  }
  const input = data.tool_input ?? data.toolInput ?? {}
  const name = data.tool_name ?? data.toolName ?? ''
  const cmd = String(input.command ?? '')
  const bg = input.run_in_background === true || input.runInBackground === true
  // BOTH shells arm the guard: this environment's PRIMARY shell is PowerShell,
  // and matching only Bash made the guard half-dead — a background regression
  // launched the usual way never armed it, so the rule counted as enforced while
  // firing at almost nothing (found by the 25.07 rule/guard audit).
  if ((name === 'Bash' || name === 'PowerShell') && bg && WAIT_CMD.test(cmd) && !NOT_WAIT.test(cmd)) {
    // run-logged.mjs is the logging wrapper around run-all (point 373 e) and
    // carries the same tier/suite argument — so the label reads the same either way.
    const label = (cmd.match(/run-(?:all|logged)\.mjs\s+([\w-]+)/)?.[1]) ?? (cmd.match(/npm\s+(run\s+)?(test\S*)/)?.[2]) ?? 'a background validation'
    try {
      writeFileSync(MARKER, JSON.stringify({ task: label, prepped: false, at: Date.now(), auto: true }, null, 2))
    } catch {
      /* never fail a tool call over the guard */
    }
  }
  process.exit(0)
}
main()
