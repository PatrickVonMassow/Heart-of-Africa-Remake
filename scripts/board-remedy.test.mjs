// Point 435 — a remedy text may not send a session down the retired path.
//
// A remedy is read at the MOMENT OF A BLOCK and followed literally, so a stale
// one is an instruction into a path that no longer exists. On 30.07.2026 the
// rule-corpus review found 43 references to the claude.ai artifact (retired
// 29.07.2026) across seven files, most of them inside exactly those texts.
//
// Three gates, matching the point's three verifiable conditions:
//   (a) no remedy STRING in the board guard family mentions the retired path,
//       proven by exercising the guards and reading what they actually print;
//   (b) only the CANONICAL board file is measured;
//   (c) a grep-level count: zero references outside a clearly labelled legacy
//       note.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PUBLISH_CMD, REPUBLISH, SYNCED_CMD } from './board-remedy.mjs'
import { BOARD_FILE_DEFAULT, boardFilePath } from './dashboard-state.mjs'
import { evaluate as dashboardEvaluate } from './dashboard-guard-core.mjs'
import { evaluate as topicEvaluate } from './dashboard-card-topic-guard-core.mjs'
import { evaluate as concisenessEvaluate } from './dashboard-conciseness-guard-core.mjs'
import { evaluate as integrityEvaluate } from './dashboard-integrity-guard-core.mjs'
import { evaluate as queueOrderEvaluate } from './queue-order-guard-core.mjs'
import { evaluate as boardFirstEvaluate } from './board-first-core.mjs'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))

/** The retired transport, in every spelling a remedy could reach for. */
const RETIRED = /artifact/i

/**
 * The label a file must carry to be allowed to name the retired path at all.
 * Its own occurrence of the word is what makes the note "clearly labelled", so
 * the scan below strips the label before counting.
 */
const LEGACY_LABEL = 'LEGACY (claude.ai artifact, retired 29.07.2026)'

/**
 * The memory that holds the board's ONE binding contract. Its slug contains the
 * word for historical reasons and is a NAME, not a transport — stripped before
 * the count, so pointing at the contract never reads as pointing at the mirror.
 */
const CONTRACT_SLUG = 'batch-dashboard-artifact'

/**
 * The modules that may still mention it: the legacy publish path itself and the
 * three places that keep an OLD record honest. Each must carry the label.
 */
const LEGACY_FILES = [
  'dashboard-publish.mjs',
  'lock-heartbeat-hook.mjs',
  'publish-outcome-core.mjs',
  'board-currency-core.mjs',
]

/** Every board remedy must offer the live transport and the attestation. */
const namesTheLiveLoop = (text) => text.includes(PUBLISH_CMD) && text.includes('--synced')

