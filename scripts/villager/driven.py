"""Driven garments (stage 3, docs/garment-stage3-plan-1398.md sections 3.2,
3.3, 3.8 to 3.10, 3.12 and 3.13): a form's panels hang from the bottom loop
of its waist band (a shell, shells.py), the junction, on the column bones
the game's driver poses (render/villagerSkirtDriver.ts).

Topology is frozen once on the basis body (adult man, no morph): the
junction loop's source vertices and order, the snapped panel boundaries,
each panel's row count, the column anchors (loop edge and t) and the
triangulation. At each of the ten corners only positions are evaluated on
those identities, and the basis plus the nine shape-morph deltas are solved
from the corners (body.morph_deltas, the same square system as the body's).

Row 0 is the band's offset row (source position + band offset along the
source normal); rows 1 to n run by fraction from the junction to the
panel's own hem, at radius hull + band offset + ease + flare (section 3.9).
Row 0 carries its source's body weights; rows 1 to 3 blend the source's two
heaviest body bones into the two nearest upper columns; lower rows ride the
upper columns alone (section 3.3).
"""
import math

import numpy as np

import skeleton as SK

# Per form its panels: name, centre angle, half width (the rendered legacy
# widths, section 3.10: the 24-sample grid kept |a| <= 0.5 in front, so its
# edges fell on +-pi/12, and |a| >= pi - 0.75 at the back, edges on
# pi -+ pi/6), and the hem height from the landmarks.
PANELS = {
    'loinFlap': (('front', 0.0, math.pi / 12, lambda L: L['hip'] - 0.10 * L['H']),
                 ('back', math.pi, math.pi / 6, lambda L: L['hip'] - 0.10 * L['H'])),
    'girdleTails': (('front', 0.0, math.pi / 12, lambda L: L['hip'] - 0.14 * L['H']),
                    ('back', math.pi, math.pi / 6, lambda L: L['knee'] + 0.05 * L['H'])),
}
FORMS = tuple(PANELS)
WEAR = 'waist'
BLEND_ROWS = 3  # rows 1..3 blend body into columns (f = 1/3, 2/3, 1)
SLAB = 0.012  # the hull's section half height (garments.Body.outline)
CORNERS = [(s, a, 0) for s in ('male', 'female') for a in ('child', 'youth', 'adult', 'elder')] + [('male', 'adult', -1), ('male', 'adult', 1)]
SHAPE_MORPHS = ['female', 'child', 'youth', 'elder', 'child_f', 'youth_f', 'elder_f', 'slight', 'stout']


def panel_name(form):
    return f'g-{form}-{WEAR}'


def band_name(form):
    return f'g-{form}-{WEAR}.band'


def driven_names(meshes):
    """The driven panels of garments['meshes'] (section 3.12)."""
    return [n for n in meshes if meshes[n].get('part') == 'driven']


def corner_weights(sex, age, build=0.0):
    """The morph weights of a corner (as sheets.corner_weights, without its Blender imports)."""
    w = {}
    if sex == 'female':
        w['female'] = 1.0
    if age != 'adult':
        w[age] = 1.0
        if sex == 'female':
            w[age + '_f'] = 1.0
    if build < 0:
        w['slight'] = -build
    if build > 0:
        w['stout'] = build
    return w


def angle_of(p, c):
    """The angle about the hips axis c (x, z): 0 the front (+z), +pi/2 the figure's left (+x)."""
    return np.arctan2(p[..., 0] - c[0], p[..., 2] - c[1])


def wrap(a):
    return (a + np.pi) % (2 * np.pi) - np.pi


def column_weights(a):
    """The two upper columns at angle a and their angular interpolation weights."""
    n = SK.COLUMN_COUNT
    x = (a % (2 * np.pi)) / (2 * np.pi / n)
    k0 = int(math.floor(x)) % n
    u = x - math.floor(x)
    return (k0, (k0 + 1) % n), (1 - u, u)


