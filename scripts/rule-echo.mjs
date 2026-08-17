#!/usr/bin/env node
// THE COMMAND BESIDE THE RULE-ECHO GUARD (user 17.08.2026).
//
//   node scripts/rule-echo.mjs --status
//   node scripts/rule-echo.mjs --stamp <file> --quote "<a phrase from that file>"
//   node scripts/rule-echo.mjs --list              # the rules and their echoes
//
// STAMPING IS PER FILE ON PURPOSE. A `--stamp-all` would turn the check into a
// formality: the guard's whole value is that somebody opened each restatement
// and compared it with the rule. One command per file is the friction that buys
// that, and it is small — the list is under a dozen files.
//
// AND IT NEEDS A QUOTE FROM THE FILE (cross-vendor review, P0). Without one, the
// commands could be generated straight from the guard's own output without any
// file being opened, which is exactly the check being claimed. The quote is not
// proof of understanding — it is proof the file was in front of somebody.
//
// A file that already says the right thing is stamped just the same. The stamp
// records that it was READ against this version of the rule, not that it changed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  RULE_REGISTRY,
  checkAll,
  fingerprint,
  quoteIsInFile,
  restamp,
  rulesForFile,
  sourceTextOf,
  stampFor,
  unregisteredStamps,
} from './rule-echo-core.mjs'
import { gatherRuleEchoInputs, gatherStampedFiles, memoryDirs } from './rule-echo-guard.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'

const USAGE = [
  'usage: node scripts/rule-echo.mjs --status',
  '       node scripts/rule-echo.mjs --stamp <file> --quote "<a phrase from that file>"',
  '       node scripts/rule-echo.mjs --list',
].join('\n')

/** EVERY path a watched entry resolves to — a memory entry may exist twice. */
function fullPathsOf(rel) {
  if (!rel.startsWith('memory/')) {
    const p = resolve(REPO_ROOT, rel)
    return existsSync(p) ? [p] : []
  }
  const name = rel.slice('memory/'.length)
  return memoryDirs()
    .map((dir) => resolve(dir, name))
    .filter((p) => existsSync(p))
}

function statusText() {
  const { files } = gatherRuleEchoInputs().inputs
  const results = checkAll(RULE_REGISTRY, files)
  const lines = []
  for (const r of results) {
    const rule = RULE_REGISTRY.find((x) => x.id === r.id)
    lines.push(`${r.id} (${rule?.title ?? ''}) — ${r.kind}${r.hash ? ` @${r.hash}` : ''}`)
    for (const s of r.stale) lines.push(`  stale     ${s.file} (stamped ${s.had})`)
    for (const u of r.unstamped) lines.push(`  unstamped ${u.file}`)
    if (r.detail) lines.push(`  ${r.detail}`)
  }
  for (const s of unregisteredStamps(RULE_REGISTRY, gatherStampedFiles())) {
    lines.push(`stray stamp ${s.file} → rule:${s.id} (${s.why})`)
  }
  return lines.join('\n')
}

function stamp(file, quote, ruleId = '') {
  const rules = rulesForFile(file)
  if (!rules.length) return { ok: false, message: `rule-echo: ${file} restates no watched rule (see --list).` }
  // ONE QUOTE MAY NOT CLEAR TWO RULES (cross-vendor review round 2, P0): a
  // phrase from the passage stating rule A says nothing about rule B in the same
  // file, so a file echoing several rules is stamped one rule at a time.
  if (rules.length > 1 && !ruleId) {
    return {
      ok: false,
      message:
        `rule-echo: ${file} restates ${rules.length} rules (${rules.map((r) => r.id).join(', ')}).\n` +
        'Stamp them one at a time, each with a quote from ITS passage:\n' +
        `  node scripts/rule-echo.mjs --stamp ${file} --rule <id> --quote "<a phrase from that passage>"`,
    }
  }
  const chosen = ruleId ? rules.filter((r) => r.id === ruleId) : rules
  if (!chosen.length) return { ok: false, message: `rule-echo: ${file} does not restate rule "${ruleId}".` }
  const messages = []
  for (const rule of chosen) {
    const r = stampOne(rule, file, quote)
    if (!r.ok) return r
    messages.push(r.message)
  }
  return { ok: true, message: messages.join('\n') }
}

