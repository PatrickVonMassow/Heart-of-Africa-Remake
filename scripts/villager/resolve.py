"""Step 3c: the garments' per-frame baked collision resolution — what keeps
every garment out of the body in every frame the penetration report measures.

Pose-driven corrective shapes (a linear blend of joint-angle shapes, tried
first on this branch) do not get there: a hem pinched between thigh and calf
in a kneel needs an offset no blend of joint angles gives without flaring the
cloth in every other pose (measured 06.10.2026: 8 of 32 garments still over
tolerance after 60 passes). So every pose the report measures (each clip
frame, a gait's at each measured stride, on each body corner) is resolved on
its own: the garment drawn along the game's path (gamepath.py) is pushed out
of the skinned body (inside judged by the winding number for every vertex,
pushed towards its nearest surface point, the push spread to its mesh ring;
a vertex pushed back and forth moved along its shortest way out instead)
and above the ground, and the push is taken back into the hung, baked frame, where the game adds it like a morph target:

    drawn = skin(baked + offset(clip, frame, stride, corner))

THE TABLE is sparse: per pose and body corner, only the vertices it moves.
A person between corners gets the blend of the corners' offsets that equals
a base plus one offset per body morph (`corner_basis`): exact at every
corner. The game interpolates linearly between frames and between the
measured strides (src/render/villagerGarmentBaked.ts).
"""
import multiprocessing as mp
import os

import numpy as np

import gamepath as GP
import rig
from body import top4
from export import EXPORT_CLIPS
from fit import depths, garment_pos
from gltfio import qmat
from sheets import corner_weights, morphed

# the shortest-way-out search: 26 directions round a vertex
_DIRS = np.array([(x, y, z) for x in (-1, 0, 1) for y in (-1, 0, 1) for z in (-1, 0, 1) if (x, y, z) != (0, 0, 0)], float)
_DIRS /= np.linalg.norm(_DIRS, axis=1)[:, None]

# forked workers read the module state
_S = {}


def drawn_garment(person, g, weights, wr, wp, offsets=None):
    """A garment as the game draws it on `person` in a pose: morphed, hung and
    baked, plus the pose's baked `offsets` (vertices × 3), skinned by the hung
    bones."""
    gi, gw = top4(g['W'])
    v = person.bake(garment_pos(g, weights), gi, gw)
    if offsets is not None:
        v = v + offsets
    return person.skin(v, gi, gw, wr, wp)


def _pose(job):
    """One frame's drawn skeleton."""
    ci, (_cname, _f, k, q, hips) = job
    person = _S['people'][ci][2]
    return rig.fk(person.h, GP.stride_pose(person.h, q, hips, k), hips)


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


def _ring(g):
    """A garment's vertex edges (both ways) and each vertex's degree."""
    from fit import neighbours
    nb, _twins = neighbours(len(g['pos']), g['tris'], g['pos'])
    src = np.concatenate([np.full(len(x), i) for i, x in enumerate(nb)]).astype(int)
    dst = np.concatenate(nb).astype(int)
    return src, dst, np.maximum(np.bincount(src, minlength=len(nb)), 1)


def corner_basis(corners):
    """The body morphs the corners span, and the matrix taking per-corner
    values to a base and one per morph (a person's value = base + Σ weight ·
    morph value)."""
    ws = [corner_weights(*c) for c in corners]
    morphs = sorted({m for w in ws for m, x in w.items() if x})
    mu = np.array([[1.0] + [w[m] for m in morphs] for w in ws])
    if mu.shape[0] != mu.shape[1] or abs(np.linalg.det(mu)) < 1e-9:
        raise ValueError(f'baked offsets: corners {corners} do not span their morphs {morphs}')
    return morphs, np.linalg.inv(mu)


def _spread(D, ring, rounds):
    """Each vertex takes half its strongest neighbour's push when that is more
    than its own, `rounds` rings out (fit.spread, vectorised)."""
    src, dst, _deg = ring
    for _ in range(rounds):
        mag = np.linalg.norm(D, axis=1)
        cand = 0.5 * mag[dst]
        best = np.zeros(len(D))
        np.maximum.at(best, src, cand)
        pick = np.full(len(D), -1)
        hit = (cand > 0) & (cand >= best[src])
        pick[src[hit]] = dst[hit]
        up = (best > mag) & (pick >= 0)
        if not up.any():
            break
        D = D.copy()
        D[up] = 0.5 * D[pick[up]]
    return D


