"""Picture inventory of the garments (work-order "garment rebuild", step 1):
every outfit the outfit generator can dress a villager in (enumerated by
build.mjs from src/systems/appearance.ts) on its sex/age body corner, through
walk, jog, sprint, kneel and dig (set `motion`) and the posable clavicles'
extremes on the idle (set `shoulders`), in the cached pipeline garments with
their cover mask — the frames sheets.py `clip_sheet` draws, laid out as a grid
(rows: outfits, columns: poses), each row and column labelled.

Run through `node scripts/villager/build.mjs inventory [--out <dir>]`. Reads
the body, clips and garments caches only when they were built from today's
inputs; it never rebuilds them (a stale cache raises)."""
import argparse
import json
import math
import os
import pickle
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import render as R  # noqa: E402
import gamepath as GP  # noqa: E402
import sheets as S  # noqa: E402
from body import top4  # noqa: E402

# (clip, fraction of its duration, column label)
POSES = [
    ('walk', 0.0, 'walk 0'), ('walk', 0.25, 'walk .25'), ('walk', 0.5, 'walk .5'), ('walk', 0.75, 'walk .75'),
    ('jog', 0.0, 'run 0'), ('jog', 0.5, 'run .5'), ('sprint', 0.25, 'sprint .25'),
    ('kneel', 0.5, 'kneel'), ('dig', 0.3, 'dig .3'), ('dig', 0.7, 'dig .7'),
]
# the posable clavicles at the extremes of VILLAGER_POSE.shoulders on the idle's
# first frame (penetration.py `with_shoulders`): (clip, variant index, label)
SHOULDERS = [('idle', 0.0, 'idle'), ('shoulders', 0, 'fwd'), ('shoulders', 1, 'up'), ('shoulders', 2, 'down'),
             ('shoulders', 3, 'fwd+up'), ('shoulders', 4, 'fwd+down')]
# the walk cycle side-on in eight phases at the game's stride scales
# (gamepath.strides: VILLAGER_GLTF stride range), for the user-report outfits
WALKCYCLE = [('walk', k / 8, f'walk {k}/8', st) for st in (1.0, 1.35) for k in range(0, 8, 2)] + \
    [('jog', k / 4, f'run {k}/4 x1.35', 1.35) for k in range(4)]
