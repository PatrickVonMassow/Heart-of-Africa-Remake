// The legacy garment builder's local fit (scripts/villager/garments.py),
// checked outside Blender: plain Python with numpy runs the pure helpers the
// villager clothing fixes changed — the girdle cord's weights, the skirts'
// thigh blend, the short skirt's and chest wrapper's ease, the sleeve ring.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { VILLAGER_ASSET } from '../../src/config/balance'

const dir = dirname(fileURLToPath(import.meta.url))

// CI runners carry no numpy; the fit is checked where the asset is built.
const hasNumpy = (() => {
  try {
    execFileSync('python3', ['-c', 'import numpy'], { stdio: 'ignore', timeout: 30000, windowsHide: true })
    return true
  } catch {
    return false
  }
})()

/** Run `body` (Python) with garments imported as G and the fit config as FIT; it prints one JSON value. */
function py(body) {
  const src = `import sys, json\nsys.path.insert(0, ${JSON.stringify(dir)})\nimport numpy as np\nimport garments as G\nimport skeleton as SK\nFIT = json.loads(${JSON.stringify(JSON.stringify(VILLAGER_ASSET.garmentFit))})\n${body}\n`
  return JSON.parse(execFileSync('python3', ['-c', src], { encoding: 'utf8', windowsHide: true, timeout: 30000 }))
}

// The pinned MakeHuman sources (node scripts/villager/build.mjs fetch), git-ignored.
const sources = join(dir, '..', '..', 'local', 'assets-src', 'villager')
const hasSources = existsSync(join(sources, 'makehuman', 'base.obj'))

describe.skipIf(!hasNumpy || !hasSources)('chest wrapper on the woman base mesh (diagnostic)', () => {
  // Work-order points 1482/1489: the wrapper is cut on the man's body and the
  // surface map carries it onto a woman's; its top edge there must lie above
  // her breast apex. Nearest-vertex map, rest pose: a diagnostic of the
  // anchor height, not a penetration gate (the asset build's settle and
  // penetration report measure the cloth).
  it('puts the top edge above the breast apex with margin', () => {
    const src = `import sys, json
sys.path.insert(0, ${JSON.stringify(dir)})
import numpy as np
import skeleton as SK
import body as BD
import garments as G
from mhbody import MakeHuman
cfg = {'VILLAGER_ASSET': json.loads(${JSON.stringify(JSON.stringify(VILLAGER_ASSET))})}
mh = MakeHuman(${JSON.stringify(sources)})
C = BD.corner_shapes(mh, cfg)
AM = C[('male', 'adult', 0)]
H = cfg['VILLAGER_ASSET']['stature']
Wfull, _ = BD.full_weights(mh)
arm = Wfull[:, [SK.INDEX[n] for n in BD.ARM_BONES]].sum(1)
j = BD.joints_of(mh, AM)
L = G.landmarks(np.array([[*j[n][0], *j[n][1]] if n in j else [0.0] * 6 for n in SK.NAMES]), H)
L['fit'] = cfg['VILLAGER_ASSET']['garmentFit']
body = np.zeros(len(AM), bool); body[mh.groups['body']] = True
trunk = body & (arm < 0.3)
bi = np.nonzero(body)[0]
def top_ring(y):
  m = trunk & (np.abs(AM[:, 1] - y) < 0.012)
  h = G.hull2d(AM[m][:, [0, 2]]); c = h.mean(0)
  return np.array([[c[0] + d[0] * (G.ray_hull(h, c, d) + L['fit']['chestWrapEaseTop'] * H), y, c[1] + d[1] * (G.ray_hull(h, c, d) + L['fit']['chestWrapEaseTop'] * H)] for d in G.angles()])
out = {}
for age in ('youth', 'adult'):
  F = C[('female', age, 0)]
  chest = trunk & (F[:, 1] > 0.75) & (F[:, 1] < 1.0) & (F[:, 0] > 0.02)
  apex = F[np.argmax(np.where(chest, F[:, 2], -9))]
  res = {}
  for name, y in (('new', G.chest_wrap_top(L)), ('chestTop', L['chestTop'])):
    p = top_ring(y)
    ids = bi[((p[:, None, :] - AM[None, body, :]) ** 2).sum(2).argmin(1)]
    q = F[ids] + (p - AM[ids])
    res[name] = float(q[q[:, 2] > 0.03, 1].min() - apex[1])
  out[age] = res
print(json.dumps(out))
`
    const r = JSON.parse(execFileSync('python3', ['-c', src], { encoding: 'utf8', windowsHide: true, timeout: 120000 }))
    for (const age of ['youth', 'adult']) {
      // 3 cm over the apex at rest: the run's forward lean and the breathing chest keep it covered
      expect(r[age].new).toBeGreaterThan(0.03)
      // the old anchor's edge lay about 1 cm over the apex (the bare breasts of the owner's frames)
      expect(r[age].chestTop).toBeLessThan(0.02)
    }
  }, 120000)
})

