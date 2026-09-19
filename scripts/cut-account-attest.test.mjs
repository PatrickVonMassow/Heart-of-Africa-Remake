import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captureFloor, floorWitnesses, validateAttestation, validateFloorWitnesses } from './cut-account-attest.mjs'

const dirs = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cut-attest-'))
  dirs.push(root)
  const transcript = join(root, 'session.jsonl')
  const rows = [
    { timestamp: '2026-08-20T03:00:00Z' },
    { type: 'user', sessionId: 'session', cwd: root, timestamp: '2026-08-20T03:01:00Z', message: { content: '[batch-resume]' } },
    { type: 'assistant', sessionId: 'session', timestamp: '2026-08-20T03:02:00Z', message: { usage: { input_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 } } },
  ]
  // Whitespace is deliberate: reserializing a row must not count as verbatim.
  const source = rows.map((r) => '  ' + JSON.stringify(r) + ' ').join('\n') + '\n'
  writeFileSync(transcript, source)
  return { root, transcript, rows, source, reading: { kind: 'owner', transcript, date: '20.08.2026', summands: [2, 3, 4], stated: 9, adds: true } }
}

describe('captureFloor', () => {
  it('reads a real file and preserves exact usage, kind and earliest rows with provenance', () => {
    const f = fixture()
    const a = captureFloor(f.reading, f)
    expect(a.transcript).toBe(f.transcript)
    expect(Number.isFinite(Date.parse(a.readAt))).toBe(true)
    expect(a.witnesses.usage).toEqual({ line: 3, raw: f.source.split('\n')[2] })
    expect(a.witnesses.kind).toEqual({ line: 2, raw: f.source.split('\n')[1] })
    expect(a.witnesses.earliest).toEqual({ line: 1, raw: f.source.split('\n')[0] })
    expect(() => validateAttestation(f.reading, a, f)).not.toThrow()
    expect(readFileSync(f.transcript, 'utf8')).toBe(f.source)
  })

  it('refuses a missing transcript and a floor that disagrees with a real one', () => {
    const f = fixture()
    expect(() => captureFloor({ ...f.reading, summands: [9, 9, 9] }, f)).toThrow(/summands/)
    rmSync(f.transcript)
    expect(() => captureFloor(f.reading, f)).toThrow(/ENOENT/)
  })

  it('rejects an attestation that does not match its transcript, even when numbers still agree', () => {
    const f = fixture()
    const a = captureFloor(f.reading, f)
    a.witnesses.usage.raw += ' '
    expect(() => validateAttestation(f.reading, a, f)).toThrow(/does not match/)
    const good = captureFloor(f.reading, f)
    expect(() => validateAttestation(f.reading, good, { ...f, source: f.source + '\n' })).toThrow(/does not match/)
  })

  it('can re-derive the preserved witnesses after the source expires', () => {
    const f = fixture()
    const a = captureFloor(f.reading, f)
    rmSync(f.transcript)
    expect(() => validateAttestation(f.reading, a, { root: f.root })).not.toThrow()
  })

  it.each([
    ['wrong session', (rows) => { rows[2].sessionId = 'other' }],
    ['relative cwd', (rows) => { rows[1].cwd = '.' }],
    ['wrong kind', (rows) => { rows[1].message.content = 'ordinary prompt' }],
    ['wrong usage date', (rows) => { rows[2].timestamp = '2026-08-21T03:00:00Z' }],
    ['stale row after usage', (rows) => { rows.push({ timestamp: '2026-08-20T02:00:00+02:00' }) }],
    ['spliced kind after usage', (rows) => { rows.push(rows.splice(1, 1)[0]) }],
  ])('refuses %s', (_name, mutate) => {
    const f = fixture()
    mutate(f.rows)
    writeFileSync(f.transcript, f.rows.map(JSON.stringify).join('\n'))
    expect(() => captureFloor(f.reading, f)).toThrow()
  })

  it('scans beyond the first usage and compares timestamps as instants', () => {
    const f = fixture()
    const text = f.source + JSON.stringify({ timestamp: '2026-08-20T04:30:00+02:00' })
    const witnesses = floorWitnesses(text)
    expect(witnesses.earliest.line).toBe(4)
    expect(() => validateFloorWitnesses(f.reading, witnesses, f.root)).not.toThrow()
  })
})
