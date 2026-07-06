// Minimal dependency-free PNG codec for the geodata preprocessing scripts.
// Decode: 8-bit, color types 0 (gray), 2 (RGB), 6 (RGBA), non-interlaced.
// Encode: 8-bit RGB with per-scanline "Up" filter (good for smooth data).
// Uses node:zlib for DEFLATE.

import zlib from 'node:zlib'

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

// --- CRC32 (PNG polynomial) ---------------------------------------------------

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// --- Decode -------------------------------------------------------------------

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/**
 * Decode a PNG buffer. Returns { width, height, channels, data } where data
 * is a Uint8Array of width*height*channels samples.
 */
export function decodePng(buf) {
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== SIGNATURE[i]) throw new Error('not a PNG')
  }
  let pos = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + len
  }
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`)
  if (interlace !== 0) throw new Error('interlaced PNG not supported')
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`unsupported color type ${colorType}`)

  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = new Uint8Array(width * height * channels)
  let rpos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[rpos++]
    const row = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rpos + x]
      const left = x >= channels ? row[x - channels] : 0
      const up = prev ? prev[x] : 0
      const ul = prev && x >= channels ? prev[x - channels] : 0
      let v
      switch (filter) {
        case 0: v = rawByte; break
        case 1: v = rawByte + left; break
        case 2: v = rawByte + up; break
        case 3: v = rawByte + ((left + up) >> 1); break
        case 4: v = rawByte + paeth(left, up, ul); break
        default: throw new Error(`bad filter ${filter}`)
      }
      row[x] = v & 0xff
    }
    rpos += stride
  }
  return { width, height, channels, data: out }
}

// --- Encode -------------------------------------------------------------------

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/** Encode 8-bit RGB pixels (Uint8Array, length width*height*3) as a PNG. */
export function encodePngRgb(width, height, pixels, level = 9) {
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const o = y * (stride + 1)
    raw[o] = 2 // "Up" filter: vertical deltas compress smooth data well
    for (let x = 0; x < stride; x++) {
      const cur = pixels[y * stride + x]
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0
      raw[o + 1 + x] = (cur - up) & 0xff
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type RGB
  const idat = zlib.deflateSync(raw, { level })
  return Buffer.concat([
    Buffer.from(SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
