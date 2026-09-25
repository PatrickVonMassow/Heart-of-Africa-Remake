import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const css = readFileSync('src/index.css', 'utf8')

it('keeps the compatibility dismissal above the journal and below modal dialogs', () => {
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  const nodes = ['status-bar', 'journal', 'renderer-warning', 'dialog-backdrop'].map((className) => {
    const node = document.createElement('div')
    node.className = className
    document.body.append(node)
    return node
  })
  try {
    const [status, journal, notice, modal] = nodes.map((node) => Number(getComputedStyle(node).zIndex))
    expect(status).toBeGreaterThan(16777271) // maximum drei Html label layer
    expect(notice).toBeGreaterThan(journal)
    expect(modal).toBeGreaterThan(notice)
  } finally { style.remove(); nodes.forEach((node) => node.remove()) }
})
