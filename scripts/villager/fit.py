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
import skeleton as SK
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


def descend(state, frames, sample, apply, passes, stride, log=print):
    """The fit loop, free of geometry so it can be checked on its own.

    `state` {name: rest positions}; `frames` every frame the report measures;
    `sample(state, frame)` → {name: (depth, push or None)} for one frame, the
    push an (n × 3) proposal; `apply(name, pos, push)` → the moved positions.
    Every pass measures the garment's depth over ALL frames — the baseline and
    every candidate on the same frames as the report — while the pushes are
    proposed from every `stride`-th frame only (offset by the pass). A
    candidate deeper than the garment's best is undone and that garment stops,
    so the returned state is never deeper than the one handed in."""
    names = list(state)
    best = {n: (np.inf, state[n].copy()) for n in names}
    done = set()
    idle = 0
    for it in range(passes + 1):
        deep = {n: 0.0 for n in names}
        push = {n: np.zeros_like(state[n]) for n in names}
        for k, fr in enumerate(frames):
            res = sample(state, fr)
            proposing = it < passes and k % stride == it % stride
            for n, (d, p) in res.items():
                deep[n] = max(deep[n], d)
                if proposing and p is not None and n not in done:
                    take = np.einsum('ij,ij->i', p, p) > np.einsum('ij,ij->i', push[n], push[n])
                    push[n][take] = p[take]
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
    state, deep = descend(state, frames, sample, apply, passes, stride, log)
    for n in names:
        G[n]['pos'] = state[n]
    return garments


# The body corners in the order their morphs can be settled: each corner's
# morph weights are those of a corner before it plus ONE morph of its own (None:
# the neutral corner, the rest positions), so a corner settled later never
# moves one settled before it.
SETTLE_ORDER = (
    (('male', 'adult', 0.0), None), (('female', 'adult', 0.0), 'female'), (('male', 'child', 0.0), 'child'),
    (('male', 'youth', 0.0), 'youth'), (('male', 'elder', 0.0), 'elder'), (('male', 'adult', -1.0), 'slight'),
    (('male', 'adult', 1.0), 'stout'), (('female', 'child', 0.0), 'child_f'), (('female', 'youth', 0.0), 'youth_f'),
    (('female', 'elder', 0.0), 'elder_f'),
)


def face_pushes(n, tris, fw, fi, need, dirs):
    """Per vertex the largest push that moves the cloth points between the
    vertices (`fi` vertex ids, `fw` barycentric weights) by `need` along
    `dirs`: a linear point moves by Σ w·d, so each vertex takes w / Σ w²."""
    out = np.zeros((n, 3))
    mag = np.zeros(n)
    k = need[:, None] * dirs / np.einsum('kj,kj->k', fw, fw)[:, None]
    for c in range(3):
        d = fw[:, c, None] * k
        m = np.linalg.norm(d, axis=1)
        for v, dv, mv in zip(fi[:, c], d, m):
            if mv > mag[v]:
                mag[v], out[v] = mv, dv
    return out


def way_out(tree, p, d, hits=64):
    """How far point `p` must move along `d` to leave the body: the distance
    to the hit where the winding number along the ray falls to zero (inf when
    it never does)."""
    from mathutils import Vector
    o, dv = Vector(p), Vector(d)
    hs = []
    for _ in range(hits):
        hit, n, _i, _d = tree.ray_cast(o, dv)
        if hit is None:
            break
        hs.append(((hit - Vector(p)).length, 1 if n.dot(dv) > 0 else -1))
        o = hit + dv * 1e-6
    w = sum(s for _l, s in hs)
    for length, s in hs:
        w -= s
        if w <= 0:
            return length
    return np.inf


# The layer a garment's slot lies in, innermost first (src/systems/appearance.ts
# LayerSlot; the head pieces sit under a hood): the clearance it is settled to
# grows by VILLAGER_ASSET.garmentLayerGap per layer, so an inner garment never
# settles where an outer one lies.
LAYER = {'ornament': 0, 'hip': 1, 'head': 1, 'torso': 2, 'shoulder': 3}


