import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ANSWER_DEADLINE_MS } from './decision-card-guard-core.mjs'
import {
  DECISION_CARD_SESSION_RETENTION_MS,
  extractLastUserMessage,
} from './decision-card-guard.mjs'
import { boardHtml } from './dashboard-guard-fixtures.mjs'
import { buildResponderPrompt } from './chat-watcher-core.mjs'

const dir = mkdtempSync(join(tmpdir(), 'vdzk-answer-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const boardPath = join(dir, 'board.html')
const statePath = join(dir, 'guard-state.json')
const answersPath = join(dir, 'answers.json')
const transcriptPath = join(dir, 'transcript.jsonl')
const session = 'answer-test-session'
const titles = ['Kartenschrift auf der Tafel', 'Freigabe nach dem Stau']
const env = {
  ...process.env,
  CLAUDE_SESSION_ID: session,
  DECISION_CARD_DASHBOARD: boardPath,
  DECISION_CARD_GUARD_STATE: statePath,
  VDZK_ANSWERS_PATH: answersPath,
}

function reset(message = 'Die Kartenschrift bleibt wie gemessen.') {
  writeFileSync(boardPath, boardHtml({ klaerungExtra: titles }))
  writeFileSync(statePath, JSON.stringify({
    version: 2,
    sessions: {
      [session]: {
        titles,
        userMessage: { id: 'user-message-1', text: message },
        review: { messageId: 'user-message-1', kept: {} },
      },
    },
  }))
  rmSync(answersPath, { force: true })
}

function run(script, args) {
  return execFileSync(process.execPath, [join(process.cwd(), 'scripts', script), ...args], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

describe('the transcript user-message boundary', () => {
  const entry = (overrides) => JSON.stringify({
    type: 'user',
    uuid: 'message',
    message: { content: 'Nachricht.' },
    ...overrides,
  })

  it('arms only a string prompt positively marked as typed', () => {
    expect(extractLastUserMessage(entry({ promptSource: 'typed' })))
      .toEqual({ id: 'message', text: 'Nachricht.' })
    expect(extractLastUserMessage(entry({
      promptSource: 'typed',
      message: { content: [{ type: 'text', text: 'Kein String.' }] },
    }))).toBeNull()
    expect(extractLastUserMessage(entry({
      promptSource: 'typed',
      isSidechain: true,
    }))).toBeNull()
  })

  it.each([
    ['SDK launcher or task notification', { promptSource: 'sdk' }],
    ['SDK agent-to-agent message', { promptSource: 'sdk', isMeta: true }],
    ['hook feedback', { isMeta: true, message: { content: 'Stop hook feedback: GitHub CI is RED.' } }],
    ['command or compaction text', { message: { content: '<command-name>/clear</command-name>' } }],
    ['tool result', { message: { content: [{ type: 'tool_result', content: 'done' }] } }],
  ])('does not arm from %s', (_shape, overrides) => {
    expect(extractLastUserMessage(entry(overrides))).toBeNull()
  })

  it('does not promote last-position Stop hook feedback into a user message', () => {
    const transcript = [
      entry({ uuid: 'typed', promptSource: 'typed', message: { content: 'Echte Nachricht.' } }),
      entry({ uuid: 'feedback', isMeta: true, message: { content: 'Stop hook feedback: GitHub CI is RED.' } }),
    ].join('\n')
    expect(extractLastUserMessage(transcript)).toEqual({ id: 'typed', text: 'Echte Nachricht.' })
    expect(extractLastUserMessage(transcript.split('\n')[1])).toBeNull()
  })

  it('arms from the chat watcher marker but reviews only its quoted user messages', () => {
    const prompt = buildResponderPrompt([
      { id: 'chat-1', ts: 1, text: 'Kartenschrift bleibt.' },
      { id: 'chat-2', ts: 2, text: 'Die Freigabe wartet.' },
    ])
    const transcript = entry({ uuid: 'watcher', promptSource: 'sdk', message: { content: prompt } })
    expect(extractLastUserMessage(transcript)).toEqual({
      id: 'watcher',
      text: 'Kartenschrift bleibt.\nDie Freigabe wartet.',
    })
  })

  it('fails open for malformed transcript lines and a malformed watcher list', () => {
    expect(extractLastUserMessage('broken\n')).toBeNull()
    expect(extractLastUserMessage(entry({ message: { content: buildResponderPrompt([
      { id: 'chat-1', ts: 1, text: 'Kartenschrift bleibt.' },
    ]) + ' fremder Nachsatz' } }))).toBeNull()
  })
})

describe('the per-session turn baseline', () => {
  it('prunes expired sessions while keeping the current session unconditionally', () => {
    const now = Date.now()
    writeFileSync(boardPath, boardHtml({ klaerungExtra: titles }))
    writeFileSync(statePath, JSON.stringify({
      version: 2,
      sessions: {
        [session]: { titles: ['old current title'], at: now - DECISION_CARD_SESSION_RETENTION_MS - 60_000 },
        recent: { titles: ['recent title'], at: now },
        expired: { titles: ['expired title'], at: now - DECISION_CARD_SESSION_RETENTION_MS - 60_000 },
        undated: { titles: ['undated title'] },
      },
    }))
    const source = `
      const mod = await import('./scripts/decision-card-guard.mjs')
      process.stdout.write(String(mod.seedDecisionCardBaseline(${JSON.stringify(session)})))
    `
    expect(execFileSync(process.execPath, ['--input-type=module', '--eval', source], {
      cwd: process.cwd(), env, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })).toBe('true')

    const sessions = JSON.parse(readFileSync(statePath, 'utf8')).sessions
    expect(Object.keys(sessions).sort()).toEqual(['recent', session].sort())
    expect(sessions[session]).toMatchObject({ titles, seededAtTurnStart: true })
    expect(sessions[session].at).toBeGreaterThanOrEqual(now)
  })

  it('stays at turn start across two passing Stops with a card added between them', () => {
    const assistant = (id, text) => JSON.stringify({
      type: 'assistant',
      message: { id, content: [{ type: 'text', text }] },
    })
    const transcript = [
      JSON.stringify({
        type: 'user',
        uuid: 'same-turn-user',
        promptSource: 'typed',
        message: { content: 'Arbeite weiter.' },
      }),
      assistant('first-stop', 'Zwischenstand ohne Frage.'),
    ]
    writeFileSync(boardPath, boardHtml({ klaerungExtra: [] }))
    writeFileSync(statePath, JSON.stringify({
      version: 2,
      sessions: {
        [session]: {
          titles: [],
          userMessage: { id: 'same-turn-user', text: 'Arbeite weiter.' },
          review: { messageId: 'same-turn-user', kept: {} },
          at: Date.now(),
          seededAtTurnStart: true,
        },
      },
    }))
    writeFileSync(transcriptPath, transcript.join('\n'))
    rmSync(answersPath, { force: true })

    const stop = () => execFileSync(process.execPath, [join(process.cwd(), 'scripts', 'decision-card-guard.mjs')], {
      cwd: process.cwd(),
      env,
      encoding: 'utf8',
      windowsHide: true,
      input: JSON.stringify({ session_id: session, transcript_path: transcriptPath }),
    })
    expect(stop()).toBe('')
    expect(JSON.parse(readFileSync(statePath, 'utf8')).sessions[session].titles).toEqual([])

    writeFileSync(boardPath, boardHtml({ klaerungExtra: ['Neu gestellte Farbauswahl'] }))
    transcript.push(assistant('second-stop', 'Welche Kartenhöhe willst du?'))
    writeFileSync(transcriptPath, transcript.join('\n'))
    expect(stop()).toBe('')
    expect(JSON.parse(readFileSync(statePath, 'utf8')).sessions[session].titles).toEqual([])
  })
})

describe('board.mjs vdzk-keep records the current message, never the board', () => {
  it('refuses a suspected hit without --why and accepts it with a reason', () => {
    reset()
    expect(() => run('board.mjs', ['vdzk-keep', 'Kartenschrift'])).toThrow(/--why/)
    const before = readFileSync(boardPath, 'utf8')
    expect(run('board.mjs', ['vdzk-keep', 'Kartenschrift', '--why', 'Die Nachricht bestätigt nur die Schrift, nicht ihren Einsatz.']))
      .toContain('message recorded as not answering')
    expect(readFileSync(boardPath, 'utf8')).toBe(before)
    const state = JSON.parse(readFileSync(statePath, 'utf8'))
    expect(state.sessions[session].review.messageId).toBe('user-message-1')
    expect(state.sessions[session].review.kept[titles[0]].why).toContain('bestätigt')
  })

  it('keeps several unrelated cards in one cheap call', () => {
    reset('Danke, ich habe den Bericht gesehen.')
    run('board.mjs', ['vdzk-keep', 'Kartenschrift', 'Freigabe'])
    const kept = JSON.parse(readFileSync(statePath, 'utf8')).sessions[session].review.kept
    expect(Object.keys(kept)).toEqual(titles)
    expect(kept[titles[0]].why).toBe('')
  })

  it('refuses ambiguous and unknown fragments', () => {
    reset('Danke.')
    expect(() => run('board.mjs', ['vdzk-keep', 'a'])).toThrow(/matches 2/)
    expect(() => run('board.mjs', ['vdzk-keep', 'Launchzeit'])).toThrow(/no due open question/)
  })
})

describe('vdzk-answer carries the decision with its deadline', () => {
  it('appends the exact card, answer, message UUID and shared deadline', () => {
    reset()
    const out = run('vdzk-answer.mjs', ['Kartenschrift', '--answer', 'Die gemessene Schrift bleibt.'])
    expect(out).toContain('deadline')
    const [entry] = JSON.parse(readFileSync(answersPath, 'utf8'))
    expect(entry).toMatchObject({
      cardTitle: titles[0],
      answer: 'Die gemessene Schrift bleibt.',
      sourceSessionId: session,
      sourceMessageId: 'user-message-1',
    })
    expect(entry.deadlineAt - entry.recordedAt).toBe(ANSWER_DEADLINE_MS)
  })

  it('updates the same card/message record instead of stacking duplicate duties', () => {
    reset()
    run('vdzk-answer.mjs', ['Kartenschrift', '--answer', 'Erste Fassung.'])
    run('vdzk-answer.mjs', ['Kartenschrift', '--answer', 'Korrigierte Fassung.'])
    const entries = JSON.parse(readFileSync(answersPath, 'utf8'))
    expect(entries).toHaveLength(1)
    expect(entries[0].answer).toBe('Korrigierte Fassung.')
  })

  it('--applied clears only the named card', () => {
    reset()
    run('vdzk-answer.mjs', ['Kartenschrift', '--answer', 'Schrift bleibt.'])
    run('vdzk-answer.mjs', ['Freigabe', '--answer', 'Website zuerst.'])
    run('vdzk-answer.mjs', ['--applied', 'Kartenschrift'])
    const entries = JSON.parse(readFileSync(answersPath, 'utf8'))
    expect(entries.map((entry) => entry.cardTitle)).toEqual([titles[1]])
  })

  it('refuses to overwrite a malformed carrier', () => {
    reset()
    writeFileSync(answersPath, '{broken')
    expect(() => run('vdzk-answer.mjs', ['Kartenschrift', '--answer', 'Schrift bleibt.'])).toThrow(/unreadable/)
    expect(readFileSync(answersPath, 'utf8')).toBe('{broken')
  })
})

describe('deadline redemption is unattended and retry-safe', () => {
  const redeem = (now, fail = '') => {
    const source = `
      const mod = await import('./scripts/vdzk-answer.mjs')
      const result = mod.redeemDueVdzkAnswers({
        now: ${Number(now)},
        runBoard: (title) => {
          if (title === ${JSON.stringify(fail)}) throw new Error('publish failed')
          return title
        },
      })
      process.stdout.write(JSON.stringify(result))
    `
    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', source], {
      cwd: process.cwd(), env, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    }))
  }

  it('applies a due answer, clears a vanished card, and leaves a future answer', () => {
    reset('Danke.')
    writeFileSync(answersPath, JSON.stringify([
      { cardTitle: titles[0], answer: 'Schrift bleibt.', deadlineAt: 100 },
      { cardTitle: titles[1], answer: 'Website zuerst.', deadlineAt: 300 },
      { cardTitle: 'Schon entfernte Karte', answer: 'Erledigt.', deadlineAt: 100 },
    ]))
    const result = redeem(200)
    expect(result.applied.map((entry) => entry.cardTitle)).toEqual([titles[0]])
    expect(result.cleared.map((entry) => entry.cardTitle)).toEqual(['Schon entfernte Karte'])
    expect(JSON.parse(readFileSync(answersPath, 'utf8')).map((entry) => entry.cardTitle)).toEqual([titles[1]])
  })

  it('retains a due answer when removing or publishing its card fails', () => {
    reset('Danke.')
    writeFileSync(answersPath, JSON.stringify([
      { cardTitle: titles[0], answer: 'Schrift bleibt.', deadlineAt: 100 },
    ]))
    const result = redeem(200, titles[0])
    expect(result.failed).toHaveLength(1)
    expect(JSON.parse(readFileSync(answersPath, 'utf8'))).toHaveLength(1)
  })
})
