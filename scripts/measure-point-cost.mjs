#!/usr/bin/env node
// REPEATABLE COST PER FINISHED POINT (work-order point 701), IO wrapper.
//
//   node scripts/measure-point-cost.mjs --points 10
//   node scripts/measure-point-cost.mjs --points 10 --json
//   node scripts/measure-point-cost.mjs --points 10 \
//     --write docs/point-cost-ledger.json --report docs/point-cost-report.md
//
// The command reads the harness's existing Claude transcripts, Codex rollouts, git
// merges and boundary log. The JSON/Markdown files are generated views, not another
// accounting layer someone has to update by hand.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { writeJsonAtomic, writeTextAtomic } from './atomic-write.mjs'
import { isMainModule } from './is-main.mjs'
import { mainCheckoutOf } from './measure-context-cost-core.mjs'
import { listTranscripts, transcriptDir } from './measure-context-cost.mjs'
import { readMerges } from './measure-task-cost.mjs'
import {
  ITEM_LABELS,
  LEVERS,
  LEVER_LABELS,
  aggregatePointLedger,
  assignPoints,
  associateBoundaryEvents,
  parseBoundaryLog,
  parseClaudeTranscript,
  parseCodexTranscript,
  selectLandedPoints,
} from './measure-point-cost-core.mjs'
import { REPO_ROOT } from './repo-paths.mjs'

const HOUR = 3_600_000

function walkFiles(root, accept, out = []) {
  if (!existsSync(root)) return out
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) walkFiles(path, accept, out)
    else if (entry.isFile() && accept(path)) out.push(path)
  }
  return out
}

export function listCodexRollouts(root, { since = 0 } = {}) {
  return walkFiles(root, (path) => {
    if (!/rollout-.*\.jsonl$/.test(basename(path))) return false
    try {
      return statSync(path).mtimeMs >= since
    } catch {
      return false
    }
  }).sort()
}

export function readProviderTurns({ claudeDir, codexDir, since = 0, points = [] } = {}) {
  const turns = []
  const claudeFiles = listTranscripts(claudeDir).filter((entry) => {
    try {
      return statSync(entry.path).mtimeMs >= since
    } catch {
      return false
    }
  })
  for (const entry of claudeFiles) {
    turns.push(...parseClaudeTranscript(readFileSync(entry.path, 'utf8'), { file: entry.rel, scope: entry.scope }))
  }
  const candidate = points.length
    ? new RegExp(points.map((point) => `(?:point[- ]|feat/)${point}(?:\\b|-)`).join('|'), 'i')
    : null
  const codexFiles = listCodexRollouts(codexDir, { since })
  let codexRead = 0
  for (const path of codexFiles) {
    const text = readFileSync(path, 'utf8')
    // Rollouts repeat a large instruction prefix. The point appears in cwd, branch or
    // opening prompt. Retain the pre-filter count as a source-quality reading, but
    // parse excluded files too so their traffic is named as residual rather than lost.
    const candidateMatch = !candidate || candidate.test(text)
    if (candidateMatch) codexRead += 1
    turns.push(...parseCodexTranscript(text, { file: path }).map((turn) => ({ ...turn, candidateMatch })))
  }
  return { turns, claudeFiles: claudeFiles.length, codexFiles: codexRead, codexCandidates: codexFiles.length }
}

const dateMs = (value) => {
  if (Number.isFinite(value)) return value
  const parsed = Date.parse(value ?? '')
  return Number.isFinite(parsed) ? parsed : null
}

const iso = (value) => {
  const ms = dateMs(value)
  return ms == null ? null : new Date(ms).toISOString()
}

const k = (value) => {
  if (value == null) return 'n/a'
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  return `${Math.round(value / 1000)}k`
}

const pct = (value) => {
  if (value == null) return 'n/a'
  const percent = value * 100
  return `${percent.toFixed(Math.abs(percent) < 0.1 ? 2 : 1)}%`
}

function originTotal(row) {
  return row.origins.mainSession + row.origins.crossVendorReviews + Object.values(row.origins.agents).reduce((sum, value) => sum + value, 0)
}

