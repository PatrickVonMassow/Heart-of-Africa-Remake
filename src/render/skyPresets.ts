// Sky presets per scene (regional mood tints, design.md §19). Kept separate
// from the SkyDome component so sky.tsx only exports components (Fast Refresh).

export interface SkyPreset {
  zenith: string
  horizon: string
  /** Color below the horizon line (hides the dome bottom). */
  ground: string
  sun: string
  /** 0..1 cloud coverage. */
  clouds: number
}

export const TRAVEL_SKY: SkyPreset = {
  zenith: '#3d76c4',
  horizon: '#cfe0ea',
  ground: '#8a94a0',
  sun: '#fff2d0',
  clouds: 0.55,
}

export const PORT_SKY: SkyPreset = {
  zenith: '#3f7fc9',
  horizon: '#d8e6ee',
  ground: '#9aa4ac',
  sun: '#fff3d6',
  clouds: 0.4,
}

export const VILLAGE_SKY: SkyPreset = {
  zenith: '#4a82b8',
  horizon: '#e2e3c8',
  ground: '#a0a08a',
  sun: '#ffefc2',
  clouds: 0.5,
}
