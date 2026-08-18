import { describe, expect, it } from 'vitest'
import { addVdzk } from './board-core.mjs'
import { runBoardEdit } from './board-edit-core.mjs'
import { parseCards, sliceSections } from './dashboard-guard-core.mjs'
import { boardHtml } from './dashboard-guard-fixtures.mjs'

const tasks = (...points) => points.map((point) => `- [ ] ${point}. Open`).join('\n')
const questionTitles = (html) => parseCards(sliceSections(html).sections['Von dir zu klären']).map((card) => card.title)

function harness(initialHtml, tasksText, publish = () => 'board PUBLISHED') {
  const state = { html: initialHtml, writes: 0, publishes: 0, stdout: [], stderr: [] }
  const edit = (transform, done = 'open question added: Kartenschrift wählen') =>
    runBoardEdit({
      html: state.html,
      tasksText,
      transform,
      done,
      write: (html) => {
        state.html = html
        state.writes += 1
      },
      rotate: () => 'archive rotation: unchanged',
      publish: () => {
        state.publishes += 1
        return publish()
      },
      stdout: (line) => state.stdout.push(line),
      stderr: (line) => state.stderr.push(line),
    })
  return { state, edit }
}

describe('runBoardEdit — publish preflight and honest partial failure', () => {
  it('refuses a knowably incomplete board before writing or publishing', () => {
    const { state, edit } = harness(boardHtml(), tasks(210, 211, 204, 703))

    expect(() => edit((html) => addVdzk(html, 'Kartenschrift wählen', 'Welche Variante?'))).toThrow(
      /precondition refused before writing.*703/,
    )
    expect(state.writes).toBe(0)
    expect(state.publishes).toBe(0)
    expect(questionTitles(state.html)).toEqual([])
  })

  it('drives write, late publish refusal, and retry without doubling the card', () => {
    const refusal = Object.assign(new Error('refused'), {
      stderr: 'board-publish REFUSED — a late transport condition failed',
    })
    const { state, edit } = harness(boardHtml(), tasks(210, 211, 204), () => {
      throw refusal
    })
    const addQuestion = (html) => addVdzk(html, 'Kartenschrift wählen', 'Welche Variante?')

    expect(edit(addQuestion)).toMatchObject({ written: true, published: false })
    expect(state.stderr[0]).toBe('BOARD FILE WRITTEN — open question added: Kartenschrift wählen')
    expect(state.stderr.join('\n')).toContain('board-publish REFUSED')
    expect(() => edit(addQuestion)).toThrow(/"Kartenschrift wählen" already stands/)
    expect(questionTitles(state.html)).toEqual(['Kartenschrift wählen'])
    expect(state.writes).toBe(1)
  })

  it('keeps the write report first even when the failure has several remedy lines', () => {
    const refusal = Object.assign(new Error('refused'), { stderr: 'REFUSED\nremedy line one\nremedy line two' })
    const { state, edit } = harness(boardHtml(), tasks(210, 211, 204), () => {
      throw refusal
    })

    edit((html) => addVdzk(html, 'Eine neue Frage', 'Wie weiter?'), 'open question added: Eine neue Frage')
    expect(state.stderr).toEqual([
      'BOARD FILE WRITTEN — open question added: Eine neue Frage',
      'REFUSED\nremedy line one\nremedy line two',
      'The LIVE page was NOT updated — fix the above, then: node scripts/board-publish.mjs',
    ])
  })
})
