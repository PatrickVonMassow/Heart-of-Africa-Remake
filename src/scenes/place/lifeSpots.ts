// Fixed positions of the settlement-life props (design.md §19). Shared
// between PlaceLife (rendering) and the layout builder (colliders and
// keep-clear zones in PlaceScene).

export const VILLAGE_SPOTS = {
  talkers: [4.6, 5.6] as [number, number],
  pounder: [-7, 1.2] as [number, number],
  drummer: [-2.2, 0.2] as [number, number],
  well: [9, 8.5] as [number, number],
}

/** Chatting pair on the port plaza. */
export const PORT_TALKERS: [number, number] = [6, 6]
