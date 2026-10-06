"""Step 3c: pose-driven garment correction — corrective shapes on each garment,
weighted by the pose's joint angles, fitted until no garment vertex lies
inside the skinned body in any frame the penetration report measures.

THE DRIVERS (evaluated alike in the game, src/render/villagerGarmentDrivers.ts):
for each bone of VILLAGER_ASSET.garmentDriverBones, its DRAWN local rotation
(the hung skeleton's: W · hang⁻¹, the parent's taken out) turns the bone's hung
rest axis (down for a limb, up for the trunk and head); the turned axis's
x and z components, split into their positive and negative parts, are four
drivers in [0, 1] — 0 at the hung rest, 1 with the bone swung a right angle
that way. A constant driver 1 carries the shape every pose takes.

THE SHAPES live in the hung, baked garment's frame (what the game skins, the
frame three's morph targets act in): corrected = baked + Σ driver_k · shape_k.
Like the garment itself they follow the person's body morphs: a person's
shapes are `shapes` + Σ_m weight_m · `shape_morphs[m]` (`person_shapes`),
so each body corner the report measures has shapes of its own (one set for
all corners plateaued at a few vertices per garment, measured 06.10.2026;
the same fit per corner converged).

THE FIT, per body corner and garment vertex, on linear inequalities
relinearised every pass: in each frame where a vertex comes closer to the
skinned body than `garmentFitMargin`, or lies inside it, its shapes X (drivers
× 3) must lift it clear: u · (aᵀX) ≥ the depth to clear, u the body's normal
taken into the baked frame through the transpose of the vertex's bone blend,
a the frame's drivers. Each pass adds the `garmentCorrectFrames` frames a
vertex violates most to its constraints and solves for the least shapes that
meet them all, each entry bounded by `garmentCorrectCap` (Hildreth's dual
coordinate ascent; the bound keeps a vertex whose constraints contradict each
other from running away). Each vertex keeps the shapes of the pass its worst
depth over all frames was least in, so none ends deeper than it began.
"""
import multiprocessing as mp
import os

import numpy as np

import gamepath as GP
import rig
import skeleton as SK
from body import top4
from export import EXPORT_CLIPS
from fit import depths, garment_pos
from gltfio import qinv, qmat, qmul
from sheets import corner_weights, morphed

UP = np.array([0.0, 1.0, 0.0])
DOWN = np.array([0.0, -1.0, 0.0])


def driver_names(cfg):
    out = ['always']
    for b, _axis in cfg['VILLAGER_ASSET']['garmentDriverBones']:
        out += [f'{b}+x', f'{b}-x', f'{b}+z', f'{b}-z']
    return out


def drivers(person, wr, cfg):
    """The driver values of a pose (A-pose world turns `wr`) on `person`."""
    drawn = person.drawn(wr)
    out = [1.0]
    for b, axis in cfg['VILLAGER_ASSET']['garmentDriverBones']:
        i = SK.INDEX[b]
        p = rig.PARENT_IDX[i]
        q = drawn[i] if p < 0 else qmul(qinv(drawn[p]), drawn[i])
        u = qmat(q) @ (UP if axis == 'up' else DOWN)
        out += [max(0.0, u[0]), max(0.0, -u[0]), max(0.0, u[2]), max(0.0, -u[2])]
    return np.array(out)


def person_shapes(g, weights):
    """A garment's corrective shapes on a person with body morph `weights`
    (drivers × vertices × 3), or None for a garment without."""
    if g.get('shapes') is None:
        return None
    out = g['shapes'].copy()
    for m, w in weights.items():
        if w and m in g['shape_morphs']:
            out += w * g['shape_morphs'][m]
    return out


def drawn_garment(person, g, weights, wr, wp, cfg):
    """A garment as the game draws it on `person` in a pose: morphed, hung and
    baked, its corrective shapes weighted by the pose's drivers, skinned by the
    hung bones."""
    gi, gw = top4(g['W'])
    v = person.bake(garment_pos(g, weights), gi, gw)
    sh = person_shapes(g, weights)
    if sh is not None:
        v = v + np.einsum('k,kvi->vi', drivers(person, wr, cfg), sh)
    return person.skin(v, gi, gw, wr, wp)


# ---- the per-frame work (forked workers read the module state) ---------------------

