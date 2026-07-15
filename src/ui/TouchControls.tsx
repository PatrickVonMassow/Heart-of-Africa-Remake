// On-screen touch controls (design.md §17.5, point 84): a virtual movement
// stick (bottom-left) and a look/zoom drag surface (right screen half). It is
// mounted by the HUD only while ui.touchActive, which the deliberate-input
// guard in input.ts arms on the first real touch — so a desktop never sees it
// and PC play is pixel-identical. The controls only WRITE into input.ts's touch
// state; the scenes consume it at the same merge points as the gamepad, so
// there is no second input path.

import { useCallback, useRef } from 'react'
import { addTouchLook, addTouchPinch, setTouchStick } from '../systems/input'
import { stickVector, pinchRatio } from '../systems/touchInput'
import { balance } from '../config/balance'
import { useStrings } from '../i18n'

/** Pointer capture keeps a drag glued to its element even past its edge; a
 *  stray/synthetic pointer id can reject it, which must never break the drag. */
function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId)
  } catch {
    /* no active pointer with this id — ignore */
  }
}

export function TouchControls() {
  const t = useStrings()
  // Virtual-stick origin (screen px) captured on the first touch of the pad.
  const stickOrigin = useRef<{ x: number; y: number } | null>(null)
  const stickPointer = useRef<number | null>(null)
  const knob = useRef<HTMLDivElement | null>(null)

  const onStickDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    stickPointer.current = e.pointerId
    stickOrigin.current = { x: e.clientX, y: e.clientY }
    capture(e.currentTarget as HTMLElement, e.pointerId)
  }, [])

  const onStickMove = useCallback((e: React.PointerEvent) => {
    if (stickPointer.current !== e.pointerId || !stickOrigin.current) return
    const dx = e.clientX - stickOrigin.current.x
    const dy = e.clientY - stickOrigin.current.y
    const { stickRadius, stickDeadZone } = balance.touch
    const v = stickVector(dx, dy, stickRadius, stickDeadZone)
    setTouchStick(v.x, v.y)
    if (knob.current) {
      // Draw the knob at the clamped offset (v.y is forward = up = −screen y).
      knob.current.style.transform = `translate(${v.x * stickRadius}px, ${-v.y * stickRadius}px)`
    }
  }, [])

  const onStickUp = useCallback((e: React.PointerEvent) => {
    if (stickPointer.current !== e.pointerId) return
    stickPointer.current = null
    stickOrigin.current = null
    setTouchStick(0, 0)
    if (knob.current) knob.current.style.transform = 'translate(0px, 0px)'
  }, [])

  // Look/zoom surface: one finger drags the look; two fingers pinch to zoom.
  const lookPointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const lastPinchDist = useRef<number | null>(null)

  const pinchDistance = () => {
    const pts = [...lookPointers.current.values()]
    if (pts.length < 2) return 0
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
  }

  const onLookDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    lookPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    capture(e.currentTarget as HTMLElement, e.pointerId)
    if (lookPointers.current.size === 2) lastPinchDist.current = pinchDistance()
  }, [])

  const onLookMove = useCallback((e: React.PointerEvent) => {
    const prev = lookPointers.current.get(e.pointerId)
    if (!prev) return
    lookPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (lookPointers.current.size >= 2) {
      // Pinch: fold the finger-spread ratio into the pending zoom.
      const dist = pinchDistance()
      if (lastPinchDist.current && dist > 0) {
        const ratio = pinchRatio(lastPinchDist.current, dist)
        addTouchPinch(Math.pow(ratio, balance.touch.pinchFactor))
      }
      lastPinchDist.current = dist
    } else {
      // Single-finger drag turns the view.
      const dx = (e.clientX - prev.x) * balance.touch.lookDragFactor
      const dy = (e.clientY - prev.y) * balance.touch.lookDragFactor
      addTouchLook(dx, dy)
    }
  }, [])

  const onLookUp = useCallback((e: React.PointerEvent) => {
    lookPointers.current.delete(e.pointerId)
    if (lookPointers.current.size < 2) lastPinchDist.current = null
  }, [])

  return (
    <div className="touch-controls">
      <div
        className="touch-stick"
        role="slider"
        aria-label={t.hud.touch.moveStick}
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickUp}
        onPointerCancel={onStickUp}
      >
        <div className="touch-stick-knob" ref={knob} />
      </div>
      <div
        className="touch-look"
        aria-label={t.hud.touch.lookArea}
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookUp}
        onPointerCancel={onLookUp}
      />
    </div>
  )
}
