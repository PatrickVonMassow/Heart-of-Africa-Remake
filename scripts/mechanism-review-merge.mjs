// Git merge driver for .claude/mechanism-reviews.jsonl.
// Configured transiently by scripts/land-point.mjs; see .gitattributes.
import { readFileSync, writeFileSync } from 'node:fs'
import { mergeMechanismReviewLedger } from './mechanism-review-merge-core.mjs'

const [ancestorPath, currentPath, otherPath, ledgerPath = '.claude/mechanism-reviews.jsonl'] = process.argv.slice(2)

try {
  if (!ancestorPath || !currentPath || !otherPath) throw new Error('expected ancestor, current and other blob paths')
  const merged = mergeMechanismReviewLedger({
    ancestor: readFileSync(ancestorPath, 'utf8'),
    current: readFileSync(currentPath, 'utf8'),
    other: readFileSync(otherPath, 'utf8'),
  })
  writeFileSync(currentPath, merged)
} catch (error) {
  console.error(`mechanism-review merge: refusing ${ledgerPath}: ${error.message}`)
  process.exitCode = 1
}