def ray_segment(c, d, p, q):
    """The ray c + s d (s > 0) against the segment p q (2-D): t on the segment or None."""
    e = q - p
    den = d[0] * (-e[1]) - d[1] * (-e[0])
    if abs(den) < 1e-12:
        return None
    r = p - c
    s = (r[0] * (-e[1]) - r[1] * (-e[0])) / den
    t = (d[0] * r[1] - d[1] * r[0]) / den
    if s <= 0 or t < -1e-9 or t > 1 + 1e-9:
        return None
    return float(min(1.0, max(0.0, t)))


def run(n, i0, i1):
    """The loop indices from i0 to i1 going forward round a loop of n."""
    out = [i0]
    while out[-1] != i1:
        out.append((out[-1] + 1) % n)
    return out


def snap(angles, target):
    """The loop index whose angle lies nearest the target angle."""
    return int(np.argmin(np.abs(wrap(angles - target))))


# ---- the frozen topology (section 3.8) ------------------------------------------------


def junction(band, pos):
    """The band's bottom boundary loop (body vertex ids)."""
    rows = band['rows']
    return list(min(rows, key=lambda r: float(pos[r, 1].mean())))


def freeze(form, loop, row0, hips_xz, yj, hems, H, spacing):
    """The frozen topology on the basis body: the loop ordered by increasing
    angle, per panel its loop members (boundaries snapped to loop vertices)
    and row count, the anchors (loop index, t) and the triangles."""
    a = angle_of(row0, hips_xz)
    if np.mean(wrap(np.roll(a, -1) - a)) < 0:
        loop, row0, a = loop[::-1], row0[::-1], a[::-1]
    n = len(loop)
    panels = []
    for (name, centre, half, _hem), hem in zip(PANELS[form], hems):
        i0, i1 = snap(a, centre - half), snap(a, centre + half)
        members = run(n, i0, i1)
        rows = max(BLEND_ROWS + 1, int(math.ceil((yj - hem) / (spacing * H) - 1e-9)))
        panels.append({'name': name, 'members': members, 'rows': rows, 'edges': (float(a[i0]), float(a[i1])),
                       'want': (wrap(centre - half), wrap(centre + half))})
    anchors = []
    for k, phi in enumerate(SK.column_angles()):
        d = np.array([math.sin(phi), math.cos(phi)])
        hit = None
        for i in range(n):
            t = ray_segment(hips_xz, d, row0[i, [0, 2]], row0[(i + 1) % n, [0, 2]])
            if t is not None:
                hit = (i, t)
                break
        if hit is None:
            raise AssertionError(f'driven {form}: column {k} meets no junction edge')
        anchors.append(hit)
    tris, base = [], 0
    for p in panels:
        m = len(p['members'])
        vid = lambda r, j, b=base, m=m: b + r * m + j  # noqa: E731
        for r in range(p['rows']):
            for j in range(m - 1):
                tris += [[vid(r, j), vid(r + 1, j), vid(r + 1, j + 1)], [vid(r, j), vid(r + 1, j + 1), vid(r, j + 1)]]
        p['base'] = base
        base += (p['rows'] + 1) * m
    return {'loop': list(loop), 'panels': panels, 'anchors': anchors, 'tris': np.array(tris, int), 'count': base}


# ---- one corner -----------------------------------------------------------------------


def hull_at(pos, keep, y):
    from garments import hull2d
    sel = keep & (np.abs(pos[:, 1] - y) < SLAB)
    if sel.sum() < 3:
        sel = keep & (np.abs(pos[:, 1] - y) < 3 * SLAB)
    return hull2d(pos[sel][:, [0, 2]])


