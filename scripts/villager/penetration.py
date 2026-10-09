"""The per-frame garment penetration report on WHAT THE GAME DRAWS: for every
frame of every exported clip (a gait's also at the shortest and longest
stride the game warps it to) and every age/sex corner and build extreme,
the body and each garment are skinned along the game's own path
(gamepath.py: the corner's mesh hung and baked, then skinned by the hung
bones), and the garment's cover mask (mask.py) applied as the game applies
it: the body's triangles hidden under the garment left out, its covered
vertices pushed VILLAGER_ASSET.garmentMaskPush inward along their normal.

Per garment, alone on the masked body:

  cloth   how deep a garment vertex, or a point of the cloth between its
          vertices (`face_points`), lies inside the drawn body: inside by
          the winding number (fit.inside) and under drawn skin: its depth
          when its nearest body point is drawn, else its depth under the
          nearest drawn skin if drawn skin encloses it (`_occluded`);
  shown   how far a drawn body point (vertex or triangle centre) the garment
          covers lies outside the cloth, through it (mask.Volume.where; a
          point pressed into another body part is hidden there only where
          that part's skin is drawn — a hidden surface occludes nothing);
  hole    how far a hidden body point has left the garment by an opening
          (missing skin seen at a hem or a sleeve);
  cut     how far a hidden body point lies outside the garment through
          its cloth: the cloth drawn where the body bulges past it — what
          hiding is for — judged against its own, wider tolerance
          VILLAGER_ASSET.garmentMaskCutTolerance (a limb visibly cut off).

And per garment worn under each garment of an OUTER layer (mask.LAYER) that
covers part of it (every outfit layering), the same with the inner garment's
own mask: `inner` how far a drawn covered point of it shows through the outer
cloth, unless it lies inside the body as drawn while both are worn (pushed)
and that body hides no triangle (`Sight`); `inner hole`
how far a hidden one has left the outer garment by an opening. A column
counts a frame once (its worst outer garment); every failing outer garment and
body part of a frame is named as its own case.

Every value is the measured maximum, below tolerance too: the tolerance
decides `over` and the failure, never what is recorded.

The pipeline fails the penetration step when any value exceeds
VILLAGER_ASSET.garmentPenetrationTolerance. Written to
verification/villager-body/penetration-report.md (and .json).
"""
import json
import os

import numpy as np

import gamepath as GP
import mask as M
from body import top4, vertex_normals
from export import EXPORT_CLIPS
from fit import depths, garment_pos
from sheets import corner_weights, morphed

CORNERS = [(s, a, 0.0) for s in ('male', 'female') for a in ('child', 'youth', 'adult', 'elder')] + [('male', 'adult', -1.0), ('male', 'adult', 1.0)]
COLUMNS = ('cloth', 'shown', 'hole', 'cut', 'inner', 'innerHole')

_S = {}


def face_points(tris, pos, spacing):
    """The cloth points between the vertices: per triangle of the cloth at
    `pos` the points of a barycentric grid at most about `spacing` apart,
    its corners left out, as (vertex ids k × 3, weights k × 3)."""
    t = np.asarray(tris)
    p = np.asarray(pos)
    edge = np.max([np.linalg.norm(p[t[:, j]] - p[t[:, (j + 1) % 3]], axis=1) for j in range(3)], axis=0)
    m_of = np.maximum(2, np.ceil(edge / spacing)).astype(int)
    ids, ws = [], []
    for m in np.unique(m_of):
        grid = np.array([(i, j, m - i - j) for i in range(m + 1) for j in range(m + 1 - i)], float) / m
        grid = grid[grid.max(1) < 1]
        sel = t[m_of == m]
        ids.append(np.repeat(sel, len(grid), axis=0))
        ws.append(np.tile(grid, (len(sel), 1)))
    return np.concatenate(ids), np.concatenate(ws)