export function buildSnapshot({ landed, turns, boundaryText = '', source = {}, generatedAt = new Date().toISOString() } = {}) {
  const points = landed.map((row) => row.point)
  const assigned = assignPoints(turns, points)
  const boundaryEvents = associateBoundaryEvents(parseBoundaryLog(boundaryText), assigned)
  const result = aggregatePointLedger({ landed, turns: assigned, boundaryEvents })
  const assignedTurns = assigned.filter((turn) => points.includes(turn.point) && turn.tokens > 0)
  const residualTurns = assigned.filter((turn) => !points.includes(turn.point) && turn.tokens > 0)
  const providerTokens = {
    anthropic: assignedTurns.filter((turn) => turn.provider === 'anthropic').reduce((sum, turn) => sum + turn.tokens, 0),
    openai: assignedTurns.filter((turn) => turn.provider === 'openai').reduce((sum, turn) => sum + turn.tokens, 0),
  }
  const reviewProviderTokens = {
    anthropic: assignedTurns.filter((turn) => turn.role === 'review' && turn.provider === 'anthropic').reduce((sum, turn) => sum + turn.tokens, 0),
    openai: assignedTurns.filter((turn) => turn.role === 'review' && turn.provider === 'openai').reduce((sum, turn) => sum + turn.tokens, 0),
  }
  const assignedBy = assignedTurns.reduce(
    (totals, turn) => {
      totals[turn.pointSource] = (totals[turn.pointSource] ?? 0) + turn.tokens
      return totals
    },
    { evidence: 0, session: 0, neighbour: 0 },
  )
  const residualFor = (provider) => {
    const providerTurns = residualTurns.filter((turn) => turn.provider === provider)
    const unattributed = providerTurns.filter((turn) => turn.point == null)
    const outsideWindow = providerTurns.filter((turn) => turn.point != null)
    const totalOf = (rows) => rows.reduce((sum, turn) => sum + turn.tokens, 0)
    return {
      tokens: totalOf(providerTurns),
      turns: providerTurns.length,
      files: new Set(providerTurns.map((turn) => turn.file)).size,
      unattributedTokens: totalOf(unattributed),
      unattributedTurns: unattributed.length,
      outsideWindowTokens: totalOf(outsideWindow),
      outsideWindowTurns: outsideWindow.length,
    }
  }
  return {
    schemaVersion: 1,
    generatedAt,
    accounting: {
      unit: 'provider-reported billed tokens',
      note: 'Claude cache counters are disjoint; Codex cached_input_tokens is a subset of input_tokens. No provider price or quota conversion is applied.',
      attribution: 'Explicit point evidence, then the dominant delegated session, then neighbours within one active episode; missing evidence is never divided across points.',
    },
    source,
    window: {
      points: points.length,
      newestLanding: iso(landed[0]?.landedAt),
      oldestLanding: iso(landed.at(-1)?.landedAt),
    },
    providerTokens,
    reviewProviderTokens,
    residualTokens: {
      anthropic: residualFor('anthropic'),
      openai: residualFor('openai'),
    },
    assignedBy,
    ...result,
  }
}

function proposals(snapshot) {
  const items = snapshot.items
  return [
    items.pictureReads.tokens > 0 && items.pictureReads.share >= 0.01
      ? `Picture reads are ${pct(items.pictureReads.share)}: crop to the decision region before model judgment and preserve a full-frame fallback only when composition is the question.`
      : items.pictureReads.tokens > 0
        ? `Picture reads are only ${pct(items.pictureReads.share)}: cropping can reduce an individual read, but it is not a cost-per-point priority in this window.`
      : 'No picture-read charge was observed: do not claim crop savings from this window; first retain explicit image-read evidence.',
    items.agentReports.tokens > 0
      ? `Agent reports are ${pct(items.agentReports.share)}: cap handoffs to a structured verdict/findings/gates payload and keep full logs addressable rather than injected.`
      : 'No agent-report charge was observed: the report-length proposal has no measured support in this window.',
    items.reviewRounds.tokens > 0
      ? `Cross-vendor reviews are ${pct(items.reviewRounds.share)}: keep the review, but measure and eliminate repeated rounds caused by incomplete material or unbatched findings.`
      : 'No cross-vendor-review charge was observed: a review-round proposal has no measured support in this window.',
    items.rawSuiteLogs.tokens > 0
      ? `Raw suite/log reads are ${pct(items.rawSuiteLogs.share)}: use the bounded digest where it preserves the failure surface; this is the measured third-largest item, but far behind reviews and reports.`
      : 'No raw-suite/log-read charge was observed: broader digest adoption has no measured support in this window.',
  ]
}

