#!/usr/bin/env node
// ASK THE OTHER VENDOR FOR PURE TEXT WORK (work-order point 654, A1).
//
//   node scripts/ask-sol.mjs --kind diagnose  --brief "why did the place suite go red?" \
//        --log /tmp/place.log --diff main..HEAD
//   node scripts/ask-sol.mjs --kind audit     --brief "…" --file src/world/river.ts
//   node scripts/ask-sol.mjs --kind enumerate --brief "…"      # a blind-parallel half
//   node scripts/ask-sol.mjs --kind explain   --brief "…" --file scripts/board-core.mjs
//   … and anything piped on stdin is material too.
//
// It is `scripts/review-sol.mjs`'s proven path — `codex exec` at effort HIGH in a
// READ-ONLY sandbox, the artefact on stdin — generalised past reviews to the four kinds
// of work that need no write access: DIAGNOSE, AUDIT, ENUMERATE, EXPLAIN. The login
// handling, the unavailability classification and the model-id freshness probe are
// IMPORTED from that path, not rebuilt.
//
// SOL AUTHORS NOTHING ON THIS PATH. The answer is text a Claude session acts on, and no
// commit carries Sol's trailer from here. Sol's AUTHORING lane is a different command
// (scripts/author-sol.mjs, point 667), where the trailer and the allowlist do apply.
//
// WHEN SOL IS NOT AVAILABLE — or when the share switch has moved the load away from it —
// this says so in ONE line, names the cause, hands the work back to the Claude chain and
// exits 3, so a script can tell "Sol answered" from "Sol did not" without reading prose.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { classifyOutcome, MATERIAL_BUDGET_CHARS, REVIEW_TIMEOUT_MS, SOL_MODEL_NAME, SOL_REASONING_EFFORT } from './review-sol-core.mjs'
import { ensureModelProven, runCodex } from './review-sol.mjs'
import { currentSetting, settingProblemLine } from './sol-share.mjs'
import { routeFor } from './sol-share-core.mjs'
import { buildAskPrompt, formatAnswerReport, formatAskMaterial, formatUnavailable, KINDS, normaliseKind, parseAnswer } from './ask-sol-core.mjs'

/** One git read that never throws — a missing range is reported, not fatal. */
function git(args) {
  const res = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 128 * 1024 * 1024 })
  return res.status === 0 && !res.error ? (res.stdout ?? '').trim() : null
}

