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
          the winding number (fit.inside), its nearest body point on a drawn
          triangle;
  shown   how far a drawn body point (vertex or triangle centre) the garment
          covers lies outside the cloth, through it (mask.Volume.where; a
          point pressed into another body part is hidden there);
  hole    how far a hidden body point has left the garment by an opening
          (missing skin seen at a hem or a sleeve).

And per garment worn under each garment of another slot that covers part of
it (every outfit layering), the same with the inner garment's own mask:
`inner` how far a drawn covered point of it shows through the outer cloth,
`inner hole` how far a hidden one has left the outer garment by an opening.

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
COLUMNS = ('cloth', 'shown', 'hole', 'inner', 'innerHole')

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


def _buried(tree, pts, nrm, eps):
    """Whether each point lies against another body part: `eps` off it along
    its normal is inside the body."""
    from fit import inside
    return np.fromiter((inside(tree, (p + eps * n).tolist()) for p, n in zip(pts, nrm)), bool, len(pts))


def _empty():
    return {c: {'value': 0.0, 'at': None, 'over': 0} for c in COLUMNS} | {'checked': 0}


def _note(r, col, v, at, tol):
    c = r[col]
    if v > tol:
        c['over'] += 1
    if v > c['value']:
        c['value'], c['at'] = float(v), at


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
            # cloth inside the drawn (pushed) body
            tree = full if not mb.any else BVHTree.FromPolygons(bp.tolist(), body['tris'].tolist(), all_triangles=True)
            fi, fw = S['faces'][n]
            pts = np.concatenate([gv[n], np.einsum('kj,kji->ki', fw, gv[n][fi])])
            d, _co, _n = depths(tree, pts)
            if mb.any and (d > tol).any():
                for i in np.nonzero(d > tol)[0]:
                    if not mb.drawn[tree.find_nearest(pts[i].tolist())[2]]:
                        d[i] = 0.0
            _note(r, 'cloth', max(0.0, float(d.max())), at, tol)
            if not mb.any:
                continue
            # covered skin through the cloth; hidden skin out by an opening
            place, dist = S['vol'][n].where(gv[n], smp, reach, ids=mb.shown, trees=trees[n])
            thr = mb.shown[(place[mb.shown] == M.THROUGH) & (dist[mb.shown] > tol)]
            if len(thr):
                fn = np.concatenate([nrm, vertex_normals_faces(bp, body['tris'])])
                thr = thr[~_buried(tree, smp[thr], fn[thr], tol)]
            _note(r, 'shown', float(dist[thr].max()) if len(thr) else 0.0, at, tol)
            place, dist = S['vol'][n].where(gv[n], smp, reach, ids=mb.hidden, trees=trees[n])
            out = mb.hidden[place[mb.hidden] == M.OUT]
            _note(r, 'hole', float(dist[out].max()) if len(out) else 0.0, at, tol)
        for i, o, mi in pairs:
            _ip, smp, _nrm = mi.drawn_at(gv[i], depth)
            place, dist = S['vol'][o].where(gv[o], smp, reach, ids=mi.shown, trees=trees[o])
            thr = mi.shown[(place[mi.shown] == M.THROUGH)]
            _note(worst[i], 'inner', float(dist[thr].max()) if len(thr) else 0.0, f'under {o}, {at}', tol)
            place, dist = S['vol'][o].where(gv[o], smp, reach, ids=mi.hidden, trees=trees[o])
            out = mi.hidden[place[mi.hidden] == M.OUT]
            _note(worst[i], 'innerHole', float(dist[out].max()) if len(out) else 0.0, f'under {o}, {at}', tol)
    return c, worst


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
              tol=a['garmentPenetrationTolerance'], clip_names=clip_names or EXPORT_CLIPS,
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
                        t[col]['value'], t[col]['at'] = r[col]['value'], r[col]['at']
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
        'through the cloth. Hole = how far a hidden body point has left the garment by an opening. Inner / inner hole = the same for the garment '
        'worn under each garment of another slot covering part of it (its worst layering). Figure units (1 unit ≈ 1.3 m); '
        f'tolerance (VILLAGER_ASSET.garmentPenetrationTolerance): {tol}.',
        '',
        '| Garment | ' + ' | '.join(f'{c} | where | frames over' for c in ('Cloth', 'Shown', 'Hole', 'Inner', 'Inner hole')) + ' |',
        '| --- |' + ' --- | --- | --- |' * len(COLUMNS),
    ]
    bad = 0
    for n, r in sorted(worst.items()):
        cells, fine = [], True
        for col in COLUMNS:
            v = r[col]
            ok = v['value'] <= tol
            fine = fine and ok
            cells.append(f'{v["value"]:.4f}{"" if ok else " ✗"} | {v["at"] or "—"} | {v["over"]}')
        bad += 0 if fine else 1
        lines.append(f'| `{n}` | ' + ' | '.join(cells) + ' |')
    lines += ['', f'**{len(worst) - bad} of {len(worst)} garments within tolerance in every frame and layering** '
              f'({worst[next(iter(worst))]["checked"]} poses × corners each).', '']
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, 'penetration-report.md'), 'w').write('\n'.join(lines))
    json.dump({'tolerance': tol, 'stride': stride, 'garments': worst}, open(os.path.join(out, 'penetration-report.json'), 'w'), indent=1)
    print('\n'.join(lines))
    return bad
