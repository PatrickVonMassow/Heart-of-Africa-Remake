// Pure detector for assertions that CANNOT FAIL.
//
// The night a degraded model authored three deliveries, its signature was not
// broken code — it was work that LOOKED finished. Among it were tests whose
// assertions were tautologies: `expect(true).toBe(true)` beside a fix that did
// nothing. Green suite, untouched defect, and the review that would have caught
// it is exactly the review a busy session skips because the suite is green.
//
// A tautology is machine-detectable with no judgement and no false positives,
// so it should never again depend on someone reading the diff. This deliberately
// does NOT try to find "a test with no assertion at all": assertions are
// routinely made through local helpers, and a heuristic for that produced three
// false accusations on the first run — a detector that cries wolf is worse than
// none (the guard-health lesson).

/**
 * Assertions whose truth is fixed at authoring time. Each is a comparison of
 * two literals, or a presence check on a literal — no program state is
 * consulted, so no change to the product can ever make it fail.
 */
export const TAUTOLOGY_RES = [
  // expect(true).toBe(true) / expect(1).toEqual(1) / expect('a').toBe('a')
  {
    re: /expect\(\s*(true|false|-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|`[^`$]*`)\s*\)\s*\.\s*(?:toBe|toEqual|toStrictEqual)\(\s*\1\s*\)/g,
    hint: 'vergleicht zwei gleiche Literale',
  },
  // expect(true).toBeTruthy() / expect(false).toBeFalsy() / expect(1).toBeDefined()
  {
    re: /expect\(\s*(?:true|false|-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|\[\]|\{\})\s*\)\s*\.\s*(?:toBeTruthy|toBeFalsy|toBeDefined|toBeNull|toBeUndefined)\(\s*\)/g,
    hint: 'prüft ein Literal auf seine eigene, feststehende Beschaffenheit',
  },
  // assert(true) / assert.ok(true)
  { re: /\bassert(?:\.ok)?\(\s*true\s*[,)]/g, hint: 'behauptet wahr' },
]

/**
 * Every cannot-fail assertion in a source text, as
 * `{ line, text, hint }`. Line numbers are 1-based so a finding can be opened.
 */
export function findTautologies(source) {
  const lines = String(source ?? '').split('\n')
  const out = []
  lines.forEach((line, i) => {
    for (const { re, hint } of TAUTOLOGY_RES) {
      re.lastIndex = 0
      const m = re.exec(line)
      if (m) out.push({ line: i + 1, text: m[0].trim(), hint })
    }
  })
  return out
}

/** Human-readable verdict for a set of findings keyed by file. */
export function formatTautologies(byFile) {
  const entries = Object.entries(byFile ?? {}).filter(([, v]) => v.length)
  if (!entries.length) return ''
  return [
    'ZUSICHERUNGEN, DIE NICHT FEHLSCHLAGEN KÖNNEN:',
    ...entries.flatMap(([file, hits]) =>
      hits.map((h) => `  · ${file}:${h.line} — ${h.text} (${h.hint})`),
    ),
    '',
    'Ein solcher Test ist grün, gleichgültig was das Programm tut. Er täuscht Abdeckung',
    'vor, wo keine ist — und wird gerade dort geschrieben, wo eine Änderung nichts',
    'bewirkt hat. Ersetze ihn durch eine Zusicherung über echten Programmzustand oder',
    'lösche ihn; eine leere Stelle ist ehrlicher als eine falsche.',
  ].join('\n')
}
