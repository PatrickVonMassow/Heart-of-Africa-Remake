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
import os

import numpy as np

import rig
import skeleton as SK
from body import top4
from export import EXPORT_CLIPS
from gltfio import qmat
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


def nearest_face(tree, pts):
    """Nearest surface point, its normal and its face index for every point."""
    co = np.empty_like(pts)
    nrm = np.empty_like(pts)
    fi = np.empty(len(pts), int)
    for k, p in enumerate(pts.tolist()):
        c, n, i, _d = tree.find_nearest(p)
        co[k] = c
        nrm[k] = n
        fi[k] = i
    return co, nrm, fi


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


def spread(D, nb, twins, rounds=2, keep=0.5):
    """Every vertex keeps at least its own push; its neighbours take part of
    it (`keep` of it per ring, over `rounds` rings)."""
    out = D.copy()
    for _ in range(rounds):
        mag = np.linalg.norm(out, axis=1)
        nxt = out.copy()
        for i in range(len(out)):
            if len(nb[i]) == 0:
                continue
            m = mag[nb[i]]
            k = nb[i][np.argmax(m)]
            cand = keep * out[k]
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
    from mathutils.bvhtree import BVHTree
    margin = cfg['VILLAGER_ASSET']['garmentFitMargin']
    step = cfg['VILLAGER_ASSET']['garmentFitStep']
    jidx, jw = top4(body['W'])
    import mask as M
    names = [n for n in garments['meshes'] if n.startswith('g-')]
    G = garments['meshes']
    skin = {n: top4(G[n]['W']) for n in names}
    topo = {n: neighbours(len(G[n]['pos']), G[n]['tris'], G[n]['pos']) for n in names}
    arm = [SK.INDEX[f'{b}.{x}'] for b in ('upperArm', 'forearm', 'hand') for x in 'LR']
    arm_face = np.isin(np.argmax(body['W'], 1)[body['tris']], arm).any(1)
    on_arm = {n: G[n]['W'][:, arm].sum(1) > 0.05 for n in names}
    drapes = {n: M.layer(n) == M.LAYER['shoulder'] for n in names}
    shapes = {c: morphed(body, corner_weights(*c)) for c in corners()}
    frames = [(c, cname, f) for c in corners() for cname in EXPORT_CLIPS for f in range(len(clips['clips'][cname]['times']))]

    def sample(state, fr):
        corner, cname, f = fr
        w = corner_weights(*corner)
        pos, j = shapes[corner]
        c = clips['clips'][cname]
        wr, wp = rig.fk(j, c['q'][f], c['hips'][f])
        bv = rig.skin(pos, jidx, jw, j, wr, wp)
        tree = BVHTree.FromPolygons(bv.tolist(), body['tris'].tolist(), all_triangles=True)
        R = np.array([qmat(q) for q in wr])
        out = {}
        for n in names:
            gi, gw = skin[n]
            gv = rig.skin(garment_pos({'pos': state[n], 'morph_pos': G[n]['morph_pos']}, w), gi, gw, j, wr, wp)
            co, nrm, fi = nearest_face(tree, gv)
            s = np.einsum('ij,ij->i', gv - co, nrm)
            depth = max(0.0, float(-s.min()))
            # the shoulder layer (capes, cloaks, the hood) drapes the arms
            # and does not follow them: the arms swing under it in every
            # clip, and pushing it off them in the rest pose crumpled it into
            # lumpy blobs (measured 09.10.2026)
            bad = np.nonzero((s < margin) & ~(arm_face[fi] & ~on_arm[n] & drapes[n]))[0]
            if not len(bad):
                out[n] = (depth, None)
                continue
            # back into the rest pose through the transpose of the vertex's
            # bone blend (its inverse for one bone; never the blow-up a
            # near-singular blend's inverse gives)
            A = np.einsum('vk,vkij->vij', gw[bad], R[gi[bad]])
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