class Masked:
    """A mesh (`tris`) under one garment's mask `m` (n × 4): which samples
    (vertices, then triangle centres) are drawn and covered, which hidden."""

    def __init__(self, m, tris, names, worn):
        hide, push = M.decode(m, names, [worn])
        t = np.asarray(tris)
        self.tris = t
        self.push = push.astype(float)
        drawn = M.drawn_tris(t, hide)
        self.drawn = drawn
        self.drawn_ids = np.nonzero(drawn)[0]
        vdrawn = np.zeros(len(m), bool)
        vdrawn[t[drawn].ravel()] = True
        tcov = push[t].all(1)
        # drawn and covered: shown through the cloth is a defect
        self.shown = np.concatenate([np.nonzero(vdrawn & push)[0], len(m) + np.nonzero(drawn & tcov)[0]])
        # hidden: out by an opening is a hole
        self.hidden = np.concatenate([np.nonzero(hide & ~vdrawn)[0], len(m) + np.nonzero(~drawn)[0]])
        # every drawn sample, covered or not (fit.settle_layers)
        self.drawn_samples = np.concatenate([np.nonzero(vdrawn)[0], len(m) + np.nonzero(drawn)[0]])
        self.any = bool(push.any())

    def drawn_at(self, v, depth):
        """Pushed positions and samples (vertices, then triangle centres) for
        posed positions `v`, and the vertex normals used."""
        nrm = vertex_normals(v, self.tris)
        p = v - depth * self.push[:, None] * nrm
        return p, np.concatenate([p, p[self.tris].mean(1)]), nrm


# how far a shown skin sample is stepped off its own surface before the
# occlusion test: far below any gap between body parts, independent of the
# tolerance, so a residual is never dropped by a probe that crossed a small gap
PROBE = 1e-4


def _occluded(full, drawn, q):
    """Whether point `q` lies inside the body under DRAWN skin: inside the whole
    body (`full`, every triangle) and inside by the drawn triangles alone
    (`drawn`; None: nothing hidden). A body part whose surface the mask hides
    there occludes nothing."""
    from fit import inside
    q = list(q)
    return inside(full, q) and (drawn is None or inside(drawn, q))


def inside_body(tree, q):
    from fit import inside
    return inside(tree, list(q))


class Sight:
    """The body as drawn: `pos` (pushed as the game pushes it), `tris`, and
    per triangle `drawn`. A point is COVERED only when it lies inside the body
    and the body hides no triangle: through a hidden triangle a point inside
    is seen, and no finite set of rays proves a partly hidden surface blocks
    every line of sight, so any hole counts the point as seen (conservative:
    a residual may be over-counted, never hidden)."""

    def __init__(self, pos, tris, drawn):
        from mathutils.bvhtree import BVHTree
        self.closed = bool(np.asarray(drawn, bool).all())
        if self.closed:
            self.full = BVHTree.FromPolygons(np.asarray(pos).tolist(), np.asarray(tris).tolist(), all_triangles=True)

    def covered(self, q):
        return self.closed and inside_body(self.full, np.asarray(q, float))


def _first_shown(ids, dist, keep):
    """The largest `dist` over the sample ids that `keep` accepts, tested in
    descending order (only up to the first accepted), and its id."""
    for k in ids[np.argsort(-dist[ids], kind='stable')]:
        if keep(k):
            return float(dist[k]), int(k)
    return 0.0, None


def _empty():
    return {c: {'value': 0.0, 'at': None, 'over': 0, 'part': None} for c in COLUMNS} | {'checked': 0, 'cases': {}, 'clips': {}}


def _note(r, col, v, at, tol, part=None, clip=None, cases=()):
    """Record value `v` of column `col` once for this pose (and per clip);
    every (body part, outer garment, value, where) of `cases` over tolerance
    is counted as a named CASE (column, clip, body part, outer garment): its
    worst value, where, and in how many frames."""
    c = r[col]
    if clip is not None:
        k = f'{col} {clip}'
        r['clips'][k] = max(r['clips'].get(k, 0.0), float(v))
    if v > tol:
        c['over'] += 1
    if v > c['value']:
        c['value'], c['at'], c['part'] = float(v), at, part
    for p, o, cv, cat in cases:
        if cv > tol:
            e = r['cases'].setdefault((col, clip, p, o), {'value': 0.0, 'at': None, 'over': 0})
            e['over'] += 1
            if cv > e['value']:
                e['value'], e['at'] = float(cv), cat