def build_at(form, fz, pos, normals, joints, H, full, keep, off, ease, flare):
    """Panel positions (fz['count'] x 3) and the 24 column heads at one
    corner's rest body `pos` (normals, joints, stature H); the hull from the
    full-resolution body `full` where `keep` (the trunk and legs, no arms)."""
    from garments import landmarks, ray_hull
    L = landmarks(joints, H)
    hips = joints[SK.INDEX['hips']]
    c = np.array([hips[0], hips[2]])
    hips_y = float(hips[1])
    loop = np.array(fz['loop'])
    row0 = pos[loop] + off * normals[loop]
    yj = float(pos[loop, 1].mean())
    out = np.zeros((fz['count'], 3))
    hems = []
    hulls = {}
    for p, (_n, _c, _h, hemf) in zip(fz['panels'], PANELS[form]):
        hem = float(hemf(L))
        hems.append(hem)
        m = p['members']
        for r in range(p['rows'] + 1):
            s = r / p['rows']
            for j, i in enumerate(m):
                k = p['base'] + r * len(m) + j
                if r == 0:
                    out[k] = row0[i]
                    continue
                y = row0[i, 1] + s * (hem - row0[i, 1])
                key = round(float(y), 9)
                if key not in hulls:
                    hulls[key] = hull_at(full, keep, y)
                # the direction is the source's angle about the hips axis; the ray
                # starts at the section's own centre (as garments.Body.ring): below
                # the crotch a slight body's legs can lie behind the hips axis, and
                # a ray from the axis would then miss the hull
                d = row0[i, [0, 2]] - c
                d = d / np.linalg.norm(d)
                a = math.atan2(d[0], d[1])
                h = hulls[key]
                ch = h.mean(0)
                rad = ray_hull(h, ch, d) + off + ease * H + flare * hips_y * s * s * (0.45 + 0.55 * abs(math.sin(a)))
                out[k] = (ch[0] + d[0] * rad, y, ch[1] + d[1] * rad)
    heads = np.zeros((2 * SK.COLUMN_COUNT, 3))
    knee = 0.5 * (joints[SK.INDEX['shin.L'], 1] + joints[SK.INDEX['shin.R'], 1])
    for k, (i, t) in enumerate(fz['anchors']):
        a = (1 - t) * row0[i] + t * row0[(i + 1) % len(loop)]
        heads[k] = a
        heads[SK.COLUMN_COUNT + k] = (a[0], knee, a[2])
    return out, heads, {'yj': yj, 'hems': hems, 'knee': float(knee), 'row0': row0, 'hips': c}


def weights(fz, form, Wbody, row0_basis, hips_xz):
    """Per panel vertex its dense weights (section 3.3)."""
    from body import top4
    nb = Wbody.shape[1]
    W = np.zeros((fz['count'], nb))
    loop = fz['loop']
    a = angle_of(row0_basis, hips_xz)
    for p in fz['panels']:
        m = p['members']
        for r in range(p['rows'] + 1):
            f = min(1.0, r / BLEND_ROWS)
            for j, i in enumerate(m):
                k = p['base'] + r * len(m) + j
                idx, w = top4(Wbody[[loop[i]]])
                if r == 0:
                    W[k, idx[0]] = w[0]
                    continue
                if f < 1:
                    two = idx[0][:2]
                    ww = w[0][:2] / max(1e-12, w[0][:2].sum())
                    W[k, two] += (1 - f) * ww
                (k0, k1), (u0, u1) = column_weights(float(a[i]))
                W[k, SK.INDEX[f'col.U.{k0}']] += f * u0
                W[k, SK.INDEX[f'col.U.{k1}']] += f * u1
    W[W < 1e-9] = 0
    return W / W.sum(1, keepdims=True)


def uvs(fz, row0_basis, hips_xz):
    a = angle_of(row0_basis, hips_xz)
    uv = np.zeros((fz['count'], 2))
    for p in fz['panels']:
        m = p['members']
        for r in range(p['rows'] + 1):
            for j, i in enumerate(m):
                uv[p['base'] + r * len(m) + j] = ((a[i] + np.pi) / (2 * np.pi), r / p['rows'])
    return uv


# ---- the builder ----------------------------------------------------------------------


