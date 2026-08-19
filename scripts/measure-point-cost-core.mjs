// COST PER FINISHED POINT (work-order point 701), pure parsing and aggregation.
//
// The repository already has a corrected Claude response fold and a phase report in
// measure-context-cost-core.mjs / measure-task-cost-core.mjs. This module keeps that
// accounting rule and adds the two things those reports cannot answer:
//   1. Codex rollout transcripts, whose token counters have a different JSON shape;
//   2. a landed-point ledger split by main session, every agent, reviews and the
//      expensive single items the harness leaves evidence for.
//
// "tokens" below means provider-reported billed token volume. A Codex cached-input
// counter is a SUBSET of input_tokens and is therefore never added a second time.
// Claude's cache counters are separate and are added once. This is deliberately not a
// dollar conversion: provider prices and quota rules differ, while both transcripts do
// record tokens exactly.

import { foldUsage, IDLE_GAP_MS } from './measure-context-cost-core.mjs'

export const LEVERS = [
  'pointBoundary',
  'contextWatermark',
  'delegationBrief',
  'boundedVerifyDigest',
  'openArchiveSplit',
  'docBudgets',
]

export const LEVER_LABELS = {
  pointBoundary: 'point boundary taken',
  contextWatermark: 'context watermark crossed',
  delegationBrief: 'delegation brief used',
  boundedVerifyDigest: 'bounded verify digest used',
  openArchiveSplit: 'open/archive split used through the bounded task source',
  docBudgets: 'document-budget guard observed',
}

export const ITEM_LABELS = {
  pictureReads: 'picture reads',
  agentReports: 'agent reports',
  reviewRounds: 'cross-vendor review rounds',
  suiteDigests: 'suite digests',
  rawSuiteLogs: 'raw suite/log reads',
}

const IMAGE_PATH = /\.(?:png|jpe?g|webp|gif|avif|bmp|tiff?)\b/i
const WHOLE_SPEC_PATH = /(?:^|[\\/])(?:TASKS\.md|design\.md|docs[\\/]tasks-archive\.md)\b/i
const REVIEW_PROMPT = /SECOND pair of eyes|cross[- ]vendor review|Gegenpr(?:ü|u)fung|\breviewer\b|\breview round\b/i
const REPORT_PATH = /(?:author|agent|sol|fable|opus|review)[^\s/\\]*\.log\b/i

const positive = (value) => (Number.isFinite(value) && value > 0 ? value : 0)

/** Claude counters are disjoint. Codex's cached counter is not passed here. */
export function claudeTokens(usage = {}) {
  return (
    positive(usage.input_tokens) +
    positive(usage.cache_creation_input_tokens) +
    positive(usage.cache_read_input_tokens) +
    positive(usage.output_tokens)
  )
}

/** Codex total_tokens is authoritative; the components are a checked fallback. */
export function codexTokens(usage = {}) {
  if (positive(usage.total_tokens)) return positive(usage.total_tokens)
  return positive(usage.input_tokens) + positive(usage.output_tokens)
}

function jsonLines(text = '') {
  const rows = []
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      rows.push(JSON.parse(line))
    } catch {
      // A live transcript can end in a partial line. It is not a billed response and
      // must not make the whole historical reading disappear.
    }
  }
  return rows
}

function contentText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => {
      if (typeof block === 'string') return block
      const value = block?.text ?? block?.content ?? block?.output ?? ''
      return typeof value === 'string' ? value : JSON.stringify(value ?? '')
    })
    .join('\n')
}

function toolText(tool = {}) {
  const input = tool.input ?? tool.arguments ?? ''
  return `${tool.name ?? ''}\n${typeof input === 'string' ? input : JSON.stringify(input)}`
}

