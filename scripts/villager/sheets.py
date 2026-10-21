"""Frame sheets of the villager body, its clips and its dress (judged by eye)."""
import math
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


def hand_sheet(out, body):
    """The hand shapes close up (natural-villager-motion step 3): the adult
    man's right hand, left to right relaxed, closed round a shaft and pointing,
    as the morph deltas put them on the rest body. verification/villager-body/
    hands-<view>.png"""
    from body import HAND_SHAPES
    jidx, jw = top4(body['W'])
    base = corner_weights('male', 'adult')
    hand = SK.INDEX['hand.R']
    # the hand alone: the triangles skinned mostly to it
    on = body['W'][:, hand] > 0.4
    tris = body['tris'][on[body['tris']].all(1)]
    for view in ('front', 'side', 35):
        cam = view if view != 'side' else 'other'
        # the shapes side by side across the picture, along the camera's
        # screen right (perpendicular to its view: +x from the front, +z for
        # 'other' looking along +x); spaced along x, the side view stacked
        # them into the screen
        a = np.radians(hand_azimuth(cam))
        across = np.array([np.cos(a), 0.0, -np.sin(a)])
        R.clear()
        x = 0.0
        for k, shape in enumerate(HAND_SHAPES):
            w = dict(base, **{f'{shape}.R': 1.0})
            pos, j = morphed(body, w)
            wr, wp = rig.fk(j, rest_q())
            v = rig.skin(pos, jidx, jw, j, wr, wp)
            c = wp[hand]
            v = v - c + x * across
            R.add_mesh(f'hand-{shape}', v, tris, SKIN)
            R.label(shape, x * across + np.array([0, -0.13, 0.0]), 0.03, cam, LABEL)
            x += 0.2
        R.render(os.path.join(out, f"hands-{view if isinstance(view, str) else 'az' + str(view)}.png"),
                 tuple((x / 2 - 0.1) * across + np.array([0, -0.05, 0])), x + 0.05, cam, (1500, 600))


def hand_azimuth(view):
    """A view's camera azimuth (deg) as render.py reads it."""
    return {'side': 90.0, 'front': 0.0, 'back': 180.0, 'other': -90.0}.get(view, view)


def selftest_hand_layout():
    """The hand sheet's spacing runs across every view's picture: it is
    perpendicular to the camera's view direction (no Blender needed)."""
    for view in ('front', 'other', 35):
        a = np.radians(hand_azimuth(view))
        across = np.array([np.cos(a), 0.0, -np.sin(a)])
        look = np.array([np.sin(a), 0.0, np.cos(a)])
        assert abs(float(across @ look)) < 1e-12 and abs(np.linalg.norm(across) - 1) < 1e-12, view
    print('sheets hand layout selftest: ok')


def sheets(out, mh, body, clips, garments, cfg, only=''):
    want = set(only.split(',')) if only else None
    if not want or 'body' in want:
        body_sheet(out, body)
    if not want or 'hands' in want:
        hand_sheet(out, body)
    if garments and (not want or 'garments' in want):
        garment_sheet(out, body, clips, garments, cfg, 'walk', 0.3, view='front')
        garment_sheet(out, body, clips, garments, cfg, 'walk', 0.3, view='side')
    if garments and (not want or 'build' in want):
        # every garment in its own build pose, on the neutral man and the
        # body corners farthest from him (a girl, a stout man)
        for corner, tag in ((('male', 'adult'), 'man'), (('female', 'child'), 'girl'), (('male', 'adult', 1.0), 'stout')):
            for view in ('front', 'side'):
                garment_sheet(out, body, clips, garments, cfg, 'build', view=view, corner=corner, fname=f'garments-build-{tag}-{view}')
    if garments and clips and (not want or 'dress' in want):
        # the shipped garments in motion: four outfits through walk, kneel and dig
        for name in DRESS_CLIPS:
            for k, (sex, age, outfit) in enumerate(outfits(garments)):
                clip_sheet(out, body, clips, name, frames=8, view=35, spacing=1.0, sex=sex, age=age,
                           fname=f'dress-{name}-{k}.png', garments=garments, outfit=outfit, cfg=cfg)
    if clips and (not want or 'gait' in want):
        # per gait clip its support intervals, contact fraction and knee bend
        from gaitplots import gait_plots
        gait_plots(out, body, clips)
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
    person = GP.Person(j)
    baked = person.bake(pos, jidx, jw)
    btris, bpush, inner = masked(body, garments, outfit, cfg)
    gm = worn_meshes(body, garments, outfit, cw, cfg)
    c = clips['clips'][name]
    d = c['duration']
    spacing = spacing if spacing is not None else (0.55 if view == 'side' else 0.75)
    span = spacing * (frames - 1)
    for f in range(frames):
        t = d * f / frames if c['kind'] in ('gait', 'loop') else d * f / (frames - 1)
        q, hips = sample(c, t)
        wr, wp = person.pose(q, hips)
        bv = person.skin(baked, jidx, jw, wr, wp)
        v = push_in(bv, body['tris'], bpush, cfg)
        if view == 'side':
            v[:, 2] += f * spacing - span / 2
        else:
            v[:, 0] += f * spacing - span / 2
        R.add_mesh(f'f{f}', v, btris, SKIN)
        for k, n in enumerate(outfit):
            g = gm[n]
            gt, gp = inner[n]
            gv = push_in(GP.drawn_garment(person, g, cw, wr, wp), g['tris'], gp, cfg, source_normals(g, bv, body['tris']))
            if view == 'side':
                gv[:, 2] += f * spacing - span / 2
            else:
                gv[:, 0] += f * spacing - span / 2
            R.add_mesh(f'f{f}-{n}', gv, gt, GARMENT_COLOURS[k % len(GARMENT_COLOURS)])
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