def corner_body(body, w):
    pos = body['pos'].copy()
    joints = body['joints'].copy()
    for m, x in w.items():
        if x:
            pos = pos + x * body['morph_pos'][m]
            joints = joints + x * body['joint_deltas'][m]
    return pos, joints


def full_body(body, w):
    """The full-resolution body at the morph weights `w` (additive, as the corners)."""
    full = body['basis_full'].copy()
    for m, x in w.items():
        if x:
            full = full + x * body['deltas_full'][m]
    return full


def stature(cfg, sex, age):
    a = cfg['VILLAGER_ASSET']
    return a['stature'] * a['statureFactor'][age][sex]


def build(body, band, form, cfg, keep, log=print):
    """The driven garment of `form` on the cut body (the shells' body):
    garments['meshes'] entry with pos (basis), tris, uv, W, morph_pos and its
    record `driven` (extras.villager.driven[form], section 3.12). `keep`:
    per full-resolution vertex, on the body and off the arms (the hull's set)."""
    from body import morph_deltas, vertex_normals
    from shells import offset
    A = cfg['VILLAGER_ASSET']
    D = A['drivenGarments']
    fc = D['forms'][form]
    off = offset(band, A['garmentShellStep'])
    tris = np.asarray(body['tris'])
    loop = junction(band, body['pos'])
    if len(loop) < D['minLoopVertices']:
        raise AssertionError(f'driven {form}: junction loop of {len(loop)} vertices, at least {D["minLoopVertices"]} needed')
    from garments import landmarks
    Hb = stature(cfg, 'male', 'adult')
    nrm0 = vertex_normals(body['pos'], tris)
    row0 = body['pos'][loop] + off * nrm0[loop]
    hips = body['joints'][SK.INDEX['hips']]
    c = np.array([hips[0], hips[2]])
    Lb = landmarks(body['joints'], Hb)
    hems = [float(h(Lb)) for _n, _c, _h, h in PANELS[form]]
    fz = freeze(form, loop, row0, c, float(body['pos'][loop, 1].mean()), hems, Hb, D['rowSpacing'])
    shapes, heads, info = {}, {}, {}
    for key in CORNERS:
        sex, age, b = key
        pos, joints = corner_body(body, corner_weights(sex, age, b))
        shapes[key], heads[key], info[key] = build_at(form, fz, pos, vertex_normals(pos, tris), joints, stature(cfg, sex, age),
                                                      full_body(body, corner_weights(sex, age, b)), keep, off, fc['ease'], fc['flare'])
    basis, deltas = morph_deltas(shapes)
    hbasis, hdeltas = morph_deltas(heads)
    from body import MORPHS
    for m in MORPHS:
        if m not in deltas:
            deltas[m] = np.zeros_like(basis)
            hdeltas[m] = np.zeros_like(hbasis)
    row0b = info[('male', 'adult', 0)]['row0']
    W = weights(fz, form, body['W'], row0b, c)
    uv = uvs(fz, row0b, c)
    src = np.full(fz['count'], -1, int)
    row = np.zeros(fz['count'], int)
    for p in fz['panels']:
        m = p['members']
        for r in range(p['rows'] + 1):
            for j, i in enumerate(m):
                k = p['base'] + r * len(m) + j
                row[k] = r
                if r == 0:
                    src[k] = fz['loop'][i]
    g = {'pos': basis, 'tris': fz['tris'], 'uv': uv, 'W': W, 'morph_pos': deltas, 'part': 'driven',
         'extras': {'form': form, 'wear': WEAR, 'bottom': float(basis[:, 1].min())}}
    loopv = fz['loop']
    g['driven'] = {
        'form': form, 'panel': panel_name(form), 'band': band_name(form),
        'src': [int(x) for x in src], 'row': [int(x) for x in row],
        'panels': {p['name']: {'rows': p['rows'], 'base': p['base'], 'width': len(p['members'])} for p in fz['panels']},
        'anchors': [[int(loopv[i]), int(loopv[(i + 1) % len(loopv)]), float(t)] for i, t in fz['anchors']],
        'heads': {'basis': [float(x) for x in hbasis.ravel()], 'deltas': {m: [float(x) for x in hdeltas[m].ravel()] for m in MORPHS}},
        'offset': float(off), 'ease': float(fc['ease']), 'flare': float(fc['flare']),
        'intervals': {p['name']: [info[('male', 'adult', 0)]['yj'], h] for p, h in zip(fz['panels'], hems)},
    }
    check(form, fz, g, shapes, heads, info, body, band, cfg, off, log)
    additive_report(body, form, cfg, fz, g, off, keep, log)
    log(f'[driven] {panel_name(form)}: {fz["count"]} vertices, {len(fz["tris"])} triangles, loop {len(loop)}, '
        + ', '.join(f'{p["name"]} {len(p["members"])} wide x {p["rows"]} rows' for p in fz['panels']))
    return g


