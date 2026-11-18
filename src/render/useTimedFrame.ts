// `useFrame` with the callback's main-thread time booked as frame work of a
// named system (src/systems/longFrame.ts, docs/perf-1543-driving-hitches.md).
// DEV only: production registers the bare callback.

import { useFrame, type RenderCallback } from '@react-three/fiber'
import { timedFrame, type FrameSystem } from '../systems/longFrame'

export function useTimedFrame(system: FrameSystem, callback: RenderCallback, renderPriority?: number): null {
  return useFrame(timedFrame(system, callback), renderPriority)
}
