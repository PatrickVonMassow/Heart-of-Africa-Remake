// Finished cloth is accumulating scenery, never inventory.
import { balance } from '../config/balance'
import { mulberry32 } from '../world/noise'

export function initialLoomCloth(seed: number, placeId: string): number {
  let hash = seed
  for (const char of placeId) hash = Math.imul(hash, 31) ^ char.charCodeAt(0)
  const cfg = balance.villageLife.loom
  return Math.min(cfg.stackCap, cfg.stackSeedMin + Math.floor(
    mulberry32(hash >>> 0)() * (cfg.stackSeedMax - cfg.stackSeedMin + 1),
  ))
}

/** At capacity the village carries a batch away; later strips build it again. */
export function addLoomCloth(current: number, finished: number): number {
  const { stackCap, stackFallback } = balance.villageLife.loom
  let count = current
  for (let i = 0; i < finished; i++) count = count >= stackCap ? stackFallback : count + 1
  return count
}
