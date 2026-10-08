"""Step 3b: fit the dress to the motion — the garments, built round the body
in one design pose (garments.py), are posed through the exported clips at
every body corner (the frames, corners and skinning the penetration report
measures), and wherever a garment vertex comes closer to the skinned body
than `garmentFitMargin` — or lies inside it — the push that would clear it is
taken back into the rest pose through the transpose of that vertex's bone
blend, at most `garmentFitStep` per pass. Per vertex the largest push over
the frames is kept, spread a little onto its neighbours (no spike in the
cloth), and added to the rest position; the morphs keep their deltas, so
every corner moves with it. The proposals come from every second frame, but
each state is measured over ALL frames the report measures: a candidate
deeper than the garment's best is undone and the garment stops, so the fit
never deepens a garment's worst penetration (`selftest`).

Measured 06.10.2026: this lowers most garments' deepest point but cannot
reach the tolerance. A static rest offset cannot follow a pose — a skirt's
front stays where a lifted knee needs it gone, and cloth caught between two
body parts (between the legs, under the arm) is pushed from one into the
other — so the passes oscillate instead of converging.
What the fit leaves is not corrected per pose: the body and inner garments a
garment covers are hidden or pushed in under it (mask.py), and the report
measures what the game draws.
"""
import numpy as np

from body import top4
from export import EXPORT_CLIPS
from sheets import corner_weights, morphed


def garment_pos(g, weights):
    p = g['pos'].copy()
    for m, w in weights.items():
        if w:
            p += w * g['morph_pos'][m]
    return p


def nearest(tree, pts):
    """Nearest surface point and its normal for every point."""
    co = np.empty_like(pts)
    nrm = np.empty_like(pts)
    for k, p in enumerate(pts.tolist()):
        c, n, _i, _d = tree.find_nearest(p)
        co[k] = c
        nrm[k] = n
    return co, nrm


# Rays the inside test casts (unit vectors, none along an axis the body is
# built round, so no ray runs along a seam of the mesh).
RAYS = ((0.0, 1.0, 0.0), (0.57735, -0.57735, 0.57735), (-0.6, 0.0, -0.8))


def winding(tree, p, d, hits=64):
    """The body's winding number round `p` along one ray: +1 for every face
    the ray leaves the body through, −1 for every face it enters by. The
    posed body is closed but crosses itself (a hand pressed into the thigh),
    so parity would call a point inside two shells outside; the signed count
    does not."""
    from mathutils import Vector
    o, d = Vector(p), Vector(d)
    w = 0
    for _ in range(hits):
        hit, n, _i, _d = tree.ray_cast(o, d)
        if hit is None:
            break
        w += 1 if n.dot(d) > 0 else -1
        o = hit + d * 1e-6
    return w


def inside(tree, p):
    """Inside the body by the winding number on two of three rays (the third
    cast only when the first two disagree). The sign of the nearest face's
    normal alone is no inside test: near a toe tip, a finger or the crotch it
    calls points outside the body inside (measured 06.10.2026: up to 0.19
    deep on points no ray found inside), and on a crease or where two body
    parts cross it calls points inside the body outside."""
    a = winding(tree, p, RAYS[0]) > 0
    if a == (winding(tree, p, RAYS[1]) > 0):
        return a
    return winding(tree, p, RAYS[2]) > 0


def depths(tree, pts):
    """Signed depth of every point inside the body (negative: outside): its
    distance to the body's surface, inside or outside decided for EVERY point
    by the winding number (`inside`) — never by the nearest face's normal,
    which a crease or two crossing body parts flip. Also returns the nearest
    surface points and their face normals."""
    co, nrm = nearest(tree, pts)
    dist = np.linalg.norm(pts - co, axis=1)
    ins = np.fromiter((inside(tree, p) for p in pts.tolist()), bool, len(pts))
    return np.where(ins, dist, -dist), co, nrm


def neighbours(n, tris, verts):
    """Each vertex's ring, vertices on the same spot (a uv seam) counted as one."""
    nb = [set() for _ in range(n)]
    for a, b, c in tris:
        nb[a].update((b, c))
        nb[b].update((a, c))
        nb[c].update((a, b))
    key = {}
    for i, p in enumerate(np.round(verts, 6)):
        key.setdefault(tuple(p), []).append(i)
    for group in key.values():
        if len(group) > 1:
            u = set().union(*(nb[i] for i in group))
            for i in group:
                nb[i] = u | set(group)
    for i in range(n):
        nb[i].discard(i)
    return [np.array(sorted(s), int) for s in nb], [g for g in key.values() if len(g) > 1]


