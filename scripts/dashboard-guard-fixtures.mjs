// Shared fixtures for the dashboard Stop-hook guard: a VALID board in the real
// markup, and a fully consistent input set that satisfies every invariant.
//
// They live outside the guard's own test file because the preflight tests need
// exactly the same green state to ask "would this guard block?" against — and a
// second copy of a fixture this detailed would drift, which is precisely the
// failure mode the preflight itself is built to avoid.
/** Minimal dashboard HTML in the real board's markup (incl. an Erledigt section
 *  that also uses `.num`, which the queue parser must NOT pick up). `nowCards`
 *  renders SEVERAL now-cards for the parallel-work workflow (numbers become
 *  `N — Task N` titles, strings stay literal non-point titles) and overrides
 *  the single `nowPoint`/`nowTitle` pair. `klaerung` renders point-tied
 *  "Von dir zu klären" cards (leading number in the title); `klaerungExtra`
 *  adds no-number cards like the real ntfy one. */
export function boardHtml({
  nowPoint = 210,
  nowTitle = 'Meereskante glätten',
  nowCards = null,
  queue = [211, 204],
  done = [209],
  klaerung = [],
  klaerungExtra = [],
} = {}) {
  // Cards carry the shapes the point-313 audit requires (duration meta in the
  // queue, a time meta on the now-card, a non-empty body, no `open`), so the
  // pre-313 invariant tests keep reading a fully consistent board.
  const body = '<div class="body"><p>Kurzstand.</p></div>'
  const q = queue
    .map(
      (n) =>
        `<details><summary><span class="num">${n}</span><span class="t">Task ${n}</span>` +
        `<span class="right"><span class="meta">~2 h</span></span></summary>${body}</details>`,
    )
    .join('\n')
  const d = done
    .map(
      (n) =>
        `<details><summary><span class="num">${n}</span><span class="t">Done ${n}</span>` +
        `<span class="right"><span class="meta">09:00 – 10:00</span></span></summary>${body}</details>`,
    )
    .join('\n')
  const k = [
    ...klaerung.map(
      (n) => `<details><summary><span class="t">${n} — Frage zu Punkt ${n}</span></summary>${body}</details>`,
    ),
    ...klaerungExtra.map((t) => `<details><summary><span class="t">${t}</span></summary>${body}</details>`),
  ].join('\n')
  const nowTitles = (nowCards ?? [nowPoint == null ? nowTitle : `${nowPoint} — ${nowTitle}`]).map((c) =>
    typeof c === 'number' ? `${c} — Task ${c}` : c,
  )
  const now = nowTitles
    .map((t) => {
      // The CHIP the reader sees since point 655: a numbered title is rendered
      // the way every writer renders it now, so the fixture stays a board the
      // publish gate would accept.
      const lead = t.match(/^(\d+)\s*—\s*([\s\S]*)$/)
      const head = lead ? `<span class="num">${lead[1]}</span><span class="t">${lead[2]}</span>` : `<span class="t">${t}</span>`
      return `<details class="now"><summary>${head}
<span class="right"><span class="meta">09:00 · bis ~11:00</span></span></summary>
<div class="body"><p>Status (Stand 09:00): der point-200-Vergleich darf hier NICHT zählen.</p></div></details>`
    })
    .join('\n')
  // Every section folds behind its heading and the Erledigt section links its
  // archive page (point 371) — the fixture has to be a VALID board, or the
  // pre-existing invariant tests would read violations that are the fixture's.
  return `<meta name="viewport" content="width=device-width, initial-scale=1">
<main><h1>Dashboard</h1>
<details class="sect"><summary><h2>Woran ich gerade arbeite</h2></summary>
${now}
</details>
<details class="sect"><summary><h2>Von dir zu klären</h2></summary>
${k}
</details>
<details class="sect"><summary><h2>Warteschlange</h2></summary>
${q}
</details>
<details class="sect">
<summary><h2>Erledigt</h2></summary>
${d}
<p class="archive-link">Ältere im <a href="https://example.invalid/archiv">Archiv</a>.</p>
</details>
</main>`
}

/** A fully consistent input — every invariant satisfied → allow. */
export function green(overrides = {}) {
  const html = overrides.html ?? boardHtml()
  return {
    paused: false,
    open: [210, 211, 204],
    done: [209],
    marker: {
      dashboardPath: '.batch-dashboard.html',
      head: 'abc1234',
      publishedHash: 'hash-1',
    },
    markerFileExists: true,
    head: 'abc1234',
    html,
    repoHash: 'hash-1',
    focus: { point: 210, note: 'smooth the sea edge', setAt: 1000, confirmedAt: 1000 },
    pending: null,
    sessionId: 'sess-a',
    lastToolAt: 500,
    now: 2000,
    ...overrides,
  }
}
