// Assembles the two blind halves of the 1462 closing cleanup into A.json/B.json (one-off; reads local/ raw answers and origin/closing/1462-blind-a).
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const R = '/workspace/hoa'
const show = (f) => execFileSync('git', ['-C', R, 'show', `origin/closing/1462-blind-a:docs/blind-1462/${f}`], { encoding: 'utf8' })
// One said-block per ask-lane answer; a model that echoed the format line and repeated its list (A p31) keeps only the first copy.
const said = (t) => { const m = t.match(/^--- .* said ---\n([\s\S]*?)\n--- end ---/m); const b = m ? m[1] : t; const e = b.indexOf('\nEach entry on ONE line'); if (e >= 0) console.log('echo cut:', b.slice(0, 40).replace(/\n/g, ' ')); return e >= 0 ? b.slice(0, e) : b }
const ENTRY = /^\s*[A-Za-z]*(\d+)\s*\|\s*([^|]+?)\s*\|\s*(.+)$/
const odd = []
function parse(list, text, defaultPart, out) {
  let part = defaultPart
  for (const line of text.split('\n')) {
    const h = line.match(/^=====\s*part\s+(p\d+)\s*=====/)
    if (h) { part = h[1]; continue }
    if (!line.trim() || /^\(none\)$/i.test(line.trim())) continue
    const m = line.match(ENTRY)
    if (!m) { odd.push(`${list}[${part}] ${line.slice(0, 140)}`); continue }
    out.push({ id: `${list}${out.length + 1}`, file: m[2].trim(), defect: `[${part}] ${m[3].trim()}` })
  }
}
const pp = (n) => `p${String(n).padStart(2, '0')}`
const A = []
parse('A', show('A.txt'), null, A)
parse('A', show('A-p03-p34.txt'), null, A)
for (let n = 22; n <= 33; n++) parse('A', said(readFileSync(`${R}/local/blind-1462-a/${pp(n)}.txt`, 'utf8')), pp(n), A)
parse('A', show('A-p34-held.txt'), null, A)
parse('A', show('A-p35-p37.txt'), null, A)
parse('A', readFileSync(`${R}/local/blind-1462-a-p38.txt`, 'utf8'), 'p38', A)
const B = []
for (let n = 1; n <= 38; n++) parse('B', said(readFileSync(`${R}/local/blind-1462-b/${pp(n)}.txt`, 'utf8')), pp(n), B)
parse('B', said(readFileSync(`${R}/local/blind-1462-b/p14b.txt`, 'utf8')), 'p14', B)
const parts = (L) => [...new Set(L.map((e) => e.defect.slice(1, 4)))].sort().join(',')
console.log('A', A.length, parts(A)); console.log('B', B.length, parts(B))
console.log('ODD:\n' + odd.join('\n'))
writeFileSync(`${R}/docs/blind-1462/A.json`, JSON.stringify({ model: 'Opus 5.5', entries: A }, null, 1) + '\n')
writeFileSync(`${R}/docs/blind-1462/B.json`, JSON.stringify({ model: 'GPT-6.1 Sol', entries: B }, null, 1) + '\n')
