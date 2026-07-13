// Bridge so the travel movement loop can collide the player with the streamed
// wildlife (design.md §19) without importing the Wildlife component module —
// keeping that file exporting only its component (react-refresh). The Wildlife
// component registers a query over its live herds; the movement loop calls it.

/** Returns nearby live animals as collision circles `[x, z, radius]`. */
export type AnimalCollider = (px: number, pz: number, radius: number) => Array<[number, number, number]>

let collider: AnimalCollider | null = null

/** The Wildlife component registers (and on unmount clears) its herd query. */
export function setAnimalCollider(fn: AnimalCollider | null): void {
  collider = fn
}

/** Nearby live animals as collision circles, or `[]` before wildlife mounts. */
export function collidableAnimalsNear(px: number, pz: number, radius: number): Array<[number, number, number]> {
  return collider ? collider(px, pz, radius) : []
}
