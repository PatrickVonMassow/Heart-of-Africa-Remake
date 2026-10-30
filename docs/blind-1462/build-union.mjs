// Builds docs/blind-1462/U.json from Fable's fold lines; every input id not in a fold stays its own union entry.
import { readFileSync, writeFileSync } from 'node:fs'
const R = '/workspace/hoa'
const A = JSON.parse(readFileSync(`${R}/docs/blind-1462/A.json`, 'utf8')).entries
const B = JSON.parse(readFileSync(`${R}/docs/blind-1462/B.json`, 'utf8')).entries
const raw = readFileSync(`${R}/local/blind-1462-merge.txt`, 'utf8')
const body = (raw.match(/^--- .* said ---\n([\s\S]*?)\n--- end ---/m) ?? [null, raw])[1]
const all = new Map([...A, ...B].map((e) => [e.id, e]))
const used = new Set(); const entries = []; const bad = []
for (const line of body.split('\n')) {
  const m = line.match(/^\s*B\d+\s*\|\s*([^|]+?)\s*\|\s*from\s+([AB]\d+(?:\s*\+\s*[AB]\d+)+)\s*·\s*(.+)$/)
  if (!m) { if (line.trim() && !/^\(none\)$/.test(line.trim())) bad.push(line.slice(0, 120)); continue }
  const from = m[2].split('+').map((s) => s.trim())
  for (const id of from) { if (!all.has(id) || used.has(id)) bad.push(`id ${id} unknown or reused`); used.add(id) }
  entries.push({ id: `U${entries.length + 1}`, from, file: m[1], defect: m[3].trim() })
}
for (const e of [...A, ...B]) if (!used.has(e.id)) entries.push({ id: `U${entries.length + 1}`, from: [e.id], file: e.file, defect: e.defect })
writeFileSync(`${R}/docs/blind-1462/U.json`, JSON.stringify({ mergedBy: 'Fable 5.1', entries }, null, 1) + '\n')
console.log(`folds ${entries.filter((e) => e.from.length > 1).length}, union ${entries.length}`)
if (bad.length) console.log('UNREAD:\n' + bad.join('\n'))
