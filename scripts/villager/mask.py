"""Step: the garment cover masks — what a worn garment hides, instead of a
per-pose correction of the cloth.

THE VOLUME. A garment's cloth (uv seams welded) falls into connected parts
(trousers: the seat and two legs); each part with every open edge loop capped
by a fan to the loop's centre bounds a closed volume, and the garment's
volume is their union. A loop whose centre lies inside another part (a
trouser leg's top inside the seat) is a seam between parts; every other loop
is an OPENING (neck, sleeve, hem, a cape's outline).

THE MASK, read in the BUILD POSE (garments.design_pose, the pose every
garment is tailored in). A point inside the volume that moves with the
cloth (its skin weights within VILLAGER_ASSET.garmentMaskWeightGap of the
nearest cloth's: a hand hanging inside a skirt's outline does not) is
covered:

  hide  covered and farther than VILLAGER_ASSET.garmentMaskOpening from
        every opening's cap: while the garment is worn, a triangle whose
        three corners are all hidden is not drawn;
  push  covered near an opening: it stays drawn, pushed garmentMaskPush
        inward along its normal (so does a hidden corner of a drawn
        triangle), so the skin at a neckline, a sleeve or a hem stays
        visible and the cloth lying on it wins.

OVER EVERY POSE (`motion`, `decide`): the body's classes are then checked
against each garment posed in every pose of the exported clips at every body
corner, skinned as the game skins: a point keeps its build-pose class while
that leaves no defect in any pose, else takes the choice that leaves none —
hidden when it never leaves by an opening, never passes the cloth past the
cut tolerance and never comes near an opening; pushed when it never passes
through the cloth. A point with no clean choice (out by an opening in one
pose, through the cloth in another) keeps its build-pose class: only the
cloth itself can fix it. One mask per vertex ships, no per-pose data.

The body gets one mask per vertex (hide and push bits over the garments);
every garment the same over the garments of an OUTER layer (LAYER) that cover
it (every outfit layering: a figure wears at most one garment per slot). The game reads
the body's mask from villager.glb — attribute _COVER, unsigned shorts (hide
bits 0-15, hide bits 16-31, push bits 0-15, push bits 16-31); bit k is
scene.extras.villager.garmentMask.garments[k] (src/render/villagerGarmentMask.ts).

THE MEASURE, in any pose (penetration.py): a covered point outside the posed
volume either shows THROUGH the cloth (its nearest point of the capped
surface on the cloth, with the volume right behind it) or has LEFT by an
opening (its nearest point on an opening's cap or edge, or a straight way
to the cap's centre that crosses no cloth). A drawn point through the cloth
is skin (or an inner garment) showing through it; a hidden point out by an
opening is a hole.
"""
import numpy as np

import garments as G
import rig
from body import top4

# The garment's slot (src/systems/appearance.ts LayerSlot), by form: two
# garments of different slots can be worn together.
SLOT = {
    **{f: 'hip' for f in ('loinFlap', 'girdleTails', 'apron', 'skirtShort', 'skirtKnee', 'wrapLong', 'trousers')},
    **{f: 'torso' for f in ('breastCloth', 'shirt', 'robe', 'toga')},
    **{f: 'shoulder' for f in ('cape', 'cloak', 'hood')},
    **{f: 'head' for f in ('cap', 'hairBag', 'headRing', 'headband', 'topknot', 'turban', 'veil')},
    **{f: 'ornament' for f in ('limbRings', 'neckBeads', 'waistBeads')},
}
# The layer a slot is worn in, innermost first: in a layering the garment of
# the outer layer lies over the inner one (an ornament under everything, the
# head pieces under a hood). Only an outer layer's garment hides or pushes in
# an inner one; the reverse contact is the outer garment seen over it.
LAYER = {'ornament': 0, 'hip': 1, 'head': 1, 'torso': 2, 'shoulder': 3}


def layer(name):
    return LAYER[SLOT[form(name)]]


# The mask attribute holds 32 garments (two unsigned shorts per class).
BITS = 32
# Rays of the inside test (fit.RAYS: no ray along an axis the body is built round)
RAYS = ((0.0, 1.0, 0.0), (0.57735, -0.57735, 0.57735), (-0.6, 0.0, -0.8))
IN, THROUGH, OUT = 0, 1, 2


