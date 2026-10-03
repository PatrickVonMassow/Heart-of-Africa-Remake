// Decision sweep of the request-approval guard: which commands are request
// deposits, and when a transcript shows the user's approval of exactly that
// request. The 03.10.2026 failure — the user reports a problem, the session
// deposits quoting the report — is pinned as its own case.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  evaluate,
  normalize,
  parseTranscript,
  requestOf,
  requestsOf,
  tokenize,
  humanText,
} from './request-approval-guard-core.mjs'
import { commandFrom, hookDecision, readTranscript } from './request-approval-guard.mjs'
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

describe('cross-vendor review findings (GPT-6 Astra, 86cbc8f)', () => {
  const approvedChat = [human('start'), said(TITLE), human('passt so')]

  it('1: judges EVERY deposit in a chained command, not only the first', () => {
    const command = `${deposit('passt so')} ; node scripts/finding.mjs --request "Unapproved" --stdin`
    expect(requestsOf(command).map((r) => r.title)).toEqual([TITLE, 'Unapproved'])
    expect(verdict(deposit('passt so'), approvedChat).block).toBe(false)
    expect(verdict(command, approvedChat)).toMatchObject({ block: true, id: 'no-approved' })
    expect(verdict(command, approvedChat).reason).toContain('Unapproved')
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
    // the PowerShell escape is the backtick, and a here-string body is one word
    expect(requestOf('& node C:\\hoa\\scripts\\finding.mjs --request "a `"b`"" --approved "ok"', 'powershell')).toEqual({
      title: 'a "b"',
      approved: 'ok',
    })
    const here = `node .\\scripts\\finding.mjs --request "${TITLE}" --stdin @'\n--approved "passt so"\n'@`
    expect(requestOf(here, 'powershell')).toEqual({ title: TITLE, approved: '' })
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

describe('confirming review findings (GPT-6 Astra, b9d21dd) — all caught by the textual rule', () => {
  const approvedChat = [human('start'), said(TITLE), human('passt so')]
  const caught = (command, shell = 'bash') => {
    expect(requestOf(command, shell), command).toEqual({ title: TITLE, approved: '' })
    expect(evaluate({ command, entries: approvedChat, shell }).block, command).toBe(true)
  }
  it('if/then', () => caught(`if true; then node scripts/finding.mjs --request "${TITLE}" --stdin; fi`))
  it('env -u', () => caught(`env -u HOME node scripts/finding.mjs --request "${TITLE}" --stdin`))
  it('bash -lc', () => caught(`bash -lc 'node scripts/finding.mjs --request "${TITLE}" --stdin'`))
  it('multi-argument pwsh -Command', () =>
    caught(`pwsh -NoProfile -Command node .\\scripts\\finding.mjs --request "${TITLE}" --stdin`, 'powershell'))
  it('PowerShell backtick + CRLF continuation', () =>
    caught(`node .\\scripts\\finding.mjs --request \`\r\n  "${TITLE}" --stdin`, 'powershell'))
  it('node -e … -- finding.mjs --request is judged (fail closed, no longer a false positive to argue)', () =>
    caught(`node -e "1" -- scripts/finding.mjs --request "${TITLE}"`))
  it('chain and node -r stay caught', () => {
    caught(`node -r fs scripts/finding.mjs --request "${TITLE}"`)
    expect(requestsOf(`${deposit('passt so')} && node scripts/finding.mjs --request "Unapproved"`)).toHaveLength(2)
  })
  it('pairs each --approved with its own --request', () => {
    const command = `node scripts/finding.mjs --request "${TITLE}" --approved "passt so"; node scripts/finding.mjs --request "Other"`
    expect(requestsOf(command)).toEqual([
      { title: TITLE, approved: 'passt so' },
      { title: 'Other', approved: '' },
    ])
  })
  it('stops the approval lookup at a --request=<value> deposit too (round-3 review)', () => {
    const command = 'node scripts/finding.mjs --request "A"; node scripts/finding.mjs --request="B" --approved "passt so"'
    expect(requestsOf(command)).toEqual([
      { title: 'A', approved: '' },
      { title: 'B', approved: 'passt so' },
    ])
    const chat = [human('start'), said('A and B'), human('passt so')]
    expect(evaluate({ command, entries: chat })).toMatchObject({ block: true, id: 'no-approved' })
  })
  it('denies a matched command whose --request has no readable title (fail closed)', () => {
    for (const command of ['node scripts/finding.mjs --request', 'node scripts/finding.mjs --request --stdin', 'node scripts/finding.mjs --request ; ls']) {
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
