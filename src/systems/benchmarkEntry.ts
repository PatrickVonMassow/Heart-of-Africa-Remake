// The benchmark's settlement entry (point 1561): the ordinary `enterPlace`,
// so the walkable scene and its inhabitants come up as for a player, but on
// the LATER-entry path and without its side effects. A port's re-entry writes
// an arrival entry and a checkpoint to localStorage; a benchmark must neither
// add to the journal nor overwrite the player's checkpoints with its state.

import { useGame } from '../state/store'
import { benchLaterEntryPatch } from './benchmark'

/** Enter `id` silently; returns what the entry itself added (0/0 expected). */
export function benchEnterPlace(id: string): { journal: number; money: number } {
  useGame.setState(benchLaterEntryPatch(useGame.getState(), id))
  const before = useGame.getState()
  const { addEntry, saveCheckpoint } = before
  useGame.setState({ addEntry: () => {}, saveCheckpoint: () => {} })
  try {
    useGame.getState().enterPlace(id)
  } finally {
    useGame.setState({ addEntry, saveCheckpoint })
  }
  const after = useGame.getState()
  return { journal: after.journal.length - before.journal.length, money: after.money - before.money }
}
