// Defer a TASKS point that needs the user's decision, WITHOUT stalling the batch
// (user request 22.07.2026: a blocking approval/question must never freeze the
// batch until an answer arrives). Instead of a blocking AskUserQuestion, the
// assistant: (1) adds a "Von dir zu klären" card to the dashboard, (2) runs this
// to mark the point AWAITING-USER + ping the phone, (3) moves on to the next
// workable point. The point still counts as OPEN (the batch is not done); the
// assistant simply skips AWAITING-USER points when picking the next item, and —
// only if EVERY open point is AWAITING-USER — pauses (setPaused) and notifies.
// The user's answer (in chat) clears the marker via --clear and the point resumes.
//
//   node scripts/defer-for-user.mjs <pointNumber> "<what you need from the user>"
//   node scripts/defer-for-user.mjs --clear <pointNumber>
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { notify } from './notify.mjs'

const TASKS = fileURLToPath(new URL('../TASKS.md', import.meta.url))
const iso = () => new Date().toISOString()

const [, , a, b] = process.argv
const lines = readFileSync(TASKS, 'utf8').split('\n')

function rewrite(pointNum, transform) {
  let hit = false
  const out = lines.map((l) => {
    const m = l.match(/^- \[ \] (\d+)\./)
    if (m && Number(m[1]) === pointNum) { hit = true; return transform(l) }
    return l
  })
  if (hit) writeFileSync(TASKS, out.join('\n'))
  return hit
}

if (a === '--clear') {
  const n = Number(b)
  const ok = rewrite(n, (l) => l.replace(/ AWAITING-USER\([^)]*\)/g, ''))
  console.log(ok ? `point ${n}: AWAITING-USER cleared — it re-enters the work queue` : `point ${n} not found`)
  process.exit(0)
}

const n = Number(a)
const question = (b || 'a decision is needed').trim()
if (!Number.isFinite(n)) { console.error('usage: defer-for-user.mjs <pointNumber> "<question>"'); process.exit(1) }
const ok = rewrite(n, (l) => (/ AWAITING-USER\(/.test(l) ? l : `${l} AWAITING-USER(${iso()})`))
if (!ok) { console.error(`point ${n} not found (open lines only)`); process.exit(1) }
await notify(`Point ${n} needs you`, `${question}\n\nAnswer in chat / on the dashboard; I've moved on to the next point meanwhile.`, 'high')
console.log(`point ${n} marked AWAITING-USER + notified; add a "Von dir zu klären" dashboard card and continue with another point.`)
process.exit(0)
