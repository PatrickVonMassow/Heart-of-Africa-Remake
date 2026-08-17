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
import { RULE_REGISTRY, checkAll, fingerprint, quoteIsInFile, restamp, sourceTextOf, stampFor, unregisteredStamps } from './rule-echo-core.mjs'
import { gatherRuleEchoInputs, gatherStampedFiles, memoryDirs } from './rule-echo-guard.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'

const USAGE = [
  'usage: node scripts/rule-echo.mjs --status',
  '       node scripts/rule-echo.mjs --stamp <file> --quote "<a phrase from that file>"',
  '       node scripts/rule-echo.mjs --list',
].join('\n')

/** The rule a watched file restates, or null. */
export function ruleForFile(file, registry = RULE_REGISTRY) {
  return registry.find((rule) => rule.echoes.some((e) => e.file === file)) ?? null
}

/** Resolve a watched path to disk, memory entries included. */
function fullPathOf(rel) {
  if (!rel.startsWith('memory/')) return resolve(REPO_ROOT, rel)
  const name = rel.slice('memory/'.length)
  return memoryDirs().map((dir) => resolve(dir, name)).find((p) => existsSync(p)) ?? ''
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

function stamp(file, quote) {
  // EVERY rule this file restates, not the first (cross-vendor review, P2): a
  // file may echo two rules, and stamping only one left the other stale on every
  // Stop with no command able to clear it.
  const rules = RULE_REGISTRY.filter((r) => r.echoes.some((e) => e.file === file))
  if (!rules.length) return { ok: false, message: `rule-echo: ${file} restates no watched rule (see --list).` }
  const messages = []
  for (const rule of rules) {
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
  const full = fullPathOf(file)
  if (!full || !existsSync(full)) return { ok: false, message: `rule-echo: ${file} does not exist here.` }
  const text = readFileSync(full, 'utf8')
  const q = quoteIsInFile(text, quote)
  if (!q.ok) {
    return {
      ok: false,
      message:
        `rule-echo: ${file} not stamped — ${q.reason}.\n` +
        'Stamping needs a verbatim phrase FROM the file, so the list of names alone cannot clear\n' +
        `the guard:\n  node scripts/rule-echo.mjs --stamp ${file} --quote "<a phrase from it>"`,
    }
  }
  const next = restamp(text, rule.id, hash)
  if (!next) {
    return {
      ok: false,
      message:
        `rule-echo: ${file} carries no stamp yet. Add this line where the file states the rule,\n` +
        `in whatever comment syntax it uses, then run --stamp again:\n  ${stampFor(rule.id, hash)}`,
    }
  }
  if (next === text) return { ok: true, message: `rule-echo: ${file} already stamped @${hash}.` }
  writeFileSync(full, next)
  return { ok: true, message: `rule-echo: ${file} stamped @${hash}.` }
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
      if (!file) {
        console.error(`rule-echo: --stamp needs a file.\n\n${USAGE}`)
        process.exit(2)
      }
      const r = stamp(file, quote)
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