def smooth_cloth(garments, rounds, lam=0.5, mu=-0.53):
    """Taubin smoothing (`rounds` λ/μ pairs, no shrinking) of every garment's
    rest positions and each morph's offsets alike, its open edges (hems,
    openings) held: the settle's pushes leave the cloth dented, and the
    next settle pass takes it clear of the body again."""
    G = garments['meshes']
    for n in [n for n in G if n.startswith('g-')]:
        g = G[n]
        nb, twins = neighbours(len(g['pos']), g['tris'], g['pos'])
        rep = np.arange(len(g['pos']))
        for grp in twins:
            rep[grp] = min(grp)
        t = rep[np.asarray(g['tris'])]
        e = np.sort(np.concatenate([t[:, [0, 1]], t[:, [1, 2]], t[:, [2, 0]]]), axis=1)
        u, c = np.unique(e, axis=0, return_counts=True)
        edge = np.zeros(len(g['pos']), bool)
        edge[u[c == 1].ravel()] = True
        edge = edge[rep]
        free = np.nonzero(~edge & np.array([len(x) > 0 for x in nb]))[0]

        def step(a, f):
            mean = np.array([a[nb[i]].mean(0) for i in free])
            out = a.copy()
            out[free] = a[free] + f * (mean - a[free])
            return out
        arrays = [g['pos']] + [g['morph_pos'][m] for m in g['morph_pos']]
        for _ in range(rounds):
            arrays = [step(step(a, lam), mu) for a in arrays]
        g['pos'] = arrays[0]
        for m, a in zip(g['morph_pos'], arrays[1:]):
            g['morph_pos'][m] = a


def settle(body, garments, cfg, passes=4, log=lambda *x: print(*x, flush=True)):
    """Every edge split to garmentEdgeMax (garments.refine), the cloth an arm
    passes through in the build pose cut (garments.armholes); then
    settle_once and settle_layers, every edge the settling stretched split
    again and settled again, until none is."""
    import mask as M
    from garments import armholes, refine
    G = garments['meshes']
    for n in [n for n in G if n.startswith('g-')]:
        G[n] = refine(G[n], cfg['VILLAGER_ASSET']['garmentEdgeMax'])
        # an armhole where an upper arm passes the trunk cloth; a garment of
        # the shoulder layer drapes the arms instead (garments.build_form)
        if M.form(n) != 'limbRings' and M.layer(n) < M.LAYER['shoulder']:
            G[n], cut, of_sleeve = armholes(body, G[n])
            if cut:
                log(f'settle {n}: {cut} triangles cut where an arm passes through, {of_sleeve} of them a sleeve\'s')
    for k in range(passes):
        if k:
            smooth_cloth(garments, cfg['VILLAGER_ASSET']['garmentSettleSmooth'])
        settle_once(body, garments, cfg, log=log)
        # the layers last: an outer garment only ever moves out, so it keeps
        # its body clearance, while an inner one settled after it could rise
        # through it again
        settle_layers(body, garments, cfg, log=log)
        split = 0
        if k < passes - 1:
            for n in [n for n in G if n.startswith('g-')]:
                nv = len(G[n]['pos'])
                G[n] = refine(G[n], cfg['VILLAGER_ASSET']['garmentEdgeMax'])
                split += len(G[n]['pos']) - nv
            log(f'settle pass {k + 1}: {split} vertices added where the settling stretched the cloth')
        if not split:
            break
    smooth_cloth(garments, cfg['VILLAGER_ASSET']['garmentSettleSmooth'])
    # the cover masks follow the settled cloth: settle the body clearance and
    # the layers again, under the masks the settled garments give, until
    # neither moves anything (a layer push spread near a collar can dip the
    # cloth into the body, a body push lift an inner garment)
    # It ends only on a state both have validated: the layer settle found
    # nothing to push (so it changed nothing) after a body settle that left
    # no cloth inside. Short of that after the last round, the penetration
    # step measures what is left.
    done = False
    for k in range(12):
        before, after = settle_once(body, garments, cfg, log=log)
        found, held = settle_layers(body, garments, cfg, log=log)
        log(f'settle again {k + 1}: cloth {before:.4f} inside before, {after:.4f} after; inner through outer {found:.4f} before, {held:.4f} refused')
        if found <= 0.0 and after <= 1e-4:
            done = True
            break
    # what the settle could not resolve is said, never taken as settled: the
    # penetration step measures it (it applies no refusal)
    if not done:
        log(f'settle: NOT CONVERGED after 12 rounds (cloth {after:.4f} inside, inner through outer {found:.4f})')
    if held > 0:
        log(f'settle: inner through outer {held:.4f} left where a push into or across the body was refused')
    return garments