function stampOne(rule, file, quote) {
  const sourcePath = resolve(REPO_ROOT, rule.source.file)
  if (!existsSync(sourcePath)) return { ok: false, message: `rule-echo: the rule's source ${rule.source.file} is missing.` }
  const sourceText = sourceTextOf(readFileSync(sourcePath, 'utf8'), rule.source)
  if (!sourceText) {
    return { ok: false, message: `rule-echo: the anchor "${rule.source.startsWith}" matches no line in ${rule.source.file} — fix RULE_REGISTRY first.` }
  }
  const hash = fingerprint(sourceText)
  const fulls = fullPathsOf(file)
  if (!fulls.length) return { ok: false, message: `rule-echo: ${file} does not exist here.` }
  const texts = fulls.map((p) => readFileSync(p, 'utf8'))
  const q = texts.map((text) => quoteIsInFile(text, quote)).find((r) => !r.ok) ?? { ok: true, reason: '' }
  if (!q.ok) {
    return {
      ok: false,
      message:
        `rule-echo: ${file} not stamped — ${q.reason}.\n` +
        'Stamping needs a verbatim phrase FROM the file, so the list of names alone cannot clear\n' +
        `the guard:\n  node scripts/rule-echo.mjs --stamp ${file} --quote "<a phrase from it>"`,
    }
  }
  // EVERY copy, not the first (review round 2, P1): stamping one of two copies
  // left the other stale with no command able to reach it.
  const nexts = texts.map((text) => restamp(text, rule.id, hash))
  if (nexts.some((n) => !n)) {
    return {
      ok: false,
      message:
        `rule-echo: ${file} carries no stamp yet. Add this line where the file states the rule,\n` +
        `in whatever comment syntax it uses, then run --stamp again:\n  ${stampFor(rule.id, hash)}`,
    }
  }
  let written = 0
  nexts.forEach((next, i) => {
    if (next === texts[i]) return
    writeFileSync(fulls[i], next)
    written += 1
  })
  const where = fulls.length > 1 ? ` (${fulls.length} copies)` : ''
  return {
    ok: true,
    message: written
      ? `rule-echo: ${file} stamped @${hash}${where}.`
      : `rule-echo: ${file} already stamped @${hash}${where}.`,
  }
}

function listText() {
  return RULE_REGISTRY.map((rule) =>
    [`${rule.id} — ${rule.title}`, `  source: ${rule.source.file} (“${rule.source.startsWith}…”)`, ...rule.echoes.map((e) => `  echo:   ${e.file}${e.optional ? ' (optional)' : ''}`)].join('\n'),
  ).join('\n\n')
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const at = (flag) => argv.indexOf(flag)
  try {
    if (at('--list') >= 0) {
      console.log(listText())
      process.exit(0)
    }
    if (at('--stamp') >= 0) {
      const file = argv[at('--stamp') + 1]
      const quote = at('--quote') >= 0 ? argv[at('--quote') + 1] : ''
      const ruleId = at('--rule') >= 0 ? argv[at('--rule') + 1] : ''
      if (!file) {
        console.error(`rule-echo: --stamp needs a file.\n\n${USAGE}`)
        process.exit(2)
      }
      const r = stamp(file, quote, ruleId)
      console.log(r.message)
      process.exit(r.ok ? 0 : 1)
    }
    if (at('--status') >= 0 || argv.length === 0) {
      const text = statusText()
      console.log(text || 'rule-echo: nothing watched.')
      process.exit(0)
    }
    console.error(USAGE)
    process.exit(2)
  } catch (e) {
    console.error(`rule-echo: ${e && e.message}`)
    process.exit(1)
  }
}
