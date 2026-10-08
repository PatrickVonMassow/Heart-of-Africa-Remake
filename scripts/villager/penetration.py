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

And per garment worn under each garment of another slot that covers part of
it (every outfit layering), the same with the inner garment's own mask:
`inner` how far a drawn covered point of it shows through the outer cloth,
`inner hole` how far a hidden one has left the outer garment by an opening;
per pose the worst outer garment, so a frame counts once.

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
        self.any = bool(push.any())

    def drawn_at(self, v, depth):
        """Pushed positions and samples (vertices, then triangle centres) for
        posed positions `v`, and the vertex normals used."""
        nrm = vertex_normals(v, self.tris)
        p = v - depth * self.push[:, None] * nrm
        return p, np.concatenate([p, p[self.tris].mean(1)]), nrm


def _occluded(full, drawn, q):
    """Whether point `q` lies inside the body under DRAWN skin: inside the whole
    body (`full`, every triangle) and inside by the drawn triangles alone
    (`drawn`; None: nothing hidden). A body part whose surface the mask hides
    there occludes nothing."""
    from fit import inside
    q = list(q)
    return inside(full, q) and (drawn is None or inside(drawn, q))


def _first_shown(ids, dist, keep):
    """The largest `dist` over the sample ids that `keep` accepts, tested in
    descending order (only up to the first accepted), and its id."""
    for k in ids[np.argsort(-dist[ids], kind='stable')]:
        if keep(k):
            return float(dist[k]), int(k)
    return 0.0, None


def _empty():
    return {c: {'value': 0.0, 'at': None, 'over': 0, 'part': None} for c in COLUMNS} | {'checked': 0}


def _note(r, col, v, at, tol, part=None):
    c = r[col]
    if v > tol:
        c['over'] += 1
    if v > c['value']:
        c['value'], c['at'], c['part'] = float(v), at, part


def _worst(ids, dist, part):
    """The largest `dist` over the sample ids and the body part (bone) of that sample."""
    if not len(ids):
        return 0.0, None
    k = ids[np.argmax(dist[ids])]
    return float(dist[k]), part(k)


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
             if i != o and M.SLOT[M.form(i)] != M.SLOT[M.form(o)]]
    pairs = [p for p in pairs if p[2].any]
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
            v, x = _first_shown(cand, val, lambda x: under[x] or _occluded(tree, dtree, pts[x]))
            _note(r, 'cloth', v, at, tol, bone(int(body['tris'][tri[x]][0])) if x is not None else None)
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
                return not _occluded(tree, dtree, smp[x] + tol * fn[x])
            v, x = _first_shown(thr, dist, visible)
            _note(r, 'shown', v, at, tol, bone(x) if x is not None else None)
            place, dist = S['vol'][n].where(gv[n], smp, reach, ids=mb.hidden, trees=trees[n])
            out = mb.hidden[place[mb.hidden] == M.OUT]
            v, part = _worst(out, dist, bone)
            _note(r, 'hole', v, at, tol, part)
            thr = mb.hidden[place[mb.hidden] == M.THROUGH]
            v, part = _worst(thr, dist, bone)
            _note(r, 'cut', v, at, S['cut'], part)
        # every layering, counted once per pose and inner garment: the worst
        # outer garment over it, so "frames over" never exceeds "checked"
        lay = {}
        for i, o, mi in pairs:
            _ip, smp, _nrm = mi.drawn_at(gv[i], depth)
            ipart = lambda k, i=i, mi=mi: S['bones'][S['gdom'][i][k if k < S['gnv'][i] else mi.tris[k - S['gnv'][i]][0]]]  # noqa: E731
            place, dist = S['vol'][o].where(gv[o], smp, reach, ids=mi.shown, trees=trees[o])
            thr = mi.shown[place[mi.shown] == M.THROUGH]
            v, part = _worst(thr, dist, ipart)
            if v > lay.get((i, 'inner'), (-1,))[0]:
                lay[i, 'inner'] = (v, f'under {o}, {at}', part)
            place, dist = S['vol'][o].where(gv[o], smp, reach, ids=mi.hidden, trees=trees[o])
            out = mi.hidden[place[mi.hidden] == M.OUT]
            v, part = _worst(out, dist, ipart)
            if v > lay.get((i, 'innerHole'), (-1,))[0]:
                lay[i, 'innerHole'] = (v, f'under {o}, {at}', part)
        for (i, col), (v, where, part) in lay.items():
            _note(worst[i], col, v, where, tol, part)
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
    # the largest accepted value is kept, below tolerance too
    ids, dist = np.array([0, 1, 2]), np.array([0.002, 0.001, 0.0005])
    assert _first_shown(ids, dist, lambda k: k != 0) == (0.001, 1)
    r = _empty()
    _note(r, 'shown', 0.001, 'x', 0.003)
    assert r['shown']['value'] == 0.001 and r['shown']['over'] == 0
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
                for col in COLUMNS:
                    t[col]['over'] += r[col]['over']
                    if r[col]['value'] > t[col]['value']:
                        t[col].update(value=r[col]['value'], at=r[col]['at'], part=r[col]['part'])
            log(f'penetration: {sex} {age} {build:+.0f} done')
    return worst, _S['tol']