def _per_part(ids, dist, part_of, keep, lim):
    """The largest `dist` over the sample ids that `keep` accepts, with its
    id, and per body part (`part_of`) its own largest accepted value over
    `lim` as [(part, value, id)] — every failing body part, not only the worst."""
    memo = {}

    def k(x):
        if x not in memo:
            memo[x] = keep(x)
        return memo[x]
    v, x = _first_shown(ids, dist, k)
    found = []
    if v > lim:
        over = ids[dist[ids] > lim]
        parts = np.array([part_of(int(y)) for y in over])
        for p in sorted(set(parts.tolist())):
            pv, px = _first_shown(over[parts == p], dist, k)
            if px is not None:
                found.append((p, pv, px))
    return v, x, found


def _always(_x):
    return True


def _corner(c):
    """One body corner: every pose, every garment and layering, its worst values."""
    from mathutils.bvhtree import BVHTree
    S = _S
    body, garments, names, gskin, tol, cfg = S['body'], S['garments'], S['names'], S['gskin'], S['tol'], S['cfg']
    a = cfg['VILLAGER_ASSET']
    depth, reach = a['garmentMaskPush'], a['garmentMaskOpening']
    mk = garments['mask']
    sex, age, build = c
    w = corner_weights(sex, age, build)
    pos, j = morphed(body, w)
    person = GP.Person(j)
    bh = person.bake(pos, S['jidx'], S['jw'])
    gh = {n: person.bake(garment_pos(garments['meshes'][n], w), *gskin[n]) for n in names}
    bm = {n: Masked(mk['body'], body['tris'], mk['garments'], n) for n in names}
    # every layering: (inner, outer) with the inner's mask under that outer
    pairs = [(i, o, Masked(mk['inner'][i], garments['meshes'][i]['tris'], mk['garments'], o)) for i in names for o in names
             if M.layer(i) < M.layer(o)]
    pairs = [p for p in pairs if p[2].any]
    # the body as the game draws it while both garments of a layering are
    # worn (hidden triangles left out, covered vertices pushed in): an inner
    # garment's point is seen unless it lies inside that body and nothing is hidden
    btris = np.asarray(body['tris'])
    both = {(i, o): M.decode(mk['body'], mk['garments'], [i, o]) for i, o, _m in pairs}
    worst = {n: _empty() for n in names}
    nv = len(body['pos'])
    bone = lambda k: S['bones'][S['dom'][k if k < nv else body['tris'][k - nv][0]]]  # noqa: E731
    for k, (cname, f, kst, q, hips) in enumerate(GP.poses(S['clips'], S['clip_names'], cfg)):
        if k % S['stride']:
            continue
        at = f'{cname} frame {f}{"" if kst == 1 else f" stride {kst:g}"} ({sex} {age} build {build:+.0f})'
        wr, wp = person.pose(q, hips, kst)
        bv = person.skin(bh, S['jidx'], S['jw'], wr, wp)
        full = BVHTree.FromPolygons(bv.tolist(), body['tris'].tolist(), all_triangles=True)
        gv = {n: person.skin(gh[n], *gskin[n], wr, wp) for n in names}
        trees = {n: S['vol'][n].trees(gv[n]) for n in names}
        for n in names:
            r = worst[n]
            r['checked'] += 1
            mb = bm[n]
            bp, smp, nrm = mb.drawn_at(bv, depth)
            # the pushed body: every triangle (inside test), and the drawn ones
            tree = full if not mb.any else BVHTree.FromPolygons(bp.tolist(), body['tris'].tolist(), all_triangles=True)
            dtree = None if not mb.any else BVHTree.FromPolygons(bp.tolist(), body['tris'][mb.drawn].tolist(), all_triangles=True)
            # cloth inside the body under drawn skin, at every depth (no
            # tolerance filter): a point whose nearest skin is drawn counts its
            # depth; one whose nearest skin is hidden counts its depth under the
            # nearest drawn skin, if drawn skin encloses it at all
            fi, fw = S['faces'][n]
            pts = np.concatenate([gv[n], np.einsum('kj,kji->ki', fw, gv[n][fi])])
            d, _co, _n = depths(tree, pts)
            cand = np.nonzero(d > 0)[0]
            val, tri, under = d.copy(), np.zeros(len(d), int), np.ones(len(d), bool)
            for x in cand:
                ti = tree.find_nearest(pts[x].tolist())[2]
                tri[x] = ti
                if dtree is not None and not mb.drawn[ti]:
                    _c, _nn, dti, dd = dtree.find_nearest(pts[x].tolist())
                    val[x], tri[x], under[x] = (dd, mb.drawn_ids[dti], False) if dti is not None else (0.0, ti, False)
            cpart = lambda x: bone(int(body['tris'][tri[x]][0]))  # noqa: E731
            v, x, found = _per_part(cand, val, cpart, lambda x: under[x] or _occluded(tree, dtree, pts[x]), tol)
            _note(r, 'cloth', v, at, tol, cpart(x) if x is not None else None, cname, [(p, None, pv, at) for p, pv, _x in found])
            if not mb.any:
                continue
            # covered skin through the cloth (unless drawn skin of another body
            # part encloses it); hidden skin out by an opening; hidden skin past the cloth
            place, dist = S['vol'][n].where(gv[n], smp, reach, ids=mb.shown, trees=trees[n])
            thr = mb.shown[(place[mb.shown] == M.THROUGH) & (dist[mb.shown] > 0)]
            fn = None
            def visible(x):
                nonlocal fn
                if fn is None:
                    fn = np.concatenate([nrm, vertex_normals_faces(bp, body['tris'])])
                return not _occluded(tree, dtree, smp[x] + PROBE * fn[x])
            for col, ids, keep, lim in (('shown', thr, visible, tol),):
                v, x, found = _per_part(ids, dist, bone, keep, lim)
                _note(r, col, v, at, lim, bone(x) if x is not None else None, cname, [(p, None, pv, at) for p, pv, _x in found])
            place, dist = S['vol'][n].where(gv[n], smp, reach, ids=mb.hidden, trees=trees[n])
            for col, ids, lim in (('hole', mb.hidden[place[mb.hidden] == M.OUT], tol), ('cut', mb.hidden[place[mb.hidden] == M.THROUGH], S['cut'])):
                v, x, found = _per_part(ids, dist, bone, _always, lim)
                _note(r, col, v, at, lim, bone(x) if x is not None else None, cname, [(p, None, pv, at) for p, pv, _x in found])
        # every layering: the column counts once per pose and inner garment
        # (its worst outer garment, so "frames over" never exceeds "checked");
        # every failing outer garment and body part is named as its own case
        lay, cases = {}, {}
        bnrm = None
        sight = {}
        for i, o, mi in pairs:
            _ip, smp, _nrm = mi.drawn_at(gv[i], depth)
            ipart = lambda k, i=i, mi=mi: S['bones'][S['gdom'][i][k if k < S['gnv'][i] else mi.tris[k - S['gnv'][i]][0]]]  # noqa: E731
            place, dist = S['vol'][o].where(gv[o], smp, reach, ids=mi.shown, trees=trees[o])
            thr = mi.shown[place[mi.shown] == M.THROUGH]

            def seen(x, i=i, o=o, smp=smp):
                nonlocal bnrm
                if (i, o) not in sight:
                    hide, push = both[i, o]
                    if bnrm is None:
                        bnrm = vertex_normals(bv, btris)
                    sight[i, o] = Sight(bv - depth * push[:, None] * bnrm, btris, M.drawn_tris(btris, hide))
                return not sight[i, o].covered(smp[x])
            where = f'under {o}, {at}'
            v, x, found = _per_part(thr, dist, ipart, seen, tol)
            if v > lay.get((i, 'inner'), (-1,))[0]:
                lay[i, 'inner'] = (v, where, ipart(x) if x is not None else None)
            cases.setdefault((i, 'inner'), []).extend((p, o, pv, where) for p, pv, _x in found)
            place, dist = S['vol'][o].where(gv[o], smp, reach, ids=mi.hidden, trees=trees[o])
            v, x, found = _per_part(mi.hidden[place[mi.hidden] == M.OUT], dist, ipart, _always, tol)
            if v > lay.get((i, 'innerHole'), (-1,))[0]:
                lay[i, 'innerHole'] = (v, where, ipart(x) if x is not None else None)
            cases.setdefault((i, 'innerHole'), []).extend((p, o, pv, where) for p, pv, _x in found)
        for (i, col), (v, where, part) in lay.items():
            _note(worst[i], col, v, where, tol, part, cname, cases.get((i, col), ()))
    return c, worst


