// The board, the focus and the activity stamp are HOST-LOCAL SINGLETONS: one
// host runs one batch. Resolving them against the checkout a process happened to
// start in gave a session whose cwd had moved into a point's worktree a second,
// empty state file beside the live one — the Stop guard read no registered
// dashboard and refused every turn. These pins say which root they belong to.
import { describe, it, expect } from 'vitest'
import { commonRepoPath } from './repo-paths.mjs'
import {
  STATE_PATH,
  FOCUS_PATH,
  PENDING_PATH,
  ACTIVITY_PATH,
  BOARD_FILE_DEFAULT,
  boardFilePath,
} from './dashboard-state.mjs'

describe('dashboard state lives in the shared checkout', () => {
  it.each([
    ['dashboard-state.json', STATE_PATH],
    ['current-focus.json', FOCUS_PATH],
    ['focus-check-pending.json', PENDING_PATH],
    ['tool-activity.json', ACTIVITY_PATH],
  ])('resolves %s against the common root', (file, actual) => {
    expect(actual).toBe(commonRepoPath(`.claude/${file}`))
  })

  it('resolves the default board against the common root, not the current checkout', () => {
    expect(boardFilePath(null)).toBe(commonRepoPath(BOARD_FILE_DEFAULT))
  })

  it('keeps a registered absolute path as it stands', () => {
    const registered = commonRepoPath('.batch-dashboard.html')
    expect(boardFilePath({ dashboardPath: registered })).toBe(registered)
  })
})