_ST = {}


def _settle_one(n):
    """settle_once for one garment at the corner in _ST: its new rest
    positions (or the corner's morph) and how deep its cloth still lies."""
    from mathutils.bvhtree import BVHTree
    from penetration import face_points
    S = _ST
    G, w, morph, person, wr, wp, a = S['G'], S['w'], S['morph'], S['person'], S['wr'], S['wp'], S['a']
    tree = BVHTree.FromPolygons(S['bv'].tolist(), S['tris'].tolist(), all_triangles=True)
    axis, clear = S['axis'], S['clear']
    g = dict(G[n])
    g['morph_pos'] = dict(g['morph_pos'])
    gi, gw = S['skin'][n]
    fi, fw = face_points(g['tris'], g['pos'], a['garmentFaceSpacing'])
    first = None
    for _r in range(S['rounds']):
        gv = person.draw(garment_pos(g, w), gi, gw, wr, wp)
        d, co, nrm = depths(tree, gv)
        need = clear[n] + d
        bad = np.nonzero(need > 1e-6)[0]
        # a point outside but short of its clearance moves away from the
        # nearest skin, not along that face's normal (which in the mouth's
        # slit points into the cavity)
        off = gv - co
        ln = np.linalg.norm(off, axis=1)
        out_ = (d < 0) & (ln > 1e-9)
        nrm = nrm.copy()
        nrm[out_] = off[out_] / ln[out_, None]
        # the cloth between the vertices: a point of it still inside
        # (a curve tighter than the edges follow) moves its vertices
        fp = np.einsum('kj,kji->ki', fw, gv[fi])
        fd, _fc, fn = depths(tree, fp)
        fb = np.nonzero(fd > 0)[0]
        if first is None:
            first = float(max(0.0, d.max(), fd.max() if len(fd) else 0.0))
        if not len(bad) and not len(fb):
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
        if len(fb):
            pf = face_pushes(len(gv), g['tris'], fw[fb], fi[fb], fd[fb] + a['garmentFitMargin'], fn[fb])
            take = np.einsum('ij,ij->i', pf, pf) > np.einsum('ij,ij->i', push, push)
            push[take] = pf[take]
        nb, twins = S['topo'][n]
        push = spread(push, nb, twins, a['garmentSettleSpreadRings'], a['garmentSettleSpreadKeep'])
        rest = person.undraw(gv + push, gi, gw, wr, wp) - person.undraw(gv, gi, gw, wr, wp)
        if morph is None:
            g['pos'] = g['pos'] + rest
        else:
            g['morph_pos'][morph] = g['morph_pos'][morph] + rest
    gv = person.draw(garment_pos(g, w), gi, gw, wr, wp)
    last = float(max(0.0, depths(tree, np.concatenate([gv, np.einsum('kj,kji->ki', fw, gv[fi])]))[0].max()))
    return n, (g['pos'] if morph is None else g['morph_pos'][morph]), last, first or 0.0