def selftest():
    """Occlusion counts only drawn skin; a residual below tolerance stays
    measured (needs Blender's mathutils)."""
    from mathutils.bvhtree import BVHTree

    def box(x0, x1, y0, y1, z0, z1):
        v = [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
        q = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (1, 5, 7, 3), (0, 2, 6, 4)]
        return v, [t for a, b, c, d in q for t in ((a, b, c), (a, c, d))]
    # an arm point pressed into a thigh: occluded while the thigh is drawn,
    # shown once the mask hides the thigh's triangles
    av, at = box(-0.05, 0.05, -0.05, 0.05, 0.0, 1.0)
    tv, tt = box(0.0, 0.4, -0.2, 0.2, 0.3, 0.7)
    v = av + tv
    tris = at + [tuple(i + len(av) for i in t) for t in tt]
    full = BVHTree.FromPolygons(v, tris, all_triangles=True)
    arm_only = BVHTree.FromPolygons(v, at, all_triangles=True)
    q = (0.05 + 0.003, 0.0, 0.5)
    assert _occluded(full, None, q) and _occluded(full, full, q)
    assert not _occluded(full, arm_only, q), 'a hidden thigh occludes nothing'
    # a shown sample 0.002 from a drawn thigh is not buried by its probe,
    # whatever the tolerance (0.003 would have crossed the gap)
    gv, gt = box(0.052, 0.4, -0.2, 0.2, 0.3, 0.7)
    gap = BVHTree.FromPolygons(av + gv, at + [tuple(i + len(av) for i in t) for t in gt], all_triangles=True)
    s, n = np.array([0.05, 0.0, 0.5]), np.array([1.0, 0.0, 0.0])
    assert _occluded(gap, None, s + 0.003 * n), 'the old tolerance probe crossed the gap'
    assert not _occluded(gap, None, s + PROBE * n), 'a probe off its own skin stays outside'
    # the largest accepted value is kept, below tolerance too
    ids, dist = np.array([0, 1, 2]), np.array([0.002, 0.001, 0.0005])
    assert _first_shown(ids, dist, lambda k: k != 0) == (0.001, 1)
    r = _empty()
    _note(r, 'shown', 0.001, 'x', 0.003)
    assert r['shown']['value'] == 0.001 and r['shown']['over'] == 0
    # a case over tolerance is named (column, clip, part, outer garment); every
    # value, below tolerance too, is kept per column and clip; the column counts
    # a pose once, every failing body part and outer garment is its own case
    _note(r, 'inner', 0.01, 'a', 0.003, 'thigh', 'walk', [('thigh', 'g-cloak', 0.01, 'a')])
    _note(r, 'inner', 0.02, 'b', 0.003, 'thigh', 'walk', [('thigh', 'g-cloak', 0.02, 'b'), ('hip', 'g-cape', 0.005, 'b'),
                                                           ('arm', 'g-cape', 0.002, 'b')])
    _note(r, 'inner', 0.002, 'c', 0.003, 'arm', 'dig', [('arm', 'g-cloak', 0.002, 'c')])
    assert r['cases'] == {('inner', 'walk', 'thigh', 'g-cloak'): {'value': 0.02, 'at': 'b', 'over': 2},
                          ('inner', 'walk', 'hip', 'g-cape'): {'value': 0.005, 'at': 'b', 'over': 1}}, r['cases']
    assert r['clips'] == {'inner walk': 0.02, 'inner dig': 0.002}, r['clips']
    assert r['inner']['over'] == 2
    # every failing body part is found, each with its own worst ACCEPTED value
    ids, dist = np.array([0, 1, 2, 3]), np.array([0.05, 0.04, 0.02, 0.001])
    part = {0: 'thigh', 1: 'thigh', 2: 'hip', 3: 'arm'}.get
    assert _per_part(ids, dist, part, lambda k: k != 0, 0.003) == (0.04, 1, [('hip', 0.02, 2), ('thigh', 0.04, 1)])
    assert _per_part(ids, dist, part, lambda k: False, 0.003) == (0.0, None, [])
    # visible only: a point inside the body is covered only when the body as
    # drawn is closed; any hidden triangle — far, small, or behind a drawn
    # part that blocks its centre — counts the point as seen
    bv_, bt_ = box(0.0, 0.4, -0.2, 0.2, 0.3, 0.7)
    bt_ = np.array(bt_)
    inner_pt, outside = (0.02, 0.0, 0.5), (0.6, 0.0, 0.5)
    allv = np.ones(len(bt_), bool)
    assert Sight(bv_, bt_, allv).covered(inner_pt), 'inside a fully drawn thigh'
    assert not Sight(bv_, bt_, allv).covered(outside), 'outside the body'
    assert not Sight(bv_, bt_, ~allv).covered(inner_pt), 'inside a hidden thigh'
    far = np.array([all(bv_[k][0] == 0.4 for k in t) for t in bt_])
    half = far & (np.cumsum(far) == 1)
    assert not Sight(bv_, bt_, ~half).covered(inner_pt), 'seen through half a hidden side'
    # a partly obstructed opening: a drawn plate inside the thigh blocks the
    # line toward the hole's centre while its edge stays in sight
    pv, pt = box(0.3, 0.31, -0.05, 0.05, 0.45, 0.55)
    ov = bv_ + pv
    ot = np.concatenate([bt_, np.array(pt) + len(bv_)])
    od = np.concatenate([~half, np.ones(len(pt), bool)])
    assert not Sight(ov, ot, od).covered(inner_pt), 'seen past a part blocking the hole centre'
    # the pushed body is what is drawn: a point between the skin as built and
    # the skin pushed in lies outside the drawn body and is seen
    pushed_v = np.array(bv_)
    pushed_v[pushed_v[:, 0] == 0.0, 0] = 0.03
    assert Sight(bv_, bt_, allv).covered(inner_pt) and not Sight(pushed_v, bt_, allv).covered(inner_pt)
    print('penetration selftest: ok')