describe.skipIf(!hasNumpy || !hasSources)('chest wrapper lies on every body corner (builder output, browserless)', () => {
  // Work-order point 1482, pass 5: the pass-4 wrapper ballooned off chest,
  // upper arms and waist; its outward offset from the trunk at every ring of
  // the builder's own output (build_form on the rest body, nearest-vertex map
  // onto each corner, clear_corners) stays within a small fraction of H.
  // Rest pose, no clip fit or settle (those need Blender): the asset build's
  // penetration report and villagerFigureBody.test.ts measure the rest.
  it('stands off no corner by more than 0.02 H and keeps its top clear of the arms at the sides', () => {
    const src = `import sys, json
sys.path.insert(0, ${JSON.stringify(dir)})
import numpy as np
import skeleton as SK
import body as BD
import garments as G
from mhbody import MakeHuman
cfg = {'VILLAGER_ASSET': json.loads(${JSON.stringify(JSON.stringify(VILLAGER_ASSET))})}
mh = MakeHuman(${JSON.stringify(sources)})
C = BD.corner_shapes(mh, cfg)
basis, deltas = BD.morph_deltas(C)
H = cfg['VILLAGER_ASSET']['stature']
Wfull, _ = BD.full_weights(mh)
jb = BD.joints_of(mh, basis)
L = G.landmarks(np.array([[*jb[n][0], *jb[n][1]] if n in jb else [0.0] * 6 for n in SK.NAMES]), H)
L['fit'] = cfg['VILLAGER_ASSET']['garmentFit']
B = object.__new__(G.Body)
B.v, B.W, B._hulls = basis, Wfull, {}
B.arm = Wfull[:, [SK.INDEX[n] for n in BD.ARM_BONES]].sum(1)
B.mask_body = np.zeros(len(basis), bool); B.mask_body[mh.groups['body']] = True
B.body = {'joints': np.array([[*jb[n][0], *jb[n][1]] if n in jb else [0.0] * 6 for n in SK.NAMES])}
v = G.build_form(B, 'wrapLong', 'chest', L)[0][0]
v = v[v[:, 1] > L['hip']]
bi = np.nonzero(B.mask_body)[0]
ids = bi[np.array([((basis[B.mask_body] - p) ** 2).sum(1).argmin() for p in v])]
morph = {k: deltas[k][ids] for k in deltas}
morph = G.clear_corners(v, morph, basis, deltas, B.mask_body & (B.arm < G.CLEAR_ARM), G.PUSH_CLEARANCE, L['fit']['chestWrapDrape'] * H)
trunk = B.mask_body & (B.arm < 0.3)
out = {}
for names in ((), ('female',), ('female', 'youth', 'youth_f'), ('female', 'child', 'child_f'), ('female', 'elder', 'elder_f'), ('stout',), ('slight',)):
  skin = basis + sum((deltas[n] for n in names), np.zeros_like(basis))
  gp = v + sum((morph[n] for n in names), np.zeros_like(v))
  worst = 0.0
  for y in np.linspace(gp[:, 1].max(), L['hip'], 10):
    sec = skin[trunk & (np.abs(skin[:, 1] - y) < 0.012)][:, [0, 2]]
    gs = gp[np.abs(gp[:, 1] - y) < 0.006][:, [0, 2]]
    if len(sec) < 3 or not len(gs): continue
    h = G.hull2d(sec); c = h.mean(0)
    for p in gs:
      d = p - c; r = np.linalg.norm(d)
      worst = max(worst, r - G.ray_hull(h, c, d / r))
  out['+'.join(names) or 'male'] = worst / H
arm = basis[B.mask_body & (B.arm > 0.5)]
top = v[v[:, 1] > L['shoulder'] - 0.12 * H]
near = np.sqrt(((top[:, None, :] - arm[None]) ** 2).sum(2)).min(1)
print(json.dumps({'off': out, 'nearArm': float(near.min() / H)}))
`
    const r = JSON.parse(execFileSync('python3', ['-c', src], { encoding: 'utf8', windowsHide: true, timeout: 300000 }))
    // measured at pass 5: 0.009-0.015 H; the pass-4 drape stood a woman's cloth 0.04 H off under the bust and a girl's 0.03 H off her chest
    for (const [corner, off] of Object.entries(r.off)) expect(off, corner).toBeLessThan(0.02)
    expect(r.nearArm).toBeGreaterThan(0)
  }, 300000)
})