DRESS_CLIPS = ('walk', 'sprint', 'kneelDown', 'kneel', 'kneelUp', 'dig')
OUTFITS = [
    ('male', 'adult', ('g-robe-chest', 'g-turban-aroundHead')),
    ('female', 'adult', ('g-wrapLong-chest', 'g-neckBeads-neck', 'g-headband-aroundHead')),
    ('male', 'elder', ('g-trousers-waist', 'g-shirt-chest', 'g-cloak-chest')),
    ('female', 'youth', ('g-skirtKnee-waist', 'g-cape-chest', 'g-limbRings-limbs')),
    # every shell garment at once (shells.py): their seams over one another
    ('female', 'adult', ('g-trousers-waist', 'g-breastCloth-chest', 'g-neckBeads-neck', 'g-neckBeads-chest', 'g-waistBeads-waist')),
]


def outfits(garments):
    """OUTFITS resolved against the built garments: each id itself when it
    was built, else the same form in another wear (the first built); a form
    no longer built at all raises (a renamed garment never silently empties
    an outfit)."""
    have = [n for n in garments['meshes'] if n.startswith('g-')]
    out = []
    for sex, age, outfit in OUTFITS:
        worn = []
        for n in outfit:
            form = n.split('-')[1]
            alt = n if n in have else next((m for m in have if m.split('-')[1] == form), None)
            if alt is None:
                raise RuntimeError(f'sheets: outfit garment {n} (form {form}) is not built (garments: {", ".join(have)})')
            worn.append(alt)
        out.append((sex, age, tuple(worn)))
    return out


GARMENT_COLOURS = [(0.75, 0.68, 0.55, 1), (0.55, 0.25, 0.18, 1), (0.25, 0.3, 0.5, 1), (0.6, 0.5, 0.3, 1)]


def masked(body, garments, worn, cfg):
    """The game's cover mask for an outfit `worn` (mask.py): the body's drawn
    triangles and pushed vertices, and per worn garment the same under the
    worn garments of an outer layer — (tris, push, {name: (tris, push)})."""
    import mask as MK
    import shells as SHL
    mk = (garments or {}).get('mask')
    worn = [n for n in worn if n.startswith('g-')]
    if mk is None or cfg is None:
        return body['tris'], None, {n: (garments['meshes'][n]['tris'], None) for n in worn}
    # the shells (shells.py): the body's faces under them cut, each built with
    # its hidden-source cut and its sources' push
    keep, sd = SHL.corner_dress(body, garments, worn, {}, cfg)
    legacy = [n for n in worn if n in mk['garments']]
    hide, push = MK.decode(mk['body'], mk['garments'], legacy)
    inner = {n: (x['tris'], x['push']) for n, x in sd.items()}
    for n in legacy:
        over = [o for o in legacy if MK.layer(o) > MK.layer(n)]
        h, p = MK.decode(mk['inner'][n], mk['garments'], over)
        t = garments['meshes'][n]['tris']
        inner[n] = (t[MK.drawn_tris(t, h)], p)
    return body['tris'][MK.drawn_tris(body['tris'], hide) & keep], push, inner


