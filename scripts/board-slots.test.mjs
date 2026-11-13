// The board's slot line reads the corrected census (12.11.2026): a branch at its
// main cut point, local and origin-tracking alike, holds the slot of its open
// point instead of leaving it "free".
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { measureSlotLine } from './board-slots.mjs'

function freshCutRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-board-slots-'))
  const git = (...args) =>
    execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=', ...args], {
      cwd: dir,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, LC_ALL: 'C' },
    })
  git('init', '-b', 'main')
  git('config', 'user.email', 'test@example.invalid')
  git('config', 'user.name', 'Test')
  writeFileSync(join(dir, 'base.txt'), 'base')
  git('add', 'base.txt')
  git('commit', '-m', 'base')
  git('branch', 'feat/1490-head-load-porter')
  git('update-ref', 'refs/remotes/origin/feat/1490-head-load-porter', 'main')
  return dir
}

describe('measureSlotLine — fresh-cut / unfetched-cloud branch', () => {
  it('counts the actively worked fresh-cut branch as an occupied slot, in the short form', () => {
    const dir = freshCutRepo()
    try {
      const tasksText = '- [ ] 1490. Porter\n'
      const line = measureSlotLine({ tasksText, allTasksText: tasksText, activePoints: [1490], cwd: dir })
      expect(line.text).toMatch(/^2\/3 Slots frei: /)
      expect(line.text).not.toContain('Messung fehlgeschlagen')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
