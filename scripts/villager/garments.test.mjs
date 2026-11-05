// The legacy garment builder's local fit (scripts/villager/garments.py),
// checked outside Blender: plain Python with numpy runs the pure helpers the
// villager clothing fixes changed — the girdle cord's weights, the skirts'
// thigh blend, the short skirt's and chest wrapper's ease, the sleeve ring.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { VILLAGER_ASSET } from '../../src/config/balance'

const dir = dirname(fileURLToPath(import.meta.url))

/** Run `body` (Python) with garments imported as G and the fit config as FIT; it prints one JSON value. */
function py(body) {
  const src = `import sys, json\nsys.path.insert(0, ${JSON.stringify(dir)})\nimport numpy as np\nimport garments as G\nimport skeleton as SK\nFIT = json.loads(${JSON.stringify(JSON.stringify(VILLAGER_ASSET.garmentFit))})\n${body}\n`
  return JSON.parse(execFileSync('python3', ['-c', src], { encoding: 'utf8', windowsHide: true, timeout: 30000 }))
}

describe('garment builder local fit', () => {
  it('rides the girdle cord on the hips and spine alone', () => {
    const r = py(`
n = G.girdle_count()
W = np.zeros((n + 5, len(SK.NAMES)))
W[:, SK.INDEX['thigh.L']] = 0.6
W[:, SK.INDEX['hips']] = 0.4
W[0] = 0; W[0, SK.INDEX['thigh.R']] = 1
out = G.girdle_weights(W, n)
other = [i for i in range(len(SK.NAMES)) if i not in (SK.INDEX['hips'], SK.INDEX['spine'])]
print(json.dumps({'n': n, 'sum': float(np.abs(out[:n].sum(1) - 1).max()), 'off': float(out[:n][:, other].max()),
  'first': float(out[0, SK.INDEX['hips']]), 'rest': float(out[n, SK.INDEX['thigh.L']])}))`)
    // the torus of girdle(): 25 ring columns × 7 tube rows
    expect(r.n).toBe(25 * 7)
    expect(r.sum).toBeLessThan(1e-9)
    expect(r.off).toBe(0)
    // a vertex with no pelvis share falls to the hips
    expect(r.first).toBe(1)
    // the flaps after the cord keep their own weights
    expect(r.rest).toBeCloseTo(0.6)
  })

  it('blends a long wrapper over both thighs a short way below the crotch', () => {
    const r = py(`
crotch, hem = 0.6, 0.1
ys = np.linspace(crotch - 0.02, hem, 12)
a = 2 * np.pi * np.arange(24) / 24
v = np.array([[np.sin(t) * 0.15, y, np.cos(t) * 0.1] for y in ys for t in a])
W = np.zeros((len(v), len(SK.NAMES)))
left = v[:, 0] > 0
W[left, SK.INDEX['thigh.L']] = 1
W[~left, SK.INDEX['thigh.R']] = 1
def spread(out):
  # the front column (t = 0, left by the split) a third of the way down: how one-sided it is
  k = 4 * 24
  return float(abs(out[k, SK.INDEX['thigh.L']] - out[k, SK.INDEX['thigh.R']]))
old = G.skirt_weights(v, W, crotch, hem)
new = G.skirt_weights(v, W, crotch, hem, *G.skirt_blend('wrapLong', FIT))
knee = G.skirt_weights(v, W, crotch, hem, *G.skirt_blend('skirtKnee', FIT))
print(json.dumps({'old': spread(old), 'new': spread(new), 'knee': spread(knee), 'sum': float(np.abs(new.sum(1) - 1).max())}))`)
    expect(r.new).toBeLessThan(r.old)
    expect(r.new).toBeLessThan(0.25)
    expect(r.sum).toBeLessThan(1e-9)
    // the other skirts keep their blend
    expect(r.knee).toBeCloseTo(r.old, 9)
  })

  it('keeps the front and rear flap of a loin flap apart in the blur', () => {
    const r = py(`
w, reach = G.skirt_blend('loinFlap', FIT)
print(json.dumps({'w': w, 'reach': reach, 'apron': list(G.skirt_blend('apron', FIT)), 'flap': 'loinFlap' in G.SKIRTS}))`)
    expect(r.flap).toBe(true)
    expect(r.w).toBe(0.9)
    expect(r.reach).toBe(VILLAGER_ASSET.garmentFit.wrapBlendReach)
    expect(r.apron).toEqual([0.9, VILLAGER_ASSET.garmentFit.wrapBlendReach])
  })

  it('sits the short skirt and the chest wrapper close at their top edge', () => {
    const r = py(`
L = {'H': 1.34, 'fit': FIT}
print(json.dumps({'short': list(G.skirt_profile('skirtShort', 'waist', L)), 'chest': list(G.skirt_profile('wrapLong', 'chest', L)),
  'waist': list(G.skirt_profile('wrapLong', 'waist', L))}))`)
    const H = 1.34
    const [ease, flare, top] = r.short
    expect(top).toBeLessThan(ease)
    expect(ease).toBeLessThan(0.012 * H)
    expect(flare).toBeLessThan(0.035)
    expect(r.chest[2]).toBeLessThan(r.chest[0])
    // the waist wrapper is as before
    expect(r.waist).toEqual([0.012 * H, 0.05, null])
  })

  it('blends the tube ease from the top ring to the hem', () => {
    const r = py(`
class B:
  arm = np.zeros(3)
  body = {'joints': np.array([[0, 0.8, 0]])}
  def ring(self, y, m, ease):
    return np.zeros(2), np.full(4, 0.1 + ease)
rings = G.tube(B(), 1.0, 0.5, 0.02, 0.0, np.ones(3, bool), rings=5, ease_top=0.004)
print(json.dumps([float(r[2][0]) for r in rings]))`)
    expect(r[0]).toBeCloseTo(0.104)
    expect(r[4]).toBeCloseTo(0.12)
    for (let k = 1; k < r.length; k++) expect(r[k]).toBeGreaterThan(r[k - 1])
  })

  it('fits the sleeve ring closer round the arm', () => {
    const r = py(`print(json.dumps([G.sleeve_radius(0.04, k, FIT) for k in range(3)]))`)
    for (let k = 0; k < 3; k++) expect(r[k]).toBeLessThan(0.04 * 1.12 + 0.006 + 0.004 * k)
    expect(r[0]).toBeGreaterThan(0.04)
  })
})
