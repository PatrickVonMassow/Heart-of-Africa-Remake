// Pure PreToolUse input rewriting for the large producers named by the output
// budget. The registered wrapper is scripts/path-scope-guard.mjs: every Bash,
// PowerShell, Read and Grep call already passes through that hook.

export const READ_LINE_BUDGET = 200
export const GREP_RESULT_BUDGET = 100

/** The named shell producer in parsed command segments, or null. Quoted prose
 * is safe because the parser keeps it as an operand of its real command. */
export function shellProducer(command, { expandSegments, headAndArgs } = {}) {
  if (typeof expandSegments !== 'function' || typeof headAndArgs !== 'function') return null
  for (const segment of expandSegments(String(command ?? ''))) {
    const split = headAndArgs(segment)
    const head = String(split.head ?? '').toLowerCase()
    const lower = (split.args ?? []).map((word) => String(word.text ?? '').toLowerCase())
    if (head === 'grep' || head === 'egrep' || head === 'fgrep') return 'grep'
    if (head === 'git' && lower.includes('diff')) return 'git diff'
    if (head === 'npm' && lower.some((word) => word === 'ls' || word === 'list')) return 'npm ls'
    if (head === 'gh') {
      const positionals = lower.filter((word) => !word.startsWith('-'))
      if (positionals[0] === 'run' && positionals[1] === 'view') return 'gh run view'
    }
  }
  return null
}

function shellRewrite(command, toolName) {
  const encoded = Buffer.from(command).toString('base64url')
  const runner = toolName === 'PowerShell'
    ? 'node "$env:CLAUDE_PROJECT_DIR/scripts/tool-output-budget.mjs"'
    : 'node "$CLAUDE_PROJECT_DIR/scripts/tool-output-budget.mjs"'
  return `${runner} --encoded-command ${encoded}`
}

const positiveInt = (value) => Number.isInteger(value) && value > 0

/**
 * Return the hook's allowed updatedInput, or null when this is not a producer.
 * Read/Grep are bounded at their own native pagination controls; their source
 * files remain the complete on-disk copy. Shell producers are captured whole by
 * the spill runner and selectively readable with run-logged --show.
 */
export function interceptToolOutput(payload, { expandSegments, headAndArgs } = {}) {
  if (!payload || typeof payload !== 'object') return null
  const toolName = payload.tool_name
  const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {}

  if ((toolName === 'Bash' || toolName === 'PowerShell') && typeof input.command === 'string') {
    const producer = shellProducer(input.command, { expandSegments, headAndArgs })
    if (!producer) return null
    return {
      producer,
      updatedInput: { ...input, command: shellRewrite(input.command, toolName) },
      reason: `${producer} output is captured by the per-call budget; full output spills to local/tool-output-logs.`,
    }
  }

  if (toolName === 'Read' && (typeof input.file_path === 'string' || typeof input.path === 'string')) {
    const requested = positiveInt(input.limit) ? input.limit : READ_LINE_BUDGET
    const limit = Math.min(requested, READ_LINE_BUDGET)
    return {
      producer: 'file read',
      updatedInput: { ...input, limit },
      reason: `file read output is limited to ${limit} lines; continue selectively with offset/limit against the same full source file.`,
    }
  }

  if (toolName === 'Grep') {
    const requested = positiveInt(input.head_limit) ? input.head_limit : GREP_RESULT_BUDGET
    const headLimit = Math.min(requested, GREP_RESULT_BUDGET)
    return {
      producer: 'grep',
      updatedInput: { ...input, head_limit: headLimit },
      reason: `grep output is limited to ${headLimit} results; narrow the pattern/path or use output_mode=count before fetching detail.`,
    }
  }
  return null
}

export function interceptionEnvelope(interception) {
  if (!interception) return null
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: interception.reason,
      updatedInput: interception.updatedInput,
    },
  }
}