export function formatConsole(snapshot) {
  const lines = []
  lines.push(`POINT COST LEDGER — last ${snapshot.window.points} landed points; provider-reported billed tokens`)
  lines.push(`window ${snapshot.window.oldestLanding ?? 'n/a'} → ${snapshot.window.newestLanding ?? 'n/a'}`)
  const codexDiscovered = snapshot.source.codexCandidates ?? snapshot.source.codexFiles ?? 0
  const codexMatched = snapshot.source.codexFiles ?? 0
  lines.push(`sources: Claude ${snapshot.source.claudeFiles ?? 0} transcript(s), Codex ${codexDiscovered} rollout(s) discovered; ${codexMatched} matched the point pre-filter, ${Math.max(0, codexDiscovered - codexMatched)} did not`)
  lines.push(`assigned: Anthropic ${k(snapshot.providerTokens.anthropic)} · OpenAI ${k(snapshot.providerTokens.openai)} · total ${k(snapshot.totalTokens)}`)
  lines.push(`cross-vendor review reconciliation: Anthropic ${k(snapshot.reviewProviderTokens.anthropic)} · OpenAI ${k(snapshot.reviewProviderTokens.openai)}`)
  const codexResidual = snapshot.residualTokens.openai
  lines.push(`named Codex residual: ${k(codexResidual.tokens)} across ${codexResidual.turns} turn(s) / ${codexResidual.files} file(s): unattributed ${k(codexResidual.unattributedTokens)}, declared outside the landed-point window ${k(codexResidual.outsideWindowTokens)}`)
  lines.push('')
  lines.push('POINT  LANDED               TOTAL     MAIN   REVIEWS   AGENTS (each delegated session)')
  for (const row of snapshot.ledger) {
    const agents = Object.entries(row.origins.agents)
      .map(([agent, tokens]) => `${agent}=${k(tokens)}`)
      .join(', ') || '—'
    lines.push(
      `${String(row.point).padStart(5)}  ${(iso(row.landedAt)?.slice(0, 16) ?? 'n/a').padEnd(19)} ${k(row.tokens).padStart(8)} ${k(row.origins.mainSession).padStart(8)} ${k(row.origins.crossVendorReviews).padStart(9)}   ${agents}`,
    )
  }
  lines.push('')
  const withoutAbsent = LEVERS.filter((lever) => snapshot.effectiveness[lever].absent === 0).length
  lines.push(`LEVER EFFECTIVENESS — n=${snapshot.ledger.length}; ${withoutAbsent} of ${LEVERS.length} levers have no absent group`)
  lines.push('Signed differences are suppressed where workload or incurred cost triggers the observation.')
  for (const lever of LEVERS) {
    const effect = snapshot.effectiveness[lever]
    lines.push(
      `  ${LEVER_LABELS[lever].padEnd(58)} ${String(effect.fired).padStart(2)}/${snapshot.ledger.length} (${effect.events} event(s))  ` +
        `fired ${k(effect.firedMean).padStart(7)} absent ${k(effect.absentMean).padStart(7)} difference ${k(effect.difference).padStart(8)} (${pct(effect.differencePct)}) — ${effect.verdict}`,
    )
  }
  lines.push(`  whole-document reads observed beside the brief: ${snapshot.ledger.reduce((sum, row) => sum + row.wholeDocumentReads, 0)}`)
  lines.push('')
  lines.push('LARGE ITEMS — inclusive shares; overlaps are possible when a review consumes another item')
  for (const [item, value] of Object.entries(snapshot.items).sort((a, b) => b[1].tokens - a[1].tokens)) {
    lines.push(`  ${ITEM_LABELS[item].padEnd(28)} ${k(value.tokens).padStart(8)}  ${pct(value.share).padStart(6)}`)
  }
  lines.push(`  three largest: ${snapshot.largestItems.map((item) => `${item.label} ${k(item.tokens)} (${pct(item.share)})`).join(' · ')}`)
  lines.push('')
  lines.push('PROPOSALS — after the measurement')
  for (const proposal of proposals(snapshot)) lines.push(`  - ${proposal}`)
  lines.push('')
  lines.push('Every lever comparison is observational. A missing fired/absent group is named as unmeasurable, never treated as zero savings.')
  return lines.join('\n')
}