def spread(D, nb, twins, rounds=2):
    """Every vertex keeps at least its own push; its neighbours take part of it."""
    out = D.copy()
    for _ in range(rounds):
        mag = np.linalg.norm(out, axis=1)
        nxt = out.copy()
        for i in range(len(out)):
            if len(nb[i]) == 0:
                continue
            m = mag[nb[i]]
            k = nb[i][np.argmax(m)]
            cand = 0.5 * out[k]
            if np.linalg.norm(cand) > mag[i]:
                nxt[i] = cand
        out = nxt
    for g in twins:
        out[g] = out[g][np.argmax(np.linalg.norm(out[g], axis=1))]
    return out


def corners():
    from penetration import CORNERS
    return CORNERS


_D = {}


def _reduce(ks):
    """One pass's deepest values and largest pushes over the frames `ks`
    (indices), the pass's arguments read from _D (set before a fork)."""
    state, frames, sample, it, passes, stride, done = (_D[k] for k in ('state', 'frames', 'sample', 'it', 'passes', 'stride', 'done'))
    deep = {n: 0.0 for n in state}
    push = {n: np.zeros_like(state[n]) for n in state}
    for k in ks:
        res = sample(state, frames[k])
        proposing = it < passes and k % stride == it % stride
        for n, (d, p) in res.items():
            deep[n] = max(deep[n], d)
            if proposing and p is not None and n not in done:
                take = np.einsum('ij,ij->i', p, p) > np.einsum('ij,ij->i', push[n], push[n])
                push[n][take] = p[take]
    return deep, push


def descend(state, frames, sample, apply, passes, stride, log=print, workers=1):
    """The fit loop, free of geometry so it can be checked on its own.

    `state` {name: rest positions}; `frames` every frame the report measures;
    `sample(state, frame)` → {name: (depth, push or None)} for one frame, the
    push an (n × 3) proposal; `apply(name, pos, push)` → the moved positions.
    Every pass measures the garment's depth over ALL frames — the baseline and
    every candidate on the same frames as the report — while the pushes are
    proposed from every `stride`-th frame only (offset by the pass). A
    candidate deeper than the garment's best is undone and that garment stops,
    so the returned state is never deeper than the one handed in. `workers`
    > 1 measures the frames in forked processes (the same result)."""
    names = list(state)
    best = {n: (np.inf, state[n].copy()) for n in names}
    done = set()
    idle = 0
    for it in range(passes + 1):
        _D.update(state=state, frames=frames, sample=sample, it=it, passes=passes, stride=stride, done=done)
        if workers > 1:
            import multiprocessing as mp
            chunks = [range(c, len(frames), workers * 4) for c in range(workers * 4)]
            with mp.get_context('fork').Pool(workers) as pool:
                parts = pool.map(_reduce, chunks)
        else:
            parts = [_reduce(range(len(frames)))]
        deep = {n: max(pd[n] for pd, _pp in parts) for n in names}
        push = {n: np.zeros_like(state[n]) for n in names}
        for _pd, pp in parts:
            for n in names:
                take = np.einsum('ij,ij->i', pp[n], pp[n]) > np.einsum('ij,ij->i', push[n], push[n])
                push[n][take] = pp[n][take]
        moved = 0
        for n in names:
            if deep[n] <= best[n][0]:
                best[n] = (deep[n], state[n].copy())
            else:
                state[n] = best[n][1].copy()
                done.add(n)
            if n in done or it == passes or not push[n].any():
                continue
            state[n] = apply(n, state[n], push[n])
            moved += 1
        log(f'fit pass {it + 1}: deepest {max(deep.values(), default=0):.4f} over all frames, {moved} garments moved')
        # a pass whose frames proposed nothing is no end while others may
        idle = 0 if moved else idle + 1
        if idle >= stride:
            break
    return {n: best[n][1] for n in names}, {n: best[n][0] for n in names}