def _depth(tree, pts):
    """fit.depths (inside by the winding number, depth = distance to the
    surface) and, per point, its way out: towards its nearest surface point
    (the face normal where it lies on the surface)."""
    d, co, nrm = depths(tree, pts)
    dist = np.abs(d)[:, None]
    out = np.where(dist > 1e-9, (co - pts) / np.maximum(dist, 1e-12), nrm)
    return d, out


def _way_out(tree, p, clear, floor, dirs=_DIRS, reach=0.15):
    """The shortest step out of the body for a point inside (or nearer than
    `clear`): the shortest step along any of `dirs` that lands at least
    `clear` outside and above the ground, searched outward step by step."""
    for s in np.arange(1, int(reach / 0.0025) + 1) * 0.0025:
        cand = p[None, :] + dirs * s
        d, _o = _depth(tree, cand)
        ok = np.nonzero((d <= -clear) & (cand[:, 1] >= floor))[0]
        if len(ok):
            return dirs[ok[0]] * s
    return None


def _sphere(n):
    """`n` directions spread evenly over the sphere (Fibonacci)."""
    i = np.arange(n) + 0.5
    y = 1 - 2 * i / n
    r = np.sqrt(1 - y * y)
    a = np.pi * (3 - np.sqrt(5)) * i
    return np.stack([r * np.cos(a), y, r * np.sin(a)], 1)


_FINE = _sphere(200)


def _resolve(fi):
    """One frame: per garment the moved vertices and their baked offsets."""
    from mathutils.bvhtree import BVHTree
    S = _S
    cfg = S['cfg']['VILLAGER_ASSET']
    tol = cfg['garmentPenetrationTolerance']
    goal, clear = 0.9 * tol, cfg['garmentFitMargin'] * 0.5
    ci = S['frames'][fi][0]
    person, bh, gh = S['people'][ci][2:5]
    wr, wp = S['posed'][fi]
    bv = person.skin(bh, S['jidx'], S['jw'], wr, wp)
    tree = BVHTree.FromPolygons(bv.tolist(), S['body']['tris'].tolist(), all_triangles=True)
    R = np.array([qmat(x) for x in person.drawn(wr)])
    floor = min(0.0, float(bv[:, 1].min()))
    out = {}
    for n in S['names']:
        gi, gw = S['skin'][n]
        w0 = person.skin(gh[n], gi, gw, wr, wp)
        D = np.zeros_like(w0)
        tries = np.zeros(len(w0), int)
        check = np.arange(len(w0))
        for _r in range(S['rounds']):
            pts = w0[check] + D[check]
            d, nrm = _depth(tree, pts)
            under = floor - pts[:, 1]
            bad = (d > goal) | (under > 0)
            if not bad.any():
                break
            push = np.zeros((len(check), 3))
            push[d > goal] = nrm[d > goal] * (d[d > goal] + clear)[:, None]
            push[under > 0, 1] += under[under > 0] + 1e-4
            v = check[bad]
            tries[v] += 1
            for k in np.nonzero(bad)[0]:
                # pushed back and forth: the shortest way out instead
                if tries[check[k]] >= 3:
                    w = _way_out(tree, pts[k], clear, floor)
                    if w is not None:
                        push[k] = w
            Dn = np.zeros_like(D)
            Dn[v] = push[bad]
            Dn = _spread(Dn, S['rings'][n], S['spread'])
            moved = np.nonzero(np.abs(Dn).sum(1) > 0)[0]
            D[moved] += Dn[moved]
            check = moved
        # what the rounds left: each such vertex alone along its shortest way
        # out, judged on the positions the game draws from the stored offsets
        # (float32, skinned again) by the report's own test (penetration.py)
        A = np.einsum('vk,vkij->vij', gw, R[gi])
        Ainv = np.linalg.inv(A)
        for _r in range(6):
            off = np.einsum('vij,vj->vi', Ainv, D).astype(np.float32)
            pts = person.skin(gh[n] + off, gi, gw, wr, wp)
            d, _o = _depth(tree, pts)
            bad = np.nonzero((d > goal) | (pts[:, 1] < floor))[0]
            if not len(bad):
                break
            for v in bad:
                w = _way_out(tree, pts[v], clear, floor, _FINE, 0.3)
                if w is not None:
                    D[v] = pts[v] + w - w0[v]
        off = np.einsum('vij,vj->vi', Ainv, D).astype(np.float32)
        ids = np.nonzero(np.abs(off).sum(1) > 1e-7)[0]
        if len(ids):
            out[n] = (ids.astype(np.int32), off[ids])
    return out