def report(out, body, clips, garments, cfg, stride=1):
    worst, tol = measure(body, clips, garments, cfg, stride)
    a = cfg['VILLAGER_ASSET']
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
        'Cloth = how deep a garment vertex or a point of the cloth between its vertices (about garmentFaceSpacing = '
        f'{a["garmentFaceSpacing"]} apart) lies inside the drawn body. Shown = how far a drawn body point the garment covers lies outside it '
        'through the cloth. Hole = how far a hidden body point has left the garment by an opening. Cut = how far a hidden body point lies past the cloth '
        f'(tolerance garmentMaskCutTolerance = {a["garmentMaskCutTolerance"]}: the cloth drawn where the body bulges past it is what hiding is for, '
        'a limb cut off is not). Inner / inner hole = the same for the garment '
        'worn under each garment of another slot covering part of it: per pose the worst of its layerings, named by the outer garment '
        'and the inner garment\'s body part. Every value is the measured maximum, below tolerance too; drawn skin occludes, hidden skin '
        'does not. Figure units (1 unit ≈ 1.3 m); '
        f'tolerance (VILLAGER_ASSET.garmentPenetrationTolerance): {tol}.',
        '',
        f'Frames over (of N) = the frames (pose × corner; N = {worst[next(iter(worst))]["checked"]} per garment, every '
        f'{"" if stride == 1 else f"{stride}th of the "}{frames} poses at {len(CORNERS)} corners) in which that column exceeds its tolerance; '
        'a frame counts once per garment however many layerings or samples fail in it.',
        '',
        '| Garment | ' + ' | '.join(f'{c} | where | frames over (of {worst[next(iter(worst))]["checked"]})' for c in ('Cloth', 'Shown', 'Hole', 'Cut', 'Inner', 'Inner hole')) + ' |',
        '| --- |' + ' --- | --- | --- |' * len(COLUMNS),
    ]
    bad = 0
    for n, r in sorted(worst.items()):
        cells, fine = [], True
        for col in COLUMNS:
            v = r[col]
            ok = v['value'] <= (a['garmentMaskCutTolerance'] if col == 'cut' else tol)
            fine = fine and ok
            where = (v['at'] or '—') + (' — ' + v['part'] if v.get('part') else '')
            cells.append(f'{v["value"]:.4f}{"" if ok else " ✗"} | {where} | {v["over"]}')
        bad += 0 if fine else 1
        lines.append(f'| `{n}` | ' + ' | '.join(cells) + ' |')
    lines += ['', f'**{len(worst) - bad} of {len(worst)} garments within tolerance in every frame and layering** '
              f'({worst[next(iter(worst))]["checked"]} poses × corners each).', '']
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, 'penetration-report.md'), 'w').write('\n'.join(lines))
    json.dump({'tolerance': tol, 'stride': stride, 'garments': worst}, open(os.path.join(out, 'penetration-report.json'), 'w'), indent=1)
    print('\n'.join(lines))
    return bad