def settle(body, garments, cfg, passes=3, log=lambda *x: print(*x, flush=True)):
    """settle_once, then every edge the settling stretched past garmentEdgeMax
    split again (garments.refine) and settled again, until none is."""
    from garments import refine
    G = garments['meshes']
    for k in range(passes):
        settle_once(body, garments, cfg, log=log)
        split = 0
        for n in [n for n in G if n.startswith('g-')]:
            nv = len(G[n]['pos'])
            G[n] = refine(G[n], cfg['VILLAGER_ASSET']['garmentEdgeMax'])
            split += len(G[n]['pos']) - nv
        log(f'settle pass {k + 1}: {split} vertices added where the settling stretched the cloth')
        if not split:
            break
    return garments


def settle_once(body, garments, cfg, rounds=8, log=lambda *x: print(*x, flush=True)):
    """Settle every garment round the body in the BUILD POSE as the game draws
    it, at every body corner: every garment vertex at least its layer's
    clearance (VILLAGER_ASSET.garmentSettleClearance + garmentLayerGap per
    LAYER) outside the drawn body, so with edges no longer than garmentEdgeMax
    (garments.refine) the cloth between the vertices clears it too. A vertex
    short of it moves out along the body's normal at its nearest point — or,
    inside where that way leads into another body part (the armpit, where the
    arm meets the trunk), outward from the body's axis, over the limb. The
    move is taken back to the rest pose through the game's blend at that
    corner (gamepath.Person.undraw) and added to the corner's own morph
    (SETTLE_ORDER), spread a little onto the neighbours so no spike rises in
    the cloth."""
    import gamepath as GP
    import mask as M
    from garments import design_pose
    from mathutils.bvhtree import BVHTree
    from penetration import face_points
    a = cfg['VILLAGER_ASSET']
    jidx, jw = top4(body['W'])
    q = design_pose(body)
    G = garments['meshes']
    names = [n for n in G if n.startswith('g-')]
    skin = {n: top4(G[n]['W']) for n in names}
    topo = {n: neighbours(len(G[n]['pos']), G[n]['tris'], G[n]['pos']) for n in names}
    clear = {n: a['garmentSettleClearance'] + a['garmentLayerGap'] * LAYER[M.SLOT[M.form(n)]] for n in names}
    for corner, morph in SETTLE_ORDER:
        w = corner_weights(*corner)
        pos, j = morphed(body, w)
        person = GP.Person(j)
        wr, wp = person.build_pose(q)
        bv = person.draw(pos, jidx, jw, wr, wp)
        tree = BVHTree.FromPolygons(bv.tolist(), body['tris'].tolist(), all_triangles=True)
        axis = wp[SK.INDEX['hips']]
        worst = 0.0
        for n in names:
            g = G[n]
            gi, gw = skin[n]
            for _r in range(rounds):
                gv = person.draw(garment_pos(g, w), gi, gw, wr, wp)
                d, _co, nrm = depths(tree, gv)
                need = clear[n] + d
                bad = np.nonzero(need > 1e-6)[0]
                if not len(bad):
                    break
                dirs = nrm.copy()
                for k in bad[d[bad] > 0]:
                    if way_out(tree, gv[k], nrm[k]) > 1.5 * d[k] + 0.005:
                        r = np.array([gv[k][0] - axis[0], 0.0, gv[k][2] - axis[2]])
                        r /= max(np.linalg.norm(r), 1e-9)
                        out = way_out(tree, gv[k], r)
                        if out < np.inf:
                            need[k], dirs[k] = out + clear[n], r
                push = np.zeros_like(gv)
                push[bad] = need[bad, None] * dirs[bad]
                nb, twins = topo[n]
                push = spread(push, nb, twins)
                rest = person.undraw(gv + push, gi, gw, wr, wp) - person.undraw(gv, gi, gw, wr, wp)
                if morph is None:
                    g['pos'] = g['pos'] + rest
                else:
                    g['morph_pos'][morph] = g['morph_pos'][morph] + rest
            fi, fw = face_points(g['tris'], g['pos'], a['garmentFaceSpacing'])
            gv = person.draw(garment_pos(g, w), gi, gw, wr, wp)
            last = float(max(0.0, depths(tree, np.concatenate([gv, np.einsum('kj,kji->ki', fw, gv[fi])]))[0].max()))
            worst = max(worst, last)
            if last > 1e-9:
                log(f'settle {corner[0]} {corner[1]} {corner[2]:+.0f} {n}: cloth {last:.4f} inside')
        log(f'settle {corner[0]} {corner[1]} {corner[2]:+.0f}: deepest {worst:.4f}')
    return garments