/** The item whose RESULT a later model response will consume. */
export function itemForTool(tool = {}) {
  const name = String(tool.name ?? '')
  const text = toolText(tool)
  const lower = name.toLowerCase()
  if (lower.includes('view_image') || lower === 'image' || ((name === 'Read' || /read/i.test(name)) && IMAGE_PATH.test(text))) {
    return 'pictureReads'
  }
  if (/TaskOutput|SendMessage|Agent|spawn_agent|wait_agent|send_message|followup_task/i.test(name)) return 'agentReports'
  if (/run-logged\.mjs|run-wait\.mjs/.test(text)) return 'suiteDigests'
  if (/npm (?:run )?test:(?:small|large)|npm test\b|scripts[\\/]verify[\\/].*\.mjs|playwright/i.test(text)) return 'rawSuiteLogs'
  if (REPORT_PATH.test(text) && /(?:Read|Bash|exec|exec_command)/i.test(name)) return 'agentReports'
  return null
}

function signalsForTools(tools = [], extraText = '') {
  const text = `${extraText}\n${tools.map(toolText).join('\n')}`
  const wholeDocumentRead = tools.some((tool) => {
    if (!WHOLE_SPEC_PATH.test(toolText(tool))) return false
    if (tool.name === 'Read') {
      const input = tool.input ?? {}
      return input.offset == null && input.limit == null
    }
    return /\b(?:cat|less)\s+[^\n]*(?:TASKS\.md|design\.md|tasks-archive\.md)/i.test(toolText(tool))
  })
  const delegationBrief = /point-brief\.mjs\s+\d+|DELEGATION BRIEF — WORK-ORDER POINT/i.test(text)
  return {
    delegationBrief,
    boundedVerifyDigest: /run-logged\.mjs|run-wait\.mjs/.test(text),
    openArchiveSplit: delegationBrief || /tasks-source\.mjs/.test(text),
    docBudgets: /doc-budget(?:-guard|-core)?\.mjs|document budget (?:exceeded|guard)/i.test(text),
    wholeDocumentRead,
  }
}

function classifyRole({ scope = 'top-level', prompt = '' } = {}) {
  if (scope === 'top-level') return 'main'
  return REVIEW_PROMPT.test(prompt) ? 'review' : 'agent'
}

/**
 * Parse one Claude Code transcript. PURE: the IO wrapper supplies the file text.
 * Tool results are attached to the NEXT response, which is the response that paid to
 * read them. This is what makes an image or a multi-thousand-token agent report visible
 * as an item rather than charging only the cheap request that asked for it.
 */
export function parseClaudeTranscript(text = '', { file = 'session.jsonl', scope = 'top-level' } = {}) {
  const rows = jsonLines(text)
  const prompt = rows
    .filter((row) => row?.type === 'user')
    .map((row) => contentText(row?.message?.content))
    .join('\n')
  const role = classifyRole({ scope, prompt })
  const toolById = new Map()
  const pendingItems = new Set()
  let pendingText = ''
  const groups = new Map()
  const order = []

  for (const row of rows) {
    if (row?.type === 'user') {
      const blocks = Array.isArray(row?.message?.content) ? row.message.content : []
      pendingText += `\n${contentText(row?.message?.content)}`
      for (const block of blocks) {
        if (block?.type !== 'tool_result') continue
        const item = itemForTool(toolById.get(block.tool_use_id))
        if (item) pendingItems.add(item)
      }
      continue
    }
    const usage = row?.message?.usage
    const at = Date.parse(row?.timestamp ?? '')
    if (!usage || !Number.isFinite(at)) continue
    const key = row.message?.id ?? row.requestId ?? `${file}:${row.uuid ?? at}`
    let group = groups.get(key)
    if (!group) {
      const sessionBase = row.sessionId ?? file.replace(/\.jsonl$/, '')
      const agent = row.agentId ? String(row.agentId).replace(/^agent-/, '') : null
      group = {
        id: key,
        at,
        provider: 'anthropic',
        session: agent ? `${sessionBase}/agent-${agent}` : sessionBase,
        sessionBase,
        scope: agent || scope === 'subagent' ? 'subagent' : 'top-level',
        role,
        agent: agent ? `claude:${agent}` : null,
        branch: row.gitBranch ?? '',
        cwd: row.cwd ?? '',
        file,
        prompt,
        evidenceText: pendingText,
        tools: [],
        items: new Set(pendingItems),
        usages: [],
      }
      pendingText = ''
      pendingItems.clear()
      groups.set(key, group)
      order.push(group)
    }
    group.at = Math.min(group.at, at)
    group.usages.push(usage)
    for (const block of Array.isArray(row?.message?.content) ? row.message.content : []) {
      if (block?.type !== 'tool_use') continue
      const tool = { id: block.id, name: block.name ?? '', input: block.input ?? {} }
      toolById.set(block.id, tool)
      if (!group.tools.some((known) => known.id === tool.id)) group.tools.push(tool)
      const item = itemForTool(tool)
      if (item) group.items.add(item)
    }
  }

  return order.map((group) => {
    const usage = foldUsage(group.usages)
    const signals = signalsForTools(group.tools, `${group.prompt}\n${group.evidenceText}`)
    return { ...group, usage, tokens: claudeTokens(usage), items: [...group.items], signals, usages: undefined }
  })
}