_S = {}


def _pose(job):
    """One frame's drawn skeleton and drivers."""
    ci, (_cname, _f, k, q, hips) = job
    person = _S['people'][ci][2]
    wr, wp = rig.fk(person.h, GP.stride_pose(person.h, q, hips, k), hips)
    return wr, wp, drivers(person, wr, _S['cfg'])


def _setup(body, clips, garments, cfg, corners, only, workers):
    jidx, jw = top4(body['W'])
    names = only or [n for n in garments['meshes'] if n.startswith('g-')]
    skin = {n: top4(garments['meshes'][n]['W']) for n in names}
    people = []
    for c in corners:
        w = corner_weights(*c)
        pos, j = morphed(body, w)
        person = GP.Person(j)
        people.append((c, j, person, person.bake(pos, jidx, jw), {n: person.bake(garment_pos(garments['meshes'][n], w), *skin[n]) for n in names}))
    frames = [(ci, pose) for ci in range(len(people)) for pose in GP.poses(clips, EXPORT_CLIPS, cfg)]
    _S.update(body=body, cfg=cfg, jidx=jidx, jw=jw, names=names, skin=skin, people=people, frames=frames)
    with mp.get_context('fork').Pool(workers) as pool:
        _S['posed'] = pool.map(_pose, frames, chunksize=16)
    _S['drv'] = np.array([p[2] for p in _S['posed']])


def _frame(fi, active):
    """Depth of each active garment vertex in frame `fi` and, where it comes
    closer to the body than the margin, its constraint: (local ids, depth to
    clear, baked-frame normal u). `active` {name: (vertex ids, shapes
    corners × ids × drivers × 3)}."""
    from mathutils.bvhtree import BVHTree
    S = _S
    ci = S['frames'][fi][0]
    person, bh, gh = S['people'][ci][2:5]
    wr, wp, a = S['posed'][fi]
    bv = person.skin(bh, S['jidx'], S['jw'], wr, wp)
    tree = BVHTree.FromPolygons(bv.tolist(), S['body']['tris'].tolist(), all_triangles=True)
    R = np.array([qmat(x) for x in person.drawn(wr)])
    margin = S['cfg']['VILLAGER_ASSET']['garmentFitMargin']
    out = {}
    for n, (ids, X) in active.items():
        if not len(ids):
            continue
        gi, gw = S['skin'][n][0][ids], S['skin'][n][1][ids]
        gv = person.skin(gh[n][ids] + np.einsum('k,vki->vi', a, X[ci]), gi, gw, wr, wp)
        d, _co, nrm = depths(tree, gv, -margin)
        bad = np.nonzero(d > -margin)[0]
        A = np.einsum('vk,vkij->vij', gw[bad], R[gi[bad]])
        out[n] = (d, bad, d[bad] + margin, np.einsum('vji,vj->vi', A, nrm[bad]))
    return out


def _keep(v, need, k):
    """Indices of the `k` largest `need` per unit `v`."""
    o = np.lexsort((-need, v))
    v = v[o]
    first = np.r_[0, np.nonzero(np.diff(v))[0] + 1]
    rank = np.arange(len(v)) - np.repeat(first, np.diff(np.r_[first, len(v)]))
    return o[rank < k]


def _chunk(args):
    """Frames lo..hi: per garment the worst depth of each (corner, local id)
    and the `k` constraints each violates most."""
    lo, hi, active, k = args
    C = len(_S['people'])
    deep = {n: np.full((C, len(ids)), -np.inf) for n, (ids, _X) in active.items()}
    rows = {n: [] for n in active}
    for fi in range(lo, hi):
        ci = _S['frames'][fi][0]
        for n, (d, bad, need, u) in _frame(fi, active).items():
            np.maximum(deep[n][ci], d, out=deep[n][ci])
            if len(bad):
                rows[n].append((ci * len(active[n][0]) + bad, np.full(len(bad), fi), need, u))
    cons = {}
    for n, r in rows.items():
        if r:
            v, f, need, u = (np.concatenate(x) for x in zip(*r))
            keep = _keep(v, need, k)
            cons[n] = (v[keep], f[keep], need[keep], u[keep])
    return deep, cons


