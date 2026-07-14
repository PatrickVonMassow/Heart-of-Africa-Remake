// Live first-person player position within the current settlement, in
// place-local units (the same space the layout and the town-plan map use).
// PlaceScene writes it every frame; the town-plan map marker (MapOverlay)
// reads it to draw "you are here" without a per-frame store write. `active`
// is true only while a place scene is mounted.
export const placePlayerPosition = { x: 0, z: 0, active: false }