def settle_once(body, garments, cfg, rounds=8, log=lambda *x: print(*x, flush=True)):
    """Settle every garment round the body in the BUILD POSE as the game draws
    it, at every body corner: every garment vertex at least its layer's
    clearance (VILLAGER_ASSET.garmentSettleClearance + garmentLayerGap per
    mask.LAYER) outside the drawn body, so with edges no longer than garmentEdgeMax
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
    clear = {n: a['garmentSettleClearance'] + a['garmentLayerGap'] * M.layer(n) for n in names}
    import multiprocessing as mp
    deepest = before = 0.0
    for corner, morph in SETTLE_ORDER:
        w = corner_weights(*corner)
        pos, j = morphed(body, w)
        person = GP.Person(j)
        wr, wp = person.build_pose(q)
        _ST.update(G=G, w=w, morph=morph, person=person, wr=wr, wp=wp, bv=person.draw(pos, jidx, jw, wr, wp), tris=body['tris'],
                   axis=wp[SK.INDEX['hips']], skin=skin, topo=topo, clear=clear, a=a, rounds=rounds)
        # the garments settle independently of each other: one worker each
        with mp.get_context('fork').Pool(max(1, min(len(names), (os.cpu_count() or 2) - 1))) as pool:
            done = pool.map(_settle_one, names)
        worst = 0.0
        for n, new, last, first in done:
            before = max(before, first)
            if morph is None:
                G[n]['pos'] = new
            else:
                G[n]['morph_pos'][morph] = new
            worst = max(worst, last)
            if last > 1e-9:
                log(f'settle {corner[0]} {corner[1]} {corner[2]:+.0f} {n}: cloth {last:.4f} inside')
        log(f'settle {corner[0]} {corner[1]} {corner[2]:+.0f}: deepest {worst:.4f}')
        deepest = max(deepest, worst)
    # how deep the deepest cloth lay before this settle, and after it
    return before, deepest


def settle_layers(body, garments, cfg, rounds=6, log=print):
    """The same for every layering, in the build pose at every body corner: a
    point of an inner garment its cover mask leaves drawn under an outer one
    (mask.py) and outside that outer garment through its cloth pushes the
    outer cloth nearest to it out past it by `garmentFitMargin`.
    Returns the deepest such point before the first push at any corner, and
    the deepest one left after the last round whose push was refused (into
    or across the body): no push resolves those, so they are reported, never
    counted as settled."""
    import gamepath as GP
    import mask as M
    from mathutils.bvhtree import BVHTree
    from penetration import Masked
    from body import barycentric
    from mathutils import Vector
    a = cfg['VILLAGER_ASSET']
    # an outer cloth settles a whole layer gap past the inner one: a gap of
    # garmentFitMargin left the two coincident to the eye (patches of the inner
    # garment through the outer within tolerance)
    margin, reach, stick = a['garmentLayerGap'], a['garmentMaskOpening'], a['garmentLayerReach']
    G = garments['meshes']
    mk = M.masks(body, garments, cfg, log=lambda *x: None)
    names = mk['garments']
    skin = {n: top4(G[n]['W']) for n in names}
    topo = {n: neighbours(len(G[n]['pos']), G[n]['tris'], G[n]['pos']) for n in names}
    from garments import design_pose
    q = design_pose(body)
    pose = M.build_pose(body)
    vol = {n: M.Volume(pose(G[n]['pos'], G[n]['W']), G[n]['tris']) for n in names}
    # every layering whose inner garment the outer one covers, or whose drawn
    # inner garment lies outside the outer one through its cloth by at most
    # garmentLayerReach in the neutral build pose: there the mask leaves it
    # uncovered, and it is the inner garment drawn over the outer one (one
    # farther off is another part of the figure, a skirt below a hood's hem).
    # The penetration step counts covered samples only; these uncovered ones
    # are settled for the picture, on the body the mask is read on (taken per
    # corner they set the layer settle oscillating, measured 09.10.2026).
    gn = {n: pose(G[n]['pos'], G[n]['W']) for n in names}
    covering = {n for n in names if any(op for P in vol[n].parts for op in P['opening'])}
    drawn_at_corners = [gn]
    for corner, _m in SETTLE_ORDER[1:]:
        w = corner_weights(*corner)
        person = GP.Person(morphed(body, w)[1])
        wr, wp = person.build_pose(q)
        drawn_at_corners.append({n: person.draw(garment_pos(G[n], w), *skin[n], wr, wp) for n in names})
    pairs = {}
    for i in names:
        for o in names:
            # a head piece lies under a hood alone: a cape's or cloak's collar
            # pulled toward a turban or a hair bag dragged its cloth into the head
            if M.SLOT[M.form(i)] == 'head' and M.form(o) != 'hood':
                continue
            if M.layer(i) < M.layer(o) and o in covering:
                mi = Masked(mk['inner'][i], G[i]['tris'], names, o)
                ids = mi.drawn_samples
                # near the outer cloth at ANY body corner: one picked on the
                # neutral body alone came through it at another corner (a
                # robe's sleeve cap through a cloak on an elder woman,
                # measured 09.10.2026); the set stays fixed through the
                # corners below, so it cannot oscillate
                near = np.zeros(0, int)
                for gc in drawn_at_corners:
                    smp = mi.drawn_at(gc[i], a['garmentMaskPush'])[1]
                    place, dist = vol[o].where(gc[o], smp, reach, ids=ids)
                    near = np.union1d(near, ids[(place[ids] == M.THROUGH) & (dist[ids] <= stick) & ~np.isin(ids, mi.shown)])
                if mi.any or len(near):
                    pairs.setdefault(o, []).append((i, mi, np.union1d(mi.shown, near)))
    # the body is the innermost layer: skin the mask leaves drawn under a
    # garment and outside it through its cloth (`shown`) pushes the cloth too
    for o in sorted(covering):
        mb = Masked(mk['body'], body['tris'], names, o)
        if mb.any:
            pairs.setdefault(o, []).append(('body', mb, mb.shown))
    found = 0.0
    held = 0.0
    for corner, morph in SETTLE_ORDER:
        w = corner_weights(*corner)
        _pos, j = morphed(body, w)
        person = GP.Person(j)
        wr, wp = person.build_pose(q)
        bpos, _j = morphed(body, w)
        bjidx, bjw = top4(body['W'])
        btree = BVHTree.FromPolygons(person.draw(bpos, bjidx, bjw, wr, wp).tolist(), body['tris'].tolist(), all_triangles=True)
        first = None
        for _r in range(rounds + 1):
            gv = {n: person.draw(garment_pos(G[n], w), *skin[n], wr, wp) for n in names}
            gv['body'] = person.draw(bpos, bjidx, bjw, wr, wp)
            moved = 0
            cur = 0.0
            refused = 0.0
            # the inner layers' outer garments first: a hip garment settled
            # over the beads before a robe settles over it
            for o, inner in sorted(pairs.items(), key=lambda p: M.layer(p[0])):
                to = np.asarray(G[o]['tris'])
                cloth = BVHTree.FromPolygons(gv[o].tolist(), to.tolist(), all_triangles=True)
                trees = vol[o].trees(gv[o])
                fi, fw, need, dirs = [], [], [], []
                for i, mi, ids in inner:
                    # the inner garment as the game draws it under this outer
                    # one: its covered points pushed in along its own normals
                    # (which for a closed piece or an inward-facing sheet
                    # is toward the outer cloth)
                    smp = mi.drawn_at(gv[i], a['garmentMaskPush'])[1]
                    place, dist = vol[o].where(gv[o], smp, reach, ids=ids, trees=trees)
                    for k in ids[(place[ids] == M.THROUGH) & (dist[ids] > 0) & ((dist[ids] <= stick) | np.isin(ids, mi.shown))]:
                        co, _n, ti, _d = cloth.find_nearest(smp[k].tolist())
                        co = np.array(co)
                        u = smp[k] - co
                        # only ever out from the body (the normal of the body
                        # nearest the inner point: the cloth's nearest body
                        # point may be a hand beside it): an inner point past a
                        # fold of the outer cloth never pulls it into the body
                        _bc, bn, _bi, _bd = btree.find_nearest(smp[k].tolist())
                        if u @ np.array(bn) <= 0:
                            refused = max(refused, float(dist[k]))
                            continue
                        # nor across the body: an inner point on another side
                        # of the figure (a hair bag behind the head under a
                        # cape's collar) is no reason to pull the cloth there
                        ln = float(np.linalg.norm(u))
                        if ln > 1e-9 and btree.ray_cast(Vector(co.tolist()), Vector((u / ln).tolist()), ln)[0] is not None:
                            refused = max(refused, float(dist[k]))
                            continue
                        fi.append(to[ti])
                        fw.append(barycentric(co, *gv[o][to[ti]]))
                        need.append(np.linalg.norm(u) + margin)
                        dirs.append(u / max(np.linalg.norm(u), 1e-12))
                        cur = max(cur, float(dist[k]))
                if not need or _r == rounds:
                    continue
                push = face_pushes(len(gv[o]), to, np.clip(np.array(fw), 0, 1), np.array(fi), np.array(need), np.array(dirs))
                nb, twins = topo[o]
                push = spread(push, nb, twins, a['garmentSettleSpreadRings'], a['garmentSettleSpreadKeep'])
                gi, gw = skin[o]
                rest = person.undraw(gv[o] + push, gi, gw, wr, wp) - person.undraw(gv[o], gi, gw, wr, wp)
                if morph is None:
                    G[o]['pos'] = G[o]['pos'] + rest
                else:
                    G[o]['morph_pos'][morph] = G[o]['morph_pos'][morph] + rest
                moved += 1
            first = cur if first is None else first
            if not moved:
                break
        log(f'settle layers {corner[0]} {corner[1]} {corner[2]:+.0f}: inner through outer {first:.4f} -> {cur:.4f}'
            + (f'; {refused:.4f} left where the push was refused' if refused > 0 else ''))
        found = max(found, first)
        held = max(held, refused)
    return found, held


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


def selftest_armholes():
    """armhole_keep cuts the cloth an arm passes through (by a vertex or the
    centre) and counts the sleeve's; refine carries a sleeve's membership to
    its new vertices."""
    from garments import armhole_keep, refine
    # a body-cloth square (0-3) and a sleeve square (4-7), all inside an arm
    sq = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0.0]])
    t = np.array([[0, 1, 2], [0, 2, 3], [4, 5, 6], [4, 6, 7]])
    sleeve = np.arange(8) >= 4
    vin = np.zeros(8, bool)
    vin[[1, 5]] = True
    keep, of_sleeve = armhole_keep(t, sleeve, vin, lambda k: False)
    assert keep.tolist() == [False, True, False, True] and of_sleeve == 1, (keep, of_sleeve)
    # a centre inside the arm cuts a triangle with no vertex in it
    keep, of_sleeve = armhole_keep(t, sleeve, np.zeros(8, bool), lambda k: k in (1, 3))
    assert keep.tolist() == [True, False, True, False] and of_sleeve == 1, (keep, of_sleeve)
    g = {'pos': np.vstack([sq, sq + [5, 0, 0]]), 'tris': t, 'uv': np.zeros((8, 2)), 'W': np.ones((8, 1)),
         'morph_pos': {}, 'sleeve': sleeve}
    r = refine(g, 0.3)
    assert len(r['pos']) > 8 and (r['sleeve'] == (r['pos'][:, 0] > 2.5)).all(), r['sleeve']


def selftest_build():
    """The game's path unposed exactly (gamepath.Person.undraw), refine()
    leaving no edge over its limit and the cloth where it was, face_pushes
    moving a cloth point by exactly what it asks."""
    import gamepath as GP
    import skeleton as SK
    from garments import refine
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
    # two triangles of a 1 × 1 square: every edge ≤ 0.3 after, the area kept
    g = {'pos': np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0.0]]), 'tris': np.array([[0, 1, 2], [0, 2, 3]]),
         'uv': np.zeros((4, 2)), 'W': np.eye(4), 'morph_pos': {'m': np.ones((4, 3))}}
    r = refine(g, 0.3)
    t, p = r['tris'], r['pos']
    e = np.concatenate([np.linalg.norm(p[t[:, i]] - p[t[:, (i + 1) % 3]], axis=1) for i in range(3)])
    area = 0.5 * np.linalg.norm(np.cross(p[t[:, 1]] - p[t[:, 0]], p[t[:, 2]] - p[t[:, 0]]), axis=1).sum()
    assert e.max() <= 0.3 + 1e-12 and abs(area - 1) < 1e-12 and np.allclose(r['morph_pos']['m'], 1), (e.max(), area)
    # no T-junction: every edge is in two triangles or on the square's border
    ed = np.sort(np.concatenate([t[:, [0, 1]], t[:, [1, 2]], t[:, [2, 0]]]), axis=1)
    u, c = np.unique(ed, axis=0, return_counts=True)
    border = [((p[a][0] in (0, 1)) and p[b][0] == p[a][0]) or ((p[a][1] in (0, 1)) and p[b][1] == p[a][1]) for a, b in u[c == 1]]
    assert all(border), 'refine left an edge with a vertex in its middle'
    selftest_armholes()
    fp = face_pushes(3, np.array([[0, 1, 2]]), np.array([[0.2, 0.3, 0.5]]), np.array([[0, 1, 2]]), np.array([0.01]), np.array([[0, 0, 1.0]]))
    assert abs(np.array([0.2, 0.3, 0.5]) @ fp[:, 2] - 0.01) < 1e-12, fp