# ---- the checks on the real build (section 5, pipeline selftests) ----------------------


def check(form, fz, g, shapes, heads, info, body, band, cfg, off, log=print):
    from body import vertex_normals
    import shells as SHL
    D = cfg['VILLAGER_ASSET']['drivenGarments']
    bad = []
    n = len(fz['loop'])
    # frozen topology: identical counts at every corner (positions only differ)
    if len({s.shape for s in shapes.values()}) != 1 or len({h.shape for h in heads.values()}) != 1:
        bad.append('corner shapes differ in count')
    # row 0 equals the band's drawn offset row where the band is drawn
    tris = np.asarray(body['tris'])
    nrm = vertex_normals(body['pos'], tris)
    fm = SHL.face_masks(body['region_bits'], tris)
    built = SHL.build(body['pos'], tris, nrm, fm, {band_name(form): band}, [band_name(form)], cfg['VILLAGER_ASSET']['garmentShellStep'])
    bt = built[band_name(form)]
    at = {int(s): k for k, (s, o) in enumerate(zip(bt['src'], bt['off'])) if abs(o - off) < 1e-12}
    src = np.array(g['driven']['src'])
    r0 = np.nonzero(src >= 0)[0]
    drawn = [k for k in r0 if int(src[k]) in at]
    if not drawn:
        bad.append('no row-0 vertex on a drawn band vertex')
    for k in drawn:
        d = float(np.linalg.norm(g['pos'][k] - bt['pos'][at[int(src[k])]]))
        if d > 1e-6:
            bad.append(f'row 0 vertex {k} off the band by {d:.2e}')
            break
    # weights: at most four influences, sum 1, body bones only in rows 0..3, no col.L
    W = g['W']
    if (np.count_nonzero(W, 1) > 4).any():
        bad.append('a vertex with more than four influences')
    if not np.allclose(W.sum(1), 1):
        bad.append('weights do not sum to 1')
    row = np.array(g['driven']['row'])
    body_bones = [SK.INDEX[b] for b in SK.NAMES if b not in SK.COLUMN_NAMES]
    lower = [SK.INDEX[b] for b in SK.COLUMN_NAMES if b.startswith('col.L')]
    if (W[row > BLEND_ROWS][:, body_bones] > 0).any():
        bad.append(f'body weight below row {BLEND_ROWS}')
    if (np.count_nonzero(W[(row >= 1) & (row < BLEND_ROWS)][:, body_bones], 1) > 2).any():
        bad.append('more than two body bones in a blend row')
    for key, inf in info.items():
        # no knee blend on these forms: every hem above the knee pivot
        # OPEN: the knee blend (section 3.3) is built with skirtKnee, the first form whose hem reaches below the pivot
        if any(h <= inf['knee'] for h in inf['hems']):
            bad.append(f'{key}: a hem at or below the knee pivot (no knee blend in this builder yet)')
    if (W[:, lower] > 0).any():
        bad.append('col.L weight on a panel above the knee')
    # rows end exactly at each panel's hem, at every corner
    for key, s in shapes.items():
        for p, hem in zip(fz['panels'], info[key]['hems']):
            m = len(p['members'])
            last = s[p['base'] + p['rows'] * m: p['base'] + (p['rows'] + 1) * m]
            if np.abs(last[:, 1] - hem).max() > 1e-9:
                bad.append(f'{key} {p["name"]}: hem row off its formula by {np.abs(last[:, 1] - hem).max():.2e}')
            if s[p['base']: p['base'] + (p['rows'] + 1) * m, 1].min() < hem - 1e-9:
                bad.append(f'{key} {p["name"]}: a row below its hem')
    # widths: the snapped edges within half a loop edge of the table (the
    # basis loop's largest angular step), the front at least minFrontQuads wide
    a = angle_of(info[('male', 'adult', 0)]['row0'], info[('male', 'adult', 0)]['hips'])
    step = float(np.abs(wrap(np.roll(a, -1) - a)).max())
    for p in fz['panels']:
        for got, want in zip(p['edges'], p['want']):
            if abs(wrap(got - want)) > 0.5 * step + 1e-9:
                bad.append(f'{p["name"]} edge {got:.3f} off {want:.3f} by more than half a loop edge')
        if p['name'] == 'front' and len(p['members']) - 1 < D['minFrontQuads']:
            bad.append(f'front {len(p["members"]) - 1} quads across, at least {D["minFrontQuads"]}')
    # the panel's triangles face outward
    v = g['pos'][fz['tris']]
    nf = np.cross(v[:, 1] - v[:, 0], v[:, 2] - v[:, 0])
    c = info[('male', 'adult', 0)]['hips']
    out = v.mean(1)[:, [0, 2]] - c
    if (np.einsum('ij,ij->i', nf[:, [0, 2]], out) <= 0).mean() > 0.05:
        bad.append('panel triangles face inward')
    # the additive deltas reproduce every corner exactly
    from body import MORPHS
    for key, s in shapes.items():
        w = corner_weights(*key)
        rec = g['pos'] + sum(x * g['morph_pos'][m] for m, x in w.items())
        if np.abs(rec - s).max() > 1e-9:
            bad.append(f'{key}: deltas miss the corner by {np.abs(rec - s).max():.2e}')
    if set(g['morph_pos']) != set(MORPHS):
        bad.append('morph set differs from MORPHS')
    if bad:
        raise AssertionError(f'driven {form}: ' + '; '.join(bad))
    log(f'[driven] {form}: checks ok (loop {n}, edge step {math.degrees(step):.1f} deg)')