function codexUsage(info = {}) {
  const last = info?.last_token_usage ?? {}
  const cached = Math.min(positive(last.cached_input_tokens), positive(last.input_tokens))
  return {
    input_tokens: Math.max(0, positive(last.input_tokens) - cached),
    cache_creation_input_tokens: positive(last.cache_write_input_tokens),
    cache_read_input_tokens: cached,
    output_tokens: positive(last.output_tokens),
    total_tokens: positive(last.total_tokens),
    reasoning_output_tokens: positive(last.reasoning_output_tokens),
  }
}

/** Parse one Codex rollout. The last_token_usage snapshot is one response; the
 * total_token_usage snapshot is cumulative and is never summed line by line. */
export function parseCodexTranscript(text = '', { file = 'rollout.jsonl' } = {}) {
  const rows = jsonLines(text)
  const meta = rows.find((row) => row?.type === 'session_meta')?.payload ?? {}
  const prompt = rows
    .filter((row) => row?.payload?.type === 'user_message')
    .map((row) => row.payload.message ?? '')
    .join('\n')
  const sessionId = meta.session_id ?? meta.id ?? file
  const role = classifyRole({ scope: 'subagent', prompt })
  const toolById = new Map()
  let currentTools = []
  let consumed = new Set()
  let nextConsumed = new Set()
  let first = true
  const turns = []

  for (const row of rows) {
    const payload = row?.payload ?? {}
    if (payload.type === 'custom_tool_call' || payload.type === 'function_call') {
      const tool = {
        id: payload.call_id ?? payload.id,
        name: payload.name ?? '',
        input: payload.input ?? payload.arguments ?? {},
      }
      currentTools.push(tool)
      toolById.set(tool.id, tool)
      continue
    }
    if (payload.type === 'custom_tool_call_output' || payload.type === 'function_call_output') {
      const item = itemForTool(toolById.get(payload.call_id))
      if (item) nextConsumed.add(item)
      continue
    }
    if (payload.type !== 'token_count' || !payload.info?.last_token_usage) continue
    const usage = codexUsage(payload.info)
    const at = Date.parse(row.timestamp ?? '')
    if (!Number.isFinite(at) || codexTokens(usage) <= 0) continue
    const items = new Set(consumed)
    for (const tool of currentTools) {
      const item = itemForTool(tool)
      if (item) items.add(item)
    }
    const evidenceText = first ? prompt : ''
    const signals = signalsForTools(currentTools, evidenceText)
    turns.push({
      id: `${sessionId}:${turns.length + 1}`,
      at,
      provider: 'openai',
      session: `codex:${sessionId}`,
      sessionBase: sessionId,
      scope: 'subagent',
      role,
      agent: role === 'agent' ? `codex:${String(sessionId).slice(0, 8)}` : null,
      branch: meta.git?.branch ?? '',
      cwd: meta.cwd ?? '',
      file,
      prompt,
      evidenceText,
      tools: currentTools,
      usage,
      tokens: codexTokens(usage),
      items: [...items],
      signals,
    })
    first = false
    consumed = nextConsumed
    nextConsumed = new Set()
    currentTools = []
  }
  return turns
}

