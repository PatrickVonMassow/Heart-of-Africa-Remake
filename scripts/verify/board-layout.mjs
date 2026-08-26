// Narrow-board layout regression. This is deliberately a real Chromium check:
// jsdom has no layout engine, so getBoundingClientRect() there cannot distinguish
// a usable title column from one squeezed to a few pixels.
import { chromium } from 'playwright'
import { renderCardCriticalities } from '../board-core.mjs'

const VIEWPORT = { width: 320, height: 900 }
const MIN_TITLE_SHARE = 0.5
const EPSILON = 0.5

// The relevant rules from the published board surround the stylesheet injected
// by renderCardCriticalities. Keeping the pre-existing nowrap declarations in
// the fixture matters: they are the pressure that exposed the mobile defect.
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

const TASKS = `- [ ] 722. A deliberately long current-card title
  Criticality: high — reviewed.
- [ ] 536. A deliberately long queued-card title
  Criticality: medium — visible.
- [ ] 265. Another deliberately long queued-card title
  Criticality: high — reviewed.`

const board = renderCardCriticalities(
  `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${BOARD_STYLE}</head><body><main>
  <details class="sect" open><summary>Current and queued work</summary>
    <details class="now"><summary><span class="num">722</span><span class="t">The current card keeps a readable title on the narrowest phone</span><span class="right"><span class="pill">active</span><span class="meta">10:02 · ~12:02</span></span></summary></details>
    <details><summary><span class="num">536</span><span class="t">A queued card also keeps its complete subject readable</span><span class="right"><span class="pill">review</span><span class="meta">~1.5 h</span></span></summary></details>
    <details><summary><span class="num">265</span><span class="t">Header groups wrap without crushing this title column</span><span class="right"><span class="pill">queued</span><span class="meta">~2 h · feature</span></span></summary></details>
  </details>
  </main></body></html>`,
  TASKS,
)

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const measureBoard = async (page, html) => {
  await page.setContent(html, { waitUntil: 'load' })
  return page.evaluate(() => {
    const summaries = [...document.querySelectorAll('details:not(.sect) > summary')]
    const titles = summaries.map((summary) => {
      const title = summary.querySelector(':scope > .t').getBoundingClientRect()
      const card = summary.parentElement.getBoundingClientRect()
      return {
        point: summary.querySelector('.num')?.textContent?.trim() ?? '?',
        width: title.width,
        share: title.width / card.width,
      }
    })

    const overflow = []
    for (const summary of summaries) {
      const card = summary.parentElement.getBoundingClientRect()
      const point = summary.querySelector('.num')?.textContent?.trim() ?? '?'
      for (const group of summary.children) {
        const rect = group.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) continue
        if (rect.left < card.left - 0.5 || rect.right > card.right + 0.5) {
          overflow.push({ point, group: group.className || group.tagName, left: rect.left, right: rect.right })
        }
      }
    }

    const split = []
    for (const summary of summaries) {
      const point = summary.querySelector('.num')?.textContent?.trim() ?? '?'
      for (const selector of [':scope > .card-header-left', ':scope > .right']) {
        const group = summary.querySelector(selector)
        const children = [...group.children].map((child) => child.getBoundingClientRect())
        for (let i = 1; i < children.length; i++) {
          const previous = children[i - 1]
          const current = children[i]
          // Baseline-aligned text and a .72em badge have different tops. They
          // share a line when their vertical intervals overlap, not when their
          // top coordinates happen to be equal.
          if (!(current.top < previous.bottom && current.bottom > previous.top)) {
            split.push({ point, group: group.className })
            break
          }
        }
      }
    }

    const root = document.documentElement
    return {
      cardCount: summaries.length,
      titleCount: titles.length,
      titles,
      overflow,
      split,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
    }
  })
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: VIEWPORT })
  const measured = await measureBoard(page, board)

  const titleDetail = measured.titles
    .map((title) => `#${title.point} ${Math.round(title.width)}px/${Math.round(title.share * 100)}%`)
    .join(', ')
  check('the rendered fixture contains all three numbered cards', measured.cardCount === 3 && measured.titleCount === 3)
  check(
    `every title keeps at least ${Math.round(MIN_TITLE_SHARE * 100)}% of its card at ${VIEWPORT.width}px`,
    measured.titles.every((title) => title.share >= MIN_TITLE_SHARE),
    titleDetail,
  )
  check(
    'no header group overflows its card',
    measured.overflow.length === 0,
    measured.overflow.map((item) => `#${item.point} ${item.group}`).join(', '),
  )
  check(
    'the page has no horizontal scroll',
    measured.scrollWidth <= measured.clientWidth + EPSILON,
    `${measured.scrollWidth}px scroll / ${measured.clientWidth}px client`,
  )
  check(
    'number/badge and status/time groups stay on one line each',
    measured.split.length === 0,
    measured.split.map((item) => `#${item.point} ${item.group}`).join(', '),
  )

  // Negative control: keep the working rule in the document, then override it
  // later with the old nowrap behavior. This proves the verdict reads Chromium's
  // geometry rather than merely finding the expected stylesheet text.
  const brokenBoard = board.replace(
    '</head>',
    '<style>details:not(.sect)>summary:has(>.right){flex-wrap:nowrap}</style></head>',
  )
  const broken = await measureBoard(page, brokenBoard)
  check(
    'the measurement rejects the old squeezed-header control',
    broken.titles.some((title) => title.share < MIN_TITLE_SHARE),
    broken.titles
      .map((title) => `#${title.point} ${Math.round(title.width)}px/${Math.round(title.share * 100)}%`)
      .join(', '),
  )
} finally {
  await browser.close()
}

console.log('console errors: 0')
process.exit(failures > 0 ? 1 : 0)