export function formatMarkdown(snapshot) {
  const codexDiscovered = snapshot.source.codexCandidates ?? snapshot.source.codexFiles ?? 0
  const codexMatched = snapshot.source.codexFiles ?? 0
  const codexResidual = snapshot.residualTokens.openai
  const lines = [
    '# Cost per finished point',
    '',
    `Generated by \`node scripts/measure-point-cost.mjs --points ${snapshot.window.points}\` from the harness records at ${snapshot.generatedAt}.`,
    '',
    `${snapshot.accounting.unit}; ${snapshot.accounting.note}`,
    '',
    `Cross-vendor review reconciliation: ${snapshot.reviewProviderTokens.openai} OpenAI tokens and ${snapshot.reviewProviderTokens.anthropic} Anthropic tokens; the ledger's review origin is the OpenAI total only.`,
    '',
    `Attribution basis: ${pct(snapshot.assignedBy.evidence / snapshot.totalTokens)} explicit point evidence, ${pct(snapshot.assignedBy.session / snapshot.totalTokens)} delegated-session carry and ${pct(snapshot.assignedBy.neighbour / snapshot.totalTokens)} same-session neighbour carry within the active-episode bound.`,
    '',
    `Codex source coverage: ${codexDiscovered} rollout files discovered, ${codexMatched} matched the landed-point pre-filter and ${Math.max(0, codexDiscovered - codexMatched)} did not. All were parsed; the pre-filter gap is a source-quality reading, not silently discarded traffic.`,
    '',
    `Named Codex residual outside the ledger: ${codexResidual.tokens} tokens across ${codexResidual.turns} turns in ${codexResidual.files} files (${codexResidual.unattributedTokens} tokens without point evidence; ${codexResidual.outsideWindowTokens} tokens explicitly belonging to points outside this landed-point window).`,
    '',
    '| point | landed | total | main session | cross-vendor reviews | delegated agents |',
    '| ---: | --- | ---: | ---: | ---: | --- |',
  ]
  for (const row of snapshot.ledger) {
    const agents = Object.entries(row.origins.agents).map(([agent, tokens]) => `${agent} ${tokens}`).join('<br>') || '—'
    lines.push(`| ${row.point} | ${iso(row.landedAt) ?? 'n/a'} | ${row.tokens} | ${row.origins.mainSession} | ${row.origins.crossVendorReviews} | ${agents} |`)
  }
  const withoutAbsent = LEVERS.filter((lever) => snapshot.effectiveness[lever].absent === 0).length
  lines.push(
    '',
    '## Lever effectiveness',
    '',
    `This reading has n = ${snapshot.ledger.length} landed points; ${withoutAbsent} of ${LEVERS.length} levers have no absent group at all. Signed differences are suppressed where the workload or cost already incurred triggers the observation, because these records cannot separate the lever from that reverse causality.`,
    '',
    '| lever | fired points | events | absent | fired mean | absent mean | difference | verdict |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  )
  for (const lever of LEVERS) {
    const effect = snapshot.effectiveness[lever]
    lines.push(`| ${LEVER_LABELS[lever]} | ${effect.fired} | ${effect.events} | ${effect.absent} | ${effect.firedMean ?? 'n/a'} | ${effect.absentMean ?? 'n/a'} | ${effect.difference ?? 'n/a'} | ${effect.verdict} |`)
  }
  lines.push('', `Whole-document reads observed beside the brief: ${snapshot.ledger.reduce((sum, row) => sum + row.wholeDocumentReads, 0)}. This is the operational check behind the brief/open-archive readings.`)
  lines.push('', '## Largest measured items', '')
  for (const item of snapshot.largestItems) lines.push(`- ${item.label}: ${item.tokens} tokens (${pct(item.share)}).`)
  lines.push('', 'The three named suspects, whether or not they made the top three:', '')
  for (const item of ['pictureReads', 'agentReports', 'reviewRounds']) {
    lines.push(`- ${ITEM_LABELS[item]}: ${snapshot.items[item].tokens} tokens (${pct(snapshot.items[item].share)}).`)
  }
  lines.push('', '## Proposals', '')
  for (const proposal of proposals(snapshot)) lines.push(`- ${proposal}`)
  lines.push('', 'The comparisons are observational. “No comparison group” is a negative measurement verdict, not evidence of savings.', '')
  return lines.join('\n')
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const flag = (name, fallback = '') => {
    const index = argv.indexOf(name)
    return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback
  }
  const count = Number(flag('--points', '10'))
  if (!Number.isInteger(count) || count <= 0) {
    console.error('measure-point-cost: --points must be a positive integer.')
    process.exit(2)
  }
  const rawMerges = readMerges({ ref: flag('--ref', 'main') })
  const landed = selectLandedPoints(rawMerges, count)
  if (landed.length < count) {
    console.error(`measure-point-cost: asked for ${count} landed points, but git supplied only ${landed.length}.`)
    process.exit(1)
  }
  const oldest = Math.min(...landed.map((row) => dateMs(row.startedAt) ?? dateMs(row.landedAt)).filter(Number.isFinite))
  // The first authoring turn precedes the first commit. Three days is deliberately
  // conservative and remains bounded for the last-N command.
  const since = oldest - 12 * HOUR
  const claudeDir = transcriptDir()
  const codexDir = process.env.MEASURE_CODEX_SESSIONS_DIR || join(homedir(), '.codex', 'sessions')
  const mainRoot = mainCheckoutOf(REPO_ROOT) ?? REPO_ROOT
  const boundaryPath = process.env.MEASURE_BOUNDARY_LOG || join(mainRoot, '.claude', 'boundary.log')
  const providers = readProviderTurns({ claudeDir, codexDir, since, points: landed.map((row) => row.point) })
  const snapshot = buildSnapshot({
    landed,
    turns: providers.turns,
    boundaryText: existsSync(boundaryPath) ? readFileSync(boundaryPath, 'utf8') : '',
    source: {
      claudeFiles: providers.claudeFiles,
      codexFiles: providers.codexFiles,
      codexCandidates: providers.codexCandidates,
      boundaryLog: existsSync(boundaryPath),
    },
  })
  const empty = snapshot.ledger.filter((row) => row.tokens === 0).map((row) => row.point)
  if (empty.length) {
    console.error(`measure-point-cost: no attributed token record for landed point(s) ${empty.join(', ')} — refusing to present missing accounting as zero.`)
    process.exit(1)
  }
  for (const row of snapshot.ledger) {
    if (originTotal(row) !== row.tokens) throw new Error(`origin split does not reconcile for point ${row.point}`)
  }
  const reviewTotal = snapshot.ledger.reduce((sum, row) => sum + row.origins.crossVendorReviews, 0)
  if (snapshot.reviewProviderTokens.anthropic !== 0 || reviewTotal !== snapshot.reviewProviderTokens.openai) {
    throw new Error('cross-vendor review split does not reconcile to OpenAI review traffic')
  }
  const writePath = flag('--write')
  const reportPath = flag('--report')
  if (writePath) writeJsonAtomic(resolve(REPO_ROOT, writePath), snapshot)
  if (reportPath) writeTextAtomic(resolve(REPO_ROOT, reportPath), formatMarkdown(snapshot))
  if (argv.includes('--json')) console.log(JSON.stringify(snapshot, null, 2))
  else console.log(formatConsole(snapshot))
}
