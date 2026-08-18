import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ANSWER_DEADLINE_MS } from './decision-card-guard-core.mjs'
import { extractLastUserMessage } from './decision-card-guard.mjs'
import { boardHtml } from './dashboard-guard-fixtures.mjs'

const dir = mkdtempSync(join(tmpdir(), 'vdzk-answer-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const boardPath = join(dir, 'board.html')
const statePath = join(dir, 'guard-state.json')
const answersPath = join(dir, 'answers.json')
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
  it('returns the last real prompt UUID and skips tool results and sidechains', () => {
    const transcript = [
      JSON.stringify({ type: 'user', uuid: 'first', message: { content: 'Erste Nachricht.' } }),
      JSON.stringify({ type: 'user', uuid: 'tool', message: { content: [{ type: 'tool_result', content: 'done' }] } }),
      JSON.stringify({ type: 'user', uuid: 'sub', isSidechain: true, message: { content: 'Subagent.' } }),
      JSON.stringify({ type: 'user', uuid: 'last', message: { content: [{ type: 'text', text: 'Letzte Nachricht.' }] } }),
    ].join('\n')
    expect(extractLastUserMessage(transcript)).toEqual({ id: 'last', text: 'Letzte Nachricht.' })
    expect(extractLastUserMessage('broken\n')).toBeNull()
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
