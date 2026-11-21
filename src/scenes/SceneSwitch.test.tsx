// The village-to-village hop of the villager-dress suite (leavePlace +
// enterPlace in one tick) must remount the settlement scene, or nothing it drew
// is ever released (point 1447 measurement: ~30 pipelines per village).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { useEffect } from 'react'

const life = vi.hoisted(() => ({ mounts: [] as string[], unmounts: [] as string[] }))

vi.mock('./travel/TravelScene', () => ({ TravelScene: () => null }))
vi.mock('./place/PlaceScene', async () => {
  const { useGame } = await import('../state/store')
  return {
    PlaceScene: () => {
      // mount-scoped on purpose: only a real remount records a new pair
      useEffect(() => {
        const id = useGame.getState().placeId ?? '?'
        life.mounts.push(id)
        return () => void life.unmounts.push(id)
      }, [])
      return null
    },
  }
})

import { SceneSwitch } from './SceneSwitch'
import { freshGame, g } from '../test/store'

describe('SceneSwitch', () => {
  beforeEach(() => {
    freshGame()
    life.mounts.length = 0
    life.unmounts.length = 0
  })

  it('remounts the settlement scene on a place-to-place change that never shows travel', () => {
    act(() => g().enterPlace('cairo'))
    render(<SceneSwitch />)
    expect(life.mounts).toEqual(['cairo'])
    act(() => {
      g().leavePlace()
      g().enterPlace('tuareg-village')
    })
    expect(g().mode).toBe('place')
    expect(life.unmounts).toEqual(['cairo'])
    expect(life.mounts).toEqual(['cairo', 'tuareg-village'])
  })

  it('remounts the settlement scene on a leave and re-entry of the same place in one tick', () => {
    act(() => g().enterPlace('cairo'))
    render(<SceneSwitch />)
    act(() => {
      g().leavePlace()
      g().enterPlace('cairo')
    })
    expect(life.unmounts).toEqual(['cairo'])
    expect(life.mounts).toEqual(['cairo', 'cairo'])
  })

  it('unmounts the settlement scene when the player returns to the bird\'s-eye view', () => {
    act(() => g().enterPlace('cairo'))
    render(<SceneSwitch />)
    act(() => g().leavePlace())
    expect(life.unmounts).toEqual(['cairo'])
  })
})