/** Everything piped in, or '' when nothing was. */
export function readStdin() {
  if (process.stdin.isTTY) return ''
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

/**
 * The material sections, in the order they are worth the budget: what the caller piped
 * in first (it chose to), then the logs, then the diff, then the files.
 *
 * EVERY SECTION SAYS WHETHER IT REALLY CARRIES ITS ARTEFACT (`ok`). A file that could not
 * be read used to travel as the sentence "(could not be read: …)", which is material a
 * model can answer ABOUT — shaped, plausible, and about nothing (cross-vendor review,
 * 12.08.2026). The caller refuses a request whose material is entirely such placeholders,
 * and names the ones that failed even when the rest went through.
 */
export function gatherSections({ stdin = '', logs = [], diff = '', files = [] } = {}) {
  const sections = []
  const read = (title, path) => {
    try {
      return { title, text: readFileSync(path, 'utf8'), ok: true }
    } catch (e) {
      return { title, text: `(could not be read: ${e.message})`, ok: false, problem: `${path}: ${e.message}` }
    }
  }
  if (stdin.trim()) sections.push({ title: 'MATERIAL (stdin)', text: stdin, ok: true })
  for (const path of logs) sections.push(read(`LOG: ${path}`, path))
  if (diff) {
    const stat = git(['diff', '--stat', diff])
    const patch = git(['diff', diff])
    const failed = stat === null || patch === null
    sections.push({ title: `DIFFSTAT ${diff}`, text: stat ?? '(the range could not be read)', ok: !failed, problem: failed ? `--diff ${diff}: git could not read the range` : '' })
    sections.push({ title: `PATCH ${diff}`, text: patch ?? '(the range could not be read)', ok: !failed })
  }
  for (const path of files) sections.push(read(`FILE (current content): ${path}`, path))
  return sections
}

export const usage = () =>
  [
    'usage: node scripts/ask-sol.mjs --kind <' + KINDS.join('|') + '> --brief "<the question>" \\',
    '           [--file <path>]… [--log <path>]… [--diff <range>] [--timeout <ms>] [--anyway] [--json]',
    '',
    'Material also comes from stdin. Nothing is fetched by the model: this container cannot',
    'create user namespaces, so everything it may look at must travel with the request.',
    `Runs on ${SOL_MODEL_NAME} at reasoning effort ${SOL_REASONING_EFFORT}; ${SOL_MODEL_NAME} AUTHORS NOTHING —`,
    'the answer is text a Claude session acts on. Where the share switch routes this kind to',
    'Claude, the command refuses (exit 3) unless --anyway is given.',
    '  node scripts/sol-share.mjs --status   # what goes where right now',
  ].join('\n')

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const flag = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : ''
  }
  const flags = (name) => argv.map((a, i) => (a === name ? argv[i + 1] : null)).filter((v) => v && !v.startsWith('--'))
  const asJson = argv.includes('--json')
  try {
    if (argv.includes('--help') || argv.includes('-h')) {
      console.log(usage())
      process.exit(0)
    }
    const kind = normaliseKind(flag('--kind'))
    const brief = flag('--brief')
    if (!kind || !brief) {
      console.error(`ask-sol: --kind (one of ${KINDS.join(', ')}) and --brief are both required.\n`)
      console.error(usage())
      process.exit(2)
    }

    // THE SWITCH DECIDES WHETHER THIS RUNS AT ALL, and `--anyway` is the deliberate
    // override — deliberate, because the whole purpose of the switch is that nobody
    // spends the scarce allowance by habit.
    const share = currentSetting()
    // A fallback nobody is told about is a setting nobody chose (second cross-vendor round).
    if (share.problem) console.error(settingProblemLine(share, 'ask-sol'))
    if (routeFor(kind, share.setting) !== 'sol' && !argv.includes('--anyway')) {
      console.error(
        `ask-sol: the share switch is at \`${share.setting}\`, which routes ${kind} to Claude — not asking ${SOL_MODEL_NAME}.\n` +
          `  Do it in the Claude chain, or: node scripts/sol-share.mjs --more   (override once with --anyway)`,
      )
      process.exit(3)
    }

    // THE MATERIAL IS GATHERED BEFORE THE PROBE (cross-vendor review, 12.08.2026): a
    // request that turns out to have nothing to send must cost no codex call at all,
    // and the probe is a codex call.
    const sections = gatherSections({ stdin: readStdin(), logs: flags('--log'), diff: flag('--diff'), files: flags('--file') })
    const { text: material, carried, omitted } = formatAskMaterial({ sections, budget: MATERIAL_BUDGET_CHARS })
    if (!material.trim()) {
      console.error('ask-sol: no material at all — give it a --file, a --log, a --diff or something on stdin.')
      process.exit(2)
    }
    // A REQUEST WHOSE MATERIAL IS ALL PLACEHOLDERS IS NOT A REQUEST. An unreadable file
    // travels as "(could not be read: …)", which is text a model will happily answer
    // ABOUT — a shaped answer about nothing, reported as an answer.
    //
    // WHAT COUNTS AS REAL is asked of what actually TRAVELLED (second cross-vendor
    // round): a readable but EMPTY file and a section the budget dropped are both
    // "ok" and carry nothing, so the question is which sections were written with
    // content, not which reads succeeded.
    const failed = sections.filter((s) => !s.ok)
    for (const s of failed) console.error(`ask-sol: material MISSING — ${s.problem ?? s.title}`)
    for (const title of omitted) {
      if (!failed.some((s) => s.title === title)) console.error(`ask-sol: material EMPTY or DROPPED for the budget — ${title}`)
    }
    const real = carried.filter((title) => sections.find((s) => s.title === title)?.ok)
    if (!real.length) {
      console.error('ask-sol: NOTHING of the material actually travelled — refusing to send a request that carries only placeholders.')
      process.exit(2)
    }

    // The identity is PROVEN before a word is attributed to Sol: nothing in a run's
    // output names the model that answered, so the whole attribution rests on the server
    // refusing an unknown id (see review-sol.mjs --probe).
    if (!ensureModelProven({ who: 'ask-sol' })) {
      console.error(`ask-sol: the model id is not proven honoured — refusing to attribute an answer to ${SOL_MODEL_NAME}.`)
      process.exit(2)
    }
    console.error(`ask-sol: asking ${SOL_MODEL_NAME} (effort ${SOL_REASONING_EFFORT}) for a ${kind} — ${material.length} characters of material …`)

    const startedAt = Date.now()
    const run = runCodex({
      prompt: buildAskPrompt({ kind, brief }),
      input: material,
      timeoutMs: Number(flag('--timeout')) || REVIEW_TIMEOUT_MS,
    })
    const outcome = classifyOutcome(run)
    const parsed = outcome.ok ? parseAnswer({ kind, text: run.finalMessage }) : { ok: false, error: '' }
    const elapsedMs = Date.now() - startedAt

    if (!parsed.ok) {
      const cause = outcome.ok ? `the run produced no usable answer (${parsed.error})` : outcome.cause
      console.error(formatUnavailable({ kind, cause, setting: share.setting }))
      if (String(run.finalMessage ?? '').trim()) {
        console.error(`--- what came back, unusable as it is ---\n${String(run.finalMessage).trim()}\n--- end ---`)
      }
      process.exit(3)
    }

    // THE WHOLE ANSWER IS PRINTED, not only its shape: a cause without the reasoning
    // behind it cannot be acted on, and this is the only place the reader sees it.
    const said = String(run.finalMessage ?? '').trim()
    if (said && !asJson) console.log(`--- ${SOL_MODEL_NAME} said ---\n${said}\n--- end ---\n`)
    if (asJson) {
      console.log(JSON.stringify({ kind, model: SOL_MODEL_NAME, effort: SOL_REASONING_EFFORT, elapsedMs, setting: share.setting, ...parsed, raw: said }, null, 2))
    } else {
      console.log(formatAnswerReport({ kind, parsed, elapsedMs }))
    }
    process.exit(0)
  } catch (e) {
    console.error(`ask-sol failed: ${(e && e.message) || e}`)
    process.exit(1)
  }
}