def worn_meshes(body, garments, worn, weights, cfg):
    """name → the mesh drawn for each worn garment at the body corner
    `weights`: the garment itself, or a shell built at that corner."""
    import shells as SHL
    if not garments:
        return {}
    sd = SHL.corner_dress(body, garments, worn, weights, cfg)[1] if cfg is not None and 'region_bits' in body else {}
    return {n: sd.get(n, garments['meshes'].get(n)) for n in worn}


def push_in(v, tris, push, cfg, normals=None, depth=None):
    """Posed positions with the mask's pushed vertices moved inward (the game's vertex shader)."""
    if push is None or not push.any():
        return v
    import mask as MK
    depth = cfg['VILLAGER_ASSET']['garmentMaskPush'] if depth is None else depth
    if normals is not None:
        # a shell: along its copied source normals
        return v - depth * push.astype(float)[:, None] * normals
    return MK.pushed(v, tris, push.astype(float), depth)


def source_normals(g, body_v, body_tris):
    """A shell's push direction: its source body vertices' normals on the posed
    body `body_v` (shells copy the source normal, shells.py); None for a
    legacy garment (pushed along its own normals)."""
    if g.get('part') != 'shell':
        return None
    from body import vertex_normals
    return vertex_normals(body_v, np.asarray(body_tris))[g['src']]


def dressed(body, garments, names, weights, q, hips, cfg=None):
    """Body + garments for one pose along the game's path (gamepath.py), the
    cover mask of the garments among `names` applied: list of (verts, tris, colour)."""
    pos, j = morphed(body, weights)
    person = GP.Person(j)
    wr, wp = person.pose(q, hips)
    jidx, jw = top4(body['W'])
    btris, bpush, inner = masked(body, garments, names, cfg)
    gm = worn_meshes(body, garments, names, weights, cfg)
    bv = person.skin(person.bake(pos, jidx, jw), jidx, jw, wr, wp)
    out = [(push_in(bv, body['tris'], bpush, cfg), btris, SKIN)]
    for k, n in enumerate(names):
        g = gm[n]
        col = (0.08, 0.06, 0.05, 1) if g.get('part') == 'hair' else (0.95, 0.95, 0.92, 1) if g.get('part') == 'eyes' else GARMENT_COLOURS[k % len(GARMENT_COLOURS)]
        gt, gp = inner.get(n, (g['tris'], None))
        out.append((push_in(GP.drawn_garment(person, g, weights, wr, wp), g['tris'], gp, cfg, source_normals(g, bv, body['tris'])), gt, col))
    return out


def garment_sheet(out, body, clips, garments, cfg, clip='walk', t=0.3, per_row=8, view='side', corner=('male', 'adult'), fname=None):
    names = [n for n in garments['meshes'] if n.startswith('g-')]
    if clip == 'build':
        # the build pose every garment is tailored in (garments.design_pose)
        from garments import design_pose
        q, hips = design_pose(body), None
    else:
        c = clips['clips'][clip]
        q, hips = sample(c, c['duration'] * t)
    w = corner_weights(*corner)
    rows = [names[i:i + per_row] for i in range(0, len(names), per_row)]
    for r, row in enumerate(rows):
        R.clear()
        for k, n in enumerate(row):
            for v, tr, col in dressed(body, garments, ['hair', 'eyes', n], w, q, hips, cfg):
                v = v.copy()
                if view == 'side':
                    v[:, 2] += k * 0.8
                else:
                    v[:, 0] += k * 0.8
                R.add_mesh(f'{n}-{len(v)}', v, tr, col)
        span = (len(row) - 1) * 0.8
        R.ground(-0.6, span + 0.6, -0.6, span + 0.6)
        R.render(os.path.join(out, (fname or f'garments-{clip}-{view}') + f'-{r}.png'), (span / 2 if view != 'side' else 0, 0.68, span / 2 if view == 'side' else 0), span + 1.2, view, (int(240 * (span + 1.2)), 400))


# ---- the runtime composition (gamepath.py runtime_*; build.mjs exports it) -------


LABEL = (0.98, 0.95, 0.6, 1)


def _view_name(view, elevation):
    name = 'side (from the right)' if view == 'side' else view if isinstance(view, str) else f'azimuth {view:g}°'
    return name + (f', elev {elevation:g}°' if elevation else '')