def fit(body, clips, garments, cfg, passes=6, stride=2, log=lambda *x: print(*x, flush=True)):
    """The fit on the game's own posing (gamepath.py): every pose the report
    measures (a gait's at each stride), every body corner, the body and the
    garments hung, baked and skinned by the hung bones as the game draws them."""
    import gamepath as GP
    from mathutils.bvhtree import BVHTree
    margin = cfg['VILLAGER_ASSET']['garmentFitMargin']
    step = cfg['VILLAGER_ASSET']['garmentFitStep']
    jidx, jw = top4(body['W'])
    names = [n for n in garments['meshes'] if n.startswith('g-')]
    G = garments['meshes']
    skin = {n: top4(G[n]['W']) for n in names}
    topo = {n: neighbours(len(G[n]['pos']), G[n]['tris'], G[n]['pos']) for n in names}
    people = {}
    for c in corners():
        pos, j = morphed(body, corner_weights(*c))
        person = GP.Person(j)
        people[c] = (person, person.bake(pos, jidx, jw))
    frames = [(c, k) for c in corners() for k in range(sum(1 for _ in GP.poses(clips, EXPORT_CLIPS, cfg)))]
    pose_list = list(GP.poses(clips, EXPORT_CLIPS, cfg))

    def sample(state, fr):
        corner, k = fr
        w = corner_weights(*corner)
        person, baked = people[corner]
        _cn, _f, kst, q, hips = pose_list[k]
        wr, wp = person.pose(q, hips, kst)
        bv = person.skin(baked, jidx, jw, wr, wp)
        tree = BVHTree.FromPolygons(bv.tolist(), body['tris'].tolist(), all_triangles=True)
        out = {}
        for n in names:
            gi, gw = skin[n]
            gv = person.draw(garment_pos({'pos': state[n], 'morph_pos': G[n]['morph_pos']}, w), gi, gw, wr, wp)
            co, nrm = nearest(tree, gv)
            s = np.einsum('ij,ij->i', gv - co, nrm)
            depth = max(0.0, float(-s.min()))
            bad = np.nonzero(s < margin)[0]
            if not len(bad):
                out[n] = (depth, None)
                continue
            # back into the rest pose through the transpose of the vertex's
            # blend along the game's path (never the blow-up a near-singular
            # blend's inverse gives)
            A = person.blend(gi[bad], gw[bad], wr)
            u = np.einsum('vji,vj->vi', A, nrm[bad])
            un = np.maximum(np.linalg.norm(u, axis=1), 0.5)
            p = np.zeros_like(state[n])
            p[bad] = u / un[:, None] * np.minimum(margin - s[bad], step)[:, None]
            out[n] = (depth, p)
        return out

    def apply(n, pos, push):
        nb, twins = topo[n]
        return pos + spread(push, nb, twins)

    state = {n: G[n]['pos'].copy() for n in names}
    import os
    state, deep = descend(state, frames, sample, apply, passes, stride, log, workers=max(1, (os.cpu_count() or 2) - 1))
    for n in names:
        G[n]['pos'] = state[n]
    return garments


def selftest():
    """descend() on a toy garment of one vertex, x its rest height: frame A
    wants it higher (depth 0.05 − x), skipped frame B punishes height (depth
    3x). The proposals come from A alone; B must still veto the step that
    deepens the garment's worst frame, and the result is never deeper than
    the start. Raises AssertionError on a failure."""
    frames = ['A', 'B']

    def sample(state, fr):
        x = state['g'][0, 0]
        if fr == 'A':
            return {'g': (max(0.0, 0.05 - x), np.array([[0.01, 0, 0]]))}
        return {'g': (max(0.0, 3 * x), None)}

    worst = lambda x: max(max(0.0, 0.05 - x), 3 * x)  # noqa: E731
    state, deep = descend({'g': np.zeros((1, 3))}, frames, sample, lambda n, p, d: p + d, passes=6, stride=2, log=lambda *a: None)
    x = state['g'][0, 0]
    assert abs(deep['g'] - worst(x)) < 1e-12, (deep, x)
    assert worst(x) <= worst(0.0) + 1e-12, x
    assert abs(x - 0.01) < 1e-12, x  # 0.01 lowers the worst (0.04 vs 0.05); 0.02 would raise it (0.06)
    # a push that only ever deepens is never kept
    state, deep = descend({'g': np.zeros((1, 3))}, frames, lambda st, fr: {'g': (0.05 - st['g'][0, 0], np.array([[0.01, 0, 0]])) if fr == 'A' else (10 * st['g'][0, 0], None)},
                          lambda n, p, d: p + d, passes=6, stride=2, log=lambda *a: None)
    assert state['g'][0, 0] == 0.0 and abs(deep['g'] - 0.05) < 1e-12, (state, deep)
    selftest_build()
    print('fit selftest: ok')


def selftest_build():
    """The game's path unposed exactly (gamepath.Person.undraw)."""
    import gamepath as GP
    import skeleton as SK
    rng = np.random.default_rng(1)
    n = len(SK.NAMES)
    joints = np.zeros((n, 6))
    for i, name in enumerate(SK.NAMES):
        joints[i, :3] = rng.normal(0, 0.2, 3)
    person = GP.Person(joints)
    q = rng.normal(0, 1, (n, 4))
    q /= np.linalg.norm(q, axis=1)[:, None]
    wr, wp = person.pose(q, None)
    v = rng.normal(0, 0.3, (50, 3))
    ji = rng.integers(0, n, (50, 4))
    jw = rng.random((50, 4))
    jw /= jw.sum(1)[:, None]
    back = person.undraw(person.draw(v, ji, jw, wr, wp), ji, jw, wr, wp)
    assert np.abs(back - v).max() < 1e-9, np.abs(back - v).max()