def form(name):
    return name.split('-')[1]


def garment_names(garments):
    """The masked garments in bit order (the pipeline's garment order)."""
    names = [n for n in garments['meshes'] if n.startswith('g-')]
    if len(names) > BITS:
        raise ValueError(f'{len(names)} garments: the cover mask holds {BITS}')
    return names


def build_pose(body, joints=None):
    """Skinning in the build pose (on a person's `joints`): a function
    (verts, W) → posed verts, skinned as the game skins (top four bones)."""
    j = body['joints'] if joints is None else joints
    wr, wp = rig.fk(j, G.design_pose(body), None)
    return lambda v, W: rig.skin(v, *top4(W), j, wr, wp)


# ---- the volume -----------------------------------------------------------------


def weld(pos):
    """Each vertex's representative among the vertices on its spot."""
    key = {}
    rep = np.empty(len(pos), int)
    for i, p in enumerate(map(tuple, np.round(pos, 6))):
        rep[i] = key.setdefault(p, i)
    return rep


def parts(tris):
    """Connected parts of welded triangles: a label per triangle."""
    t = np.asarray(tris)
    up = {}

    def find(a):
        while up.get(a, a) != a:
            up[a] = up.get(up[a], up[a])
            a = up[a]
        return a
    for a, b, c in t.tolist():
        ra, rb, rc = find(a), find(b), find(c)
        up[rb] = ra
        up[find(rc)] = ra
    roots = np.array([find(a) for a in t[:, 0].tolist()])
    return np.unique(roots, return_inverse=True)[1]


def open_loops(t):
    """The open edges of welded triangles `t` (in one triangle only) chained
    into loops of vertex ids."""
    e = np.sort(np.concatenate([t[:, [0, 1]], t[:, [1, 2]], t[:, [2, 0]]]), axis=1)
    u, cnt = np.unique(e, axis=0, return_counts=True)
    adj = {}
    for a, b in u[cnt == 1].tolist():
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
    used, loops = set(), []
    for a in list(adj):
        if a in used:
            continue
        loop, cur = [a], a
        used.add(a)
        while True:
            nxt = [x for x in adj[cur] if x not in used]
            if not nxt:
                break
            cur = nxt[0]
            used.add(cur)
            loop.append(cur)
        if len(loop) >= 3:
            loops.append(np.array(loop))
    return loops


def _parity(tree, p, d, hits=64):
    from mathutils import Vector
    o, d = Vector(p), Vector(d)
    k = 0
    for _ in range(hits):
        hit, _n, _i, _d = tree.ray_cast(o, d)
        if hit is None:
            break
        k += 1
        o = hit + d * 1e-6
    return k % 2 == 1


def _inside(tree, p):
    a = _parity(tree, p, RAYS[0])
    if a == _parity(tree, p, RAYS[1]):
        return a
    return _parity(tree, p, RAYS[2])


def _on_segment(p, a, b, eps=1e-6):
    ab = b - a
    t = np.clip((p - a) @ ab / max(ab @ ab, 1e-18), 0, 1)
    return np.linalg.norm(p - (a + t * ab)) < eps


