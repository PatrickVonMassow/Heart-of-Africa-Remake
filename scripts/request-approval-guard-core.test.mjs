// Decision sweep of the request-approval guard: which commands are request
// deposits, and when a transcript shows the user's approval of exactly that
// request. The 03.10.2026 failure — the user reports a problem, the session
// deposits quoting the report — is pinned as its own case.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  evaluate,
  normalize,
  parseTranscript,
  requestOf,
  requestsOf,
  tokenize,
  humanText,
  isCanonical,
  isPossibleDeposit,
  looseView,
} from './request-approval-guard-core.mjs'
import { commandFrom, hookDecision, hookOutput, readTranscript } from './request-approval-guard.mjs'
import { REPO_ROOT } from './repo-paths.mjs'

const TITLE = 'Guard the request deposit'
const human = (text) => ({ type: 'user', origin: { kind: 'human' }, message: { role: 'user', content: [{ type: 'text', text }] } })
const humanString = (text) => ({ type: 'user', origin: { kind: 'human' }, message: { role: 'user', content: text } })
const meta = (text) => ({ type: 'user', isMeta: true, origin: { kind: 'human' }, message: { role: 'user', content: text } })
const hookFeedback = (text) => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } })
const toolResult = (text) => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: text }] },
})
const said = (text) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })
const thought = (text) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'thinking', thinking: text }] } })
const toolUse = (command) => ({
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command } }] },
})

const deposit = (approved, title = TITLE) =>
  `node scripts/finding.mjs --request "${title}" --spec-file /tmp/s.md --why-file /tmp/w.md` +
  (approved === undefined ? '' : ` --approved "${approved}"`)
const verdict = (command, entries) => evaluate({ command, entries })
/** A shape the pre-gate denies: one untitled deposit, refused even against an approved title. */
const nonCanonical = (command, shell = 'bash') => {
  expect(requestsOf(command, shell), command).toEqual([{ title: '', approved: '' }])
  const entries = [human('start'), said(`${TITLE} Outer Hidden`), human('passt so')]
  expect(evaluate({ command, entries, shell }), command).toMatchObject({ block: true, id: 'non-canonical' })
}

describe('non-request commands pass untouched', () => {
  const chat = [human('hallo')]
  it.each([
    'ls -la',
    'node scripts/finding.mjs --requests',
    `node scripts/finding.mjs --show "${TITLE}"`,
    `node scripts/finding.mjs --queued "${TITLE}" --point 5`,
    `node scripts/finding.mjs --blocked "${TITLE}" --why x`,
    'node scripts/finding.mjs --record "x" --detail "y"',
    'node scripts/finding.mjs --drain',
    'node scripts/finding.mjs --none "nothing"',
    'grep -n -- --requests scripts/finding.mjs',
    'node scripts/other.mjs --request "x"',
    'npx vitest run scripts/finding-request-cli.test.mjs',
  ])('%s', (command) => {
    expect(requestOf(command)).toBe(null)
    expect(verdict(command, chat).block).toBe(false)
  })
})

describe('request deposits in a chat session', () => {
  it('blocks a request without --approved', () => {
    const v = verdict(deposit(), [human('mach das'), said(`Vorschlag: ${TITLE}`), human('ja, mach das')])
    expect(v).toMatchObject({ block: true, id: 'no-approved' })
    expect(v.reason).toContain('solutions-need-user-approval')
    expect(v.reason).toContain('--approved')
  })

  it('allows proposal-then-approval', () => {
    const entries = [human('Die Fänger stehen falsch.'), said(`Ich schlage vor: **${TITLE}** — passt das?`), human('Ja, so einreihen.')]
    expect(verdict(deposit('so einreihen'), entries).block).toBe(false)
  })

  it('accepts a human message whose content is a plain string', () => {
    const entries = [humanString('start'), said(TITLE), humanString('passt so')]
    expect(verdict(deposit('passt so'), entries).block).toBe(false)
  })

  it("blocks the 03.10.2026 failure: the quote is the user's report BEFORE the proposal", () => {
    const entries = [human('Die Fänger stehen falsch am Felsen.'), said(`Ich hinterlege: ${TITLE}`)]
    expect(verdict(deposit('Die Fänger stehen falsch'), entries)).toMatchObject({
      block: true,
      id: 'no-approval-after-proposal',
    })
  })

  it('blocks a quote found only in an isMeta entry', () => {
    const entries = [human('start'), said(TITLE), meta('<local-command-caveat>passt so</local-command-caveat>')]
    expect(verdict(deposit('passt so'), entries).block).toBe(true)
  })

  it('blocks a quote found only in hook feedback or a tool result', () => {
    const entries = [human('start'), said(TITLE), hookFeedback('Stop hook feedback: passt so'), toolResult('passt so')]
    expect(verdict(deposit('passt so'), entries).block).toBe(true)
  })

  it('blocks a quote from a peer message (origin kind not human)', () => {
    const peer = { type: 'user', origin: { kind: 'peer' }, message: { role: 'user', content: 'passt so' } }
    expect(verdict(deposit('passt so'), [human('start'), said(TITLE), peer]).block).toBe(true)
  })

  it('blocks when the title stood only in a thinking block', () => {
    const entries = [human('start'), thought(`maybe deposit ${TITLE}`), said('Soll ich?'), human('passt so')]
    expect(verdict(deposit('passt so'), entries)).toMatchObject({ block: true, id: 'no-proposal' })
  })

  it('blocks when the title stood only in a tool_use input', () => {
    const entries = [human('start'), toolUse(deposit('passt so')), human('passt so')]
    expect(verdict(deposit('passt so'), entries)).toMatchObject({ block: true, id: 'no-proposal' })
  })

  it('blocks a quote shorter than two non-space characters', () => {
    const entries = [human('start'), said(TITLE), human('j')]
    expect(verdict(deposit('j'), entries)).toMatchObject({ block: true, id: 'quote-too-short' })
  })

  it('matches case-sensitively', () => {
    const entries = [human('start'), said(TITLE), human('passt so')]
    expect(verdict(deposit('Passt so'), entries).block).toBe(true)
    expect(verdict(deposit('passt so', TITLE.toLowerCase()), entries).block).toBe(true)
  })

  it('normalizes whitespace in title, reply, quote and message', () => {
    const entries = [
      human('start'),
      said('Vorschlag:\n  Guard   the\nrequest   deposit'),
      human('ja,\n\n  passt    so'),
    ]
    expect(verdict(deposit('passt   so', '  Guard the  request deposit '), entries).block).toBe(false)
    expect(normalize(' a \n\t b ')).toBe('a b')
  })
})

describe('headless sessions', () => {
  it('allows a deposit when the transcript holds no real human message', () => {
    const entries = [hookFeedback('launcher prompt'), meta('caveat'), said('working'), toolResult('ok')]
    expect(verdict(deposit(), entries).block).toBe(false)
    expect(verdict(deposit(), []).block).toBe(false)
  })

  it('denies a deposit whose transcript could not be read', () => {
    expect(verdict(deposit(), null)).toMatchObject({ block: true, id: 'transcript-unreadable' })
  })
})

