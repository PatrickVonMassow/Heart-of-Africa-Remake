// Attestation CLI for the periodic rule-corpus review.
//
//   node scripts/rule-review.mjs --status
//   node scripts/rule-review.mjs --reviewed --evidence "<was geprüft, was gefunden, was geändert>"
//
// Records WHEN the corpus was last read through and HOW BIG it was then, which
// is what rule-review-guard.mjs judges the next demand against. See
// rule-review-core.mjs for why this is periodic rather than remembered.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateRuleReview, isSubstantialEvidence, AXES, HIGH_FREQUENCY_FIRST } from './rule-review-core.mjs'
import { countCorpusEntries, STATE_PATH } from './rule-review-state.mjs'

const R = (p) => fileURLToPath(new URL(p, import.meta.url))

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function writeState(next) {
  mkdirSync(dirname(STATE_PATH), { recursive: true })
  writeFileSync(STATE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
}

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  return i < 0 ? null : (argv[i + 1] ?? '')
}

const state = readState()
const entryCount = countCorpusEntries()

if (argv.includes('--reviewed')) {
  const evidence = flag('--evidence')
  if (!isSubstantialEvidence(evidence)) {
    console.error(
      'Beleg fehlt oder ist zu dünn. Die Quittung muss benennen, WAS durchgesehen wurde,\n' +
        'was dabei gefunden und was geändert wurde — sonst quittiert sie nichts.\n' +
        '  node scripts/rule-review.mjs --reviewed --evidence "…"',
    )
    process.exit(1)
  }
  const next = {
    ...state,
    lastReviewedAt: Date.now(),
    reviewedCount: entryCount,
    evidence,
    history: [
      ...(Array.isArray(state.history) ? state.history.slice(-9) : []),
      { at: new Date().toISOString(), entryCount, evidence },
    ],
  }
  writeState(next)
  console.log(`Regelbestand-Durchsicht quittiert (${entryCount} Einträge).`)
  process.exit(0)
}

const verdict = evaluateRuleReview({
  now: Date.now(),
  lastReviewedAt: Number(state.lastReviewedAt) || null,
  entryCount,
  reviewedCount: Number(state.reviewedCount) || null,
  paused: existsSync(R('../.claude/batch-paused')),
})

if (argv.includes('--status')) {
  console.log(
    JSON.stringify(
      {
        entryCount,
        reviewedCount: state.reviewedCount ?? null,
        lastReviewedAt: state.lastReviewedAt ? new Date(state.lastReviewedAt).toISOString() : null,
        owed: Boolean(verdict),
        axes: AXES.length,
        readFirst: HIGH_FREQUENCY_FIRST,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

console.log(verdict ? verdict.reason : 'rule-review: keine Durchsicht fällig')
process.exit(0)