def sweep(active, workers, k):
    """Every frame once, in parallel, for the active vertices."""
    nf = len(_S['frames'])
    bounds = np.linspace(0, nf, workers * 3 + 1).astype(int)
    jobs = [(int(lo), int(hi), active, k) for lo, hi in zip(bounds[:-1], bounds[1:]) if hi > lo]
    with mp.get_context('fork').Pool(workers) as pool:
        parts = pool.map(_chunk, jobs)
    deep = {n: np.max([p[0][n] for p in parts], axis=0) for n in active}
    cons = {}
    for n in active:
        r = [p[1][n] for p in parts if n in p[1]]
        if r:
            v, f, need, u = (np.concatenate(x) for x in zip(*r))
            keep = _keep(v, need, k)
            cons[n] = (v[keep], f[keep], need[keep], u[keep])
    return deep, cons


class Constraints:
    """One garment's linear constraints, gathered over the passes, on the
    shapes X_v (drivers × 3) of each unit v (a vertex on one body corner):
    frame f clears it when u · (a_fᵀ X_v) ≥ b. A frame met again replaces its
    older linearisation."""

    def __init__(self):
        self.v = np.zeros(0, int)
        self.f = np.zeros(0, int)
        self.u = np.zeros((0, 3))
        self.b = np.zeros(0)
        self.lam = np.zeros(0)

    def add(self, v, f, u, b):
        old = set(zip(v.tolist(), f.tolist()))
        stay = np.array([(x, y) not in old for x, y in zip(self.v.tolist(), self.f.tolist())], bool)
        self.v = np.r_[self.v[stay], v]
        self.f = np.r_[self.f[stay], f]
        self.u = np.r_[self.u[stay], u]
        self.b = np.r_[self.b[stay], b]
        self.lam = np.r_[self.lam[stay], np.zeros(len(v))]

    def solve(self, X, drv, cap, sweeps=400, eps=1e-6):
        """The least shapes (min Σ|X_v|², every entry within ±cap) meeting
        every constraint: Hildreth's dual coordinate ascent with the bounds
        kept implicit (X = clip(Σ λ g)), all units at once, warm-started from
        the last pass's multipliers. Writes X (units × drivers × 3) and
        returns the worst residual and the sweeps taken."""
        if not len(self.v):
            return 0.0, 0
        o = np.argsort(self.v, kind='stable')
        for name in ('v', 'f', 'u', 'b', 'lam'):
            setattr(self, name, getattr(self, name)[o])
        units, first, count = np.unique(self.v, return_index=True, return_counts=True)
        slot = np.arange(len(self.v)) - np.repeat(first, count)
        idx = np.full((len(units), int(count.max())), -1)
        idx[np.searchsorted(units, self.v), slot] = np.arange(len(self.v))
        G = np.einsum('ck,ci->cki', drv[self.f], self.u)
        nn = np.einsum('cki,cki->c', G, G)
        y = np.zeros((len(units),) + G.shape[1:])
        np.add.at(y, np.searchsorted(units, self.v), self.lam[:, None, None] * G)
        for sweep_ in range(sweeps):
            worst = 0.0
            for j in range(idx.shape[1]):
                on = np.nonzero(idx[:, j] >= 0)[0]
                c = idx[on, j]
                g = G[c]
                r = self.b[c] - np.einsum('cki,cki->c', g, np.clip(y[on], -cap, cap))
                worst = max(worst, float(r.max()))
                lam = np.maximum(0.0, self.lam[c] + r / nn[c])
                y[on] += (lam - self.lam[c])[:, None, None] * g
                self.lam[c] = lam
            if worst < eps:
                break
        X[units] = np.clip(y, -cap, cap)
        return worst, sweep_ + 1


def corner_basis(corners):
    """The body morphs the corners span, and the matrix taking per-corner
    shapes to base + per-morph shapes (`person_shapes` inverted)."""
    ws = [corner_weights(*c) for c in corners]
    morphs = sorted({m for w in ws for m, x in w.items() if x})
    mu = np.array([[1.0] + [w[m] for m in morphs] for w in ws])
    if mu.shape[0] != mu.shape[1] or abs(np.linalg.det(mu)) < 1e-9:
        raise ValueError(f'corrective shapes: corners {corners} do not span their morphs {morphs}')
    return morphs, np.linalg.inv(mu)