def settle_layers(body, garments, cfg, q, rounds=3, log=print):
    """The same for every layering, in the build pose at every body corner: a
    point of an inner garment its cover mask leaves drawn under an outer one
    (mask.py) and outside that outer garment through its cloth pushes the
    outer cloth nearest to it out past it by `garmentFitMargin`."""
    import gamepath as GP
    import mask as M
    from mathutils.bvhtree import BVHTree
    from penetration import Masked
    from body import barycentric
    a = cfg['VILLAGER_ASSET']
    margin, reach = a['garmentFitMargin'], a['garmentMaskOpening']
    G = garments['meshes']
    mk = M.masks(body, garments, cfg, log=lambda *x: None)
    names = mk['garments']
    skin = {n: top4(G[n]['W']) for n in names}
    topo = {n: neighbours(len(G[n]['pos']), G[n]['tris'], G[n]['pos']) for n in names}
    pose = M.build_pose(body)
    vol = {n: M.Volume(pose(G[n]['pos'], G[n]['W']), G[n]['tris']) for n in names}
    pairs = {}
    for i in names:
        for o in names:
            if i != o and M.SLOT[M.form(i)] != M.SLOT[M.form(o)]:
                mi = Masked(mk['inner'][i], G[i]['tris'], names, o)
                if mi.any:
                    pairs.setdefault(o, []).append((i, mi))
    for corner, morph in SETTLE_ORDER:
        w = corner_weights(*corner)
        _pos, j = morphed(body, w)
        person = GP.Person(j)
        wr, wp = person.build_pose(q)
        worst = 0.0
        for _r in range(rounds):
            gv = {n: person.draw(garment_pos(G[n], w), *skin[n], wr, wp) for n in names}
            moved = 0
            for o, inner in pairs.items():
                to = np.asarray(G[o]['tris'])
                cloth = BVHTree.FromPolygons(gv[o].tolist(), to.tolist(), all_triangles=True)
                trees = vol[o].trees(gv[o])
                fi, fw, need, dirs = [], [], [], []
                for i, mi in inner:
                    smp = np.concatenate([gv[i], gv[i][mi.tris].mean(1)])
                    place, dist = vol[o].where(gv[o], smp, reach, ids=mi.shown, trees=trees)
                    for k in mi.shown[(place[mi.shown] == M.THROUGH) & (dist[mi.shown] > 0)]:
                        co, _n, ti, _d = cloth.find_nearest(smp[k].tolist())
                        co = np.array(co)
                        u = smp[k] - co
                        fi.append(to[ti])
                        fw.append(barycentric(co, *gv[o][to[ti]]))
                        need.append(np.linalg.norm(u) + margin)
                        dirs.append(u / max(np.linalg.norm(u), 1e-12))
                        worst = max(worst, float(dist[k])) if _r == 0 else worst
                if not need:
                    continue
                push = face_pushes(len(gv[o]), to, np.clip(np.array(fw), 0, 1), np.array(fi), np.array(need), np.array(dirs))
                nb, twins = topo[o]
                push = spread(push, nb, twins)
                gi, gw = skin[o]
                rest = person.undraw(gv[o] + push, gi, gw, wr, wp) - person.undraw(gv[o], gi, gw, wr, wp)
                if morph is None:
                    G[o]['pos'] = G[o]['pos'] + rest
                else:
                    G[o]['morph_pos'][morph] = G[o]['morph_pos'][morph] + rest
                moved += 1
            if not moved:
                break
        log(f'settle layers {corner[0]} {corner[1]} {corner[2]:+.0f}: deepest inner {worst:.4f}')


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
    print('fit selftest: ok')
