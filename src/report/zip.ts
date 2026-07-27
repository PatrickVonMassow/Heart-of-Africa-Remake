// Minimal STORE-only (uncompressed) zip writer for the F6 bug report
// (design.md §21.1). Pure: bytes in, bytes out, no DOM and no dependency —
// a bug-report archive holding a PNG and two small text files gains nothing
// from deflate, and an archiver package would be a runtime dependency for one
// keypress (CLAUDE.md §3).
//
// Layout written (PKZIP APPNOTE 4.3): per member a local file header + its raw
// data, then one central-directory header per member, then the end-of-central-
// directory record. Names are UTF-8 with the language-encoding flag (bit 11)
// set, so a non-ASCII filename unpacks correctly everywhere.

export interface ZipEntry {
  /** Member path inside the archive (forward slashes, UTF-8). */
  name: string
  data: Uint8Array
}

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50
/** PKZIP 2.0 — what STORE + the UTF-8 flag needs, nothing newer. */
const VERSION = 20
/** General-purpose bit 11: the name (and comment) are UTF-8. */
const FLAG_UTF8 = 0x0800
const METHOD_STORE = 0

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

/** CRC-32 (IEEE 802.3, the checksum zip stores) over the raw bytes. */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * MS-DOS packed time/date, the only timestamp the base zip format carries.
 * Two-second resolution, epoch 1980 — a date before that clamps to 1980-01-01
 * rather than writing a negative year field.
 */
export function dosDateTime(d: Date): { time: number; date: number } {
  const year = d.getFullYear()
  if (year < 1980) return { time: 0, date: (0 << 9) | (1 << 5) | 1 }
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

/** Fixed-size writer over one buffer — the total size is known up front. */
class ByteWriter {
  private readonly view: DataView
  private readonly bytes: Uint8Array
  private at = 0
  constructor(size: number) {
    this.bytes = new Uint8Array(size)
    this.view = new DataView(this.bytes.buffer)
  }
  u16(v: number): void {
    this.view.setUint16(this.at, v, true)
    this.at += 2
  }
  u32(v: number): void {
    this.view.setUint32(this.at, v >>> 0, true)
    this.at += 4
  }
  raw(v: Uint8Array): void {
    this.bytes.set(v, this.at)
    this.at += v.length
  }
  get offset(): number {
    return this.at
  }
  result(): Uint8Array {
    return this.bytes
  }
}

/**
 * The whole archive as one byte array. `date` is injectable so a test gets a
 * byte-identical result twice; every member carries the same timestamp.
 */
export function buildZip(entries: ZipEntry[], date: Date = new Date()): Uint8Array {
  const enc = new TextEncoder()
  const prepared = entries.map((e) => {
    const name = enc.encode(e.name)
    return { name, data: e.data, crc: crc32(e.data), offset: 0 }
  })
  const { time, date: dosDate } = dosDateTime(date)
  const localSize = prepared.reduce((n, e) => n + 30 + e.name.length + e.data.length, 0)
  const centralSize = prepared.reduce((n, e) => n + 46 + e.name.length, 0)
  const w = new ByteWriter(localSize + centralSize + 22)

  for (const e of prepared) {
    e.offset = w.offset
    w.u32(LOCAL_SIG)
    w.u16(VERSION)
    w.u16(FLAG_UTF8)
    w.u16(METHOD_STORE)
    w.u16(time)
    w.u16(dosDate)
    w.u32(e.crc)
    w.u32(e.data.length) // compressed == uncompressed under STORE
    w.u32(e.data.length)
    w.u16(e.name.length)
    w.u16(0) // no extra field
    w.raw(e.name)
    w.raw(e.data)
  }

  const centralStart = w.offset
  for (const e of prepared) {
    w.u32(CENTRAL_SIG)
    w.u16(VERSION) // version made by
    w.u16(VERSION) // version needed
    w.u16(FLAG_UTF8)
    w.u16(METHOD_STORE)
    w.u16(time)
    w.u16(dosDate)
    w.u32(e.crc)
    w.u32(e.data.length)
    w.u32(e.data.length)
    w.u16(e.name.length)
    w.u16(0) // extra
    w.u16(0) // comment
    w.u16(0) // disk number start
    w.u16(0) // internal attributes
    w.u32(0) // external attributes
    w.u32(e.offset)
    w.raw(e.name)
  }

  // Measured before the EOCD itself is written — the record sits after the
  // central directory, so `offset` would already have moved past it.
  const centralBytes = w.offset - centralStart
  w.u32(EOCD_SIG)
  w.u16(0) // this disk
  w.u16(0) // disk holding the central directory
  w.u16(prepared.length)
  w.u16(prepared.length)
  w.u32(centralBytes)
  w.u32(centralStart)
  w.u16(0) // no archive comment
  return w.result()
}
