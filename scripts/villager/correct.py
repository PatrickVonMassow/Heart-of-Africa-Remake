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

THE FIT is a projection per vertex (on linear inequalities, relinearised every pass):
in each frame where a vertex comes closer to the skinned body than
`garmentFitMargin`, or lies inside it, the shapes move by the least change
that clears it — the push taken into the baked frame through the transpose of
the vertex's bone blend, shared out over the drivers in proportion to their
values. Each pass takes, per vertex, the projection onto the constraint it
violates most (Kaczmarz's maximal-residual rule). The passes run on freely
(a veto on any pass that deepened a vertex stalled the fit, measured
06.10.2026); each vertex keeps the shapes of the pass its worst depth over
ALL frames was least in, so no vertex ends deeper than it began.
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


def drawn_garment(person, g, weights, wr, wp, cfg):
    """A garment as the game draws it on `person` in a pose: morphed, hung and
    baked, its corrective shapes weighted by the pose's drivers, skinned by the
    hung bones."""
    gi, gw = top4(g['W'])
    v = person.bake(garment_pos(g, weights), gi, gw)
    if g.get('shapes') is not None:
        v = v + np.einsum('k,kvi->vi', drivers(person, wr, cfg), g['shapes'])
    return person.skin(v, gi, gw, wr, wp)


# ---- the per-frame work (forked workers read the module state) ---------------------

_S = {}


def _setup(body, clips, garments, cfg, corners, only=None):
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


def _frame(ci, pose, active, propose):
    """Depth of each active garment vertex in one frame and, with `propose`,
    its projection onto its constraint. `active` {name: (vertex ids, their
    shapes)}."""
    from mathutils.bvhtree import BVHTree
    S = _S
    c, j, person, bh, gh = S['people'][ci]
    cname, f, k, q, hips = pose
    wr, wp = rig.fk(j, GP.stride_pose(person.h, q, hips, k), hips)
    a = drivers(person, wr, S['cfg'])
    bv = person.skin(bh, S['jidx'], S['jw'], wr, wp)
    tree = BVHTree.FromPolygons(bv.tolist(), S['body']['tris'].tolist(), all_triangles=True)
    R = np.array([qmat(x) for x in person.drawn(wr)])
    margin = S['cfg']['VILLAGER_ASSET']['garmentFitMargin']
    step = S['cfg']['VILLAGER_ASSET']['garmentCorrectStep']
    out = {}
    for n, (ids, X) in active.items():
        if not len(ids):
            continue
        gi, gw = S['skin'][n][0][ids], S['skin'][n][1][ids]
        gv = person.skin(gh[n][ids] + np.einsum('k,kvi->vi', a, X), gi, gw, wr, wp)
        d, _co, nrm = depths(tree, gv, -margin)
        prop = None
        if propose:
            bad = np.nonzero(d > -margin)[0]
            if len(bad):
                A = np.einsum('vk,vkij->vij', gw[bad], R[gi[bad]])
                u = np.einsum('vji,vj->vi', A, nrm[bad])
                need = np.minimum(d[bad] + margin, step)
                s = need / (np.maximum(np.einsum('vi,vi->v', u, u), 0.25) * (a @ a))
                prop = (bad, need, np.einsum('k,vi->kvi', a, u * s[:, None]))
        out[n] = (d, prop)
    return out


def _chunk(args):
    lo, hi, active, propose = args
    deep = {n: np.full(len(ids), -np.inf) for n, (ids, _X) in active.items()}
    acc = {n: np.zeros_like(X) for n, (_ids, X) in active.items()}
    most = {n: np.zeros(len(ids)) for n, (ids, _X) in active.items()}
    for ci, pose in _S['frames'][lo:hi]:
        for n, (d, prop) in _frame(ci, pose, active, propose).items():
            np.maximum(deep[n], d, out=deep[n])
            if prop is not None:
                bad, need, dx = prop
                take = need > most[n][bad]
                acc[n][:, bad[take]] = dx[:, take]
                most[n][bad[take]] = need[take]
    return deep, acc, most


def sweep(active, propose, workers):
    """Every frame once, in parallel, for the active vertices: per garment
    each one's worst depth and (with `propose`) its projection onto the
    constraint it violates most (zero where it violates none)."""
    nf = len(_S['frames'])
    bounds = np.linspace(0, nf, workers * 2 + 1).astype(int)
    jobs = [(int(lo), int(hi), active, propose) for lo, hi in zip(bounds[:-1], bounds[1:]) if hi > lo]
    with mp.get_context('fork').Pool(workers) as pool:
        parts = pool.map(_chunk, jobs)
    deep = {n: np.max([p[0][n] for p in parts], axis=0) for n in active}
    prop = {}
    for n, (ids, X) in active.items():
        pick = np.argmax([p[2][n] for p in parts], axis=0)
        prop[n] = np.stack([parts[pick[v]][1][n][:, v] for v in range(len(ids))], axis=1) if len(ids) else X.copy()
    return deep, prop


def correct(body, clips, garments, cfg, passes=None, corners=None, names=None, workers=None, log=lambda *a: print(*a, flush=True)):
    """Fit the corrective shapes of every garment (garments['meshes'][n]
    ['shapes'], drivers × vertices × 3) and return the garments."""
    from penetration import CORNERS
    tol = cfg['VILLAGER_ASSET']['garmentPenetrationTolerance']
    passes = cfg['VILLAGER_ASSET']['garmentCorrectPasses'] if passes is None else passes
    workers = workers or max(1, (os.cpu_count() or 2) - 1)
    _setup(body, clips, garments, cfg, corners or CORNERS, names)
    K = len(driver_names(cfg))
    G = garments['meshes']
    shapes = {n: np.zeros((K, len(G[n]['pos']), 3)) for n in (names or _S['names'])}
    best = {n: (np.full(len(G[n]['pos']), np.inf), shapes[n].copy()) for n in shapes}
    # A vertex whose shapes did not move keeps every frame's depth, so a pass
    # measures only the vertices the previous pass moved.
    live = {n: np.arange(len(G[n]['pos'])) for n in shapes}
    for it in range(passes + 1):
        deep, prop = sweep({n: (live[n], shapes[n][:, live[n]]) for n in shapes}, it < passes, workers)
        for n in shapes:
            ids = live[n]
            better = deep[n] < best[n][0][ids]
            best[n][0][ids[better]] = deep[n][better]
            best[n][1][:, ids[better]] = shapes[n][:, ids[better]]
            if it < passes:
                moved = np.abs(prop[n]).sum(axis=(0, 2)) > 0
                shapes[n][:, ids] += prop[n]
                live[n] = ids[moved]
        over = {n: float(best[n][0].max()) for n in shapes}
        log(f'correct pass {it + 1}: {sum(len(v) for v in live.values())} vertices live, deepest {max(over.values()):.4f}, {sum(v > tol for v in over.values())} garments over {tol}; '
            + ', '.join(f'{n[2:]} {over[n]:.3f}/{int((best[n][0] > tol).sum())}v' for n in shapes if over[n] > tol))
        if all(v <= tol for v in over.values()) or not any(len(v) for v in live.values()):
            break
    for n in shapes:
        G[n]['shapes'] = best[n][1]
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
