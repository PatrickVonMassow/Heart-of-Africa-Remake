// Narrow-board layout regression. This is deliberately a real Chromium check:
// jsdom has no layout engine, so getBoundingClientRect() there cannot distinguish
// a usable title column from one squeezed to a few pixels.
//
// IT MEASURES THE PUBLISHED BOARD, NOT A COPY OF ITS CSS (point 963). Two earlier
// repairs of the same complaint were verified against a fixture that repeated the
// stylesheet by hand: the fixture stayed green while the real page kept squeezing
// its title column, because the copy and the page had drifted apart. The board
// this suite renders is `.batch-dashboard.html` itself, passed through the same
// `renderCardCriticalities` the publisher uses, so the CSS under test is the CSS
// that ships.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { commonRepoPath, REPO_ROOT } from '../repo-paths.mjs'
import { renderCardCriticalities } from '../board-core.mjs'

// The portrait widths the complaint names, plus the narrowest phone the board
// has ever been read on.
const WIDTHS = [320, 360, 390, 414]
const MIN_TITLE_SHARE = 0.5
const EPSILON = 0.5

// Header content that no live card carries yet, so the regression is measured
// against the pressure that breaks the layout rather than against today's luck:
// a title that needs several lines, a criticality badge, a status pill and a
// two-part meta beside it.
const STRESS_POINT = '9631'
const STRESS_QUEUE_POINT = '9632'
const STRESS_CARDS = `
<details class="now"><summary><span class="num">${STRESS_POINT}</span><span class="t">Ein absichtlich langer Kartentitel, der im Hochformat mehrere Zeilen braucht und trotzdem vollständig lesbar bleiben muss</span><span class="right"><span class="pill">laufend</span><span class="meta">06:30 · ~08:30</span></span></summary>
  <div class="body"><p>Messkarte.</p></div>
</details>
<details><summary><span class="num">${STRESS_QUEUE_POINT}</span><span class="t">Kurz</span><span class="right"><span class="meta">06:30 · ~08:30 · überfällig seit gestern Abend · Nachtrag zur Schätzung dieses Punktes</span></span></summary>
  <div class="body"><p>Messkarte.</p></div>
</details>
`
const STRESS_TASKS = `- [ ] ${STRESS_POINT}. A deliberately long current-card title
  Criticality: high — reviewed.
- [ ] ${STRESS_QUEUE_POINT}. A queued card with a deliberately long meta
  Criticality: medium — visible.`

// The declarations point 963 replaced. Appended after the shipped stylesheet,
// this restores exactly the old behaviour and is the negative control: it proves
// the verdict below reads Chromium's geometry rather than merely finding text.
const OLD_HEADER_RULES = `<style id="board-layout-control">
details:not(.sect)>summary>.t{flex:1 1 12rem}
details:not(.sect)>summary>.right{flex-wrap:nowrap}
@media(max-width:460px){details:not(.sect)>summary:has(>.right)>.card-header-left,details:not(.sect)>summary:has(>.right)>.t,details:not(.sect)>summary:has(>.right)>.right{flex:0 1 auto}}
</style>`

// The base stylesheet of the published page. `.batch-dashboard.html` is a local
// artefact (git-ignores it), so CI has no board to read: this fixture carries
// the page's own header declarations, and the live board below is measured too
// wherever it exists, which is what keeps a drift between the two visible.
const BOARD_STYLE = `<style>
*{box-sizing:border-box}
body{font-family:ui-sans-serif,system-ui,"Segoe UI",sans-serif;line-height:1.5;margin:0;padding:16px 12px 40px;overflow-wrap:anywhere}
main{max-width:680px;margin:0 auto}
details{border:1px solid #cdbf9c;border-radius:8px;margin:8px 0;overflow:hidden}
summary{cursor:pointer;list-style:none;padding:11px 13px;display:flex;flex-wrap:nowrap;align-items:baseline;gap:2px 9px}
summary::-webkit-details-marker{display:none}
summary::after{content:"▸";margin-left:auto;font-size:.9em}
details[open]>summary::after{content:"▾"}
details.sect{border:0;border-radius:0;margin:0;overflow:visible}
details.sect>summary{padding:0;display:block}
details.sect>summary::after{content:none}
.num{font-variant-numeric:tabular-nums;font-weight:600;font-size:.86rem;flex-shrink:0;white-space:nowrap}
.t{font-weight:600;font-size:.96rem;flex:1 1 auto;min-width:0;overflow-wrap:break-word}
.right{margin-left:auto;flex-shrink:0;white-space:nowrap;display:inline-flex;align-items:baseline;gap:8px;padding-left:8px}
.meta{font-size:.76rem;font-variant-numeric:tabular-nums;white-space:nowrap}
.pill{font-size:.68rem;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap;border:1px solid currentColor}
@media(max-width:460px){.meta{font-size:.72rem}.right{gap:6px;padding-left:6px}summary{padding:10px 11px;gap:2px 7px}.t{font-size:.9rem}}
</style>`

