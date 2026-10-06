"""Frame sheets of the villager body, its clips and its dress (judged by eye)."""
import os

import numpy as np

import render as R
import gamepath as GP
import rig
import skeleton as SK
from body import top4, MORPHS

SKIN = (0.36, 0.22, 0.14, 1)


def morphed(body, weights):
    pos = body['pos'].copy()
    j = body['joints'].copy()
    for k, w in weights.items():
        if w:
            pos += w * body['morph_pos'][k]
            j += w * body['joint_deltas'][k]
    return pos, j


def corner_weights(sex, age, build=0.0):
    w = {m: 0.0 for m in MORPHS}
    f = sex == 'female'
    if f:
        w['female'] = 1
    if age != 'adult':
        w[age] = 1
        if f:
            w[age + '_f'] = 1
    if build < 0:
        w['slight'] = -build
    if build > 0:
        w['stout'] = build
    return w


def rest_q():
    return np.tile([0, 0, 0, 1.0], (len(SK.NAMES), 1))


def body_sheet(out, body):
    R.clear()
    jidx, jw = top4(body['W'])
    x = 0.0
    for sex in ('male', 'female'):
        for age in ('child', 'youth', 'adult', 'elder'):
            pos, j = morphed(body, corner_weights(sex, age))
            wr, wp = rig.fk(j, rest_q())
            v = rig.skin(pos, jidx, jw, j, wr, wp)
            v[:, 0] += x
            R.add_mesh(f'{sex}-{age}', v, body['tris'], SKIN)
            x += 0.75
    R.ground(-0.5, x, -0.5, 0.5)
    R.render(os.path.join(out, 'body-morphs-front.png'), (x / 2 - 0.4, 0.7, 0), x + 0.3, 'front', (2000, 560))
    R.render(os.path.join(out, 'body-morphs-quarter.png'), (x / 2 - 0.4, 0.7, 0), x + 0.3, 30, (2000, 560))


def sheets(out, mh, body, clips, garments, cfg, only=''):
    want = set(only.split(',')) if only else None
    if not want or 'body' in want:
        body_sheet(out, body)
    if garments and (not want or 'garments' in want):
        garment_sheet(out, body, clips, garments, cfg, 'walk', 0.3, view='front')
        garment_sheet(out, body, clips, garments, cfg, 'walk', 0.3, view='side')
    if garments and clips and (not want or 'dress' in want):
        # the shipped garments in motion: four outfits through walk, kneel and dig
        for name in DRESS_CLIPS:
            for k, (sex, age, outfit) in enumerate(OUTFITS):
                clip_sheet(out, body, clips, name, frames=8, view=35, spacing=1.0, sex=sex, age=age,
                           fname=f'dress-{name}-{k}.png', garments=garments, outfit=outfit, cfg=cfg)
    if clips:
        for name in clips['clips']:
            if not want or name in want or 'clips' in want:
                wide = name in ('dig', 'carry', 'carryIdle', 'kneelDown', 'kneelUp')
                clip_sheet(out, body, clips, name, frames=8 if wide else 10, spacing=0.95 if wide else None)
                if wide:
                    clip_sheet(out, body, clips, name, frames=8, view=35, spacing=1.0, fname=f'clip-{name}-quarter.png')


def sample(clip, t):
    """Pose (local quats, hips position) of a clip at time t (looping)."""
    from gltfio import qslerp
    times = clip['times']
    d = clip['duration']
    t = t % d if clip.get('kind') in ('gait', 'loop') else min(max(t, 0), d)
    k = min(len(times) - 2, int(np.searchsorted(times, t, side='right') - 1))
    k = max(0, k)
    f = (t - times[k]) / max(1e-9, times[k + 1] - times[k])
    q = np.array([qslerp(clip['q'][k, i], clip['q'][k + 1, i], f) for i in range(len(SK.NAMES))])
    hips = clip['hips'][k] * (1 - f) + clip['hips'][k + 1] * f
    return q, hips


def clip_sheet(out, body, clips, name, frames=10, view='side', spacing=None, sex='male', age='adult', extra=None, fname=None, garments=None, outfit=(), cfg=None):
    R.clear()
    jidx, jw = top4(body['W'])
    cw = corner_weights(sex, age)
    pos, j = morphed(body, cw)
    from resolve import drawn_garment, offsets_at
    person = GP.Person(j)
    baked = person.bake(pos, jidx, jw)
    c = clips['clips'][name]
    d = c['duration']
    spacing = spacing if spacing is not None else (0.55 if view == 'side' else 0.75)
    span = spacing * (frames - 1)
    for f in range(frames):
        t = d * f / frames if c['kind'] in ('gait', 'loop') else d * f / (frames - 1)
        q, hips = sample(c, t)
        wr, wp = rig.fk(j, q, hips)
        v = person.skin(baked, jidx, jw, wr, wp)
        if view == 'side':
            v[:, 2] += f * spacing - span / 2
        else:
            v[:, 0] += f * spacing - span / 2
        R.add_mesh(f'f{f}', v, body['tris'], SKIN)
        for k, n in enumerate(outfit):
            g = garments['meshes'][n]
            gv = drawn_garment(person, g, cw, wr, wp, offsets_at(g, cw, c, name, t))
            if view == 'side':
                gv[:, 2] += f * spacing - span / 2
            else:
                gv[:, 0] += f * spacing - span / 2
            R.add_mesh(f'f{f}-{n}', gv, garments['meshes'][n]['tris'], GARMENT_COLOURS[k % len(GARMENT_COLOURS)])
        if c.get('tool'):
            tv, tt = shovel_mesh(body, c['tool'], wr, wp, cfg_shovel(clips))
            if view == 'side':
                tv[:, 2] += f * spacing - span / 2
            else:
                tv[:, 0] += f * spacing - span / 2
            R.add_mesh(f't{f}', tv, tt, (0.42, 0.3, 0.16, 1))
    R.ground(-span / 2 - 0.5, span / 2 + 0.5, -span / 2 - 0.5, span / 2 + 0.5)
    w = span + 1.0
    R.render(os.path.join(out, fname or f'clip-{name}-{view}.png'), (0, 0.65, 0), w, view, (int(260 * w), int(260 * 1.6)))