def correct(body, clips, garments, cfg, passes=None, corners=None, names=None, workers=None, log=lambda *a: print(*a, flush=True)):
    """Fit the corrective shapes of every garment (garments['meshes'][n]
    ['shapes'] and ['shape_morphs'], drivers × vertices × 3) and return the
    garments."""
    from penetration import CORNERS
    A = cfg['VILLAGER_ASSET']
    tol, cap = A['garmentPenetrationTolerance'], A['garmentCorrectCap']
    passes = A['garmentCorrectPasses'] if passes is None else passes
    workers = workers or max(1, (os.cpu_count() or 2) - 1)
    corners = corners or CORNERS
    _setup(body, clips, garments, cfg, corners, names, workers)
    drv = _S['drv']
    C, K = len(corners), drv.shape[1]
    G = garments['meshes']
    V = {n: len(G[n]['pos']) for n in _S['names']}
    shapes = {n: np.zeros((C * V[n], K, 3)) for n in V}
    best = {n: (np.full(C * V[n], np.inf), shapes[n].copy()) for n in V}
    cons = {n: Constraints() for n in V}
    live = {n: np.arange(V[n]) for n in V}
    for it in range(passes + 1):
        active = {n: (live[n], shapes[n].reshape(C, V[n], K, 3)[:, live[n]]) for n in V}
        deep, new = sweep(active, workers, A['garmentCorrectFrames'])
        for n in V:
            units = (np.arange(C)[:, None] * V[n] + live[n][None, :]).ravel()
            d = deep[n].ravel()
            better = d < best[n][0][units]
            best[n][0][units[better]] = d[better]
            best[n][1][units[better]] = shapes[n][units[better]]
        over = {n: float(best[n][0].max()) for n in V}
        log(f'correct pass {it + 1}: {sum(len(v) for v in live.values())} vertices measured, deepest {max(over.values()):.4f}, '
            f'{sum(v > tol for v in over.values())} garments over {tol}; '
            + ', '.join(f'{n[2:]} {over[n]:.3f}/{int((best[n][0] > tol).sum())}' for n in V if over[n] > tol))
        if it == passes or all(v <= tol for v in over.values()):
            break
        for n in V:
            if n not in new:
                live[n] = live[n][:0]
                continue
            lu, f, need, u = new[n]
            ci, lv = np.divmod(lu, len(live[n]))
            unit = ci * V[n] + live[n][lv]
            now = np.einsum('ck,cki,ci->c', drv[f], shapes[n][unit], u)
            cons[n].add(unit, f, u, now + need)
            res, sw = cons[n].solve(shapes[n], drv, cap)
            if res > 1e-4:
                log(f'  {n[2:]}: {len(cons[n].v)} constraints, residual {res:.4f} after {sw} sweeps')
            live[n] = np.unique(cons[n].v % V[n])
    morphs, inv = corner_basis(corners)
    for n in V:
        per = best[n][1].reshape(C, V[n], K, 3).transpose(0, 2, 1, 3)
        basis = np.einsum('mc,ckvi->mkvi', inv, per)
        G[n]['shapes'] = basis[0]
        G[n]['shape_morphs'] = {m: basis[1 + i] for i, m in enumerate(morphs)}
    garments['drivers'] = driver_names(cfg)
    return garments


CHECK_POSES = (('kneelDown', 0), ('kneelDown', 11), ('kneelDown', 22), ('dig', 20), ('dig', 44), ('walk', 5), ('carry', 10), ('kneelUp', 8))


def driver_check(out, body, clips, cfg):
    """The drivers of a few clip frames on the adult man, for the game's own
    evaluation to be checked against (villagerGarmentDrivers.test.ts)."""
    import json
    pos, j = morphed(body, corner_weights('male', 'adult'))
    person = GP.Person(j)
    rows = []
    for cname, f in CHECK_POSES:
        c = clips['clips'][cname]
        wr, _wp = rig.fk(j, c['q'][f], c['hips'][f])
        rows.append({'clip': cname, 'frame': f, 'drivers': [round(float(x), 6) for x in drivers(person, wr, cfg)]})
    json.dump({'names': driver_names(cfg), 'poses': rows}, open(os.path.join(out, 'garment-drivers-check.json'), 'w'), indent=1)