describe('command parsing', () => {
  it('detects a chained command', () => {
    const command = `cd /workspace/hoa && node scripts/finding.mjs --request "${TITLE}" --stdin --session abc`
    nonCanonical(command)
  })

  it('detects node with options and an absolute script path', () => {
    expect(requestOf(`node --no-warnings /x/scripts/finding.mjs --request '${TITLE}'`)).toEqual({ title: TITLE, approved: '' })
  })

  it('ignores "--approved" inside a heredoc body', () => {
    const command = [
      `node scripts/finding.mjs --request "${TITLE}" --stdin <<'EOF'`,
      '--- spec ---',
      'node scripts/finding.mjs --approved "passt so"',
      '--approved "passt so"',
      'EOF',
    ].join('\n')
    nonCanonical(command)
  })

  it('still sees a request that follows a heredoc', () => {
    nonCanonical(['cat > /tmp/s.md <<EOF', 'spec text', 'EOF', `node scripts/finding.mjs --request "${TITLE}" --spec-file /tmp/s.md`].join('\n'))
  })

  it('splits a canonical command into its words', () => {
    expect(tokenize(`node x "a b" 'c d' --request="e f" "sag \\"ja\\""`)).toEqual(['node', 'x', 'a b', 'c d', '--request=e f', 'sag "ja"'])
  })

  it('reads --approved from the command and decodes double-quote escapes', () => {
    expect(requestOf(`node scripts/finding.mjs --request "${TITLE}" --approved "sag \\"ja\\""`)).toEqual({ title: TITLE, approved: 'sag "ja"' })
  })
})

describe('the wrapper payload reader', () => {
  it('takes the command of Bash and PowerShell only', () => {
    expect(commandFrom({ tool_name: 'Bash', tool_input: { command: 'ls' } })).toBe('ls')
    expect(commandFrom({ tool_name: 'PowerShell', tool_input: { command: 'dir' } })).toBe('dir')
    expect(commandFrom({ tool_name: 'Edit', tool_input: { command: 'ls' } })).toBe('')
    expect(commandFrom(null)).toBe('')
  })

  it('humanText refuses a mixed tool_result message', () => {
    const mixed = { type: 'user', origin: { kind: 'human' }, message: { content: [{ type: 'tool_result' }, { type: 'text', text: 'x' }] } }
    expect(humanText(mixed)).toBe(null)
  })
})