def resolve(body, clips, garments, cfg, corners=None, names=None, workers=None, log=lambda *a: print(*a, flush=True)):
    """Fit every garment's per-pose baked offsets (garments['meshes'][n]
    ['baked']) and return the garments."""
    from penetration import CORNERS
    corners = corners or CORNERS
    workers = workers or max(1, (os.cpu_count() or 2) - 1)
    _setup(body, clips, garments, cfg, corners, names, workers)
    G = garments['meshes']
    _S['rings'] = {n: _ring(G[n]) for n in _S['names']}
    _S['rounds'], _S['spread'] = cfg['VILLAGER_ASSET']['garmentResolveRounds'], cfg['VILLAGER_ASSET']['garmentResolveRings']
    with mp.get_context('fork').Pool(workers) as pool:
        parts = pool.map(_resolve, range(len(_S['frames'])), chunksize=4)
    keys = [(c, f, k) for c, f, k, _q, _h in GP.poses(clips, EXPORT_CLIPS, cfg)]
    P, C = len(keys), len(corners)
    morphs, inv = corner_basis(corners)
    total = 0
    empty = (np.zeros(0, np.int32), np.zeros((0, 3), np.float32))
    for n in _S['names']:
        ids_p, off_p = [], []
        for p in range(P):
            got = [parts[ci * P + p].get(n, empty) for ci in range(C)]
            ids_p.append([g[0] for g in got])
            off_p.append([g[1] for g in got])
            total += sum(len(g[0]) for g in got)
        G[n]['baked'] = {'keys': keys, 'ids': ids_p, 'off': off_p, 'morphs': morphs, 'basis': inv, 'corners': list(corners)}
    log(f'resolve: {total} baked vertex offsets over {P} poses, {C} corners and {len(_S["names"])} garments '
        f'(≈ {total * 8 / 2**20:.1f} MiB at a 16-bit index and three 16-bit floats each)')
    return garments


def check_table(garments, clips, cfg):
    """Fail loud when a garment's baked table does not belong to these clips
    and body corners: its pose keys must be exactly the poses measured now
    (clip, frame, stride, in order) and its corners the report's. Returns
    the key → pose index map."""
    from penetration import CORNERS
    want = [(c, f, k) for c, f, k, _q, _h in GP.poses(clips, EXPORT_CLIPS, cfg)]
    for n, g in garments['meshes'].items():
        b = g.get('baked') if n.startswith('g-') else None
        if b is None:
            continue
        if list(b['keys']) != want:
            raise ValueError(f'baked offsets of {n}: {len(b["keys"])} pose keys do not match the {len(want)} poses of the current clips (rebuild step resolve)')
        if list(b.get('corners', ())) != list(CORNERS):
            raise ValueError(f'baked offsets of {n}: corners {b.get("corners")} are not the report\'s {CORNERS} (rebuild step resolve)')
    return {key: i for i, key in enumerate(want)}


def corner_blend(b, weights):
    """Each corner's share in a person with body morph `weights`: the base
    and per-morph offsets the corners span (`corner_basis`), summed with
    the person's weights, are this blend of the corners' own offsets."""
    u = np.r_[1.0, [weights.get(m, 0.0) for m in b['morphs']]]
    return u @ b['basis']


def person_offsets(g, weights, p):
    """A garment's baked offsets for pose index `p` on a person with body
    morph `weights`: (vertex ids, offsets), or None."""
    b = g.get('baked')
    if b is None or not any(len(x) for x in b['ids'][p]):
        return None
    beta = corner_blend(b, weights)
    ids = np.concatenate(b['ids'][p])
    off = np.concatenate([w * o for w, o in zip(beta, b['off'][p])])
    u, inv = np.unique(ids, return_inverse=True)
    out = np.zeros((len(u), 3))
    np.add.at(out, inv, off)
    return u, out


