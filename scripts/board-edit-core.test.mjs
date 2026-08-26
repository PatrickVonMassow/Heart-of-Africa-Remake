import { describe, expect, it } from 'vitest'
import { addVdzk } from './board-core.mjs'
import { runBoardEdit } from './board-edit-core.mjs'
import { parseCards, sliceSections } from './dashboard-guard-core.mjs'
import { boardHtml } from './dashboard-guard-fixtures.mjs'

const tasks = (...points) => points.map((point) => `- [ ] ${point}. Open`).join('\n')
const questionTitles = (html) => parseCards(sliceSections(html).sections['Von dir zu klären']).map((card) => card.title)

function harness(
  initialHtml,
  tasksText,
  publish = () => 'board PUBLISHED',
  preparePublish = () => {},
  rotate = () => 'archive rotation: unchanged',
) {
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
      rotate: () => rotate(),
      preparePublish,
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
  it('renders criticality from open and archived point sources before writing', () => {
    const allTasks =
      tasks(210, 211, 204) +
      '\n  Criticality: low — current.\n- [x] 209. Closed\n  Criticality: high — historical.'
    const { state, edit } = harness(boardHtml(), allTasks)

    edit((html) => html, 'metadata refreshed')

    expect(state.html).toContain('criticality-low">niedrig</span><span class="t">Task 204</span>')
    expect(state.html).toContain('criticality-high">hoch</span><span class="t">Done 209</span>')
  })

  // Ninth cross-vendor round: when the ACTIVE-WORK RECORD is the stage that
  // failed, the shared "fix the above, then publish" remedy is the wrong one —
  // the record still describes the board as it stood before this edit, so
  // publishing projects it back over the edit and can undo it.
  it('does not send a failed active-work update off to publish', () => {
    const { state, edit } = harness(boardHtml(), tasks(210, 211, 204), () => 'board PUBLISHED', () => {
      throw new Error('declaration write refused')
    })

    const result = edit((html) => addVdzk(html, 'Kartenschrift wählen', 'Welche Variante?'))

    expect(result).toMatchObject({ written: true, published: false })
    expect(state.writes).toBe(1)
    expect(state.publishes).toBe(0)
    const said = state.stderr.join('\n')
    expect(said).toContain('ACTIVE-WORK RECORD was NOT updated')
    expect(said).toContain('Do NOT publish yet')
    expect(said).not.toContain('The LIVE page was NOT updated — fix the above')
  })

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

  it('updates the active-work source after the board write and before publishing', () => {
    const order = []
    const { edit } = harness(
      boardHtml(),
      tasks(210, 211, 204),
      () => { order.push('publish'); return 'board PUBLISHED' },
      () => order.push('active-source'),
    )
    edit((html) => addVdzk(html, 'Eine Frage', 'Wie weiter?'))
    expect(order).toEqual(['active-source', 'publish'])
  })

  // Sixth cross-vendor round: the state update ran AFTER archive rotation, so
  // a rotation that failed left the board changed and the active-work record
  // stale — and the failure's own remedy, a standalone publish, then projected
  // the old membership over the new board.
  it('updates the active-work record before rotation can fail out from under it', () => {
    const order = []
    const { state, edit } = harness(
      boardHtml(),
      tasks(210, 211, 204),
      () => 'board PUBLISHED',
      () => order.push('prepare'),
      () => {
        order.push('rotate')
        throw Object.assign(new Error('rotation failed'), { stderr: 'board-archive-rotate: cap exceeded' })
      },
    )

    const result = edit((html) => html, 'status restated')

    expect(order).toEqual(['prepare', 'rotate'])
    expect(result).toMatchObject({ written: true, published: false })
    expect(state.writes).toBe(1)
    expect(state.publishes).toBe(0)
    expect(state.stderr.join('\n')).toContain('board-archive-rotate: cap exceeded')
  })
})