def additive_report(body, form, cfg, fz, g, off, keep, log=print):
    """Section 3.8: the glTF deltas applied additively against a direct
    rebuild at builds -1, 0 and +1 per sex and age group (information)."""
    from body import vertex_normals
    fc = cfg['VILLAGER_ASSET']['drivenGarments']['forms'][form]
    tris = np.asarray(body['tris'])
    worst = (0.0, None)
    for sex in ('male', 'female'):
        for age in ('child', 'youth', 'adult', 'elder'):
            for b in (-1.0, 0.0, 1.0):
                w = corner_weights(sex, age, b)
                pos, joints = corner_body(body, w)
                direct = build_at(form, fz, pos, vertex_normals(pos, tris), joints, stature(cfg, sex, age), full_body(body, w), keep, off,
                                  fc['ease'], fc['flare'])[0]
                add = g['pos'] + sum(x * g['morph_pos'][m] for m, x in w.items())
                d = float(np.abs(add - direct).max())
                if d > worst[0]:
                    worst = (d, (sex, age, b))
    log(f'[driven] {form}: additive deltas against direct rebuilds, worst {worst[0] * 1000:.2f} mm at {worst[1]} (information)')
    return worst


# ---- selftest (no Blender) -------------------------------------------------------------


def selftest():
    # column weights: angular interpolation between neighbours, wrapping at 2 pi
    (k0, k1), (u0, u1) = column_weights(math.radians(15))
    assert (k0, k1) == (0, 1) and abs(u0 - 0.5) < 1e-12 and abs(u1 - 0.5) < 1e-12
    (k0, k1), (u0, u1) = column_weights(math.radians(-15))
    assert (k0, k1) == (11, 0) and abs(u0 - 0.5) < 1e-12
    # the ray meets a segment straddling it at its parameter
    t = ray_segment(np.zeros(2), np.array([0.0, 1.0]), np.array([-1.0, 2.0]), np.array([3.0, 2.0]))
    assert abs(t - 0.25) < 1e-12
    assert ray_segment(np.zeros(2), np.array([0.0, 1.0]), np.array([-1.0, -2.0]), np.array([3.0, -2.0])) is None
    # a toy loop: 48 vertices on a circle (running clockwise, so freeze reverses it)
    n, R = 48, 0.2
    ang = -np.arange(n) * 2 * np.pi / n
    row0 = np.stack([R * np.sin(ang), np.full(n, 1.0), R * np.cos(ang)], 1)
    fz = freeze('girdleTails', list(range(n)), row0, np.zeros(2), 1.0, [0.8, 0.5], 1.3, 0.03)
    a = angle_of(row0[fz['loop']], np.zeros(2))
    assert (wrap(np.roll(a, -1) - a) > 0).all()
    front, back = fz['panels']
    # snapped to loop vertices within half a loop edge; the front spans pi/6
    assert all(abs(wrap(g_ - w_)) <= np.pi / n + 1e-9 for p in fz['panels'] for g_, w_ in zip(p['edges'], p['want']))
    assert len(front['members']) == 5 and len(back['members']) == 9
    # row counts from the spacing on the basis (at least the blend rows + 1)
    assert front['rows'] == math.ceil(0.2 / (0.03 * 1.3)) and back['rows'] == math.ceil(0.5 / (0.03 * 1.3))
    # anchors: column k's ray meets the loop at angle 2 pi k / 12
    for k, (i, t) in enumerate(fz['anchors']):
        p = (1 - t) * row0[fz['loop'][i]] + t * row0[fz['loop'][(i + 1) % n]]
        assert abs(wrap(math.atan2(p[0], p[2]) - 2 * math.pi * k / 12)) < 1e-9
    # quads between consecutive rows of one panel only
    assert len(fz['tris']) == 2 * sum(p['rows'] * (len(p['members']) - 1) for p in fz['panels'])
    assert fz['count'] == sum((p['rows'] + 1) * len(p['members']) for p in fz['panels'])
    # weights: row 0 the body's, blend rows two body bones + two columns, below only columns
    nb = len(SK.NAMES)
    Wb = np.zeros((n, nb))
    Wb[:, SK.INDEX['hips']] = 0.6
    Wb[:, SK.INDEX['spine']] = 0.3
    Wb[:, SK.INDEX['thigh.L']] = 0.1
    W = weights(fz, 'girdleTails', Wb, row0[fz['loop']], np.zeros(2))
    rows = np.concatenate([np.repeat(np.arange(p['rows'] + 1), len(p['members'])) for p in fz['panels']])
    cols = [SK.INDEX[c] for c in SK.COLUMN_NAMES]
    assert np.allclose(W.sum(1), 1) and (np.count_nonzero(W, 1) <= 4).all()
    assert np.allclose(W[rows == 0][:, cols].sum(1), 0) and (W[rows == 0][:, SK.INDEX['thigh.L']] > 0).all()
    for r in range(1, BLEND_ROWS + 1):
        assert np.allclose(W[rows == r][:, cols].sum(1), r / BLEND_ROWS)
    assert np.allclose(W[rows == 1][:, SK.INDEX['thigh.L']], 0)
    assert np.allclose(W[rows > BLEND_ROWS][:, cols].sum(1), 1)
    print('driven selftest: ok')
