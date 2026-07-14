// Generates the tileable PBR ground textures (albedo + normal map) used by
// the terrain splatting (design.md §3). Procedural and deterministic, so the
// assets are reproducible from the repository without downloads:
//   node scripts/generate-terrain-textures.mjs
// Writes public/geodata/tex/{sand,grass,rock,forest}_{a,n}.png (256², RGB).
// The noise fields and the bake loop live in textureFields.mjs (shared with
// the settlement-surface generator and its Vitest coverage).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePngRgb } from './png.mjs'
import { TERRAIN_MATERIALS, bakeMaterial } from './textureFields.mjs'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'geodata', 'tex')
const SIZE = 256

fs.mkdirSync(OUT, { recursive: true })
for (const [name, mat] of Object.entries(TERRAIN_MATERIALS)) {
  const { albedo, normal } = bakeMaterial(mat, SIZE)
  fs.writeFileSync(path.join(OUT, `${name}_a.png`), encodePngRgb(SIZE, SIZE, albedo))
  fs.writeFileSync(path.join(OUT, `${name}_n.png`), encodePngRgb(SIZE, SIZE, normal))
  console.log(`wrote ${name}_a.png / ${name}_n.png`)
}