class Volume:
    """A garment's capped parts (`tris`, welded on `rep`), its openings
    decided in the build pose `gv`."""

    def __init__(self, gv, tris, rep=None):
        rep = weld(gv) if rep is None else rep
        t = rep[np.asarray(tris)]
        lab = parts(t)
        self.parts = []
        for c in range(lab.max() + 1 if len(lab) else 0):
            tc = t[lab == c]
            self.parts.append({'tris': tc, 'loops': open_loops(tc)})
        trees = self.trees(gv)
        for k, P in enumerate(self.parts):
            others = [tr for j, (tr, _n) in enumerate(trees) if j != k]
            P['opening'] = [not any(_inside(tr, gv[lp].mean(0).tolist()) for tr in others) for lp in P['loops']]
        self.edges = {}
        for P in self.parts:
            for lp, op in zip(P['loops'], P['opening']):
                for a, b in zip(lp, np.roll(lp, -1)):
                    self.edges[(min(a, b), max(a, b))] = op

    def trees(self, gv):
        """Per part, the capped surface's BVH at positions `gv` and its number
        of cloth triangles (the rest are caps, in loop order)."""
        from mathutils.bvhtree import BVHTree
        out = []
        n = len(gv)
        for P in self.parts:
            v, tt = [gv], [P['tris']]
            for k, lp in enumerate(P['loops']):
                v.append(gv[lp].mean(0)[None])
                tt.append(np.stack([lp, np.roll(lp, -1), np.full(len(lp), n + len(v) - 2)], 1))
            out.append((BVHTree.FromPolygons(np.concatenate(v).tolist(), np.concatenate(tt).tolist(), all_triangles=True), len(P['tris'])))
        return out

    def caps(self, gv):
        """The openings' caps at `gv`: (BVH or None, cap centres)."""
        from mathutils.bvhtree import BVHTree
        v, tt, centres = [gv], [], []
        n = len(gv)
        for P in self.parts:
            for lp, op in zip(P['loops'], P['opening']):
                if not op:
                    continue
                centres.append(gv[lp].mean(0))
                v.append(centres[-1][None])
                tt.append(np.stack([lp, np.roll(lp, -1), np.full(len(lp), n + len(v) - 2)], 1))
        if not tt:
            return None, []
        return BVHTree.FromPolygons(np.concatenate(v).tolist(), np.concatenate(tt).tolist(), all_triangles=True), centres

    def classify(self, gv, pts, reach, follows=None):
        """Per point (build pose): 0 not covered, 1 hide, 2 push. `follows`
        (point, nearest cloth triangle, its barycentric weights) → whether
        the point moves with the cloth there; one that does not (a hand
        hanging inside a skirt's outline) is never covered."""
        trees = self.trees(gv)
        caps, _c = self.caps(gv)
        cloth = None
        if follows is not None:
            from mathutils.bvhtree import BVHTree
            cloth = BVHTree.FromPolygons(gv.tolist(), np.concatenate([P['tris'] for P in self.parts]).tolist(), all_triangles=True)
            tris = np.concatenate([P['tris'] for P in self.parts])
        out = np.zeros(len(pts), np.uint8)
        for k, p in enumerate(pts.tolist()):
            if any(_inside(tr, p) for tr, _n in trees):
                if cloth is not None:
                    co, _n, i, _d = cloth.find_nearest(p)
                    t = tris[i]
                    if not follows(k, t, barycentric(np.array(co), gv[t[0]], gv[t[1]], gv[t[2]])):
                        continue
                near = caps is not None and caps.find_nearest(p)[3] <= reach
                out[k] = 2 if near else 1
        return out

    def where(self, gv, pts, reach, ids=None, trees=None):
        """Each point's place against the posed garment `gv` (IN, THROUGH,
        OUT) and its distance outside the volume (0 inside). `reach`: how
        near an opening's edge a point outside may have left by it; `ids`
        the points to judge (the rest read IN); `trees` this pose's."""
        trees = trees or self.trees(gv)
        _caps, centres = self.caps(gv)
        seg = np.array([k for k, op in self.edges.items() if op], int).reshape(-1, 2)
        ids = range(len(pts)) if ids is None else ids
        place = np.full(len(pts), IN, np.uint8)
        dist = np.zeros(len(pts))
        for k in ids:
            p = pts[k].tolist()
            if any(_inside(tr, p) for tr, _n in trees):
                continue
            best = None
            for j, (tr, nt) in enumerate(trees):
                co, _n, i, d = tr.find_nearest(p)
                if best is None or d < best[0]:
                    best = (d, j, i, nt, np.array(co))
            d, j, i, nt, co = best
            dist[k] = d
            P = self.parts[j]
            if i >= nt:
                # on a cap: an opening's is the way out, a seam's is cloth
                L = np.searchsorted(np.cumsum([len(lp) for lp in P['loops']]), i - nt, side='right')
                place[k] = OUT if P['opening'][L] else THROUGH
                continue
            t = P['tris'][i]
            if any(self.edges.get((min(t[a], t[(a + 1) % 3]), max(t[a], t[(a + 1) % 3]))) and
                   _on_segment(co, gv[t[a]], gv[t[(a + 1) % 3]]) for a in range(3)):
                place[k] = OUT
                continue
            # a fold of cloth with the outside behind it too is nothing shown through
            u = (np.asarray(p) - co) / max(d, 1e-12)
            if not any(_inside(tr, (co - u * min(d, 0.005)).tolist()) for tr, _n in trees):
                place[k] = OUT
                continue
            # left by an opening near it: a straight way to its centre crossing no cloth
            if len(seg):
                a, b = gv[seg[:, 0]], gv[seg[:, 1]]
                ab = b - a
                s = np.clip(np.einsum('ij,ij->i', np.asarray(p) - a, ab) / np.maximum(np.einsum('ij,ij->i', ab, ab), 1e-18), 0, 1)
                if np.min(np.linalg.norm(np.asarray(p) - (a + s[:, None] * ab), axis=1)) <= reach and \
                        any(self._clear(trees, p, c) for c in centres):
                    place[k] = OUT
                    continue
            place[k] = THROUGH
        return place, dist

    @staticmethod
    def _clear(trees, p, c):
        """Whether the segment p → c crosses no cloth of any part."""
        from mathutils import Vector
        o, q = Vector(p), Vector(c.tolist())
        dv = q - o
        left = dv.length
        if left < 1e-9:
            return True
        dv.normalize()
        for tr, nt in trees:
            oo, ll = o.copy(), left
            for _ in range(64):
                hit, _n, i, h = tr.ray_cast(oo, dv, ll)
                if hit is None:
                    break
                if i < nt:
                    return False
                oo, ll = hit + dv * 1e-6, ll - h - 1e-6
                if ll <= 0:
                    break
        return True