SETS = {'motion': POSES, 'shoulders': SHOULDERS, 'walkcycle': WALKCYCLE}
ROWS = 5
COL = 0.8
ROW = 2.05
PX = 230


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--config', required=True)
    p.add_argument('--work', required=True)
    p.add_argument('--outfits', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--prefix', default='1347-inventory')
    p.add_argument('--views', default='35,215')
    p.add_argument('--sets', default='motion,shoulders')
    p.add_argument('--ids', default='', help='only these outfit ids (comma list)')
    return p.parse_args(argv)


def load(work, name, key):
    v = pickle.load(open(os.path.join(work, name + '.pkl'), 'rb'))
    if v.get('_inputs') != key:
        raise RuntimeError(f'inventory: the {name} cache was built from other inputs — run the pipeline first')
    return v


def frame(body, garments, clips, sex, age, outfit, cfg, clip, frac, stride=1.0):
    """Body and worn garments of one outfit in one clip pose: [(verts, tris, rgba)]."""
    jidx, jw = top4(body['W'])
    cw = S.corner_weights(sex, age)
    pos, j = S.morphed(body, cw)
    person = GP.Person(j)
    baked = person.bake(pos, jidx, jw)
    btris, bpush, inner = S.masked(body, garments, list(outfit), cfg)
    c = clips['clips'][clip]
    if clip == 'shoulders':
        import penetration as P
        q = P.shoulders_q(person, c['q'][frac], c['shoulders'][frac])
        hips = c['hips'][frac]
    else:
        q, hips = S.sample(c, c['duration'] * frac)
    wr, wp = person.pose(q, hips, stride)
    out = [(S.push_in(person.skin(baked, jidx, jw, wr, wp), body['tris'], bpush, cfg), btris, S.SKIN)]
    for k, n in enumerate(outfit):
        g = garments['meshes'][n]
        gt, gp = inner[n]
        out.append((S.push_in(GP.drawn_garment(person, g, cw, wr, wp), g['tris'], gp, cfg), gt, S.GARMENT_COLOURS[k % len(S.GARMENT_COLOURS)]))
    if c.get('tool'):
        out.append((*S.shovel_mesh(body, c['tool'], wr, wp, S.cfg_shovel(clips)), (0.42, 0.3, 0.16, 1)))
    return out


def main():
    a = args()
    cfg = json.load(open(a.config))
    import cachekeys as CK
    keys = CK.step_keys(cfg)
    body = load(a.work, 'body', keys['body'])
    clips = load(a.work, 'clips', keys['clips'])
    garments = load(a.work, 'garments', keys['garments'])
    import hashlib
    import mask as MK
    mkey = keys['garments'] + hashlib.sha256(open(MK.__file__, 'rb').read()).hexdigest() + MK.motion_key(body)
    garments['mask'] = load(a.work, 'mask', mkey)
    import penetration as P
    clips = P.with_shoulders(clips, cfg)
    outfits = list(enumerate(json.load(open(a.outfits))['outfits']))
    if a.ids:
        want = {int(i) for i in a.ids.split(',')}
        outfits = [(i, o) for i, o in outfits if i in want]
    os.makedirs(a.out, exist_ok=True)
    index = []
    pages = [outfits[i:i + ROWS] for i in range(0, len(outfits), ROWS)]
    for name in a.sets.split(','):
        poses = SETS[name]
        ncol = len(poses)
        width = COL * (ncol - 1) + 1.0
        for view in [float(v) for v in a.views.split(',')]:
            az = math.radians(view)
            right = np.array([math.cos(az), 0.0, -math.sin(az)])
            for p, page in enumerate(pages):
                R.clear()
                for r, (oid, o) in enumerate(page):
                    up = (len(page) - 1 - r) * ROW
                    missing = [n for n in o['garments'] if n not in garments['meshes']]
                    if missing:
                        raise RuntimeError(f'inventory: {missing} not built')
                    for c, (clip, frac, _l, *st) in enumerate(poses):
                        off = right * (c * COL - (ncol - 1) * COL / 2) + np.array([0, up, 0])
                        for k, (v, t, col) in enumerate(frame(body, garments, clips, o['sex'], o['age'], o['garments'], cfg, clip, frac, *st)):
                            R.add_mesh(f'r{r}c{c}k{k}', v + off, t, col)
                    text = f"#{oid} {o['sex']} {o['age']}: " + '  '.join(n[2:] for n in o['garments'])
                    R.label(text, np.array([0, up + 1.45, 0]), 0.075, view, S.LABEL)
                for c, (_clip, _f, lab, *_st) in enumerate(poses):
                    R.label(lab, right * (c * COL - (ncol - 1) * COL / 2) + np.array([0, -0.18, 0]), 0.07, view, S.LABEL)
                lo, hi = -0.25, (len(page) - 1) * ROW + 1.6
                fname = f"{a.prefix}-{name}-az{int(view)}-{p:02d}.png"
                # Blender's ortho scale spans the picture's longer side
                R.render(os.path.join(a.out, fname), (0.0, (lo + hi) / 2, 0.0), max(width, hi - lo), view, (int(PX * width), int(PX * (hi - lo))))
                for r, (oid, o) in enumerate(page):
                    index.append({'file': fname, 'row': r, 'id': oid, **o})
    json.dump(index, open(os.path.join(a.out, f"{a.prefix}-{a.sets.replace(',', '-')}-index.json"), 'w'), indent=1)


if __name__ == '__main__':
    main()
    sys.stdout.flush()
    os._exit(0)