def cfg_shovel(clips):
    return clips['shovel']


def box(cx, cy, cz, hx, hy, hz):
    v = np.array([[x, y, z] for x in (-hx, hx) for y in (-hy, hy) for z in (-hz, hz)]) + [cx, cy, cz]
    t = [[0, 1, 3], [0, 3, 2], [4, 6, 7], [4, 7, 5], [0, 4, 5], [0, 5, 1], [2, 3, 7], [2, 7, 6], [0, 2, 6], [0, 6, 4], [1, 5, 7], [1, 7, 3]]
    return v, np.array(t)


def shovel_geometry(sh):
    """The shovel in its own frame (+y to the handle, blade at -y, face +z)."""
    sv, st = box(0, (sh['top'] + sh['shaftBottom']) / 2, 0, sh['shaftRadius'], (sh['top'] - sh['shaftBottom']) / 2, sh['shaftRadius'])
    bv, bt = box(0, (sh['shaftBottom'] + sh['tip']) / 2, 0, sh['bladeWidth'] / 2, (sh['shaftBottom'] - sh['tip']) / 2, sh['bladeThickness'] / 2)
    return np.concatenate([sv, bv]), np.concatenate([st, bt + len(sv)])


def shovel_mesh(body, tool, wr, wp, sh):
    import toolclips as T
    pos, rot = T.tool_from_hand(body, tool['hand'], wr, wp, tool.get('thumbUp', True))
    origin = pos - rot @ np.array([0, tool['grip'], 0])
    v, t = shovel_geometry(sh)
    return origin + v @ rot.T, t


DRESS_CLIPS = ('walk', 'kneelDown', 'kneel', 'kneelUp', 'dig')
OUTFITS = [
    ('male', 'adult', ('g-robe-chest', 'g-turban-aroundHead')),
    ('female', 'adult', ('g-wrapLong-chest', 'g-neckBeads-neck', 'g-headband-aroundHead')),
    ('male', 'elder', ('g-trousers-waist', 'g-shirt-chest', 'g-cloak-leftShoulder')),
    ('female', 'youth', ('g-skirtKnee-waist', 'g-cape-bothShoulders', 'g-limbRings-limbs')),
]
GARMENT_COLOURS = [(0.75, 0.68, 0.55, 1), (0.55, 0.25, 0.18, 1), (0.25, 0.3, 0.5, 1), (0.6, 0.5, 0.3, 1)]


def dressed(body, garments, names, weights, q, hips, clip=None, cname=None, t=0.0):
    """Body + garments for one pose along the game's path (gamepath.py), the
    garments' baked offsets at clip `cname`'s time `t` applied: list of
    (verts, tris, colour)."""
    from resolve import drawn_garment, offsets_at
    pos, j = morphed(body, weights)
    person = GP.Person(j)
    wr, wp = rig.fk(j, q, hips)
    jidx, jw = top4(body['W'])
    out = [(person.skin(person.bake(pos, jidx, jw), jidx, jw, wr, wp), body['tris'], SKIN)]
    for k, n in enumerate(names):
        g = garments['meshes'][n]
        col = (0.08, 0.06, 0.05, 1) if g.get('part') == 'hair' else (0.95, 0.95, 0.92, 1) if g.get('part') == 'eyes' else GARMENT_COLOURS[k % len(GARMENT_COLOURS)]
        off = offsets_at(g, weights, clip, cname, t) if clip is not None else None
        out.append((drawn_garment(person, g, weights, wr, wp, off), g['tris'], col))
    return out


def garment_sheet(out, body, clips, garments, cfg, clip='walk', t=0.3, per_row=8, view='side'):
    names = [n for n in garments['meshes'] if n.startswith('g-')]
    c = clips['clips'][clip]
    q, hips = sample(c, c['duration'] * t)
    w = corner_weights('male', 'adult')
    rows = [names[i:i + per_row] for i in range(0, len(names), per_row)]
    for r, row in enumerate(rows):
        R.clear()
        for k, n in enumerate(row):
            for v, tr, col in dressed(body, garments, ['hair', 'eyes', n], w, q, hips, c, clip, c['duration'] * t):
                v = v.copy()
                if view == 'side':
                    v[:, 2] += k * 0.8
                else:
                    v[:, 0] += k * 0.8
                R.add_mesh(f'{n}-{len(v)}', v, tr, col)
        span = (len(row) - 1) * 0.8
        R.ground(-0.6, span + 0.6, -0.6, span + 0.6)
        R.render(os.path.join(out, f'garments-{clip}-{view}-{r}.png'), (span / 2 if view != 'side' else 0, 0.68, span / 2 if view == 'side' else 0), span + 1.2, view, (int(240 * (span + 1.2)), 400))
