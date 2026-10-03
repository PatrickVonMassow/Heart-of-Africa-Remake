// Decision sweep of the request-approval guard: which commands are request
// deposits, and when a transcript shows the user's approval of exactly that
// request. The 03.10.2026 failure — the user reports a problem, the session
// deposits quoting the report — is pinned as its own case.
import { describe, it, expect } from 'vitest'
import { evaluate, normalize, requestOf, tokenize, humanText } from './request-approval-guard-core.mjs'
import { commandFrom } from './request-approval-guard.mjs'

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
    'grep -n -- --request scripts/finding.mjs',
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
    expect(requestOf(command)).toEqual({ title: TITLE, approved: '' })
    expect(verdict(command, [human('hi')]).block).toBe(true)
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
    expect(requestOf(command)).toEqual({ title: TITLE, approved: '' })
    expect(verdict(command, [human('start'), said(TITLE), human('passt so')])).toMatchObject({ block: true, id: 'no-approved' })
  })

  it('still sees a request that follows a heredoc', () => {
    const command = ['cat > /tmp/s.md <<EOF', 'spec text', 'EOF', `node scripts/finding.mjs --request "${TITLE}" --spec-file /tmp/s.md`].join('\n')
    expect(requestOf(command)).toEqual({ title: TITLE, approved: '' })
  })

  it('treats a here-string as an ordinary redirect', () => {
    expect(tokenize('cat <<< "x" && ls')).toEqual(['cat', 'x', { op: '&&' }, 'ls'])
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
