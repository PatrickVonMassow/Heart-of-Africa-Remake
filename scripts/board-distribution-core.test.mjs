import { describe, expect, it } from 'vitest'
import { CROSS, MAIN, VENDORS } from './model-lanes.mjs'
import {
  DISTRIBUTION_TITLE,
  distributionLine,
  distributionOf,
  modelLabel,
  pointOfBranch,
  renderCardDistributions,
} from './board-distribution-core.mjs'
import { parseCommitLog } from './board-distribution.mjs'

const MAIN_TRAILER = `${MAIN.trailerName} (1M context) <${VENDORS[MAIN.vendor].trailerAddress}>`
const review = (point, extra = {}) => ({
  sha: 'a'.repeat(40),
  point,
  model: CROSS.displayName,
  authoredBy: MAIN_TRAILER,
  verdict: 'merge',
  ...extra,
})
const lineOf = (point, input) => distributionLine(distributionOf(point, input))

describe('distribution line — derived from trailers and the review ledger', () => {
  it('names a local build and its recorded reviewer', () => {
    const line = lineOf(1438, { commits: [{ authors: [MAIN_TRAILER], cloud: false }], records: [review(1438)] })
    expect(line).toBe(`Bau: ${MAIN.displayName} · Lokal | Prüfung: ${CROSS.displayName}`)
  })

  it('names a cloud build from the Claude-Session trailer', () => {
    const [commit] = parseCommitLog(
      `\x1e${'b'.repeat(40)}\x1f${MAIN_TRAILER}\x1fhttps://claude.ai/code/session_x\n\nscripts/a.mjs\n`,
    )
    expect(commit.cloud).toBe(true)
    expect(lineOf(1440, { commits: [commit], records: [review(1440)] })).toBe(
      `Bau: ${MAIN.displayName} · Cloud | Prüfung: ${CROSS.displayName}`,
    )
  })

  it('shows a pending review as "offen", and a point with nothing yet as "offen" twice', () => {
    const commits = [{ authors: [MAIN_TRAILER], cloud: true }]
    const unrelated = [review(9), { kind: 'authoring-commission', point: 1440, model: MAIN.displayName }]
    expect(lineOf(1440, { commits, records: unrelated })).toBe(`Bau: ${MAIN.displayName} · Cloud | Prüfung: offen`)
    expect(lineOf(1440, {})).toBe('Bau: offen | Prüfung: offen')
  })

  it('lists both venues of a model that built in both places, and falls back to the ledger author', () => {
    const commits = [
      { authors: [MAIN_TRAILER], cloud: false },
      { authors: [MAIN_TRAILER], cloud: true },
    ]
    expect(lineOf(1, { commits })).toBe(`Bau: ${MAIN.displayName} · Lokal/Cloud | Prüfung: offen`)
    expect(lineOf(2, { records: [review(2)] })).toBe(`Bau: ${MAIN.displayName} | Prüfung: ${CROSS.displayName}`)
  })

  it('labels a retired spelling as recorded and an unregistered one stripped', () => {
    expect(modelLabel(CROSS.retired[0])).toBe(CROSS.retired[0])
    expect(modelLabel(`${MAIN.fallback.trailerName} <${VENDORS[MAIN.vendor].trailerAddress}>`)).toBe(
      MAIN.fallback.displayName,
    )
    expect(modelLabel('Claude Zeta 9 <x@y>')).toBe('Zeta 9')
  })

  it('reads the point from a feat ref and a merge subject', () => {
    expect(pointOfBranch('refs/remotes/origin/feat/1440-card-distribution')).toBe(1440)
    expect(pointOfBranch("Merge branch 'feat/1438-cloud-credit-routing'")).toBe(1438)
    expect(pointOfBranch('refs/heads/main')).toBeNull()
  })
})

describe('renderCardDistributions — a derived section at the end of every numbered card body', () => {
  const card = (point, body) =>
    `<details class="now">\n  <summary><span class="num">${point}</span><span class="t">T</span></summary>\n` +
    `  <div class="body">\n${body}\n  </div>\n</details>\n`
  const BODY = '    <p class="desc">D.</p>\n    <hr class="split">\n    <p class="status-head">Stand der Umsetzung</p>\n    <p>S.</p>'

  it('adds the section once, replaces it on re-render and leaves unnumbered cards alone', () => {
    const plain = '<details>\n  <summary><span class="t">Ohne Nummer</span></summary>\n  <div class="body"><p>X</p></div>\n</details>\n'
    const html = card(7, BODY) + plain
    const once = renderCardDistributions(html, () => 'Bau: offen | Prüfung: offen')
    expect(once).toContain(`<p class="dist-head">${DISTRIBUTION_TITLE}</p>`)
    expect(once).toContain('<p class="dist">Bau: offen | Prüfung: offen</p>')
    expect(once.indexOf('<p>S.</p>')).toBeLessThan(once.indexOf('dist-head'))
    expect(once).toContain(plain)

    const twice = renderCardDistributions(once, () => 'Bau: A · Cloud | Prüfung: B')
    expect(twice.match(/dist-head/g)).toHaveLength(1)
    expect(twice).toContain('<p class="dist">Bau: A · Cloud | Prüfung: B</p>')
    expect(renderCardDistributions(once, () => 'Bau: offen | Prüfung: offen')).toBe(once)
    expect(renderCardDistributions(once, () => null)).toBe(html)
  })

  it('escapes a recorded model name', () => {
    expect(renderCardDistributions(card(7, BODY), () => 'Bau: <b> | Prüfung: offen')).toContain(
      '<p class="dist">Bau: &lt;b&gt; | Prüfung: offen</p>',
    )
  })
})