const escaped = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Point evidence is deliberately pattern-based and candidate-bounded. Bare numbers
 * never vote: a brief for 701 legitimately names points 553, 596, 597 and 662. */
export function pointFromEvidence({ branch = '', cwd = '', text = '' } = {}, candidates = []) {
  const haystack = `${branch}\n${cwd}\n${text}`
  const scores = []
  for (const value of candidates) {
    const point = Number(value)
    if (!Number.isInteger(point)) continue
    const n = escaped(point)
    let score = 0
    const rules = [
      [new RegExp(`feat/${n}(?:[-/]|\\b)`, 'gi'), 10],
      [new RegExp(`worktrees/(?:point-)?${n}(?:[-/]|\\b)`, 'gi'), 10],
      [new RegExp(`--point\\s+${n}\\b`, 'gi'), 9],
      [new RegExp(`WORK-ORDER POINT(?: NUMBER)?[: ]+${n}\\b`, 'gi'), 9],
      [new RegExp(`point-brief\\.mjs\\s+${n}\\b`, 'gi'), 8],
      [new RegExp(`(?:point|Punkt)\s+${n}\\b`, 'gi'), 2],
    ]
    for (const [re, weight] of rules) score += [...haystack.matchAll(re)].length * weight
    if (score) scores.push({ point, score })
  }
  scores.sort((a, b) => b.score - a.score || a.point - b.point)
  if (!scores.length || scores[0].score === scores[1]?.score) return null
  return scores[0].point
}

function directPoint(turn, candidates) {
  return pointFromEvidence(
    {
      branch: turn.branch,
      cwd: turn.cwd,
      text: `${turn.evidenceText ?? ''}\n${turn.prompt ?? ''}\n${(turn.tools ?? []).map(toolText).join('\n')}`,
    },
    candidates,
  )
}

/** Assign each response to one point, then carry evidence only within the same session
 * and active episode. Returns new objects and records the source of every decision. */
export function assignPoints(turns = [], candidates = [], { idleGapMs = IDLE_GAP_MS } = {}) {
  const rows = (Array.isArray(turns) ? turns : []).map((turn) => {
    const point = directPoint(turn, candidates)
    return { ...turn, point, pointSource: point == null ? null : 'evidence' }
  })
  const bySession = new Map()
  for (const row of rows) {
    const list = bySession.get(row.session) ?? []
    list.push(row)
    bySession.set(row.session, list)
  }
  for (const list of bySession.values()) {
    list.sort((a, b) => a.at - b.at)
    // A delegated transcript / Codex rollout is one assignment by construction.
    // Its dominant direct point rescues setup turns recorded before the branch existed.
    if (list[0]?.scope === 'subagent') {
      const counts = new Map()
      for (const row of list) if (row.point != null) counts.set(row.point, (counts.get(row.point) ?? 0) + 1)
      const dominant = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0]
      if (dominant != null) {
        for (const row of list) {
          if (row.point == null) {
            row.point = dominant
            row.pointSource = 'session'
          }
        }
      }
    }
    let previous = null
    let previousAt = 0
    for (const row of list) {
      if (row.point != null) {
        previous = row.point
        previousAt = row.at
      } else if (previous != null && row.at - previousAt < idleGapMs) {
        row.point = previous
        row.pointSource = 'neighbour'
      }
    }
    let next = null
    let nextAt = 0
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const row = list[i]
      if (row.point != null) {
        next = row.point
        nextAt = row.at
      } else if (next != null && nextAt - row.at < idleGapMs) {
        row.point = next
        row.pointSource = 'neighbour'
      }
    }
  }
  return rows.sort((a, b) => a.at - b.at)
}