def barycentric(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-18:
        return np.array([1.0, 0.0, 0.0])
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    return np.clip([1 - v - w, v, w], 0, 1)


def dense(W):
    """Skin weights as the game skins (top four bones), dense (n × bones)."""
    idx, w = top4(W)
    out = np.zeros((len(W), W.shape[1]))
    np.put_along_axis(out, idx, w, 1)
    return out


def follower(Wp, Wg, gap):
    """`follows` for Volume.classify: a point (weights `Wp`) moves with the
    cloth (vertex weights `Wg`) when their skin weights differ by at most
    `gap` (L1; 0 alike, 2 disjoint)."""
    return lambda k, t, bc: np.abs(Wp[k] - bc @ Wg[t]).sum() <= gap


# ---- the mask --------------------------------------------------------------------


def to_bits(cls, n):
    """{garment bit: classes (n,)} → (n, 4) uint16: hide lo, hide hi, push lo, push hi."""
    hide = np.zeros(n, np.uint64)
    push = np.zeros(n, np.uint64)
    for b, c in cls.items():
        hide |= (c == 1).astype(np.uint64) << np.uint64(b)
        push |= (c == 2).astype(np.uint64) << np.uint64(b)
    m = np.uint64(0xFFFF)
    return np.stack([hide & m, hide >> np.uint64(16), push & m, push >> np.uint64(16)], 1).astype(np.uint16)


def masks(body, garments, cfg, clips=None, log=print):
    """The body's mask and every garment's mask over the garments of outer
    layers: {'garments': names in bit order, 'body': (n, 4), 'inner': {name: (n, 4)}}.
    With `clips` (and VILLAGER_ASSET.garmentMaskPoseStride > 0) the body's
    mask is decided over every pose (`motion`, `decide`)."""
    names = garment_names(garments)
    reach = cfg['VILLAGER_ASSET']['garmentMaskOpening']
    gap = cfg['VILLAGER_ASSET']['garmentMaskWeightGap']
    pose = build_pose(body)
    bv = pose(body['pos'], body['W'])
    gv = {n: pose(garments['meshes'][n]['pos'], garments['meshes'][n]['W']) for n in names}
    vol = {n: Volume(gv[n], garments['meshes'][n]['tris']) for n in names}
    wd = {n: dense(garments['meshes'][n]['W']) for n in names}
    bw = dense(body['W'])
    # a closed piece (a ring, beads, a head ring) has no opening and covers
    # nothing but its own solid: it hides nothing
    covering = {n for n in names if any(op for P in vol[n].parts for op in P['opening'])}
    body_cls = {}
    for b, n in enumerate(names):
        if n not in covering:
            continue
        c = vol[n].classify(gv[n], bv, reach, follower(bw, wd[n], gap))
        if c.any():
            body_cls[b] = c
        log(f'mask: body under {n}: {int((c == 1).sum())} hidden, {int((c == 2).sum())} pushed')
    stride = cfg['VILLAGER_ASSET'].get('garmentMaskPoseStride', 0)
    if clips is not None and stride > 0:
        a = cfg['VILLAGER_ASSET']
        build = {n: body_cls.get(b, np.zeros(len(bv), np.uint8)) for b, n in enumerate(names) if n in covering}
        seen = motion(body, garments, clips, cfg, build, vol, gv, bv, wd, bw, stride, log)
        for b, n in enumerate(names):
            if n not in seen:
                continue
            ids, st = seen[n]
            full = [np.zeros(len(bv)) for _ in st]
            for f, x in zip(full, st):
                f[ids] = x
            c = decide(build[n], full, a['garmentPenetrationTolerance'], a['garmentMaskCutTolerance'], body['tris'])
            if c.any():
                body_cls[b] = c
            log(f'mask: body under {n} in every pose: {int((c == 1).sum())} hidden, {int((c == 2).sum())} pushed '
                f'(build pose {int((build[n] == 1).sum())}, {int((build[n] == 2).sum())})')
    inner = {}
    for n in names:
        cls = {}
        for b, o in enumerate(names):
            if o not in covering or layer(o) <= layer(n):
                continue
            c = vol[o].classify(gv[o], gv[n], reach, follower(wd[n], wd[o], gap))
            if c.any():
                cls[b] = c
        inner[n] = to_bits(cls, len(gv[n]))
    return {'garments': names, 'body': to_bits(body_cls, len(bv)), 'inner': inner}


# ---- the mask over every pose ------------------------------------------------------

_MO = {}


def decide(c, st, tol, cut, tris=None):
    """The classes (0 not covered, 1 hide, 2 push) of points with build-pose
    classes `c`, from their places over every pose `st` (`motion`: deepest out
    by an opening, deepest through the cloth, poses inside, poses near an
    opening). A choice is CLEAN when it leaves no defect in any pose: hiding
    when the point never leaves by an opening (hole), never passes the cloth
    farther than `cut` and never comes near an opening (skin at an opening
    stays drawn); pushing when it never passes through the cloth (shown) and
    no cloth sinks under it into the body (drawn, it would hide that cloth).
    A point keeps its build-pose class while that is clean or neither is; else
    it takes the clean one. A point not covered in the build pose but inside
    the garment in some pose is covered when a choice is clean (hiding first).
    With the mesh's `tris` (all points), un-hiding is checked for what it
    exposes (`exposed`)."""
    out, thr, nin, near, sink = st
    hide = (out <= tol) & (thr <= cut) & (near == 0)
    push = (thr <= tol) & (sink <= tol)
    k = np.asarray(c, np.uint8).copy()
    k[(c == 1) & ~hide & push] = 2
    k[(c == 2) & ~push & hide] = 1
    new = (c == 0) & (nin > 0)
    k[new & hide] = 1
    k[new & ~hide & push] = 2
    if tris is not None:
        k = exposed(c, k, ~push, tris)
    return k


def exposed(c, k, unclean, tris):
    """`k` with every point drawn again (from hidden in `c`) taken back while
    it would expose a hidden neighbour that cannot be drawn cleanly
    (`unclean`): a triangle with one drawn corner is drawn whole, and its
    hidden corners are drawn with it (pushed), so un-hiding a point is clean
    only when every hidden corner it draws is."""
    t = np.asarray(tris)
    k = k.copy()
    before = ~(c[t] == 1).all(1)
    while True:
        drawn = ~(k[t] == 1).all(1)
        seen = np.zeros(len(k), bool)
        seen[t[drawn].ravel()] = True
        was = np.zeros(len(k), bool)
        was[t[before].ravel()] = True
        bad = seen & ~was & (k == 1) & unclean
        if not bad.any():
            return k
        # the triangles drawn anew round a bad corner: their un-hidden corners hide again
        hit = drawn & ~before & bad[t].any(1)
        back = np.zeros(len(k), bool)
        back[t[hit].ravel()] = True
        back &= (c == 1) & (k != 1)
        if not back.any():
            return k
        k[back] = 1


def _motion_corner(corner):
    """One body corner: per covering garment and candidate point its deepest
    out, deepest through, poses inside and poses near an opening."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree

    import gamepath as GP
    from body import vertex_normals
    from fit import garment_pos
    from sheets import corner_weights, morphed
    S = _MO
    body, garments, cand, vol, reach = S['body'], S['garments'], S['cand'], S['vol'], S['reach']
    w = corner_weights(*corner)
    pos, j = morphed(body, w)
    person = GP.Person(j)
    bh = person.bake(pos, *S['bskin'])
    gh = {n: person.bake(garment_pos(garments['meshes'][n], w), *S['gskin'][n]) for n in cand}
    st = {n: (np.zeros(len(ids)), np.zeros(len(ids)), np.zeros(len(ids), int), np.zeros(len(ids), int), np.zeros(len(ids)))
          for n, ids in cand.items()}
    for q, hips, kst in S['poses']:
        wr, wp = person.pose(q, hips, kst)
        bv = person.skin(bh, *S['bskin'], wr, wp)
        bn = vertex_normals(bv, body['tris'])
        for n, ids in cand.items():
            g = person.skin(gh[n], *S['gskin'][n], wr, wp)
            place, dist = vol[n].where(g, bv, reach, ids=ids)
            pl, d = place[ids], dist[ids]
            caps, _c = vol[n].caps(g)
            out, thr, nin, near, sink = st[n]
            np.maximum(out, np.where(pl == OUT, d, 0.0), out=out)
            np.maximum(thr, np.where(pl == THROUGH, d, 0.0), out=thr)
            nin += pl == IN
            near += np.array([caps.find_nearest(bv[k].tolist())[3] <= reach for k in ids.tolist()], int)
            # cloth under the skin: the nearest cloth straight inward from it
            cloth = BVHTree.FromPolygons(g.tolist(), S['tris'][n], all_triangles=True)
            for x, k in enumerate(ids.tolist()):
                if pl[x] != IN:
                    continue
                hit = cloth.ray_cast(Vector(bv[k].tolist()), Vector((-bn[k]).tolist()), S['sink'])
                if hit[0] is not None and hit[3] > sink[x]:
                    sink[x] = hit[3]
    return st


def motion(body, garments, clips, cfg, build, vol, gv, bv, wd, bw, stride, log=print):
    """Each covering garment's candidate body points (covered in the build
    pose, or following the cloth within VILLAGER_ASSET.garmentMaskMotionReach
    of it) and their places (`decide`) over every `stride`th pose of every
    exported clip and the build pose, at every body corner of the penetration
    report, skinned along the game's path: {name: (ids, (out, thr, nin, near,
    sink))}; `sink` how deep cloth lies under the skin straight inward (up to
    VILLAGER_ASSET.garmentMaskSinkReach) while the point is inside the garment.
    Only the decision ships, no per-pose data."""
    import multiprocessing as mp
    import os
    from mathutils.bvhtree import BVHTree

    import gamepath as GP
    from export import EXPORT_CLIPS
    from penetration import CORNERS, build_pose_clips
    a = cfg['VILLAGER_ASSET']
    near = a['garmentMaskMotionReach']
    cand = {}
    for n, c in build.items():
        tris = np.concatenate([P['tris'] for P in vol[n].parts])
        cloth = BVHTree.FromPolygons(gv[n].tolist(), tris.tolist(), all_triangles=True)
        fol = follower(bw, wd[n], a['garmentMaskWeightGap'])
        ids = []
        for k, p in enumerate(bv.tolist()):
            if not c[k]:
                co, _n, i, _d = cloth.find_nearest(p, near)
                if co is None:
                    continue
                t = tris[i]
                if not fol(k, t, barycentric(np.array(co), gv[n][t[0]], gv[n][t[1]], gv[n][t[2]])):
                    continue
            ids.append(k)
        cand[n] = np.array(ids, int)
    every = build_pose_clips(body, clips)
    poses = [(q, hips, kst) for k, (_c, _f, kst, q, hips) in enumerate(GP.poses(every, EXPORT_CLIPS, cfg)) if k % stride == 0]
    poses += [(q, hips, kst) for _c, _f, kst, q, hips in GP.poses(every, ['build'], cfg)]
    _MO.update(body=body, garments=garments, cand=cand, vol=vol, reach=a['garmentMaskOpening'], poses=poses,
               bskin=top4(body['W']), gskin={n: top4(garments['meshes'][n]['W']) for n in cand},
               tris={n: np.concatenate([P['tris'] for P in vol[n].parts]).tolist() for n in cand}, sink=a['garmentMaskSinkReach'])
    total = None
    with mp.get_context('fork').Pool(max(1, min(len(CORNERS), (os.cpu_count() or 2) - 1))) as pool:
        for st in pool.imap(_motion_corner, CORNERS):
            if total is None:
                total = st
                continue
            for n, (out, thr, nin, nr, sk) in st.items():
                t = total[n]
                total[n] = (np.maximum(t[0], out), np.maximum(t[1], thr), t[2] + nin, t[3] + nr, np.maximum(t[4], sk))
    log(f'mask: every pose: {len(poses)} poses at {len(CORNERS)} corners')
    return {n: (cand[n], total[n]) for n in cand}


def decode(m, names, worn):
    """Per point of mask `m` (n, 4) with the garments `worn` (names) on:
    (hidden, pushed) — a hidden point is pushed too where a drawn triangle
    keeps it (villagerGarmentMask.ts decodes alike)."""
    bits = 0
    for n in worn:
        bits |= 1 << names.index(n)
    lo, hi = np.uint16(bits & 0xFFFF), np.uint16(bits >> 16)
    hide = ((m[:, 0] & lo) | (m[:, 1] & hi)) != 0
    push = ((m[:, 2] & lo) | (m[:, 3] & hi)) != 0
    return hide, push | hide


def drawn_tris(tris, hidden):
    """Per triangle: drawn (not all three corners hidden)."""
    return ~hidden[np.asarray(tris)].all(1)


def pushed(v, tris, push, depth):
    """Positions `v` with the `push` vertices moved `depth` inward along their
    normal (the game's vertex shader)."""
    from body import vertex_normals
    return v - depth * push[:, None] * vertex_normals(v, np.asarray(tris))


def check(out, mk, body, outfits):
    """What the game's decode must give for the body's mask (villagerGarmentMask.test.ts):
    per worn set its covered vertices and drawn triangles."""
    import json
    import os
    sets = [[n] for n in mk['garments']] + [list(o) for o in outfits]
    rows = []
    for worn in sets:
        hide, push = decode(mk['body'], mk['garments'], worn)
        drawn = drawn_tris(body['tris'], hide)
        rows.append({'worn': worn, 'hidden': int(hide.sum()), 'covered': int(push.sum()), 'drawnTriangles': int(drawn.sum()),
                     'coveredIds': np.nonzero(push)[0][:16].tolist()})
    json.dump({'garments': list(mk['garments']), 'vertices': len(body['pos']), 'triangles': len(body['tris']), 'sets': rows},
              open(os.path.join(out, 'garment-mask-check.json'), 'w'), indent=1)


def selftest():
    """to_bits / decode round trip (no Blender needed)."""
    names = [f'g-x{k}-w' for k in range(20)]
    cls = {0: np.array([1, 0, 2, 0], np.uint8), 17: np.array([0, 2, 0, 1], np.uint8)}
    m = to_bits(cls, 4)
    assert m.tolist() == [[1, 0, 0, 0], [0, 0, 0, 2], [0, 0, 1, 0], [0, 2, 0, 0]], m.tolist()
    h, p = decode(m, names, ['g-x17-w'])
    assert h.tolist() == [False, False, False, True] and p.tolist() == [False, True, False, True], (h, p)
    h, p = decode(m, names, ['g-x0-w'])
    assert h.tolist() == [True, False, False, False] and p.tolist() == [True, False, True, False], (h, p)
    assert drawn_tris([[0, 3, 0], [0, 1, 2]], np.array([True, False, False, True])).tolist() == [False, True]
    # only an outer layer's garment masks an inner one
    assert layer('g-waistBeads-x') < layer('g-skirtKnee-x') < layer('g-robe-chest') < layer('g-cloak-x')
    assert layer('g-hood-x') == layer('g-cloak-x') and layer('g-cap-x') < layer('g-hood-x')
    # over every pose: a clean choice wins, a point with none keeps its build class
    tol, cut = 0.003, 0.02
    c = np.array([1, 1, 1, 2, 2, 2, 0, 0, 0, 0], np.uint8)
    out = np.array([0.0, 0.01, 0.01, 0.0, 0.0, 0.01, 0.0, 0.01, 0.0, 0.0])
    thr = np.array([0.0, 0.0, 0.01, 0.01, 0.03, 0.01, 0.01, 0.0, 0.0, 0.0])
    nin = np.array([5, 5, 5, 5, 5, 5, 3, 3, 0, 3])
    near = np.array([0, 0, 0, 0, 0, 0, 0, 0, 0, 2])
    k = decide(c, (out, thr, nin, near, np.zeros(10)), tol, cut)
    # hidden clean; out by an opening → pushed; out and through → kept hidden;
    # through → hidden; through past the cut → kept pushed; neither → kept;
    # inside in motion → hidden, or pushed when it leaves; never inside → not
    # covered; near an opening in some pose → pushed, not hidden
    assert k.tolist() == [1, 2, 1, 1, 2, 2, 1, 2, 0, 2], k.tolist()
    # un-hiding a point draws its triangles: not while a hidden corner of one
    # passes through the cloth (point 1 would expose point 2)
    c = np.array([1, 1, 1, 1], np.uint8)
    st = (np.array([0.0, 0.01, 0.0, 0.0]), np.array([0.0, 0.0, 0.01, 0.0]), np.array([5, 5, 5, 5]), np.zeros(4), np.zeros(4))
    assert decide(c, st, tol, cut).tolist() == [1, 2, 1, 1]
    assert decide(c, st, tol, cut, [[0, 1, 2], [0, 2, 3]]).tolist() == [1, 1, 1, 1]
    assert decide(c, st, tol, cut, [[0, 1, 3], [0, 2, 3]]).tolist() == [1, 2, 1, 1]
    # cloth sunk under a point (or under a hidden neighbour it would draw) keeps it hidden
    st = st[:4] + (np.array([0.0, 0.01, 0.0, 0.0]),)
    assert decide(c, st, tol, cut, [[0, 1, 3], [0, 2, 3]]).tolist() == [1, 1, 1, 1]
    st = st[:4] + (np.array([0.0, 0.0, 0.0, 0.01]),)
    assert decide(c, st, tol, cut, [[0, 1, 3], [0, 2, 3]]).tolist() == [1, 1, 1, 1]
    print('mask selftest: ok')


def selftest_volume():
    """Volume on toy garments (needs Blender's mathutils)."""
    def box(x0, x1, y0, y1, z0, z1, drop=()):
        v = np.array([(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)], float)
        q = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (1, 5, 7, 3), (0, 2, 6, 4)]
        q = [x for k, x in enumerate(q) if k not in drop]
        return v, np.array([t for a, b, c, d in q for t in ((a, b, c), (a, c, d))])
    # a tube round z, open at both ends (y up): a point in the middle is
    # hidden, one by the end pushed, one outside not covered
    gv, gt = box(-0.1, 0.1, -0.1, 0.1, 0.0, 1.0, drop=(4, 5))
    vol = Volume(gv, gt)
    assert sum(op for P in vol.parts for op in P['opening']) == 2, vol.parts
    c = vol.classify(gv, np.array([[0.0, 0.013, 0.5], [0.0, 0.013, 0.03], [0.3, 0.0, 0.5]]), 0.07)
    assert c.tolist() == [1, 2, 0], c
    # posed: through the side wall, out by the end, still inside
    pts = np.array([[0.13, 0.013, 0.5], [0.0, 0.013, -0.05], [0.0, 0.013, 0.5]])
    place, dist = vol.where(gv, pts, 0.02)
    assert place.tolist() == [THROUGH, OUT, IN] and abs(dist[0] - 0.03) < 1e-6, (place, dist)
    # two overlapping parts (a seat and a leg): the leg's top inside the seat
    # and the seat's bottom inside the leg are seams, the overlap is inside
    sv, st = box(-0.2, 0.2, -0.1, 0.1, 0.5, 1.0, drop=(4, 5))
    lv, lt = box(-0.1, 0.1, -0.1, 0.1, 0.0, 0.7, drop=(4, 5))
    gv2 = np.concatenate([sv, lv])
    vol = Volume(gv2, np.concatenate([st, lt + len(sv)]))
    assert sorted(op for P in vol.parts for op in P['opening']) == [False, False, True, True], [P['opening'] for P in vol.parts]
    c = vol.classify(gv2, np.array([[0.0, 0.013, 0.6], [0.0, 0.013, 0.35]]), 0.07)
    assert c.tolist() == [1, 1], c
    print('mask volume selftest: ok')
