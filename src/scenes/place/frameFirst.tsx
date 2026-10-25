// A frame callback placed between its parent's earlier siblings and its own
// later siblings. R3F runs callbacks of one priority in subscription order,
// and each subscribes in a layout effect: an earlier sibling's subtree first,
// then a parent's children in order, the parent itself last. Rendered as a
// component's first child, `frame` runs at default priority after every
// earlier sibling (the children's frame, which moves the bodies the adults'
// work hears) and before the component's own children (the figures, which
// draw what `frame` leaves).

import { useFrame } from '@react-three/fiber'

export function FrameFirst({ frame }: { frame: (dt: number) => void }): null {
  useFrame((_, dt) => frame(dt))
  return null
}
