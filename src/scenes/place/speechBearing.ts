// Sample the live camera at utterance planning time, not the traveller's yaw.
import { Vector3, type Camera } from 'three/webgpu'

export function speechBearing(camera: Camera, speaker: { x: number; z: number }): number {
  const eye = camera.getWorldPosition(new Vector3())
  const forward = camera.getWorldDirection(new Vector3())
  const dx = speaker.x - eye.x
  const dz = speaker.z - eye.z
  // Ground-plane right and forward. No division by depth: going behind the
  // camera keeps the same side and crossing the rear seam remains continuous.
  return Math.atan2(-dx * forward.z + dz * forward.x, dx * forward.x + dz * forward.z)
}