def runtime_sheets(out, body, clips, garments, cfg, rt):
    """Per subject and camera a strip of the game's OWN composed pose (the
    runtime export, its round trip already checked): body, worn garments with
    their cover mask and the shovel, skinned by the exported bones exactly as
    three skins them, the root's rotation and scale kept and its travel taken
    out. Every frame labelled with its time and camera.
    verification/villager-body/runtime-<subject>-<view>.png"""
    from fit import garment_pos
    a = cfg['VILLAGER_ASSET']
    jidx, jw = top4(body['W'])
    sv, st = shovel_geometry(a['shovel'])
    for s in rt['subjects']:
        person, pos, w = GP.runtime_person(body, s, cfg)
        baked = person.bake(pos, jidx, jw)
        hand = GP.runtime_hand_deltas(person, pos, body, jidx, jw)
        missing = [n for n in s['garments'] if not garments or n not in garments['meshes']]
        if missing:
            raise RuntimeError(f"runtime sheets: {s['id']} wears {missing}, absent from the built garments — rebuild them (--step garments)")
        worn = list(s['garments'])
        btris, bpush, inner = masked(body, garments, worn, cfg)
        gm = worn_meshes(body, garments, worn, w, cfg)
        gskin = {n: top4(gm[n]['W']) for n in worn}
        gbaked = {n: person.bake(garment_pos(gm[n], w), *gskin[n]) for n in worn}
        h = s['identity']['scale']
        elev = s.get('elevation', 0)

        def drawn(f, v, ji, jw_, tris, push, normals=None):
            # the mask push in the figure mesh's own space (pipeline unit → figure:
            # the person's scale), THEN the root with its squash, as three draws it;
            # `normals` a callable giving a shell's source normals in that space
            v = GP.runtime_skin(s, f, v, ji, jw_, 'figure')
            v = push_in(v, tris, push, cfg, normals and normals(), a['garmentMaskPush'] * s['person']['scale'])
            root = GP.runtime_root(f)
            return v @ root[:3, :3].T + root[:3, 3]
        for view in s['views']:
            R.clear()
            side = view == 'side'
            # the side strip from the figure's right (+z to the right): time and travel run left to right
            cam_view = 'other' if side else view
            az = math.radians({'other': -90.0, 'front': 0.0}.get(cam_view, cam_view))
            # the strip runs along the camera's screen-right (horizontal at any elevation)
            right = np.array([math.cos(az), 0.0, -math.sin(az)])
            spacing = (0.6 if side else 0.8 if view == 'front' else 1.0) * h
            n = len(s['frames'])
            span = spacing * (n - 1)
            cam = _view_name(view, elev)
            top = 0.0
            for k, f in enumerate(s['frames']):
                off = right * (k * spacing - span / 2)
                at = np.array([f['root']['p'][0], 0.0, f['root']['p'][2]])
                move = off - at
                fb = baked + GP.runtime_hands(f, hand)
                bv = drawn(f, fb, jidx, jw, body['tris'], bpush)
                R.add_mesh(f'f{k}', bv + move, btris, SKIN)
                top = max(top, float(bv[:, 1].max()))
                # a shell's push along its source normals on the posed (unpushed) body, figure space
                bfig = lambda: GP.runtime_skin(s, f, fb, jidx, jw, 'figure')  # noqa: E731
                for c, g in enumerate(worn):
                    gt, gp = inner[g]
                    sn = (lambda g=g: source_normals(gm[g], bfig(), body['tris'])) if gm[g].get('part') == 'shell' else None
                    gv = drawn(f, gbaked[g], *gskin[g], gm[g]['tris'], gp, sn)
                    R.add_mesh(f'f{k}-{g}', gv + move, gt, GARMENT_COLOURS[c % len(GARMENT_COLOURS)])
                    top = max(top, float(gv[:, 1].max(initial=top)))
                tool = GP.runtime_tool(f)
                if tool is not None:
                    R.add_mesh(f't{k}', sv @ tool[:3, :3].T + tool[:3, 3] + move, st, (0.42, 0.3, 0.16, 1))
                R.label(f"{f['t']:.2f} s", off + [0, -0.13 * h, 0], 0.085 * h, cam_view, LABEL)
            # the title above the tallest frame, the image tall enough for it
            title_y = top + 0.06 * h
            R.label(f"{s['title']} | camera {cam} | runtime composition (game code), travel removed",
                    np.array([0.0, title_y, 0.0]), 0.075 * h, cam_view, LABEL)
            R.ground(-span / 2 - 0.5 * h, span / 2 + 0.5 * h, -span / 2 - 0.5 * h, span / 2 + 0.5 * h)
            wide = span + 1.1 * h
            lo, hi = -0.22 * h, title_y + 0.14 * h
            R.render(os.path.join(out, f"runtime-{s['id']}-{view if isinstance(view, str) else 'az' + str(view)}.png"),
                     (0, (lo + hi) / 2, 0), wide, cam_view, (int(300 * wide / h), int(300 * (hi - lo) / h)), elevation=elev)