describe('board remedy texts (point 435)', () => {
  it('states the publish loop once, and it is the live transport', () => {
    expect(PUBLISH_CMD).toBe('node scripts/board-publish.mjs')
    expect(SYNCED_CMD).toBe('node scripts/dashboard-guard.mjs --synced')
    expect(REPUBLISH).toContain(PUBLISH_CMD)
    expect(REPUBLISH).toContain(SYNCED_CMD)
    expect(REPUBLISH).not.toMatch(RETIRED)
  })

  // (a) The strings the guards ACTUALLY print — not their source, their output.
  //
  // The board markup below is the real one (the shape every sibling guard test
  // uses): `<h2>` sections, a `<span class="num">` on a queue card and the
  // leading number in a now-card's title.
  const card = ({ n, t = 'Titel', body = 'Kurz.' }) =>
    `<details>\n  <summary>${n != null ? `<span class="num">${n}</span>` : ''}<span class="t">${t}</span>` +
    `</summary>\n  <div class="body">${body}</div>\n</details>`
  const nowCard = ({ n, t = 'Titel', body = 'Status (Stand 10:00): läuft.' }) =>
    `<details class="now">\n  <summary><span class="t">${n} — ${t}</span></summary>\n` +
    `  <div class="body">${body}</div>\n</details>`
  const boardHtml = ({ now = [], queue = [] } = {}) =>
    `<main><h1>Dashboard</h1>
<h2>Woran ich gerade arbeite</h2>
${now.map(nowCard).join('\n')}
<h2>Von dir zu klären</h2>
<h2>Warteschlange</h2>
${queue.map(card).join('\n')}
<h2>Erledigt</h2>
</main>`

  it('every remedy the board Stop guards produce names the live loop, not the retired one', () => {
    const html = boardHtml({ now: [{ n: 7 }], queue: [{ n: 8 }] })
    const produced = [
      // dashboard-guard (1): no board registered at all.
      dashboardEvaluate({ open: [7], marker: null, markerFileExists: false }).reason,
      // dashboard-guard (2): HEAD moved since the last review.
      dashboardEvaluate({
        open: [7],
        marker: { dashboardPath: BOARD_FILE_DEFAULT, head: 'aaaaaaa' },
        markerFileExists: true,
        head: 'bbbbbbb',
        html,
      }).reason,
      // dashboard-guard (9): edited but never published.
      dashboardEvaluate({
        open: [7, 8],
        marker: { dashboardPath: BOARD_FILE_DEFAULT, head: 'aaaaaaa', syncedAt: Date.now() },
        markerFileExists: true,
        head: 'aaaaaaa',
        html,
        repoHash: 'deadbeef',
        focus: { point: 7, note: 'x', confirmedAt: Date.now() },
        nowCardHash: 'h1',
      }).reason,
      // board-first: the first mutating call of a turn over an unpublished board.
      boardFirstEvaluate({
        toolName: 'Edit',
        state: { turnStartedAt: 1000 },
        focus: { confirmedAt: 2000 },
        repoHash: 'deadbeef',
        canPublish: true,
      }).reason,
    ].filter(Boolean)

    // The fixtures must really have triggered blocks, or this proves nothing.
    expect(produced.length).toBe(4)
    for (const reason of produced) {
      expect(reason, reason).not.toMatch(RETIRED)
      expect(namesTheLiveLoop(reason), reason).toBe(true)
    }
  })

  it('the card-topic, conciseness, integrity and queue-order remedies drop it too', () => {
    const wall = `<p>${Array.from({ length: 140 }, (_, i) => `wort${i}`).join(' ')}</p>`
    const produced = [
      topicEvaluate({
        dashboardHtml: boardHtml({ now: [{ n: 7, body: 'Der Punkt 8 ist auch fast fertig.' }] }),
        tasksText: '- [ ] 7. Sieben\n- [ ] 8. Acht\n',
      }).reason,
      concisenessEvaluate({ dashboardHtml: boardHtml({ queue: [{ n: 8, body: wall }] }) }).reason,
      integrityEvaluate({
        dashboardHtml: boardHtml({ now: [{ n: 7 }], queue: [{ n: 8 }] }),
        tasksMd: '- [ ] 7. Sieben\n- [x] 8. Acht\n',
      }).reason,
      queueOrderEvaluate({
        dashboardHtml: boardHtml({ queue: [{ n: 8, body: 'Der Fehler ist behoben.' }] }),
        tasksMd: '- [ ] 8. Acht\n',
      }).reason,
    ].filter(Boolean)

    expect(produced.length).toBe(4)
    for (const reason of produced) {
      expect(reason, reason).not.toMatch(RETIRED)
      expect(namesTheLiveLoop(reason), reason).toBe(true)
    }
  })

  // (b) Only the canonical board file is measured.
  it('the canonical board file is the only one measured', () => {
    expect(BOARD_FILE_DEFAULT).toBe('.batch-dashboard.html')
    expect(boardFilePath({}).replace(/\\/g, '/')).toMatch(/\/\.batch-dashboard\.html$/)
    expect(boardFilePath({ dashboardPath: '.batch-dashboard.html' })).toBe(boardFilePath({}))

    const hook = readFileSync(join(SCRIPTS, 'dashboard-reminder-hook.mjs'), 'utf8')
    expect(hook).toContain('boardFilePath')
    // The scratchpad copy of the mirror era: neither statted nor recorded here.
    expect(hook).not.toContain('hoa-batch-dashboard.html')
    expect(hook).not.toContain('CLAUDE_SCRATCHPAD_DIR')
    expect(hook).not.toContain('scratchpadPath')
  })

  // (c) The grep-level count.
  it('names the retired path nowhere but in a clearly labelled legacy note', () => {
    const offenders = []
    const labelled = []
    for (const name of readdirSync(SCRIPTS)) {
      if (!name.endsWith('.mjs') || name.endsWith('.test.mjs')) continue
      const text = readFileSync(join(SCRIPTS, name), 'utf8')
      if (text.includes(LEGACY_LABEL)) {
        labelled.push(name)
        continue
      }
      // The contract's SLUG is a NAME, not an instruction — pointing at the one
      // binding statement never counts as pointing at the retired mirror.
      if (RETIRED.test(text.split(CONTRACT_SLUG).join(''))) offenders.push(name)
    }
    expect(offenders).toEqual([])
    expect(labelled.sort()).toEqual([...LEGACY_FILES].sort())
  })
})
