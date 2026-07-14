// Generates the tileable settlement-surface textures (albedo + normal map)
// for the first-person materials (design.md §2.6): plaster, mud daub, thatch,
// wood and trodden settlement ground. Procedural and deterministic, so the
// assets are reproducible from the repository without downloads:
//   node scripts/generate-surface-textures.mjs
// Writes public/tex/{plaster,mud,thatch,wood,ground}_{a,n}.png (512², RGB).
// 512 px over the ~1-2.5 m runtime tiles keeps millimetre grain in the top
// mip; the GPU mip chain band-limits it with distance (materials.ts).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePngRgb } from './png.mjs'
import { SURFACE_MATERIALS, bakeMaterial } from './textureFields.mjs'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'tex')
const SIZE = 512

fs.mkdirSync(OUT, { recursive: true })
for (const [name, mat] of Object.entries(SURFACE_MATERIALS)) {
  const { albedo, normal } = bakeMaterial(mat, SIZE)
  fs.writeFileSync(path.join(OUT, `${name}_a.png`), encodePngRgb(SIZE, SIZE, albedo))
  fs.writeFileSync(path.join(OUT, `${name}_n.png`), encodePngRgb(SIZE, SIZE, normal))
  console.log(`wrote ${name}_a.png / ${name}_n.png`)
}