def vertex_normals_faces(v, tris):
    t = np.asarray(tris)
    f = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
    return f / np.maximum(np.linalg.norm(f, axis=1), 1e-12)[:, None]


def measure(body, clips, garments, cfg, stride=1, names=None, clip_names=None, corners=None, workers=None, log=print):
    """Each garment's worst values over the poses of `clip_names` (default:
    every exported clip) at `corners`, with the garments' cover masks."""
    import multiprocessing as mp
    names = names or M.garment_names(garments)
    jidx, jw = top4(body['W'])
    pose = M.build_pose(body)
    a = cfg['VILLAGER_ASSET']
    _S.update(body=body, clips=clips, garments=garments, cfg=cfg, stride=stride, names=names,
              gskin={n: top4(garments['meshes'][n]['W']) for n in names}, jidx=jidx, jw=jw,
              dom=np.argmax(body['W'], 1), bones=__import__('skeleton').NAMES,
              gdom={n: np.argmax(garments['meshes'][n]['W'], 1) for n in names}, gnv={n: len(garments['meshes'][n]['pos']) for n in names},
              tol=a['garmentPenetrationTolerance'], cut=a['garmentMaskCutTolerance'], clip_names=clip_names or EXPORT_CLIPS,
              vol={n: M.Volume(pose(garments['meshes'][n]['pos'], garments['meshes'][n]['W']), garments['meshes'][n]['tris']) for n in names},
              faces={n: face_points(garments['meshes'][n]['tris'], garments['meshes'][n]['pos'], a['garmentFaceSpacing']) for n in names})
    corners = corners or CORNERS
    workers = workers or max(1, min(len(corners), (os.cpu_count() or 2) - 1))
    worst = {n: _empty() for n in names}
    with mp.get_context('fork').Pool(workers) as pool:
        for (sex, age, build), part in pool.imap(_corner, corners):
            for n, r in part.items():
                t = worst[n]
                t['checked'] += r['checked']
                for key, v in r['clips'].items():
                    t['clips'][key] = max(t['clips'].get(key, 0.0), v)
                for key, e in r['cases'].items():
                    m = t['cases'].setdefault(key, {'value': 0.0, 'at': None, 'over': 0})
                    m['over'] += e['over']
                    if e['value'] > m['value']:
                        m['value'], m['at'] = e['value'], e['at']
                for col in COLUMNS:
                    t[col]['over'] += r[col]['over']
                    if r[col]['value'] > t[col]['value']:
                        t[col].update(value=r[col]['value'], at=r[col]['at'], part=r[col]['part'])
            log(f'penetration: {sex} {age} {build:+.0f} done')
    return worst, _S['tol']


