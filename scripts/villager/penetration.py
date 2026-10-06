"""The per-frame garment penetration report (work-order "glTF villager body",
final state 6): for EVERY frame of EVERY exported clip and for every age/sex
corner and build extreme, every garment is skinned with the body exactly as the
game skins it (same weights, same morphs, same skeleton), and each garment
vertex's depth inside the body is its distance to the skinned body's surface,
every vertex judged inside or outside by the body's winding number round it
(fit.py `inside`, `depths`), never by the nearest face's normal. The skinning is the GAME'S path
(gamepath.py): the corner's mesh hung and baked, then skinned by the hung
bones; a gait's frames also at the shortest and longest stride the game warps
it to; each garment with its per-frame baked
offsets (resolve.py). The report lists, per garment, the
deepest penetration and where; the pipeline fails the penetration step when any
depth exceeds VILLAGER_ASSET.garmentPenetrationTolerance.

Written to verification/villager-body/penetration-report.md (and .json).
"""
import json
import os

import numpy as np

import gamepath as GP
import resolve as RS
from body import top4
from export import EXPORT_CLIPS
from fit import depths, garment_pos
from sheets import corner_weights, morphed

CORNERS = [(s, a, 0.0) for s in ('male', 'female') for a in ('child', 'youth', 'adult', 'elder')] + [('male', 'adult', -1.0), ('male', 'adult', 1.0)]


_S = {}


def _corner(c):
    """One body corner: every pose, every garment, its worst depths."""
    from mathutils.bvhtree import BVHTree
    S = _S
    body, garments, gnames, gskin, tol = S['body'], S['garments'], S['gnames'], S['gskin'], S['tol']
    sex, age, build = c
    w = corner_weights(sex, age, build)
    pos, j = morphed(body, w)
    person = GP.Person(j)
    bh = person.bake(pos, S['jidx'], S['jw'])
    gh = {n: person.bake(garment_pos(garments['meshes'][n], w), *gskin[n]) for n in gnames}
    worst = {n: {'depth': 0.0, 'at': None, 'over': 0, 'checked': 0} for n in gnames}
    for k, (cname, f, kst, q, hips) in enumerate(GP.poses(S['clips'], S['clip_names'], S['cfg'])):
        if k % S['stride']:
            continue
        # the baked table's own index for this pose, whichever clips are measured
        pk = S['keys'].get((cname, f, kst)) if S['keys'] is not None else None
        wr, wp = person.pose(q, hips, kst)
        bv = person.skin(bh, S['jidx'], S['jw'], wr, wp)
        tree = BVHTree.FromPolygons(bv.tolist(), body['tris'].tolist(), all_triangles=True)
        for n in gnames:
            gb = gh[n]
            ro = None if pk is None else RS.person_offsets(garments['meshes'][n], w, pk)
            if ro is not None:
                gb = gb.copy()
                gb[ro[0]] += ro[1]
            gv = person.skin(gb, *gskin[n], wr, wp)
            d, _co, _n = depths(tree, gv)
            deepest = max(0.0, float(d.max()))
            r = worst[n]
            r['checked'] += 1
            r['over'] += 1 if deepest > tol else 0
            if deepest > r['depth']:
                r['depth'] = deepest
                r['at'] = f'{cname} frame {f}{"" if kst == 1 else f" stride {kst:g}"} ({sex} {age} build {build:+.0f})'
    return c, worst


def measure(body, clips, garments, cfg, stride=1, names=None, clip_names=None, corners=None, workers=None, log=print):
    """Each garment's worst depth over the poses of `clip_names` (default:
    every exported clip) at `corners`, with its baked offsets: the table is
    checked against the current clips first (resolve.check_table) and each
    pose's offsets are found by (clip, frame, stride)."""
    import multiprocessing as mp
    gnames = names or [n for n in garments['meshes'] if n.startswith('g-')]
    baked = any(garments['meshes'][n].get('baked') is not None for n in gnames)
    jidx, jw = top4(body['W'])
    _S.update(body=body, clips=clips, garments=garments, cfg=cfg, stride=stride, gnames=gnames,
              gskin={n: top4(garments['meshes'][n]['W']) for n in gnames}, jidx=jidx, jw=jw,
              tol=cfg['VILLAGER_ASSET']['garmentPenetrationTolerance'], clip_names=clip_names or EXPORT_CLIPS,
              keys=RS.check_table(garments, clips, cfg) if baked else None)
    corners = corners or CORNERS
    workers = workers or max(1, min(len(corners), (os.cpu_count() or 2) - 1))
    worst = {n: {'depth': 0.0, 'at': None, 'over': 0, 'checked': 0} for n in gnames}
    with mp.get_context('fork').Pool(workers) as pool:
        for (sex, age, build), part in pool.imap(_corner, corners):
            for n, r in part.items():
                t = worst[n]
                t['checked'] += r['checked']
                t['over'] += r['over']
                if r['depth'] > t['depth']:
                    t['depth'], t['at'] = r['depth'], r['at']
            log(f'penetration: {sex} {age} {build:+.0f} done')
    return worst, _S['tol']


def report(out, body, clips, garments, cfg, stride=1):
    worst, tol = measure(body, clips, garments, cfg, stride)
    frames = sum(1 for _ in GP.poses(clips, EXPORT_CLIPS, cfg))
    lines = [
        '# Garment penetration report',
        '',
        f'Generated by `node scripts/villager/build.mjs` (step `penetration`). Every frame of the clips {", ".join(EXPORT_CLIPS)} '
        f'({frames} poses: every frame, a gait\'s at strides {", ".join(f"{k:g}" for k in GP.strides(cfg))}{"" if stride == 1 else f"; every {stride}th"}), at {len(CORNERS)} body corners (both sexes × four age groups, and the adult man at build −1 and +1); '
        f'each garment alone on the body with its per-frame baked offsets (scripts/villager/resolve.py), skinned along the game\'s own path (the hung, baked mesh skinned by the hung bones; scripts/villager/gamepath.py). Depth = how far a garment vertex lies inside the skinned body: its distance to the body\'s surface, inside or outside decided for every vertex by the body\'s winding number '
        f'(figure units; 1 unit ≈ 1.3 m). Tolerance (VILLAGER_ASSET.garmentPenetrationTolerance): {tol}.',
        '',
        '| Garment | Deepest | Where | Frames over tolerance |',
        '| --- | --- | --- | --- |',
    ]
    bad = 0
    for n, r in sorted(worst.items()):
        ok = r['depth'] <= tol
        bad += 0 if ok else 1
        lines.append(f'| `{n}` | {r["depth"]:.4f}{"" if ok else " ✗"} | {r["at"] or "—"} | {r["over"]} / {r["checked"]} |')
    lines += ['', f'**{len(worst) - bad} of {len(worst)} garments within tolerance in every frame.**', '']
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, 'penetration-report.md'), 'w').write('\n'.join(lines))
    json.dump({'tolerance': tol, 'stride': stride, 'garments': worst}, open(os.path.join(out, 'penetration-report.json'), 'w'), indent=1)
    print('\n'.join(lines))
    return bad