/** Parse the durable boundary log rather than inferring that a hook must have run. */
export function parseBoundaryLog(text = '') {
  const events = []
  for (const line of String(text).split(/\r?\n/)) {
    const stamp = line.match(/^\[([^\]]+)\]/)?.[1]
    const at = Date.parse(stamp ?? '')
    if (!Number.isFinite(at) || !line.includes('HANDOVER')) continue
    const point = line.match(/HANDOVER point (\d+) by ([^ ]+)/)
    if (point) events.push({ kind: 'pointBoundary', at, point: Number(point[1]), session: point[2] })
    const watermark = line.match(/HANDOVER context watermark by ([^ ]+)/)
    if (watermark) events.push({ kind: 'contextWatermark', at, point: null, session: watermark[1] })
  }
  return events
}

/** A watermark line has a session id but no point. Attach it to the closest preceding
 * response in that same coordinator episode (or the immediate successor response). */
export function associateBoundaryEvents(events = [], turns = [], { maxGapMs = IDLE_GAP_MS } = {}) {
  const bySession = new Map()
  for (const turn of turns) {
    if (turn.point == null) continue
    for (const key of new Set([turn.session, turn.sessionBase])) {
      const list = bySession.get(key) ?? []
      list.push(turn)
      bySession.set(key, list)
    }
  }
  return events.map((event) => {
    if (event.point != null) return event
    const candidates = (bySession.get(event.session) ?? [])
      .map((turn) => ({ turn, distance: Math.abs(event.at - turn.at), after: turn.at > event.at }))
      .filter((entry) => entry.distance < maxGapMs)
      .sort((a, b) => Number(a.after) - Number(b.after) || a.distance - b.distance)
    return { ...event, point: candidates[0]?.turn?.point ?? null }
  })
}

const mean = (values) => (values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null)

export function leverEffect(rows = [], lever = '') {
  const fired = rows.filter((row) => row.levers?.[lever]).map((row) => row.tokens)
  const absent = rows.filter((row) => !row.levers?.[lever]).map((row) => row.tokens)
  const firedMean = mean(fired)
  const absentMean = mean(absent)
  const difference = firedMean != null && absentMean != null ? firedMean - absentMean : null
  const differencePct = difference != null && absentMean > 0 ? +(difference / absentMean).toFixed(4) : null
  let verdict = 'cannot be shown to move per-point cost: no comparison group'
  if (difference != null && difference < 0) verdict = 'associated with lower per-point cost; observational, not causal'
  else if (difference != null && difference > 0) verdict = 'not shown to lower per-point cost'
  else if (difference === 0) verdict = 'no measured per-point difference'
  return { fired: fired.length, absent: absent.length, firedMean, absentMean, difference, differencePct, verdict }
}

function emptyPoint(point, merge = {}) {
  return {
    point,
    merge: merge.sha ?? null,
    landedAt: merge.landedAt ?? merge.mergedAt ?? null,
    tokens: 0,
    turns: 0,
    sessions: new Set(),
    origins: { mainSession: 0, crossVendorReviews: 0, agents: {} },
    items: Object.fromEntries(Object.keys(ITEM_LABELS).map((item) => [item, 0])),
    levers: Object.fromEntries(LEVERS.map((lever) => [lever, false])),
    leverEvents: Object.fromEntries(LEVERS.map((lever) => [lever, 0])),
    wholeDocumentReads: 0,
    assignedBy: { evidence: 0, session: 0, neighbour: 0 },
  }
}