def build_pose_clips(body, clips):
    """`clips` with the build pose (garments.design_pose, its hips at rest)
    as a one-frame clip named 'build'."""
    from garments import design_pose
    c = dict(clips)
    c['clips'] = dict(clips['clips'])
    c['clips']['build'] = {'kind': 'pose', 'times': [0.0], 'q': [design_pose(body)], 'hips': [None]}
    return c


def _limit(col, a, tol):
    return a['garmentMaskCutTolerance'] if col == 'cut' else tol


def _table(worst, a, tol, checked_label):
    lines = [
        '| Garment | ' + ' | '.join(f'{c} | where | frames over (of {checked_label})' for c in ('Cloth', 'Shown', 'Hole', 'Cut', 'Inner', 'Inner hole')) + ' |',
        '| --- |' + ' --- | --- | --- |' * len(COLUMNS),
    ]
    bad = 0
    for n, r in sorted(worst.items()):
        cells, fine = [], True
        for col in COLUMNS:
            v = r[col]
            ok = v['value'] <= _limit(col, a, tol)
            fine = fine and ok
            where = (v['at'] or '—') + (' — ' + v['part'] if v.get('part') else '')
            cells.append(f'{v["value"]:.4f}{"" if ok else " ✗"} | {where} | {v["over"]}')
        bad += 0 if fine else 1
        lines.append(f'| `{n}` | ' + ' | '.join(cells) + ' |')
    return lines, bad