const FIXTURE_TASKS = `- [ ] 722. A deliberately long current-card title
  Criticality: high — reviewed.
- [ ] 536. A deliberately long queued-card title
  Criticality: medium — visible.
- [ ] 265. Another deliberately long queued-card title
  Criticality: high — reviewed.`

const FIXTURE = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${BOARD_STYLE}</head><body><main>
  <details class="sect" open><summary>Current and queued work</summary>
    ${STRESS_CARDS}
    <details class="now"><summary><span class="num">722</span><span class="t">The current card keeps a readable title on the narrowest phone</span><span class="right"><span class="pill">active</span><span class="meta">10:02 · ~12:02</span></span></summary></details>
    <details><summary><span class="num">536</span><span class="t">A queued card also keeps its complete subject readable</span><span class="right"><span class="pill">review</span><span class="meta">~1.5 h</span></span></summary></details>
    <details><summary><span class="num">265</span><span class="t">Header groups wrap without crushing this title column</span><span class="right"><span class="pill">queued</span><span class="meta">~2 h · feature</span></span></summary></details>
  </details>
  </main></body></html>`

const tasks = readFileSync(join(REPO_ROOT, 'TASKS.md'), 'utf8')
const stressedTasks = `${tasks}\n${STRESS_TASKS}\n${FIXTURE_TASKS}\n`

const pages = [{ name: 'fixture', html: renderCardCriticalities(FIXTURE, stressedTasks) }]

// THE PUBLISHED PAGE ITSELF, whenever this checkout can see it. It lives in the
// main checkout beside every linked worktree, and it is the artefact the user
// actually reads.
const livePath = commonRepoPath('.batch-dashboard.html')
if (existsSync(livePath)) {
  pages.push({
    name: 'published board',
    // BEFORE `</main>`, not after `<main>`: the page's refresher carries the
    // opening tag inside a JavaScript comment, so an opening-tag anchor buries
    // the measurement cards in dead text and every check on them reads "not
    // measured" while looking green enough to miss.
    html: renderCardCriticalities(
      readFileSync(livePath, 'utf8').replace('</main>', `${STRESS_CARDS}</main>`),
      stressedTasks,
    ),
  })
} else {
  console.log('note: no .batch-dashboard.html in this checkout — the fixture alone is measured')
}

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const measureBoard = async (page, html) => {
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
  // Every section open: a closed section has no laid-out cards to measure.
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((card) => {
      card.open = true
    })
  })
  return page.evaluate(
    ([stressPoint, stressQueuePoint]) => {
      const summaries = [...document.querySelectorAll('details:not(.sect) > summary')]
      const pointOf = (summary) => summary.querySelector('.num')?.textContent?.trim() ?? ''
      const named = (element) => element.className || element.tagName

      const titles = []
      const overflow = []
      const clipped = []
      const split = []
      const lines = {}

      for (const summary of summaries) {
        const card = summary.parentElement.getBoundingClientRect()
        const point = pointOf(summary)
        const title = summary.querySelector(':scope > .t')
        if (title) {
          const box = title.getBoundingClientRect()
          titles.push({ point, width: box.width, share: box.width / card.width })
        }

        // Nothing in the header may leave its card, and nothing may be cut off:
        // a column squeezed below its own content reports scrollWidth beyond
        // clientWidth even while it still sits inside the card.
        for (const element of [summary, ...summary.querySelectorAll('*')]) {
          const box = element.getBoundingClientRect()
          if (box.width === 0 && box.height === 0) continue
          if (box.left < card.left - 0.5 || box.right > card.right + 0.5) {
            overflow.push({ point, element: named(element) })
          }
          if (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1) {
            clipped.push({ point, element: named(element), scroll: element.scrollWidth, client: element.clientWidth })
          }
        }

        // A card whose header carries ordinary content keeps its two side
        // columns on one line each. The stress cards are exempt: point 963
        // requires a column to BREAK its own content when it must.
        if (point === stressPoint || point === stressQueuePoint) continue
        for (const selector of [':scope > .card-header-left', ':scope > .right']) {
          const group = summary.querySelector(selector)
          if (!group) continue
          const children = [...group.children].map((child) => child.getBoundingClientRect())
          for (let i = 1; i < children.length; i++) {
            const previous = children[i - 1]
            const current = children[i]
            // Baseline-aligned text and a .72em badge have different tops. They
            // share a line when their vertical intervals overlap, not when their
            // top coordinates happen to be equal.
            if (!(current.top < previous.bottom && current.bottom > previous.top)) {
              split.push({ point, group: named(group) })
              break
            }
          }
        }
      }

      // How many lines the stressed headers resolve to: the summary's own height
      // against one title line, and the right column's meta against its own line
      // height — the second is the column breaking its content rather than
      // keeping one unbreakable row.
      for (const point of [stressPoint, stressQueuePoint]) {
        const summary = summaries.find((entry) => pointOf(entry) === point)
        if (!summary) continue
        const title = summary.querySelector(':scope > .t')
        const lineHeight = title ? Number.parseFloat(getComputedStyle(title).lineHeight) : 0
        const meta = summary.querySelector(':scope > .right .meta')
        const metaLine = meta ? Number.parseFloat(getComputedStyle(meta).lineHeight) : 0
        lines[point] = {
          height: summary.getBoundingClientRect().height,
          lineHeight,
          rows: lineHeight > 0 ? summary.getBoundingClientRect().height / lineHeight : 0,
          metaHeight: meta ? meta.getBoundingClientRect().height : 0,
          metaLine,
          metaRows: meta && metaLine > 0 ? meta.getBoundingClientRect().height / metaLine : 0,
        }
      }

      const root = document.documentElement
      return {
        cardCount: summaries.length,
        titles,
        overflow,
        clipped,
        split,
        lines,
        stressSeen: [stressPoint, stressQueuePoint].every((point) =>
          summaries.some((summary) => pointOf(summary) === point),
        ),
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
      }
    },
    [STRESS_POINT, STRESS_QUEUE_POINT],
  )
}

const worstTitle = (measured) =>
  measured.titles.reduce((worst, title) => (title.share < worst.share ? title : worst), measured.titles[0])

const browser = await chromium.launch()
try {
  for (const { name, html } of pages) {
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const measured = await measureBoard(page, html)
      const worst = worstTitle(measured)
      const at = `${name} at ${width}px`

      check(
        `${at}: the rendered board carries its cards and both stress headers`,
        measured.cardCount > 0 && measured.stressSeen,
        `${measured.cardCount} card(s)`,
      )
      check(
        `${at}: no header part leaves its card`,
        measured.overflow.length === 0,
        measured.overflow
          .slice(0, 6)
          .map((item) => `#${item.point} ${item.element}`)
          .join(', '),
      )
      check(
        `${at}: the page has no horizontal scroll`,
        measured.scrollWidth <= measured.clientWidth + EPSILON,
        `${measured.scrollWidth}px scroll / ${measured.clientWidth}px client`,
      )
      check(
        `${at}: no header part is cut off`,
        measured.clipped.length === 0,
        measured.clipped
          .slice(0, 6)
          .map((item) => `#${item.point} ${item.element} ${item.scroll}>${item.client}`)
          .join(', '),
      )
      check(
        `${at}: every title keeps at least ${Math.round(MIN_TITLE_SHARE * 100)}% of its card`,
        measured.titles.every((title) => title.share >= MIN_TITLE_SHARE),
        worst ? `worst #${worst.point} ${Math.round(worst.width)}px/${Math.round(worst.share * 100)}%` : 'no title',
      )
      check(
        `${at}: number/badge and status/time stay on one line each for ordinary cards`,
        measured.split.length === 0,
        measured.split
          .slice(0, 6)
          .map((item) => `#${item.point} ${item.group}`)
          .join(', '),
      )
      // The complaint itself: a long title beside a long meta must resolve to
      // several lines rather than one squeezed row.
      const stressed = measured.lines[STRESS_POINT]
      check(
        `${at}: the stressed header resolves to more than one line`,
        Boolean(stressed) && stressed.rows > 1.6,
        stressed ? `${Math.round(stressed.height)}px over ${Math.round(stressed.lineHeight)}px line` : 'not measured',
      )
      // …and the right column itself: a meta too long for one line breaks INSIDE
      // its own column instead of staying one unbreakable row. That is the half
      // of the complaint the two earlier repairs left untouched.
      const longMeta = measured.lines[STRESS_QUEUE_POINT]
      check(
        `${at}: a long meta breaks inside its own column`,
        Boolean(longMeta) && longMeta.metaRows > 1.6,
        longMeta ? `${Math.round(longMeta.metaHeight)}px over ${Math.round(longMeta.metaLine)}px line` : 'not measured',
      )
      await page.close()
    }
  }

  // Negative control: restore the declarations this point replaced, and the same
  // measurement must condemn the same page.
  for (const { name, html } of pages) {
    const page = await browser.newPage({ viewport: { width: 360, height: 900 } })
    // APPENDED, not spliced into a head: the published board is a headless
    // fragment, and a control that lands nowhere silently proves nothing.
    const broken = await measureBoard(page, `${html}\n${OLD_HEADER_RULES}`)
    const worst = worstTitle(broken)
    check(
      `${name}: the measurement rejects the old squeezed-header control at 360px`,
      broken.titles.some((title) => title.share < MIN_TITLE_SHARE) || broken.clipped.length > 0,
      worst ? `worst #${worst.point} ${Math.round(worst.width)}px/${Math.round(worst.share * 100)}%` : 'no title',
    )
    await page.close()
  }
} finally {
  await browser.close()
}

console.log('console errors: 0')
process.exit(failures > 0 ? 1 : 0)