describe.skipIf(!hasNumpy)('garment builder local fit', () => {
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

  it("dips a chest wrapper's top edge at the sides under the arms, level over the breasts and the back", () => {
    const r = py(`
L = {'H': 1.0, 'waist': 0.6, 'fit': FIT}
tops, floor = G.chest_wrap_column_top(L, 0.8)
print(json.dumps({'front': float(tops[0]), 'back': float(tops[G.N_RADIAL // 2]), 'side': float(tops[G.N_RADIAL // 4]), 'floor': floor}))`)
    // level, the edge ran through the hanging upper arm and the settle cushioned the cloth round it (point 1482 pass 5)
    expect(r.front).toBeCloseTo(0.8, 9)
    expect(r.back).toBeCloseTo(0.8, 9)
    expect(r.side).toBeCloseTo(0.8 - VILLAGER_ASSET.garmentFit.chestWrapSideDrop, 9)
    expect(r.floor).toBe(0.6)
  })

  it('keeps the front and rear flap of a loin flap apart in the blur', () => {
    const r = py(`
w, reach, _hem = G.skirt_blend('loinFlap', FIT)
print(json.dumps({'w': w, 'reach': reach, 'apron': list(G.skirt_blend('apron', FIT)), 'flap': 'loinFlap' in G.SKIRTS}))`)
    expect(r.flap).toBe(true)
    expect(r.w).toBe(0.9)
    expect(r.reach).toBe(VILLAGER_ASSET.garmentFit.wrapBlendReach)
    expect(r.apron).toEqual([0.9, VILLAGER_ASSET.garmentFit.wrapBlendReach, 0.9])
  })

  it("narrows a long wrapper's blur back at the hem so its front follows the forward leg", () => {
    const r = py(`
crotch, hem = 0.6, 0.1
ys = np.linspace(crotch - 0.02, hem, 12)
a = 2 * np.pi * np.arange(24) / 24
v = np.array([[np.sin(t) * 0.15, y, np.cos(t) * 0.1] for y in ys for t in a])
W = np.zeros((len(v), len(SK.NAMES)))
# the front-left quarter rides the left thigh, the rest the right
left = (v[:, 0] > 0) & (v[:, 2] > 0)
W[left, SK.INDEX['thigh.L']] = 1
W[~left, SK.INDEX['thigh.R']] = 1
k = 11 * 24 + 2  # the hem ring, a front-left column
def share(out):
  return float(out[k, SK.INDEX['thigh.L']])
w, reach, hem_w = G.skirt_blend('wrapLong', FIT)
new = G.skirt_weights(v, W, crotch, hem, w, reach, hem_w)
wide = G.skirt_weights(v, W, crotch, hem, w, reach)
old = G.skirt_weights(v, W, crotch, hem)
print(json.dumps({'new': share(new), 'wide': share(wide), 'old': share(old), 'hem_w': hem_w}))`)
    // at the hem the blend is the pre-1482 one again, more of the column's own leg than the wide blur's
    expect(r.hem_w).toBe(VILLAGER_ASSET.garmentFit.wrapHemBlurWidth)
    expect(r.new).toBeCloseTo(r.old, 6)
    expect(r.new).toBeGreaterThan(r.wide + 0.05)
  })

  it("rings a chest wrapper densely from its top to the chest bone's head", () => {
    const r = py(`
L = {'H': 1.34, 'shoulder': 1.07, 'waist': 0.89, 'fit': FIT}
top = G.chest_wrap_top(L)
ys = G.chest_wrap_heights(L, top, 0.25)
print(json.dumps({'top': top, 'ys': ys}))`)
    const H = 1.34
    const { ys, top } = r
    expect(top).toBeCloseTo(1.07 - VILLAGER_ASSET.garmentFit.chestWrapTop * H, 9)
    expect(ys[0]).toBeCloseTo(top, 9)
    expect(ys[ys.length - 1]).toBeCloseTo(0.25, 9)
    for (let k = 1; k < ys.length; k++) expect(ys[k]).toBeLessThan(ys[k - 1])
    const bust = ys.filter((y) => y >= 0.89 - 1e-9)
    for (let k = 1; k < bust.length; k++) expect(bust[k - 1] - bust[k]).toBeLessThanOrEqual(VILLAGER_ASSET.garmentFit.chestWrapBustStep * H + 1e-9)
  })

  it('clears a point inside the trunk outline radially and lets cloth hang straight down from a bulge', () => {
    const r = py(`
a = np.linspace(-np.pi, np.pi, 72, endpoint=False)
# a 10 cm trunk with a 14 cm bulge band at y 0.9 (a breast)
skin = np.array([[np.sin(t) * rr, y, np.cos(t) * rr] for y in np.arange(0.7, 1.01, 0.01) for t in a
                 for rr in [0.14 if abs(y - 0.9) < 0.015 else 0.10]])
mask = np.ones(len(skin), bool)
pts = np.array([[0, 0.9, 0.12], [0, 0.85, 0.105], [0, 0.85, 0.2]])
plain = G.radial_clear(pts, skin, mask, 0.007)
hung = G.radial_clear(pts, skin, mask, 0.007, drape=0.06)
print(json.dumps({'plain': plain[:, 2].tolist(), 'hung': hung[:, 2].tolist(), 'y': plain[:, 1].tolist()}))`)
    // the hull of a 72-gon of radius 0.14 is just inside 0.14 in front
    expect(r.plain[0]).toBeGreaterThan(0.14)
    expect(r.plain[1]).toBeCloseTo(0.107, 3)
    expect(r.plain[2]).toBeCloseTo(0.2, 9)
    // hung: under the bulge the cloth stays out at the bulge
    expect(r.hung[1]).toBeGreaterThan(0.14)
    expect(r.hung[2]).toBeCloseTo(0.2, 9)
    expect(r.y).toEqual([0.9, 0.85, 0.85])
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

  it('pulls a standing-off edge vertex onto the skin, within reach only', () => {
    const r = py(`
co = np.array([0.0, 1.0, 0.1])
def at(off, inside=False, reach=0.04):
  p = co + np.array([0, 0, off])
  return float(G.hug_point(p, co, abs(off), inside, G.PUSH_CLEARANCE, reach)[2] - co[2])
print(json.dumps({'near': at(0.02), 'far': at(0.05), 'inside': at(0.002, True), 'close': at(0.003)}))`)
    expect(r.near).toBeCloseTo(0.007, 9)
    expect(r.close).toBeCloseTo(0.007, 9)
    // beyond reach and inside the body it stays (push_out clears the inside)
    expect(r.far).toBeCloseTo(0.05, 9)
    expect(r.inside).toBeCloseTo(0.002, 9)
  })

  it("hugs a tube garment's top ring and pins nothing else", () => {
    const r = py(`
out = {}
for form in ('breastCloth', 'skirtShort', 'skirtKnee', 'wrapLong'):
  v = np.array([[0, y, 0.1] for y in (1.0, 1.0, 0.9, 0.8)])
  hug, pin = G.edge_masks(form, v)
  out[form] = [hug.tolist(), pin.tolist()]
v = np.array([[0, 1.0, 0.1]] * 3)
out['robe'] = [m.tolist() for m in G.edge_masks('robe', v)]
print(json.dumps(out))`)
    for (const form of ['breastCloth', 'skirtShort', 'skirtKnee', 'wrapLong']) {
      expect(r[form][0]).toEqual([true, true, false, false])
      expect(r[form][1]).toEqual([true, true, false, false])
    }
    expect(r.robe).toEqual([[false, false, false], [false, false, false]])
  })

  it('pins the girdle cord without hugging it and hugs the flap tops', () => {
    const r = py(`
n = G.girdle_count()
v = np.zeros((n + 4, 3)); v[:, 1] = 0.7
v[n + 2:, 1] = 0.6
hug, pin = G.edge_masks('loinFlap', v, None, 0.7)
print(json.dumps({'cordHug': bool(hug[:n].any()), 'cordPin': bool(pin[:n].all()), 'top': hug[n:].tolist(), 'pin': pin[n:].tolist()}))`)
    expect(r.cordHug).toBe(false)
    expect(r.cordPin).toBe(true)
    expect(r.top).toEqual([true, true, false, false])
    expect(r.pin).toEqual([true, true, false, false])
  })

  it("hugs a sleeve's cap ring alone", () => {
    const r = py(`
v = np.zeros((5, 3))
hug, pin = G.edge_masks('shirt', v, np.array([0, 3, 3, 1, 2]))
print(json.dumps([hug.tolist(), pin.tolist()]))`)
    expect(r[0]).toEqual([false, true, true, false, false])
    expect(r[1]).toEqual(r[0])
  })

  it("takes the clip fit's push off a pinned vertex", () => {
    const r = py(`
push = np.ones((3, 3))
pin = np.array([False, True, False])
out = G.held(push, pin)
print(json.dumps({'out': out.tolist(), 'kept': push.tolist()}))`)
    expect(r.out).toEqual([[1, 1, 1], [0, 0, 0], [1, 1, 1]])
    expect(r.kept[1]).toEqual([1, 1, 1])
  })

  it("builds a flap form's girdle as a flat band on the waist and its front flap across the pelvis front midline", () => {
    const r = py(`
class B:
  W = np.zeros((4, 1))
  arm = np.zeros(4)
  body = {'joints': np.array([[0, 0.9, 0]])}
  def section(self, y, m, slab=0.012):
    # an elliptic waist and hips 30 cm by 20 cm, a 1.5 cm hollow at the small of the back
    a = np.linspace(-np.pi, np.pi, 240, endpoint=False)
    s = 1 - 0.15 * np.exp(-((np.abs(a) - np.pi) / 0.3) ** 2)
    return np.stack([0.15 * s * np.sin(a), 0.10 * s * np.cos(a)], 1)
  ring = G.Body.ring
  ring_star = G.Body.ring_star
H = 1.7
L = {'H': H, 'hip': 0.9, 'knee': 0.5, 'girdle': 0.9 + 0.06 * H, 'fit': FIT}
out = {}
for form in G.FLAPS:
  (v, t, uv), _ = G.build_form(B(), form, 'waist', L)
  n = G.girdle_count()
  cord, flaps = v[:n], v[n:]
  col = cord.reshape(G.N_RADIAL + 1, G.TORUS_TUBE + 1, 3)
  rad = np.hypot(col[..., 0], col[..., 2])
  front = flaps[flaps[:, 2] > 0.02]
  rows = []
  for y in np.unique(np.round(front[:, 1], 6)):
    f = front[np.isclose(front[:, 1], y)]
    mid = f[np.argmin(np.abs(f[:, 0]))]
    edge = f[np.argmax(f[:, 0])]
    rows.append({'y': float(y), 'left': float(f[:, 0].min()), 'right': float(f[:, 0].max()), 'midz': float(mid[2]), 'edgez': float(edge[2])})
  out[form] = {'depth': float((rad.max(1) - rad.min(1)).max()), 'height': float(cord[:, 1].max() - cord[:, 1].min()),
               'back': float(np.hypot(*col[G.N_RADIAL // 2, :, [0, 2]]).mean()),
               'hullBack': float(B().ring(L['girdle'], None, 0.006 * 0.9 / 0.7)[1][G.N_RADIAL // 2]), 'rows': rows}
print(json.dumps(out))`)
    const H = 1.7
    for (const form of ['loinFlap', 'apron', 'girdleTails']) {
      // a band 0.016 H high (its six-sided section: × sin 60°) and a few millimetres deep, never a round cord
      expect(r[form].height).toBeCloseTo(0.016 * H * Math.sin(Math.PI / 3), 6)
      expect(r[form].depth).toBeLessThan(0.008)
      // the band follows the small of the back (the outline 1.5 cm in there) instead of the hull's chord
      expect(r[form].back).toBeLessThan(r[form].hullBack - 0.004)
      const rows = r[form].rows
      expect(rows.length).toBe(8)
      for (const row of rows) {
        // diagnostic (point 1489): every row spans the pelvis front midline with a margin on both
        // sides, symmetric about it, and its side edges wrap back onto the outline (no flat panel)
        expect(row.left).toBeLessThan(-0.1)
        expect(row.right).toBeGreaterThan(0.1)
        expect(Math.abs(row.left + row.right)).toBeLessThan(1e-9)
        expect(row.edgez).toBeLessThan(row.midz - 0.02)
      }
      // at the girdle the flap reaches over the hip bones (the 15 cm half-width)
      const top = rows.reduce((a, b) => (b.y > a.y ? b : a))
      expect(top.right).toBeGreaterThan(0.13)
    }
  })

  it('rides the front flap on both legs alike over the pubic area, the rear flap and cord unchanged', () => {
    const r = py(`
n = 2
# cord (2), front flap above the crotch, front flap at the hem, rear flap
v = np.array([[0.1, 1.0, 0.1], [-0.1, 1.0, -0.1], [0.05, 0.9, 0.1], [0.05, 0.7, 0.1], [0.05, 0.9, -0.1]])
W = np.zeros((len(v), len(SK.NAMES)))
L, R, hips = SK.INDEX['thigh.L'], SK.INDEX['thigh.R'], SK.INDEX['hips']
W[:, L] = 0.6
W[:, hips] = 0.4
out = G.flap_weights(v, W, n, 0.0, 0.85, 0.7, 0.5)
print(json.dumps({'cord': out[:2].tolist() == W[:2].tolist(), 'rear': out[4].tolist() == W[4].tolist(),
  'top': [float(out[2, L]), float(out[2, R]), float(out[2, hips])], 'hem': [float(out[3, L]), float(out[3, R])],
  'sum': float(np.abs(out.sum(1) - 1).max()), 'pairs': int((G.mirror_bones() != np.arange(len(SK.NAMES))).sum())}))`)
    expect(r.cord).toBe(true)
    expect(r.rear).toBe(true)
    expect(r.top[0]).toBeCloseTo(0.3, 9)
    expect(r.top[1]).toBeCloseTo(0.3, 9)
    expect(r.top[2]).toBeCloseTo(0.4, 9)
    // at the hem half the mirror blend: 0.6 → 0.45 / 0.15
    expect(r.hem[0]).toBeCloseTo(0.45, 9)
    expect(r.hem[1]).toBeCloseTo(0.15, 9)
    expect(r.sum).toBeLessThan(1e-9)
    expect(r.pairs).toBeGreaterThan(0)
    expect(r.pairs % 2).toBe(0)
  })

  it('fades the front flap mirror blend out toward its side edges', () => {
    const r = py(`
v = np.array([[0.0, 0.9, 0.1], [0.1, 0.9, 0.06], [0.1, 0.9, 0.0001]])
W = np.zeros((len(v), len(SK.NAMES)))
L, R, hips = SK.INDEX['thigh.L'], SK.INDEX['thigh.R'], SK.INDEX['hips']
W[:, L] = 0.6
W[:, hips] = 0.4
out = G.flap_weights(v, W, 0, 0.0, 0.85, 0.7, 0.5, 0.0, FIT['flapSymmetryCore'], FIT['flapFrontHalfAngleTop'])
print(json.dumps({'mid': float(out[0, R]), 'side': float(out[1, R]), 'edge': float(out[2, R]), 'sum': float(np.abs(out.sum(1) - 1).max())}))`)
    // the middle mirrored fully, the edge (at 90°, beyond flapFrontHalfAngleTop) on its own thigh
    expect(r.mid).toBeCloseTo(0.3, 9)
    expect(r.side).toBeGreaterThan(0)
    expect(r.side).toBeLessThan(0.3)
    expect(r.edge).toBe(0)
    expect(r.sum).toBeLessThan(1e-9)
  })
})