/** The ledger. `landed` is newest-first [{point, sha, landedAt}]. */
export function aggregatePointLedger({ landed = [], turns = [], boundaryEvents = [] } = {}) {
  const rows = new Map(landed.map((merge) => [merge.point, emptyPoint(merge.point, merge)]))
  for (const turn of turns) {
    const row = rows.get(turn.point)
    if (!row || !(turn.tokens > 0)) continue
    row.tokens += turn.tokens
    row.turns += 1
    row.sessions.add(turn.session)
    if (turn.pointSource) row.assignedBy[turn.pointSource] += turn.tokens
    if (turn.role === 'main') row.origins.mainSession += turn.tokens
    else if (turn.role === 'review') {
      row.origins.crossVendorReviews += turn.tokens
      row.items.reviewRounds += turn.tokens
    } else {
      const agent = turn.agent ?? `${turn.provider}:${turn.sessionBase}`
      row.origins.agents[agent] = (row.origins.agents[agent] ?? 0) + turn.tokens
    }
    for (const item of new Set(turn.items ?? [])) if (item in row.items) row.items[item] += turn.tokens
    for (const lever of ['delegationBrief', 'boundedVerifyDigest', 'openArchiveSplit', 'docBudgets']) {
      if (turn.signals?.[lever]) {
        row.levers[lever] = true
        row.leverEvents[lever] += 1
      }
    }
    if (turn.signals?.wholeDocumentRead) row.wholeDocumentReads += 1
  }
  for (const event of boundaryEvents) {
    const row = rows.get(event.point)
    if (!row || !LEVERS.includes(event.kind)) continue
    row.levers[event.kind] = true
    row.leverEvents[event.kind] += 1
  }

  const ledger = landed.map(({ point }) => {
    const row = rows.get(point)
    const agents = Object.fromEntries(Object.entries(row.origins.agents).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
    return {
      ...row,
      tokens: Math.round(row.tokens),
      sessions: row.sessions.size,
      origins: {
        mainSession: Math.round(row.origins.mainSession),
        crossVendorReviews: Math.round(row.origins.crossVendorReviews),
        agents: Object.fromEntries(Object.entries(agents).map(([key, value]) => [key, Math.round(value)])),
      },
      items: Object.fromEntries(Object.entries(row.items).map(([key, value]) => [key, Math.round(value)])),
      assignedBy: Object.fromEntries(Object.entries(row.assignedBy).map(([key, value]) => [key, Math.round(value)])),
    }
  })
  const effectiveness = Object.fromEntries(LEVERS.map((lever) => [lever, leverEffect(ledger, lever)]))
  const total = ledger.reduce((sum, row) => sum + row.tokens, 0)
  const items = Object.fromEntries(
    Object.keys(ITEM_LABELS).map((item) => {
      const tokens = ledger.reduce((sum, row) => sum + row.items[item], 0)
      return [item, { tokens, share: total > 0 ? +(tokens / total).toFixed(4) : null }]
    }),
  )
  const largestItems = Object.entries(items)
    .sort((a, b) => b[1].tokens - a[1].tokens || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([item, value]) => ({ item, label: ITEM_LABELS[item], ...value }))
  return { totalTokens: total, ledger, effectiveness, items, largestItems }
}

/** Last distinct landed feature points from first-parent merge records. */
export function selectLandedPoints(merges = [], count = 10) {
  const seen = new Set()
  const rows = []
  for (const merge of Array.isArray(merges) ? merges : []) {
    const subject = String(merge?.subject ?? '')
    const branch = merge?.branch ?? subject.match(/feat\/(\d+)-[^']*/)?.[0] ?? ''
    const point = Number(String(branch).match(/feat\/(\d+)(?:-|\/|\b)/)?.[1])
    if (!Number.isInteger(point) || seen.has(point)) continue
    seen.add(point)
    rows.push({ point, sha: merge.sha ?? null, landedAt: merge.landedAt ?? merge.mergedAt ?? null, subject })
    if (rows.length >= count) break
  }
  return rows
}