def offsets_at(g, weights, clip, cname, t, stride=1.0, used=None):
    """The baked offsets (vertices × 3, dense) at clip time `t` and stride
    `stride`, interpolated between the frames round it and the measured
    strides round it as the game does (villagerGarmentBaked.ts)."""
    out = np.zeros((len(g['pos']), 3))
    b = g.get('baked')
    if b is None:
        return out
    times = clip['times']
    n = len(times)
    d = clip['duration']
    t = t % d if clip.get('kind') in ('gait', 'loop') else min(max(t, 0), d)
    step = (times[-1] - times[0]) / (n - 1)
    k = min(n - 2, max(0, int(np.floor((t - times[0]) / max(1e-9, step)))))
    f = min(1.0, max(0.0, (t - times[k]) / max(1e-9, times[k + 1] - times[k])))
    ks = sorted({kk for c, _f, kk in b['keys'] if c == cname})
    s0, gs = 0, 0.0
    if len(ks) > 1:
        x = min(ks[-1], max(ks[0], stride))
        while s0 < len(ks) - 2 and x > ks[s0 + 1]:
            s0 += 1
        gs = (x - ks[s0]) / (ks[s0 + 1] - ks[s0])
    at = {key: i for i, key in enumerate(b['keys'])}
    for fr, wf in ((k, 1 - f), (min(n - 1, k + 1), f)):
        for si, ws in ((s0, 1 - gs), (s0 + 1, gs)):
            w = wf * ws
            if not w or si >= len(ks):
                continue
            if used is not None:
                used.add(at[(cname, fr, ks[si])])
            r = person_offsets(g, weights, at[(cname, fr, ks[si])])
            if r is not None:
                out[r[0]] += w * r[1]
    return out


CHECK_GARMENT = 'g-skirtKnee-waist'
CHECK_CLIPS = ('kneel', 'walk')
CHECK_SAMPLES = (('kneel', 0.37, 1.0), ('kneel', 1.1, 1.0), ('walk', 0.21, 0.9), ('walk', 0.53, 1.35), ('walk', 0.4, 1.6))


def baked_check(out, clips, garments):
    """One garment's table for a few clips and its offsets at a few clip
    times, strides and body corners, for the game's own evaluation to be
    checked against (villagerGarmentBaked.test.ts)."""
    import json
    g = garments['meshes'].get(CHECK_GARMENT)
    if g is None or g.get('baked') is None:
        return
    b = g['baked']
    used = set()
    for cname, t, k in CHECK_SAMPLES:
        offsets_at(g, {}, clips['clips'][cname], cname, t, k, used)
    # only the poses the samples read (the rest left empty, so the file stays small)
    table = {'morphs': b['morphs'], 'basis': np.round(b['basis'], 9).tolist(), 'clips': {}}
    C = len(b['basis'])
    people = (('male', 'adult'), ('female', 'child'))
    keep = {c for sa in people for c in np.nonzero(np.abs(corner_blend(b, corner_weights(*sa))) > 1e-9)[0]}
    pick = lambda xs, f: [f(x) if c in keep else [] for c, x in enumerate(xs)]  # noqa: E731
    for cname in CHECK_CLIPS:
        idx = [i for i, (c, _f, _k) in enumerate(b['keys']) if c == cname]
        table['clips'][cname] = {'strides': sorted({b['keys'][i][2] for i in idx}),
                                 'ids': [pick(b['ids'][i], lambda x: x.tolist()) if i in used else [[]] * C for i in idx],
                                 'off': [pick(b['off'][i], lambda x: np.round(x, 6).ravel().tolist()) if i in used else [[]] * C for i in idx]}
    moved = np.unique(np.concatenate([x for i in sorted(used) for c, x in enumerate(b['ids'][i]) if c in keep] or [np.zeros(0, int)]))
    verts = moved[np.linspace(0, len(moved) - 1, min(12, len(moved))).astype(int)].tolist() if len(moved) else []
    samples = []
    for sex, age in people:
        w = corner_weights(sex, age)
        for cname, t, k in CHECK_SAMPLES:
            o = offsets_at(g, w, clips['clips'][cname], cname, t, k)
            samples.append({'sex': sex, 'age': age, 'clip': cname, 't': t, 'stride': k, 'vertices': verts,
                            'offsets': np.round(o[verts], 6).tolist()})
    times = {c: {'kind': clips['clips'][c].get('kind', 'once'), 'duration': float(clips['clips'][c]['duration']),
                 'times': [float(x) for x in clips['clips'][c]['times']]} for c in CHECK_CLIPS}
    json.dump({'garment': CHECK_GARMENT, 'vertices': len(g['pos']), 'table': table, 'times': times, 'samples': samples},
              open(os.path.join(out, 'garment-baked-check.json'), 'w'))
