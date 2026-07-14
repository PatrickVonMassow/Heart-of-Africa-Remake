// Types for the texture-baking core (textureFields.mjs), used by the Vitest
// coverage in src/render/surfaceTextures.test.ts.

export interface TextureMaterialDef {
  height(u: number, v: number): number
  colorize(h: number, u: number, v: number): [number, number, number]
  normalStrength: number
}

export declare function pnoise(u: number, v: number, p: number, seed: number): number
export declare function pnoise2(u: number, v: number, pu: number, pv: number, seed: number): number
export declare function fbm(u: number, v: number, p0: number, octaves: number, seed: number, gain?: number): number
export declare function fbm2(
  u: number,
  v: number,
  pu0: number,
  pv0: number,
  octaves: number,
  seed: number,
  gain?: number,
): number
export declare function worley(u: number, v: number, p: number, seed: number): number

export declare const TERRAIN_MATERIALS: Record<'sand' | 'grass' | 'rock' | 'forest', TextureMaterialDef>
export declare const SURFACE_MATERIALS: Record<
  'plaster' | 'mud' | 'thatch' | 'wood' | 'ground',
  TextureMaterialDef
>

export declare function bakeMaterial(
  mat: TextureMaterialDef,
  size: number,
): { albedo: Uint8Array; normal: Uint8Array }