NAMES = {'cloth': 'cloth in the body', 'shown': 'skin through the cloth', 'hole': 'hidden skin out by an opening',
         'cut': 'hidden skin past the cloth', 'inner': 'inner garment through the cloth', 'innerHole': 'hidden inner garment out by an opening'}


def report(out, body, clips, garments, cfg, stride=1, baseline=None):
    """The report: the build pose, every pose, every remaining case named, and
    — with `baseline` (a penetration-report.json of main's garments measured by
    this same step) — every garment, column and clip worse than there."""
    a = cfg['VILLAGER_ASSET']
    build, tol = measure(body, build_pose_clips(body, clips), garments, cfg, clip_names=['build'])
    worst, tol = measure(body, clips, garments, cfg, stride)
    frames = sum(1 for _ in GP.poses(clips, EXPORT_CLIPS, cfg))
    lines = [
        '# Garment penetration report',
        '',
        f'Generated by `node scripts/villager/build.mjs` (step `penetration`). Every frame of the clips {", ".join(EXPORT_CLIPS)} '
        f'({frames} poses: every frame, a gait\'s at strides {", ".join(f"{k:g}" for k in GP.strides(cfg))}{"" if stride == 1 else f"; every {stride}th"}), '
        f'at {len(CORNERS)} body corners (both sexes × four age groups, and the adult man at build −1 and +1), skinned along the game\'s own path '
        f'(scripts/villager/gamepath.py), on WHAT THE GAME DRAWS: each garment\'s cover mask (scripts/villager/mask.py) applied — the body\'s triangles '
        f'hidden under it left out, its covered vertices pushed VILLAGER_ASSET.garmentMaskPush = {a["garmentMaskPush"]} inward; covered within '
        f'garmentMaskOpening = {a["garmentMaskOpening"]} of an opening means pushed, not hidden. No per-pose garment offsets.',
        '',
        'ONLY WHAT IS SEEN COUNTS. Cloth = how deep a garment vertex or a point of the cloth between its vertices (about garmentFaceSpacing = '
        f'{a["garmentFaceSpacing"]} apart) lies under DRAWN skin (skin the mask hides shows nothing). Shown = how far a drawn body point the garment covers lies outside it '
        'through the cloth, unless drawn skin of another body part encloses it. Inner = how far a drawn point of a garment of an inner layer (mask.LAYER: '
        'ornament, then hip and head, torso, shoulder) shows through a garment of an outer layer covering it, unless it lies inside the body as drawn while both are worn (pushed in) '
        'and that body hides no triangle (through any hidden one it is seen); the part of it the outer garment\'s mask hides does not count. Hole / inner hole = how far a hidden body point / hidden inner-garment point has '
        'left the garment by an opening (a hole where skin or cloth should be is seen). Cut = how far a hidden body point lies past the cloth '
        f'(tolerance garmentMaskCutTolerance = {a["garmentMaskCutTolerance"]}: the cloth drawn where the body bulges past it is what hiding is for, '
        'a limb cut off is not). A column counts a frame once per garment (its worst layering); every failing body part — and for a layering every '
        'failing outer garment — is named as its own case. '
        'Every value is the measured maximum, below tolerance too. Figure units (1 unit ≈ 1.3 m); '
        f'tolerance (VILLAGER_ASSET.garmentPenetrationTolerance): {tol}.',
        '',
        '## Build pose',
        '',
        'The pose every garment is tailored in (garments.design_pose), as the game draws it, at every body corner.',
        '',
    ]
    t, bad_build = _table(build, a, tol, build[next(iter(build))]['checked'])
    lines += t + ['', f'**{len(build) - bad_build} of {len(build)} garments within tolerance in the build pose at every body corner and layering.**', '',
                  '## Every pose', '',
                  f'Frames over (of N) = the frames (pose × corner; N = {worst[next(iter(worst))]["checked"]} per garment, every '
                  f'{"" if stride == 1 else f"{stride}th of the "}{frames} poses at {len(CORNERS)} corners) in which that column exceeds its tolerance; '
                  'a frame counts once per garment however many layerings or samples fail in it.', '']
    t, bad = _table(worst, a, tol, worst[next(iter(worst))]['checked'])
    lines += t + ['', f'**{len(worst) - bad} of {len(worst)} garments within tolerance in every frame and layering** '
                  f'({worst[next(iter(worst))]["checked"]} poses × corners each).', '',
                  '## Remaining visible cases (handed to work-order point 1334)', '',
                  'Every case over its tolerance, by garment: what is seen, the body part (of the inner garment for a layering), the clip, the outer garment of a '
                  'layering, its worst value with where, and in how many frames it is over (clip `build`: the build pose). Each is handed to work-order point 1334 (garment motion cases).', '']
    for n, r in sorted(worst.items()):
        cases = sorted((build[n]['cases'] | r['cases']).items(), key=lambda kv: -kv[1]['value'])
        if not cases:
            continue
        lines.append(f'- `{n}`: ' + '; '.join(
            f'{NAMES[col]} — {part} — {clip}{f" under `{o}`" if o else ""} — {e["value"]:.4f} ({e["at"]}), {e["over"]} frames'
            for (col, clip, part, o), e in cases))
    lines.append('')
    worse = []
    if baseline:
        main = json.load(open(baseline))
        if 'build' not in main:
            raise RuntimeError(f'penetration: the baseline {baseline} has no build-pose measurement (`build`)')
        lines += ['## Against main', '',
                  'Main\'s garments measured by this same step (same poses, corners and rules), in the build pose and in every pose. A garment, column and '
                  'clip is WORSE when it is over tolerance and more than 0.0005 above main\'s value (clip `build`: the build pose).', '']
        for now, base in ((build, main['build']), (worst, main['garments'])):
            for n, r in sorted(now.items()):
                for key, v in sorted(r['clips'].items()):
                    col = key.split(' ')[0]
                    b = base.get(n, {}).get('clips', {}).get(key, 0.0)
                    if v > _limit(col, a, tol) and v > b + 0.0005:
                        worse.append(f'- `{n}` {key}: {b:.4f} on main → {v:.4f}')

        def within(w):
            return sum(1 for r in w.values() if all(r[c]['value'] <= _limit(c, a, tol) for c in COLUMNS))
        lines += [f'Main: {within(main["build"])} of {len(main["build"])} garments within tolerance in the build pose, '
                  f'{within(main["garments"])} of {len(main["garments"])} in every frame and layering; now {len(build) - bad_build} and {len(worst) - bad}.', '']
        lines += (worse or ['No garment, column and clip is worse than on main, in the build pose or any other.']) + ['']
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, 'penetration-report.md'), 'w').write('\n'.join(lines))

    def plain(w):
        return {n: {k: ({' '.join(str(x) for x in kk): vv for kk, vv in v.items()} if k == 'cases' else v) for k, v in r.items()} for n, r in w.items()}
    json.dump({'tolerance': tol, 'stride': stride, 'build': plain(build), 'garments': plain(worst)},
              open(os.path.join(out, 'penetration-report.json'), 'w'), indent=1)
    print('\n'.join(lines))
    # a garment failing only in the build pose fails the step too
    return sum(1 for n in worst if any(r[n][c]['value'] > _limit(c, a, tol) for r in (build, worst) for c in COLUMNS))