describe('cross-vendor review findings (cross-vendor review, 86cbc8f)', () => {
  const approvedChat = [human('start'), said(TITLE), human('passt so')]

  it('1: judges EVERY deposit in a command, not only the first', () => {
    const command = `${deposit('passt so')} --request "Unapproved"`
    expect(requestsOf(command).map((r) => r.title)).toEqual([TITLE, 'Unapproved'])
    expect(verdict(deposit('passt so'), approvedChat).block).toBe(false)
    expect(verdict(command, approvedChat)).toMatchObject({ block: true, id: 'no-approved' })
    expect(verdict(command, approvedChat).reason).toContain('Unapproved')
    nonCanonical(`${deposit('passt so')} ; node scripts/finding.mjs --request "Unapproved" --stdin`)
  })

  it('2: sees the deposit behind value-taking node options', () => {
    for (const opts of ['-r fs', '--require fs', '--import ./x.mjs', '--loader ./l.mjs', '--max-old-space-size 4096']) {
      const command = `node ${opts} scripts/finding.mjs --request "${TITLE}" --stdin`
      expect(requestOf(command), opts).toEqual({ title: TITLE, approved: '' })
      expect(verdict(command, approvedChat).block, opts).toBe(true)
    }
  })

  it('3: reads PowerShell backslash paths as paths', () => {
    const command = `node .\\scripts\\finding.mjs --request "${TITLE}" --stdin`
    expect(requestOf(command, 'powershell')).toEqual({ title: TITLE, approved: '' })
    expect(command).toContain('.\\scripts\\finding.mjs')
    expect(evaluate({ command, entries: approvedChat, shell: 'powershell' }).block).toBe(true)
    expect(hookDecision({ tool_name: 'PowerShell', tool_input: { command }, transcript_path: '/nonexistent' })).not.toBe(null)
    // a PowerShell call operator, backtick escape or here-string is not canonical
    nonCanonical('& node C:\\hoa\\scripts\\finding.mjs --request "a `"b`"" --approved "ok"', 'powershell')
    nonCanonical(`node .\\scripts\\finding.mjs --request "${TITLE}" --stdin @'\n--approved "passt so"\n'@`, 'powershell')
  })

  describe('4: a malformed transcript is unreadable, not headless', () => {
    let dir
    const payload = (text, name) => {
      const path = join(dir, `${name}.jsonl`)
      writeFileSync(path, text, 'utf8')
      return { tool_name: 'Bash', tool_input: { command: deposit() }, transcript_path: path }
    }
    it('the parser counts malformed lines and forgives only a torn last line', () => {
      expect(parseTranscript('{bad\n{"type":"x"}\n')).toEqual({ entries: [{ type: 'x' }], malformed: 1 })
      expect(parseTranscript('{"type":"x"}\n{"type":"us')).toEqual({ entries: [{ type: 'x' }], malformed: 0 })
      expect(parseTranscript('')).toEqual({ entries: [], malformed: 0 })
    })
    it('the reader and the hook deny an all-malformed transcript, and allow a clean headless one', () => {
      dir = mkdtempSync(join(tmpdir(), 'hoa-rag-'))
      try {
        const bad = payload('not json\n{also not}\n', 'all-malformed')
        expect(readTranscript(bad.transcript_path)).toEqual({ entries: [], malformed: 2 })
        const denied = hookDecision(bad)
        expect(denied.hookSpecificOutput.permissionDecision).toBe('deny')
        expect(denied.hookSpecificOutput.permissionDecisionReason).toContain('transcript-unreadable')
        expect(hookDecision(payload(`${JSON.stringify(said('working'))}\n`, 'headless'))).toBe(null)
        // malformed lines beside a readable human message: the ordinary rule judges
        const mixed = payload(`garbage\n${[human('start'), said(TITLE), human('passt so')].map((e) => JSON.stringify(e)).join('\n')}\n`, 'mixed')
        mixed.tool_input.command = deposit('passt so')
        expect(hookDecision(mixed)).toBe(null)
        // the real process prints the deny for the all-malformed transcript
        const run = spawnSync(process.execPath, ['scripts/request-approval-guard.mjs'], {
          cwd: REPO_ROOT,
          input: JSON.stringify(bad),
          encoding: 'utf8',
          windowsHide: true,
        })
        expect(run.status).toBe(0)
        const out = JSON.parse(run.stdout).hookSpecificOutput
        expect(out.permissionDecision).toBe('deny')
        expect(out.permissionDecisionReason).toContain('transcript-unreadable')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
    it('evaluate denies malformed lines without a human message', () => {
      expect(evaluate({ command: deposit(), entries: [], malformed: 3 })).toMatchObject({ block: true, id: 'transcript-unreadable' })
      expect(evaluate({ command: deposit(), entries: [], malformed: 0 }).block).toBe(false)
    })
  })

  it('5 (superseded by the textual rule): a command that merely mentions a deposit is judged too', () => {
    // Documented accepted false positive: rephrase the command to get past it.
    for (const command of [`echo node scripts/finding.mjs --request "Example"`, `printf '%s' node scripts/finding.mjs --request "Example"`]) {
      expect(requestOf(command), command).toEqual({ title: 'Example', approved: '' })
      expect(verdict(command, approvedChat).block, command).toBe(true)
    }
    expect(requestOf('grep -n -- --request scripts/finding.mjs')).toEqual({ title: 'scripts/finding.mjs', approved: '' })
  })
})

describe('confirming review findings (cross-vendor review, b9d21dd) — all caught by the textual rule', () => {
  const approvedChat = [human('start'), said(TITLE), human('passt so')]
  const caught = (command, shell = 'bash') => {
    expect(requestOf(command, shell), command).toEqual({ title: TITLE, approved: '' })
    expect(evaluate({ command, entries: approvedChat, shell }).block, command).toBe(true)
  }
  it('if/then', () => nonCanonical(`if true; then node scripts/finding.mjs --request "${TITLE}" --stdin; fi`))
  it('env -u', () => caught(`env -u HOME node scripts/finding.mjs --request "${TITLE}" --stdin`))
  it('bash -lc', () => caught(`bash -lc 'node scripts/finding.mjs --request "${TITLE}" --stdin'`))
  it('multi-argument pwsh -Command', () =>
    caught(`pwsh -NoProfile -Command node .\\scripts\\finding.mjs --request "${TITLE}" --stdin`, 'powershell'))
  it('PowerShell backtick + CRLF continuation', () =>
    nonCanonical(`node .\\scripts\\finding.mjs --request \`\r\n  "${TITLE}" --stdin`, 'powershell'))
  it('node -e … -- finding.mjs --request is judged (fail closed, no longer a false positive to argue)', () =>
    caught(`node -e "1" -- scripts/finding.mjs --request "${TITLE}"`))
  it('chain and node -r stay caught', () => {
    caught(`node -r fs scripts/finding.mjs --request "${TITLE}"`)
    nonCanonical(`${deposit('passt so')} && node scripts/finding.mjs --request "Unapproved"`)
  })
  it('pairs each --approved with its own --request', () => {
    const command = `node scripts/finding.mjs --request "${TITLE}" --approved "passt so" --request "Other"`
    expect(requestsOf(command)).toEqual([
      { title: TITLE, approved: 'passt so' },
      { title: 'Other', approved: '' },
    ])
  })
  it('stops the approval lookup at a --request=<value> deposit too (round-3 review)', () => {
    const command = 'node scripts/finding.mjs --request "A" --request="B" --approved "passt so"'
    expect(requestsOf(command)).toEqual([
      { title: 'A', approved: '' },
      { title: 'B', approved: 'passt so' },
    ])
    const chat = [human('start'), said('A and B'), human('passt so')]
    expect(evaluate({ command, entries: chat })).toMatchObject({ block: true, id: 'no-approved' })
  })
  it('denies a matched command whose --request has no readable title (fail closed)', () => {
    for (const command of ['node scripts/finding.mjs --request', 'node scripts/finding.mjs --request --stdin']) {
      expect(evaluate({ command, entries: approvedChat }), command).toMatchObject({ block: true, id: 'no-title' })
    }
    // a nested string whose flag yields no title is an untitled deposit
    expect(requestsOf(`bash -c 'node scripts/finding.mjs --request'`)).toEqual([{ title: '', approved: '' }])
  })
  it('does not read a title that merely contains the flag as a second deposit', () => {
    expect(requestsOf('node scripts/finding.mjs --request "Fix the --request parser" --approved "ok"')).toEqual([
      { title: 'Fix the --request parser', approved: 'ok' },
    ])
  })
  it('a title-less mention without finding.mjs is not judged', () => {
    expect(requestsOf('node scripts/other.mjs --request')).toEqual([])
  })

})

describe('mid-turn user messages (16.10.2026 endless loop)', () => {
  const words = 'Batch hierherholen, einreihen und direkt an nächste Session weitergeben'
  const rendered = (text) =>
    `<system-reminder>\nThe user sent a new message while you were working:\n${text}\n\nThis is how Claude Code surfaces messages the user sends mid-turn.\n</system-reminder>`
  // Shape copied from a real transcript (session 0eea1689, 16.10.2026).
  const midTurn = (text, origin = { kind: 'human' }) => ({
    type: 'attachment',
    attachment: { type: 'queued_command', prompt: [{ type: 'text', text }], commandMode: 'prompt', origin, humanTurn: true },
    rendered: [{ content: [{ type: 'text', text: rendered(text) }] }],
    renderedRole: 'system',
  })
  const proposalChat = [human('start'), said(`Vorschlag: **${TITLE}**`), toolUse('ls')]

  it('accepts an approval the user sent while the turn was running', () => {
    expect(humanText(midTurn(words))).toBe(words)
    expect(verdict(deposit(words), [...proposalChat, midTurn(words)]).block).toBe(false)
  })

  it('accepts a mid-turn prompt stored as a plain string', () => {
    const entry = midTurn(words)
    entry.attachment.prompt = words
    expect(verdict(deposit(words), [...proposalChat, entry]).block).toBe(false)
  })

  it('refuses the same text quoted inside a tool result', () => {
    const v = verdict(deposit(words), [...proposalChat, toolResult(rendered(words))])
    expect(v).toMatchObject({ block: true, id: 'no-approval-after-proposal' })
  })

  it('refuses the same text inside a system notification or a peer message', () => {
    const notification = {
      type: 'attachment',
      attachment: { type: 'queued_command', prompt: `<task-notification>${rendered(words)}</task-notification>`, commandMode: 'task-notification' },
    }
    const peer = midTurn(words, { kind: 'peer', from: 'a1' })
    const other = { type: 'attachment', attachment: { type: 'edited_text_file', snippet: words, origin: { kind: 'human' } } }
    for (const entry of [notification, peer, other, { ...midTurn(words), isMeta: true }]) {
      expect(humanText(entry)).toBe(null)
      expect(verdict(deposit(words), [...proposalChat, entry])).toMatchObject({ block: true, id: 'no-approval-after-proposal' })
    }
  })

  it('still refuses a mid-turn quote sent BEFORE the proposal', () => {
    const entries = [human('start'), midTurn(words), said(`Vorschlag: **${TITLE}**`)]
    expect(verdict(deposit(words), entries)).toMatchObject({ block: true, id: 'no-approval-after-proposal' })
  })
})

describe('the flag word inside a finding detail', () => {
  const chat = [human('hallo')]
  it('a --record whose --detail contains the flag word is no request', () => {
    const command =
      'node scripts/finding.mjs --record "Approval guard misses mid-turn messages" ' +
      '--detail "finding.mjs --request with that wording was refused; the guard reads --request in detail text"'
    expect(requestsOf(command)).toEqual([])
    expect(verdict(command, chat).block).toBe(false)
  })

  it('a --detail value with command substitution is still judged (fail closed)', () => {
    nonCanonical(`node scripts/finding.mjs --record x --detail "$(node scripts/finding.mjs --request '${TITLE}')"`)
  })

  it('a real request next to a --record detail is still judged', () => {
    nonCanonical(`node scripts/finding.mjs --record x --detail "mentions --request"; node scripts/finding.mjs --request "${TITLE}"`)
  })
  it('a --detail word given to another program is still judged (no eval bypass)', () => {
    const command = `bash -c 'eval "$1"' --detail 'node scripts/finding.mjs --request Unapproved --stdin'`
    // the opaque `eval "$1"` string counts as an untitled deposit too (round 7 on 5fc0e782c)
    expect(requestsOf(command)).toEqual([{ title: '', approved: '' }, { title: 'Unapproved', approved: '' }])
    const nextLine = `node scripts/finding.mjs --record x\nbash -c 'eval "$1"' --detail 'node scripts/finding.mjs --request Unapproved'`
    nonCanonical(nextLine)
  })

  it('an exact --request detail value stays a deposit (finding.mjs reads it as the flag)', () => {
    expect(requestsOf('node scripts/finding.mjs --record x --detail "--request"')).toHaveLength(1)
  })

  it('an expansion-bearing or unquoted detail value is still judged', () => {
    expect(requestsOf('node scripts/finding.mjs --record x --detail {--request,Unapproved} --stdin')).toHaveLength(1)
    expect(requestsOf('node scripts/finding.mjs --detail [-\\ --request]* Unapproved --stdin')).toHaveLength(1)
  })

  it('an --approved word of a later command is no approval', () => {
    nonCanonical(`node scripts/finding.mjs --request "${TITLE}" --stdin; printf '%s\\n' --approved "passt so"`)
  })

  it('detail prose inside a re-parsed string is still judged (fail closed)', () => {
    expect(requestsOf(`bash -lc 'node scripts/finding.mjs --record x --detail "mentions --request"'`)).toHaveLength(1)
    const piped = `printf '%s' 'node scripts/finding.mjs --detail "x --request Unapproved"' | xargs -d ' ' sh -c 'exec "$@"' _`
    expect(requestsOf(piped)).not.toEqual([])
  })

  it('an --approved word inside a comment is no approval', () => {
    nonCanonical(`node scripts/finding.mjs --request "${TITLE}" --stdin # --approved "passt so"`)
    nonCanonical(`node scripts/finding.mjs --request A --stdin --approved #ok`)
  })

  it('a substitution inside a title or approval is still scanned', () => {
    nonCanonical(`node scripts/finding.mjs --request "Outer $(node scripts/finding.mjs --request Hidden --stdin)" --approved "passt so"`)
    // a single-quoted title is literal: no substitution runs, the title is judged as written
    expect(requestsOf(`node scripts/finding.mjs --request 'Outer $(x)'`)).toEqual([{ title: 'Outer $(x)', approved: '' }])
  })

})

describe('shapes of earlier review rounds are denied by the pre-gate (cross-vendor review, rounds 6 and 2)', () => {
  const shapes = [
    'node scripts/finding.mjs --request > /tmp/out Hidden --stdin --approved "passt so"',
    'node scripts/finding.mjs --request 2>/dev/null Hidden',
    'node scripts/finding.mjs --request=>x Hidden',
    ['cat <<-EOF', '\t`node scripts/finding.mjs --request Hidden`', '\tEOF'].join('\n'),
    ['cat <<EOF', '$\\', '(node scripts/finding.mjs --request Hidden --stdin)', 'EOF'].join('\n'),
    ['cat <<-EOF', '\t`node scripts/finding.mjs \\', '\t--request Hidden`', '\tEOF'].join('\n'),
    ['cat <<EO\\', 'F', '$(node scripts/finding.mjs --request Hidden --stdin)', 'EOF'].join('\n'),
    ["cat <<'X'", 'foo\\', 'X', 'node scripts/finding.mjs --request Hidden --stdin'].join('\n'),
    'node scripts/finding.mjs --request <<< Outer Hidden --stdin --approved "passt so"',
    'node scripts/finding.mjs --request <<<"Outer" Hidden --stdin --approved "passt so"',
    "node scripts/finding.mjs --request 0<<< 'Outer' Hidden --stdin --approved \"passt so\"",
    'node scripts/finding.mjs --request {fd}<Outer Hidden --stdin --approved "passt so"',
    'node scripts/finding.mjs --request < Outer Hidden --stdin --approved "passt so"',
    'node scripts/finding.mjs --request >> Outer Hidden --stdin --approved "passt so"',
    ['node scripts/finding.mjs --request <<-Outer Hidden --approved "passt so"', 'x', 'Outer'].join('\n'),
    'node scripts/finding.mjs --request Outer --stdin --approved <<< "passt so"',
    'node scripts/finding.mjs --request Outer --stdin > --approved "passt so"',
    'node scripts/finding.mjs --request {fd}<<<Outer Hidden --stdin --approved "passt so"',
    ...['2>/dev/null', '>&2', '<&0', '&> /tmp/x', '>> /tmp/x', '< /tmp/x', "<<< 'x'"].map(
      (r) => `node scripts/finding.mjs --request Outer --stdin ${r} --approved "passt so"`,
    ),
    ['node scripts/finding.mjs --request Outer --stdin --approved "passt so" <<\'EOF\'', '--- spec ---', 'x', 'EOF'].join('\n'),
  ]
  it.each(shapes)('%s', (command) => nonCanonical(command))

  it('a quoted heredoc body that mentions a deposit is denied too (accepted over-block)', () => {
    for (const open of ["<<'EOF'", '<<"EOF"', '<<\\EOF']) {
      nonCanonical([`cat > /tmp/s.md ${open}`, 'Notes: $(node scripts/finding.mjs --request Hidden --stdin)', 'EOF'].join('\n'))
    }
  })

  it('a heredoc fed to a shell runs its body, so a deposit there is denied whatever the delimiter quoting', () => {
    for (const sh of ['bash', 'sh', 'zsh', 'dash', '/bin/bash']) {
      for (const open of ["<<'EOF'", '<<"EOF"', '<<EOF', '<<-EOF']) {
        nonCanonical([`${sh} ${open}`, `node scripts/finding.mjs --request Hidden --spec-file /tmp/s.md --approved "passt so"`, 'EOF'].join('\n'))
      }
    }
  })
})

describe('coarse fail-closed pre-gate (cross-vendor review, round 3 on the shape fixes)', () => {
  // the transcript approves only some OTHER, visible title
  const chat = [human('start'), said('Vorschlag: Outer'), human('passt so')]
  const denied = (command) => {
    expect(isPossibleDeposit(command), command).toBe(true)
    expect(evaluate({ command, entries: chat }), command).toMatchObject({ block: true, id: 'non-canonical' })
  }
  const shapes = {
    'substitution inside --request=': 'node scripts/finding.mjs --request="Outer $(node scripts/finding.mjs --request Hidden --stdin)" --approved "passt so"',
    'redirection before the title': 'node scripts/finding.mjs --request > /tmp/out Hidden --stdin --approved "passt so"',
    'unquoted heredoc body with a substitution': ['cat > /tmp/s.md <<EOF', 'Notes: $(node scripts/finding.mjs --request Hidden --stdin)', 'EOF'].join('\n'),
    'quote-split flag inside a substitution': 'echo "$(node scripts/finding.mjs --reque""st Hidden --stdin)"',
    'quote-split flag inside a heredoc': ['cat <<EOF', '$(node scripts/finding.mjs --reque""st Hidden --stdin)', 'EOF'].join('\n'),
    'continued heredoc terminator hiding a later deposit': [
      'cat <<EOF',
      "it's a note",
      'EO\\',
      'F',
      'node scripts/finding.mjs --request Hidden --stdin --approved "passt so"',
    ].join('\n'),
    'attached redirection': 'node scripts/finding.mjs --request Outer --stdin>/tmp/out --approved "passt so"',
    'quote-split script name': 'node scripts/fin""ding.mjs --request Outer --approved "passt so"',
    'backslash-split flag': 'node scripts/finding.mjs --req\\uest Outer --approved "passt so"',
    'empty ANSI-C string inside the name': "node scripts/fin$''ding.mjs --request Outer --approved \"passt so\"",
    'backslash-newline inside the flag': 'node scripts/finding.mjs --req\\\nuest Outer --approved "passt so"',
    'chained second deposit': 'node scripts/finding.mjs --request Outer --approved "passt so"; node scripts/finding.mjs --request Hidden',
  }
  for (const [name, command] of Object.entries(shapes)) it(`denies: ${name}`, () => denied(command))

  it('the reason tells the author how to deposit instead', () => {
    const { reason } = evaluate({ command: shapes['attached redirection'], entries: chat })
    expect(reason).toContain('ONE plain line')
    expect(reason).toContain('--spec-file')
    expect(reason).toContain('Write tool')
  })

  it('the loose view drops quotes, escapes, continuations and $', () => {
    expect(looseView('fin""ding.mjs --req\\uest a\\\nb $x')).toBe('finding.mjs --request ab x')
  })

  it('a plain canonical approved deposit is still allowed, an unapproved one blocked', () => {
    const plain = 'node scripts/finding.mjs --request "Outer" --spec-file /tmp/s.md --why-file /tmp/w.md --approved "passt so"'
    expect(isCanonical(plain)).toBe(true)
    expect(evaluate({ command: plain, entries: chat }).block).toBe(false)
    expect(evaluate({ command: plain.replace('Outer', 'Hidden'), entries: chat })).toMatchObject({ block: true, id: 'no-proposal' })
    expect(evaluate({ command: 'node scripts/finding.mjs --request="Outer" --approved "passt so"', entries: chat }).block).toBe(false)
  })

  it('an unquoted tilde is not canonical: bash expands the title past its approval', () => {
    const command = 'node scripts/finding.mjs --request ~+ --spec-file /tmp/s.md --why-file /tmp/w.md --approved "passt so"'
    expect(isCanonical(command)).toBe(false)
    const approved = [human('start'), said('Vorschlag: ~+'), human('passt so')]
    expect(evaluate({ command, entries: approved })).toMatchObject({ block: true, id: 'non-canonical' })
    expect(isCanonical('node scripts/finding.mjs --request "~+" --approved "passt so"')).toBe(true)
  })

  it('a deposit not started by node itself is not canonical: eval and friends reparse the title', () => {
    const approved = [human('start'), said('Vorschlag: ~+'), human('ok')]
    const tail = "scripts/finding.mjs --request '~+' --spec-file /tmp/s.md --why-file /tmp/w.md --approved ok"
    for (const prefix of ['eval node', 'env node', 'bash -c node', 'xargs node', 'sudo node']) {
      const command = `${prefix} ${tail}`
      expect(evaluate({ command, entries: approved }), command).toMatchObject({ block: true, id: 'non-canonical' })
    }
    expect(evaluate({ command: `node ${tail}`, entries: approved }).block).toBe(false)
  })

  it('a quoted shell wrapper around a deposit is never canonical: bash/sh/zsh -c and eval are denied', () => {
    const unapproved = [human('hallo')]
    const approved = [human('start'), said('Vorschlag: X'), human('passt so')]
    const wrapped = [
      `bash -c 'node $F $R X'`,
      `bash -c 'node scripts/fin""ding.mjs --request X'`,
      `sh -c 'node scripts/finding.mjs --request X --approved "passt so"'`,
      `zsh -c 'node scripts/finding.mjs --request X --approved "passt so"'`,
      `eval 'node scripts/finding.mjs --request X --approved "passt so"'`,
    ]
    for (const command of wrapped) {
      expect(evaluate({ command, entries: unapproved }), command).toMatchObject({ block: true, id: 'non-canonical' })
      expect(evaluate({ command, entries: approved }), command).toMatchObject({ block: true, id: 'non-canonical' })
    }
    expect(evaluate({ command: 'node scripts/finding.mjs --request X --approved "passt so"', entries: approved }).block).toBe(false)
  })

  it('unrelated commands are untouched', () => {
    // a heredoc or pipe now counts as a possible deposit (accepted over-block); see the expansion block below
    for (const command of ['git status', 'ls -la scripts', 'npm run build']) {
      expect(isPossibleDeposit(command), command).toBe(false)
      expect(evaluate({ command, entries: chat }).block, command).toBe(false)
    }
  })

  it('a headless session is not gated (it may deposit anyway)', () => {
    expect(evaluate({ command: shapes['attached redirection'], entries: [said('working')] }).block).toBe(false)
    expect(evaluate({ command: shapes['attached redirection'], entries: null })).toMatchObject({ block: true, id: 'transcript-unreadable' })
    expect(evaluate({ command: shapes['attached redirection'], entries: [], malformed: 1 })).toMatchObject({ block: true, id: 'non-canonical' })
  })

  it('the hook wrapper judges a possible deposit the precise parse does not see', () => {
    const command = shapes['quote-split flag inside a substitution']
    expect(hookDecision({ tool_name: 'Bash', tool_input: { command }, transcript_path: '/nonexistent' })).not.toBe(null)
    expect(hookDecision({ tool_name: 'Bash', tool_input: { command: 'git status' }, transcript_path: '/nonexistent' })).toBe(null)
  })
})

describe('a deposit assembled by expansion is a possible deposit (cross-vendor review of 1367, round 5)', () => {
  const chat = [human('start'), said('Vorschlag: Outer'), human('passt so')]
  const tail = ' Hidden --spec-file /tmp/s.md --why-file /tmp/w.md'
  it.each([
    `node scripts/fin{d..d}ing.mjs --re{q..q}uest${tail}`,
    `node scripts/fin*.mjs --request${tail}`,
    `node scripts/fin*.mjs --re?uest${tail}`,
    `node scripts/finding.mjs $'--re\\x71uest'${tail}`,
    `node $'scripts/fin\\x64ing.mjs' $'\\x2d\\x2d\\x72\\x65\\x71\\x75\\x65\\x73\\x74'${tail}`,
    `node $'scripts/fin\\144ing.mjs' --re[q]uest${tail}`,
    `node scripts/f@(i)nding.mjs --re\${Q:-q}uest${tail}`,
    // the expansion supplies the whole marker word (Astra review of 0c4051d18)
    `node $(printf 'scripts/fin%sing.mjs' d) $(printf -- '--re%suest' q)${tail}`,
    `node $F $R${tail}`,
    `node scripts/$F --request${tail}`,
    `node {scripts/fin,x}{ding.mjs,y} {--re,x}{quest,y}${tail}`,
    `node scripts/finding.mjs --re{q..q}uest=Hidden --spec-file /tmp/s.md`,
    // bash joins continuations before it reads $'…'
    `node $\\\n'scripts/fin\\x64ing.mjs' $\\\n'--re\\x71uest'${tail}`,
  ])('denies: %s', (command) => {
    expect(isPossibleDeposit(command), command).toBe(true)
    expect(evaluate({ command, entries: chat }), command).toMatchObject({ block: true, id: 'non-canonical' })
  })

  it.each(['git status', 'ls *.md', 'ls README.md', 'npm run lint', "git commit -m 'Fix x'"])('leaves alone: %s', (command) => {
    expect(isPossibleDeposit(command), command).toBe(false)
    expect(evaluate({ command, entries: chat }).block, command).toBe(false)
  })

  // Astra round 10 on 70c46b122: splatting; a word that spells a marker and expands too
  it.each([
    ['node @depositArgs', 'powershell'],
    ['node @depositArgs', 'bash'],
    ["bash -c 'eval node scripts/finding.mjs?*'", 'powershell'],
    ["bash -c 'eval node scripts/finding.mjs?*'", 'bash'],
    ["bash -c 'node @a'", 'powershell'],
    // Astra round 11 on 3cceeac5f: the ls exception checks splatting too
    ['ls @depositArgs', 'powershell'],
  ])('a possible deposit: %s (%s)', (command, shell) => {
    expect(isPossibleDeposit(command, shell), command).toBe(true)
    expect(evaluate({ command, entries: chat, shell }), command).toMatchObject({ block: true, id: 'non-canonical' })
  })

  it('a quoted literal path in a direct PowerShell call stays literal (Astra round 11, P2)', () => {
    const command = "node scripts\\finding.mjs --request Outer --spec-file 'C:\\tmp\\finding.mjs[old].md' --why-file C:\\tmp\\w.md --approved \"passt so\""
    expect(requestsOf(command, 'powershell')).toEqual([{ title: 'Outer', approved: 'passt so' }])
    expect(evaluate({ command, entries: chat, shell: 'powershell' }).block).toBe(false)
  })

  it.each(['git status', 'ls *.md', 'ls README.md'])('leaves alone in PowerShell: %s (Astra round 9, P2)', (command) => {
    expect(isPossibleDeposit(command, 'powershell'), command).toBe(false)
    expect(evaluate({ command, entries: chat, shell: 'powershell' }).block, command).toBe(false)
  })

  // Accepted over-block: a non-canonical chat command with any character outside the plain set counts.
  it.each([
    'echo $HOME',
    'cd "$(git rev-parse --show-toplevel)"',
    "echo 'a $b' | wc -l",
    'ls {src,docs}/*.ts',
    'cat scripts/*.json',
    ['ls *.md', 'ls'].join('\n'),
    ['cat > /tmp/notes.md <<EOF', "it's $(date)", 'EOF'].join('\n'),
    // a quoted command string is judged like a non-canonical command (round 7 on 5fc0e782c)
    "git commit -m 'Fix (x)'",
    "find . -name '*.ts'",
  ])('a non-plain character counts (accepted over-block): %s', (command) => {
    expect(isPossibleDeposit(command), command).toBe(true)
    expect(evaluate({ command, entries: chat }), command).toMatchObject({ block: true, id: 'non-canonical' })
  })

  it.each([
    `node scripts/fin*.mjs X${tail}`,
    `node scripts/x.mjs --re?uest${tail}`,
    `node scripts/x.mjs --re?uest=Hidden`,
    'npx $F $R Hidden',
    'bash -c "$CMD"',
    'eval $CMD',
    '. $FILE',
    'xargs < /tmp/args $F',
    '$N scripts/x.mjs $R Hidden',
    'cd /tmp && $N $F',
    // Astra round 2 on 23e1c913f: attached redirections, assignment prefix, expanded executor
    `node scripts/fin*.mjs</dev/null --request>/dev/null${tail}`,
    `node $F --re{q..q}uest>/dev/null${tail}`,
    `A=1 $N $F $R${tail}`,
    `n{o..o}de $F $R${tail}`,
    `echo "$($N $F $R)"`,
    'echo `$N $F $R`',
    `>echo $N $F $R`,
    // Astra round 3 on 243b02ae3: git runs an argument, heredoc substitution after a separator, quoted fake heredoc
    `git -c alias.d='!node' d $F $R${tail}`,
    ['cat <<EOF', '$(echo; $N $F $R)', 'EOF'].join('\n'),
    ["echo '<<EOF'", `$N $F $R${tail}`, 'EOF'].join('\n'),
    ["cat <<'EOF'", '$x', 'EOF', `node $F $R${tail}`].join('\n'),
    // Astra round 4 on 59f33aa53: here-string, continuation in a quoted heredoc, POSIX bracket class
    `cat <<<$F; node $F $R${tail}`,
    ["cat <<'EOF'", 'x\\', 'EOF', `node $F $R${tail}`].join('\n'),
    `node scripts/fin[[:alpha:]]ing.mjs --re[[:alpha:]]uest${tail}`,
    // Astra round 5 on 2694444a0: a matched filename may hold a whole command
    'eval cd*.md',
    'bash x*',
    // Astra round 6 on 9a0d7bd: the ls exception holds only for globs that cannot match a marker
    'ls scripts/fin*.mjs',
    'ls -la scripts/*.mjs',
    'ls --re?uest',
    // a quoted expansion that a nested shell re-reads
    `bash -c 'node scripts/fin*.mjs --re* Hidden'`,
    `bash -c 'node scripts/fin{d..d}ing.mjs --re{q..q}uest Hidden'`,
    `eval 'node scripts/fin?ing.mjs --re?uest Hidden'`,
    `bash -c 'node $(printf scripts/fin%sing.mjs d) X'`,
    `bash -c 'node scripts/fin[d]ing.mjs X'`,
    // Astra round 7 on 5fc0e782c: positional parameter; a quoted command string re-read by eval
    `bash -c 'node scripts/fin$9ding.mjs --re$9quest${tail}'`,
    `bash -c 'node scripts/fin$@ding.mjs X'`,
    `bash -c 'eval cd*.md'`,
    `bash -c 'echo hi; $N'`,
    // Astra round 8 on 9561e5879: eval re-joins separately quoted words
    `eval node 'scripts/fin""ding.mjs' '--reque""st'${tail}`,
    "eval bash 'x*'",
    `eval node 'scripts/f@(i)nding.mjs' X`,
    // Astra round 9 on 4acdd52f0: a quoted tilde expands to $HOME under eval
    `eval node '~' --request${tail}`,
  ])('a possible deposit: %s', (command) => {
    expect(isPossibleDeposit(command), command).toBe(true)
    expect(evaluate({ command, entries: chat }), command).toMatchObject({ block: true, id: 'non-canonical' })
  })

  it('a single-quoted $ in a canonical deposit stays literal: one titled request (Astra round 3, P2)', () => {
    const command = "node scripts/finding.mjs --request Outer --spec-file '/tmp/$SPEC.md' --why-file /tmp/w.md --approved \"passt so\""
    expect(requestsOf(command)).toEqual([{ title: 'Outer', approved: 'passt so' }])
    expect(evaluate({ command, entries: chat }).block).toBe(false)
  })

  it('a canonical read command behaves as before: no request (Astra round 5, P2)', () => {
    const command = "grep '$' scripts/finding.mjs"
    expect(requestsOf(command)).toEqual([])
    expect(evaluate({ command, entries: chat }).block).toBe(false)
  })

  it('a PowerShell backslash path is a direct finding.mjs call: one titled request (Astra round 4, P2)', () => {
    const command = "node scripts\\finding.mjs --request Outer --spec-file 'C:\\tmp\\$SPEC.md' --why-file C:\\tmp\\w.md --approved \"passt so\""
    expect(requestsOf(command, 'powershell')).toEqual([{ title: 'Outer', approved: 'passt so' }])
    expect(evaluate({ command, entries: chat, shell: 'powershell' }).block).toBe(false)
  })
})

describe('cross-vendor review finding (cross-vendor review, 7589d5b): PowerShell stop-parsing', () => {
  it('denies an approved title behind --%, which PowerShell expands as %VAR%', () => {
    const command = 'node scripts/finding.mjs --% --request "%USERNAME%" --spec-file C:/tmp/s.md --why-file C:/tmp/w.md --approved "ok"'
    nonCanonical(command, 'powershell')
    const chat = [human('start'), said('%USERNAME%'), human('ok')]
    expect(evaluate({ command, entries: chat, shell: 'powershell' }).block).toBe(true)
    // a quoted --% is a literal argument in both shells, and bash knows no stop-parsing token
    expect(isCanonical(`node scripts/finding.mjs --request "a --% b" --approved "ok"`, 'bash')).toBe(true)
    expect(isCanonical(`node scripts/finding.mjs --request "a --% b" --approved "ok"`, 'powershell')).toBe(true)
    expect(isCanonical(`node scripts/finding.mjs --request 'a --% b' --approved "ok"`, 'powershell')).toBe(true)
    nonCanonical('node scripts/finding.mjs --request "x" --approved "ok" --%', 'powershell')
  })
})

describe('the hook wrapper fails closed (cross-vendor review of 1367, round 6)', () => {
  const GUARD = fileURLToPath(new URL('./request-approval-guard.mjs', import.meta.url))
  const spawnGuard = (input, env = {}) =>
    spawnSync(process.execPath, [GUARD], { input, encoding: 'utf8', env: { ...process.env, ...env }, windowsHide: true })
  const denyReason = (stdout) => {
    const out = JSON.parse(stdout).hookSpecificOutput
    expect(out.permissionDecision).toBe('deny')
    return out.permissionDecisionReason
  }

  it('denies a garbled payload, naming the parse error', () => {
    const run = spawnGuard('{"tool_name": "Bash", "tool_input": ')
    expect(run.status).toBe(0)
    expect(denyReason(run.stdout)).toContain('garbled hook payload')
  })

  it('denies when evaluation throws, naming the error', () => {
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } })
    const run = spawnGuard(payload, { REQUEST_APPROVAL_GUARD_TEST_THROW: '1' })
    expect(run.status).toBe(0)
    expect(denyReason(run.stdout)).toContain('evaluation error: forced test error')
    expect(denyReason(hookOutput(payload, () => { throw new Error('boom') }))).toContain('evaluation error: boom')
  })

  it('denies a whitespace-only payload rather than reading it as a manual run', () => {
    const run = spawnGuard(' \n')
    expect(run.status).toBe(0)
    expect(denyReason(run.stdout)).toContain('garbled hook payload')
  })

  it('stays a silent no-op on an empty manual run', () => {
    const run = spawnGuard('')
    expect(run.status).toBe(0)
    expect(run.stdout).toBe('')
  })

  it('still allows an ordinary non-deposit command', () => {
    const run = spawnGuard(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' } }))
    expect(run.status).toBe(0)
    expect(run.stdout).toBe('')
  })

  it('the hook and --check pre-gate a PowerShell command in its own dialect', () => {
    // canonical in PowerShell (a backslash is no escape there), non-canonical in bash
    const command = 'Get-Content C:\\tmp\\notes.md'
    expect(isPossibleDeposit(command, 'bash')).toBe(true)
    expect(isPossibleDeposit(command, 'powershell')).toBe(false)
    const check = spawnSync(process.execPath, [GUARD, '--check', command, '--powershell'], { encoding: 'utf8', windowsHide: true })
    expect(check.stdout).toContain('OK (not a request deposit)')
    const bashCheck = spawnSync(process.execPath, [GUARD, '--check', command], { encoding: 'utf8', windowsHide: true })
    expect(bashCheck.stdout).toContain('a possible request deposit')
  })
})

describe('pure read pipelines pass the pre-gate (21.10.2026 Stop-loop blockade)', () => {
  // a chat session that approved nothing: anything judged as a possible deposit is refused
  const chat = [human('start'), said('Vorschlag: Outer'), human('passt so')]
  const STAMP =
    `node -e "console.log(new Intl.DateTimeFormat('de-DE',` +
    `{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',` +
    `minute:'2-digit',timeZone:'Europe/Berlin'}).format(new Date()))"`
  const allowed = (command, shell = 'bash') => {
    expect(isPossibleDeposit(command, shell), command).toBe(false)
    expect(evaluate({ command, entries: chat, shell }).block, command).toBe(false)
  }
  const judged = (command, shell = 'bash') => {
    expect(isPossibleDeposit(command, shell), command).toBe(true)
  }

  it.each([
    'rg "x" a | head',
    'git log --oneline | head -5',
    'cat f | grep y',
    'grep -n "a\\|b" f',
    "sed -n '1,20p' f | tail -3",
    "rg -n 'a|b?' scripts | sort | uniq -c",
    // U13: the timestamp command the UserPromptSubmit hook prescribes
    STAMP,
    // measured 21.10.2026: a quoted ?, ;, | or * in a canonical command is literal
    'node scripts/board.mjs vdzk-keep "Kartenschrift für die Anweisungstexte?"',
    'node scripts/ask-lane.mjs --kind enumerate --brief "read problem.md; answer | why?"',
    'git diff --stat main | tail -1',
    'sort -u f | uniq -c',
  ])('allowed: %s', (command) => allowed(command))

  it('the hook timestamp is exactly the command berlin-timestamp.cjs prescribes', () => {
    const hook = readFileSync(join(REPO_ROOT, 'scripts', 'hooks', 'berlin-timestamp.cjs'), 'utf8')
    const prescribed = [...hook.matchAll(/`([^`]*)`/g)].map((m) => m[1]).join('')
    expect(prescribed).toContain(STAMP)
  })

  it.each([
    'rg --request scripts/finding.mjs',
    "rg -n -- '--request' scripts | head",
    'cat f > g',
    'cat f | grep y > g',
    'rg x; node y',
    'rg x && node y',
    'cat f || rg x',
    'rg --pre cmd x | head',
    'rg --pre=cmd "x?"',
    "sort --compress-program=gzip f | head",
    'git -c alias.l=!sh log | head',
    'git --exec-path=/tmp log | head',
    "sed -n 's/a/b/w out' f | head",
    "sed -n '1e ls' f | head",
    "sed -e '1e ls' -n f | head",
    "sed 's/a/b/' f | head",
    "sed -E 's/a/b/p' f | head",
    'x | bash',
    'cat f | bash',
    'cat f | xargs node',
    'cat "$(ls)" | head',
    'cat `ls` | head',
    'cat *.md | head',
    'ls scripts/fin*.mjs | head',
    "bash -c 'node scripts/fin*.mjs --re* Hidden'",
    "eval 'node scripts/fin?ing.mjs --re?uest Hidden'",
    `node -e "console.log('scripts/finding.mjs')"`,
    `node -e "require('child_process').execSync('node scripts/fin*.mjs --re*')"`,
    `node -e "x['constr'+'uctor']('?')"`,
    `node -e "process.stdout.write('a*')"`,
    'node scripts/x.mjs "a?" | head',
    'node --import ./x.mjs scripts/x.mjs "a?"',
    "find . -name '*.ts'",
    // cross-vendor review of ea049bf: escapes, forwarding helpers, executing and writing modes
    `node -e 'requ\\u0069re("child_pro"+"cess").execSync("node scripts/fin"+"ding.mjs --re"+"quest Hidden")'`,
    `cat f | node -e 'requ\\u0069re("child_pro"+"cess")'`,
    'node -e "`${1}`"',
    "node scripts/runner.mjs 'node scripts/fin${X:-d}ing.mjs --re${Y:-q}uest Hidden'",
    'node scripts/runner.mjs "node scripts/fin?ing.mjs x"',
    'node scripts/runner.mjs "run *"',
    'git diff --ext-diff HEAD | head',
    'git log --textconv -p | head',
    'git branch --edit-description | head',
    'git branch --e | head',
    'git log --textc -p | head',
    'git diff --ext | head',
    'git diff --output=scripts/x.mjs | head',
    'sort -o scripts/x.mjs payload | head',
    'cat f | sort -uo scripts/x.mjs',
    'cat f | sort --output=scripts/x.mjs',
    'cat f | uniq - scripts/x.mjs',
    'cat payload | uniq -- - -out',
    `node scripts/runner.mjs 'node scripts/"fin"*.mjs X'`,
    "node scripts/runner.mjs 'node scripts/fin*.mjs</dev/null X'",
    "node scripts/runner.mjs 'node scripts/fin?ing.mjs</dev/null X'",
    "node scripts/runner.mjs 'printf %s scripts/fin ding.mjs,--re quest,Hidden | xargs -d , node'",
    'node scripts/runner.mjs "plain prose?"',
    `node -e 'Object.getOwnPropertyDescriptor(Object.getPrototypeOf(()=>0),"constr"+"uctor").value("return pro"+"cess")()'`,
  ])('still judged: %s', (command) => judged(command))

  it('a judged non-canonical read still meets the chat refusal', () => {
    expect(evaluate({ command: 'cat f > g', entries: chat })).toMatchObject({ block: true, id: 'non-canonical' })
  })

  it.each([
    'Get-Content f | Select-String y',
    'Get-ChildItem | Select-String "a|b?"',
    "Get-Content f | Select-String -Pattern 'a.*b' -CaseSensitive",
    'get-date',
    "Get-Content 'notes; draft.md'",
    'node scripts\\board.mjs vdzk-keep "Kartenschrift?"',
  ])('allowed in PowerShell: %s', (command) => allowed(command, 'powershell'))

  it.each([
    'Get-Content f | Select-String --request',
    'Get-Content scripts\\finding.mjs | Select-String x',
    'Get-Content f > g',
    'Get-Content f; node y',
    'Get-Content f | pwsh',
    'Get-Content f | Invoke-Expression',
    'Get-Content $f | Select-String x',
    'Get-ChildItem fin*.mjs | Select-String x',
    'Get-ChildItem @a | Select-String x',
    "Get-Content f | Select-String 'x?' | bash",
    "pwsh -Command 'node scripts\\fin*.mjs'",
    "Get-Content 'scripts/fin*.mjs'",
    "Get-Content 'scripts\\fin*.mjs'",
    "Get-Content 'scripts/FIN*.mjs'",
    "Get-ChildItem scripts -Filter 'finding?.mjs'",
    "Get-Content 'notes?.md'",
    "Select-String 'x?' scripts/fin*",
    "Get-Content f | Select-String 'x' -Path 'scripts/f*'",
    "Get-ChildItem scripts | Select-String -Pattern '.' -Include '*fin[d]ing.mjs'",
    "Get-ChildItem scripts | Select-String 'x?' -Exclude 'a*'",
    "Get-ChildItem scripts | Select-String -Pattern '.' \u2013Include '*fin[d]ing.mjs'",
    "Get-ChildItem scripts | Select-String 'x?' \u2014Path 'a*'",
    "Get-Content f | Select-String 'x?' 'scripts/fin*.mjs'",
    "Get-ChildItem 'Scripts\\Fin?ing.MJS' | Select-String x",
    "Get-ChildItem 'scripts/fin*.mjs' | Select-String x",
  ])('still judged in PowerShell: %s', (command) => judged(command, 'powershell'))
})
