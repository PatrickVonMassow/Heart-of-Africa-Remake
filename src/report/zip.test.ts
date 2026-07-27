// The STORE-only zip writer (design.md §21.1, F6 bug report): byte layout,
// CRC-32 against the standard check vectors, several members, an empty member
// and a UTF-8 filename. The archive is read back by an INDEPENDENT parser
// written the way an unzip reads one — end-of-central-directory first, then
// the central directory, then each local header — so a wrong offset or size
// fails here rather than in the user's file manager.

import { describe, it, expect } from 'vitest'
import { buildZip, crc32, dosDateTime, type ZipEntry } from './zip'

const enc = new TextEncoder()
const dec = new TextDecoder()
const bytes = (s: string) => enc.encode(s)

interface ParsedMember {
  name: string
  data: Uint8Array
  crc: number
  method: number
  flags: number
}

/** Reads an archive the way an unzip does: EOCD → central directory → local
 *  headers. Deliberately does NOT reuse the writer's constants. */
function parseZip(buf: Uint8Array): ParsedMember[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  // The EOCD sits at the end (no archive comment, so exactly 22 bytes).
  const eocd = buf.length - 22
  expect(view.getUint32(eocd, true)).toBe(0x06054b50)
  const count = view.getUint16(eocd + 10, true)
  expect(view.getUint16(eocd + 8, true)).toBe(count)
  const centralSize = view.getUint32(eocd + 12, true)
  const centralStart = view.getUint32(eocd + 16, true)
  expect(centralStart + centralSize).toBe(eocd)

  const out: ParsedMember[] = []
  let at = centralStart
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50)
    const flags = view.getUint16(at + 8, true)
    const method = view.getUint16(at + 10, true)
    const crc = view.getUint32(at + 16, true)
    const compressed = view.getUint32(at + 20, true)
    const size = view.getUint32(at + 24, true)
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    const local = view.getUint32(at + 42, true)
    const name = dec.decode(buf.subarray(at + 46, at + 46 + nameLen))
    at += 46 + nameLen + extraLen + commentLen

    // The local header must agree with the directory entry in every field an
    // extractor trusts, and the data must start right behind it.
    expect(view.getUint32(local, true)).toBe(0x04034b50)
    expect(view.getUint16(local + 6, true)).toBe(flags)
    expect(view.getUint16(local + 8, true)).toBe(method)
    expect(view.getUint32(local + 14, true)).toBe(crc)
    expect(view.getUint32(local + 18, true)).toBe(compressed)
    expect(view.getUint32(local + 22, true)).toBe(size)
    const localNameLen = view.getUint16(local + 26, true)
    const localExtraLen = view.getUint16(local + 28, true)
    expect(dec.decode(buf.subarray(local + 30, local + 30 + localNameLen))).toBe(name)
    const dataAt = local + 30 + localNameLen + localExtraLen
    out.push({ name, data: buf.subarray(dataAt, dataAt + size), crc, method, flags })
  }
  expect(at).toBe(eocd)
  return out
}

describe('crc32 (the checksum an extractor verifies against)', () => {
  it('matches the standard check vectors', () => {
    // "123456789" → 0xCBF43926 is the published CRC-32/ISO-HDLC check value.
    expect(crc32(bytes('123456789')) >>> 0).toBe(0xcbf43926)
    expect(crc32(new Uint8Array(0))).toBe(0)
    expect(crc32(bytes('a'))).toBe(0xe8b7be43)
    expect(crc32(bytes('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339)
  })
})

describe('dosDateTime', () => {
  it('packs the timestamp into the two DOS words', () => {
    const { time, date } = dosDateTime(new Date(2026, 6, 27, 13, 45, 30))
    expect(date).toBe(((2026 - 1980) << 9) | (7 << 5) | 27)
    expect(time).toBe((13 << 11) | (45 << 5) | 15)
  })

  it('clamps a pre-1980 date instead of writing a negative year field', () => {
    const { time, date } = dosDateTime(new Date(1890, 0, 1))
    expect(date).toBe((1 << 5) | 1)
    expect(time).toBe(0)
  })
})

describe('buildZip', () => {
  const stamp = new Date(2026, 6, 27, 12, 0, 0)
  const entries: ZipEntry[] = [
    { name: 'hoa-report.png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255, 12]) },
    { name: 'hoa-report.json', data: bytes('{"seed":42}') },
    { name: 'hoa-report.txt', data: bytes('Nichts los — Bericht ohne Beschreibung.') },
    { name: 'leer.bin', data: new Uint8Array(0) },
    { name: 'Bericht-Straße-☃.txt', data: bytes('unicode name') },
  ]

  it('writes every member back out unchanged, stored and in order', () => {
    const members = parseZip(buildZip(entries, stamp))
    expect(members.map((m) => m.name)).toEqual(entries.map((e) => e.name))
    for (let i = 0; i < entries.length; i++) {
      expect(members[i].method).toBe(0) // STORE — no deflate
      expect(Array.from(members[i].data)).toEqual(Array.from(entries[i].data))
      expect(members[i].crc).toBe(crc32(entries[i].data))
    }
  })

  it('carries an empty member with a zero length and a zero CRC', () => {
    const members = parseZip(buildZip(entries, stamp))
    const empty = members.find((m) => m.name === 'leer.bin')!
    expect(empty.data.length).toBe(0)
    expect(empty.crc).toBe(0)
  })

  it('flags UTF-8 names so a non-ASCII filename survives extraction', () => {
    const members = parseZip(buildZip(entries, stamp))
    expect(members.every((m) => (m.flags & 0x0800) !== 0)).toBe(true)
    expect(members.find((m) => m.name === 'Bericht-Straße-☃.txt')).toBeDefined()
  })

  it('is deterministic for the same input and timestamp', () => {
    const a = buildZip(entries, stamp)
    const b = buildZip(entries, stamp)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('writes a valid empty archive (just the end record)', () => {
    const buf = buildZip([], stamp)
    expect(buf.length).toBe(22)
    expect(parseZip(buf)).toEqual([])
  })

  it('sizes the buffer exactly — no trailing padding an extractor would trip on', () => {
    const one: ZipEntry[] = [{ name: 'a.txt', data: bytes('hello') }]
    const buf = buildZip(one, stamp)
    // 30 + name(5) + data(5) + 46 + name(5) + 22
    expect(buf.length).toBe(30 + 5 + 5 + 46 + 5 + 22)
  })
})
