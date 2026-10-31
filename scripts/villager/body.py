"""Step 1: the villager's base body from MakeHuman — one decimated mesh in the
game's figure units with morph targets for sex, age and build, the skeleton's
joints per morph, skin weights mapped onto the villager bones, and three hand
shapes per hand — closed round a shaft (grip), pointing (point) and relaxed
(relax) — from the MakeHuman finger weights (natural-villager-motion step 3; no
finger bones).

Morphs are BILINEAR over the appearance table's corners, exact at every
(sex, age) corner: basis = adult man; `female`; `child`/`youth`/`elder` (male);
`child_f`/`youth_f`/`elder_f` the female corrections of each; `slight`/`stout`
the build at the adult man (added at any age, scaled — src/render/villagerBody.ts).
Every corner shape is scaled to its own stature (VILLAGER_ASSET.statureFactor;
a child to the adult's, drawn small by its caller) with the soles at y = 0 and
the ankles' midpoint at z = 0.
"""
import json

import numpy as np

import skeleton as SK
from gltfio import qaxis, qmat, qrot, qmul, qnorm, qinv
from mhbody import MakeHuman

AGES = ['child', 'youth', 'adult', 'elder']
SEXES = ['female', 'male']
HAND_SHAPES = ('grip', 'point', 'relax')
HAND_MORPHS = [f'{h}.{s}' for h in HAND_SHAPES for s in 'LR']
MORPHS = ['female', 'child', 'youth', 'elder', 'child_f', 'youth_f', 'elder_f', 'slight', 'stout', *HAND_MORPHS]


def corner_shapes(mh, cfg):
    """{(sex, age, build): (verts in figure units, joints dict head/tail)} for
    every corner plus the adult man's two build extremes."""
    A = cfg['VILLAGER_ASSET']
    body = mh.groups['body']
    out = {}

    def make(sex, age, build):
        w = 0.5 + build * A['buildWeight']
        cup = min(A['breastCup'][age], A['breastCupMax']) if sex == 'female' else 0.0
        v = mh.shape(1.0 if sex == 'male' else 0.0, A['makeHumanAge'][age], w, A['makeHumanRace'], cup)
        lo = v[body, 1].min()
        hi = v[body, 1].max()
        H = A['stature'] * A['statureFactor'][age][sex]
        s = H / (hi - lo)
        zmid = 0.5 * (mh.centroid(v, 'joint-l-ankle')[2] + mh.centroid(v, 'joint-r-ankle')[2])
        v = (v - np.array([0.0, lo, zmid])) * s
        v[:, 0] -= v[body, 0].mean() * 0  # symmetric already
        return v

    for sex in SEXES:
        for age in AGES:
            out[(sex, age, 0)] = make(sex, age, 0)
    out[('male', 'adult', -1)] = make('male', 'adult', -1)
    out[('male', 'adult', 1)] = make('male', 'adult', 1)
    return out


def joints_of(mh, v):
    """Head and tail of every villager bone for a shape."""
    j = {}
    for name, _parent, head, tail in SK.BONES:
        j[name] = (mh.centroid(v, head), mh.centroid(v, tail))
    return j


def morph_deltas(C):
    """The bilinear morph deltas from the corner arrays (any per-vertex or
    per-joint array works the same)."""
    AM = C[('male', 'adult', 0)]
    AF = C[('female', 'adult', 0)]
    d = {'female': AF - AM}
    for age in ('child', 'youth', 'elder'):
        d[age] = C[('male', age, 0)] - AM
        d[age + '_f'] = C[('female', age, 0)] - AF - C[('male', age, 0)] + AM
    d['slight'] = C[('male', 'adult', -1)] - AM
    d['stout'] = C[('male', 'adult', 1)] - AM
    return AM, d


# ---- the closed hand ------------------------------------------------------------

FINGERS = ['index', 'middle', 'ring', 'pinky']


def hand_shape(mh, v, weights_full, side, shape):
    """The basis shape with one hand posed: each finger curled at each
    phalanx by `shape['fingers'][finger]` (rad), the thumb folded across the
    palm by `shape['thumb']` — linear blend skinning of the MakeHuman
    game_engine finger bones on the full-resolution mesh. The shapes
    (VILLAGER_ASSET.handShapes): grip closes round a shaft, point keeps the
    index straight, relax is the soft curl of a hand at rest."""
    rig = json.load(open(mh.dir + '/rig.game_engine.json'))
    s = '_l' if side == 'L' else '_r'

    def head(bone):
        return mh.centroid(v, rig[bone]['head']['cube_name'])

    def tail(bone):
        t = rig[bone]['tail']
        return mh.centroid(v, t['cube_name']) if 'cube_name' in t else head(bone)

    # The palm's normal: across the knuckles × along the fingers, pointing to
    # the palm side (away from the back of the hand, which faces outward-up).
    knuckles = head('index_01' + s) - head('pinky_01' + s)
    along = head('middle_01' + s) - head('hand' + s)
    palm = np.cross(along, knuckles) if side == 'L' else np.cross(knuckles, along)
    palm /= np.linalg.norm(palm)
    # Each finger bone: its world rotation (about the curl axis) composed down the chain.
    world = {}
    for f in FINGERS:
        curl = shape['fingers'][f]
        q = np.array([0, 0, 0, 1.0])
        for k in (1, 2, 3):
            b = f'{f}_0{k}{s}'
            d = tail(b) - head(b)
            axis = np.cross(d, palm)
            q = qnorm(qmul(qaxis(axis, curl[k - 1]), q))
            world[b] = q
    # The thumb folds across the palm toward the fingers.
    q = np.array([0, 0, 0, 1.0])
    for k, ang in zip((1, 2, 3), shape['thumb']):
        b = f'thumb_0{k}{s}'
        d = tail(b) - head(b)
        axis = np.cross(d, palm)
        q = qnorm(qmul(qaxis(axis, ang), q))
        world[b] = q
    # Skin: each finger bone rotates about its own head after its parents moved.
    out = v.copy()
    parents = {b: rig[b]['parent'] for b in world}
    pos_head = {b: head(b) for b in world}
    # posed heads (FK)
    posed = {}

    def posed_head(b):
        if b in posed:
            return posed[b]
        p = parents[b]
        if p in world:
            ph = posed_head(p)
            r = world[p]
            posed[b] = ph + qrot(r, pos_head[b] - pos_head[p])
        else:
            posed[b] = pos_head[b]
        return posed[b]

    acc = np.zeros_like(v)
    wsum = np.zeros(len(v))
    for b, q in world.items():
        ws = weights_full.get(b, [])
        if not ws:
            continue
        idx = np.array([i for i, _ in ws])
        w = np.array([x for _, x in ws])
        # moved = posed_head + R (x - rest_head)
        rel = v[idx] - pos_head[b]
        R = _qm(q)
        moved = posed_head(b) + rel @ R.T
        acc[idx] += w[:, None] * moved
        wsum[idx] += w
    m = wsum > 0
    out[m] = acc[m] + (1 - wsum[m])[:, None] * v[m]
    return out


def _qm(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


# ---- decimation and the mapping back onto the full mesh -------------------------


def triangulate(quads):
    tris = []
    for f, t in quads:
        for k in range(1, len(f) - 1):
            tris.append(((f[0], f[k], f[k + 1]), (t[0], t[k], t[k + 1])))
    return tris


def decimate(mh, basis, target_tris):
    """Decimate the body in Blender (collapse, X symmetry; hands, feet and face
    protected by a vertex group). Returns vertices, triangles and per-corner UVs."""
    import bpy
    quads = mh.body_quads()
    used = mh.groups['body']
    remap = -np.ones(len(basis), int)
    remap[used] = np.arange(len(used))
    me = bpy.data.meshes.new('body-full')
    me.from_pydata(basis[used].tolist(), [], [[int(remap[i]) for i in f] for f, _ in quads])
    uv = me.uv_layers.new(name='UVMap')
    loops = [t for _f, ts in quads for t in ts]
    for li, t in enumerate(loops):
        uv.data[li].uv = mh.vt[t] if t >= 0 else (0, 0)
    ob = bpy.data.objects.new('body-full', me)
    bpy.context.scene.collection.objects.link(ob)
    # Protect hands, feet and face: their detail is what reads at a glance.
    vg = ob.vertex_groups.new(name='keep')
    H = basis[used, 1].max()
    for k, p in enumerate(basis[used]):
        hand = abs(p[0]) > 0.17 * H / 1.34 and p[1] < 0.62 * H and p[1] > 0.35 * H
        foot = p[1] < 0.06 * H
        face = p[1] > 0.86 * H and p[2] > 0.02 * H / 1.34
        # the chest front keeps enough rings for the women's breasts (the
        # female morph is mapped onto this decimated adult man's surface)
        chest = 0.66 * H < p[1] < 0.8 * H and p[2] > 0.03 * H / 1.34
        vg.add([k], 0.85 if (hand or foot) else 0.6 if (face or chest) else 1.0, 'REPLACE')
    mod = ob.modifiers.new('dec', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.use_symmetry = True
    mod.symmetry_axis = 'X'
    mod.use_collapse_triangulate = True
    mod.vertex_group = 'keep'
    mod.vertex_group_factor = 1.0
    mod.ratio = min(1.0, target_tris / (2.0 * len(quads)))
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier='dec')
    me = ob.data
    me.calc_loop_triangles()
    verts = np.array([v.co[:] for v in me.vertices])
    tris = np.array([t.vertices[:] for t in me.loop_triangles])
    uvl = me.uv_layers.active.data
    tri_uv = np.array([[uvl[l].uv[:] for l in t.loops] for t in me.loop_triangles])
    bpy.data.objects.remove(ob)
    return verts, tris, tri_uv


def surface_map(mh, basis, pts):
    """For each point: the full-mesh triangle it lies nearest to, its
    barycentric weights there, and its offset off that surface."""
    from mathutils.bvhtree import BVHTree
    tris = triangulate(mh.body_quads())
    tv = np.array([t for t, _ in tris])
    tree = BVHTree.FromPolygons(basis.tolist(), tv.tolist(), all_triangles=True)
    idx = np.zeros((len(pts), 3), int)
    bary = np.zeros((len(pts), 3))
    off = np.zeros((len(pts), 3))
    for k, p in enumerate(pts):
        co, _n, fi, _d = tree.find_nearest(p)
        a, b, c = basis[tv[fi]]
        idx[k] = tv[fi]
        bary[k] = barycentric(np.array(co), a, b, c)
        off[k] = p - np.array(co)
    return idx, bary, off


def barycentric(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
    d20, d21 = v2 @ v0, v2 @ v1
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-18:
        return np.array([1.0, 0, 0])
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    return np.array([1 - v - w, v, w])


def apply_map(shape, idx, bary, off):
    return (shape[idx] * bary[:, :, None]).sum(1) + off


def vertex_normals(verts, tris):
    n = np.zeros_like(verts)
    fn = np.cross(verts[tris[:, 1]] - verts[tris[:, 0]], verts[tris[:, 2]] - verts[tris[:, 0]])
    for k in range(3):
        np.add.at(n, tris[:, k], fn)
    ln = np.linalg.norm(n, axis=1)
    ln[ln == 0] = 1
    return n / ln[:, None]


def full_weights(mh):
    """game_engine weights mapped onto the villager bones, per full-mesh vertex
    (n × bones), normalized; plus the raw per-MakeHuman-bone lists."""
    raw = json.load(open(mh.dir + '/weights.game_engine.json'))['weights']
    W = np.zeros((len(mh.v), len(SK.NAMES)))
    for b, lst in raw.items():
        t = SK.weight_target(b)
        if t is None:
            continue
        for i, w in lst:
            W[i, SK.INDEX[t]] += w
    s = W.sum(1)
    s[s == 0] = 1
    return W / s[:, None], raw


def top4(W):
    idx = np.argsort(-W, axis=1)[:, :4]
    w = np.take_along_axis(W, idx, 1)
    w[w < 1e-3] = 0
    s = w.sum(1)
    s[s == 0] = 1
    w = w / s[:, None]
    return idx, w


def build_body(mh, cfg):
    shapes = cfg['VILLAGER_ASSET']['handShapes']
    C = corner_shapes(mh, cfg)
    basis, deltas = morph_deltas(C)
    Wfull, raw = full_weights(mh)
    for m in HAND_MORPHS:
        h, side = m.split('.')
        deltas[m] = hand_shape(mh, basis, raw, side, shapes[h]) - basis
    # Joints per corner → per morph.
    J = {k: joints_of(mh, v) for k, v in C.items()}
    jarr = {k: np.array([[*J[k][n][0], *J[k][n][1]] for n in SK.NAMES]) for k in C}
    jbasis, jdel = morph_deltas(jarr)
    for m in HAND_MORPHS:
        jdel[m] = np.zeros_like(jbasis)

    # Each palm's normal at rest (the retarget aligns the hands' twist by it).
    palm = {}
    for side, s in (('L', 'l'), ('R', 'r')):
        knuckles = mh.centroid(basis, f'joint-{s}-finger-2-1') - mh.centroid(basis, f'joint-{s}-finger-5-1')
        along = mh.centroid(basis, f'joint-{s}-finger-3-1') - mh.centroid(basis, f'joint-{s}-hand')
        n = np.cross(along, knuckles) if side == 'L' else np.cross(knuckles, along)
        palm[side] = n / np.linalg.norm(n)
    verts, tris, tri_uv = decimate(mh, basis, cfg['VILLAGER_ASSET']['bodyTriangles'])
    idx, bary, off = surface_map(mh, basis, verts)
    pos = apply_map(basis, idx, bary, off)
    morph_pos = {k: apply_map(basis + d, idx, bary, off) - pos for k, d in deltas.items()}
    W = (Wfull[idx] * bary[:, :, None]).sum(1)
    # Eyes: the base mesh's eyeball helpers, rigid on the head.
    body = {
        'C': C, 'basis_full': basis, 'deltas_full': deltas, 'Wfull': Wfull,
        'pos': pos, 'tris': tris, 'tri_uv': tri_uv, 'morph_pos': morph_pos, 'W': W,
        'joints': jbasis, 'joint_deltas': jdel, 'map': (idx, bary, off), 'palm': palm,
    }
    # the shell garments' regions (shells.py): scalars from the uncut body,
    # the body cut along their level sets, one region word per vertex
    import shells as SHL
    from garments import landmarks
    L = landmarks(jbasis, cfg['VILLAGER_ASSET']['stature'])
    split = cfg['VILLAGER_ASSET']['bodySplit']
    subdivide(body, SHL.cuts(L), split, mh=mh)
    body['region'] = region_scalars(body['pos'], body['W'])
    presplit(body, SHL.cuts(L), mh=mh, split=split)
    body['region_bits'] = SHL.region_words(body['region'], L)
    return body


# ---- the pre-split along the shell regions ---------------------------------------

ARM_BONES = ('upperArm.L', 'forearm.L', 'hand.L', 'upperArm.R', 'forearm.R', 'hand.R')
LEG_BONES = {s: tuple(f'{b}.{s}' for b in ('thigh', 'shin', 'foot', 'toe')) for s in 'LR'}


def region_scalars(pos, W):
    """The scalars the shell regions are classified on: rest height, the arm
    bones' summed weight (garments.Body.arm), each leg's (stage 3)."""
    col = lambda names: W[:, [SK.INDEX[n] for n in names]].sum(1)  # noqa: E731
    return {'y': pos[:, 1].copy(), 'arm': col(ARM_BONES), 'leg.L': col(LEG_BONES['L']), 'leg.R': col(LEG_BONES['R'])}


def split_level(st, key, c, within=None, tag=-1):
    """Cut the mesh state `st` along the level set `key` = c: a vertex on every
    crossed edge (of the faces `within` selects, every face when None), every
    per-vertex array interpolated there and the cut scalar set to c exactly;
    each face holding a cut edge becomes two or three, winding kept, no
    hanging vertex. Returns the number of inserted vertices."""
    s = st['region'][key]
    tris = st['tris']
    elig = np.ones(len(tris), bool) if within is None else within(st)
    d = s - c
    cut = {}
    for f in np.nonzero(elig)[0]:
        for e in range(3):
            a, b = int(tris[f, e]), int(tris[f, (e + 1) % 3])
            if d[a] * d[b] < 0:
                cut.setdefault((min(a, b), max(a, b)), None)
    if not cut:
        return 0
    n0 = len(st['pos'])
    keys = sorted(cut)
    a = np.array([k[0] for k in keys])
    b = np.array([k[1] for k in keys])
    t = (c - s[a]) / (s[b] - s[a])
    for k, e in enumerate(keys):
        cut[e] = n0 + k
    lerp = lambda x: x[a] + (x[b] - x[a]) * (t[:, None] if x.ndim > 1 else t)  # noqa: E731
    st['pos'] = np.concatenate([st['pos'], lerp(st['pos'])])
    st['W'] = np.concatenate([st['W'], lerp(st['W'])])
    st['morph_pos'] = {m: np.concatenate([v, lerp(v)]) for m, v in st['morph_pos'].items()}
    for r, v in st['region'].items():
        nv = lerp(v)
        if r == key:
            nv[:] = c
        st['region'][r] = np.concatenate([v, nv])
    # where each new vertex lies in the uncut mesh: its parent triangle and
    # barycentric weights (the clip-frame regression and the refit read them)
    st['vparent'] = np.concatenate([st['vparent'], -np.ones(len(keys), int)])
    st['vbary'] = np.concatenate([st['vbary'], np.zeros((len(keys), 3))])
    st['vedge'] = np.concatenate([st['vedge'], np.stack([a, b], 1)])
    st['vcut'] = np.concatenate([st['vcut'], np.full(len(keys), tag)])
    out_t, out_uv, out_o, out_b = [], [], [], []
    for f in range(len(tris)):
        tv = [int(x) for x in tris[f]]
        uv = st['tri_uv'][f]
        cb = st['cbary'][f]
        o = st['torig'][f]
        on = [cut.get((min(tv[e], tv[(e + 1) % 3]), max(tv[e], tv[(e + 1) % 3]))) for e in range(3)]
        hits = [e for e in range(3) if on[e] is not None]
        if not hits:
            out_t.append(tv)
            out_uv.append(uv)
            out_o.append(o)
            out_b.append(cb)
            continue

        def mid(e):
            # the inserted corner on edge e (tv[e] → tv[e+1]) of this face
            x = on[e]
            p, q = tv[e], tv[(e + 1) % 3]
            u = (c - s[p]) / (s[q] - s[p])
            uvx = uv[e] + (uv[(e + 1) % 3] - uv[e]) * u
            bx = cb[e] + (cb[(e + 1) % 3] - cb[e]) * u
            if st['vparent'][x] < 0:
                st['vparent'][x] = o
                st['vbary'][x] = bx
            return x, uvx, bx

        corner = [(tv[k], uv[k], cb[k]) for k in range(3)]
        if len(hits) == 1:
            e = hits[0]
            m = mid(e)
            A, B, O = corner[e], corner[(e + 1) % 3], corner[(e + 2) % 3]
            parts = [(A, m, O), (m, B, O)]
        else:
            # the corner both cut edges meet at stands alone
            i = [k for k in range(3) if k in hits and (k - 1) % 3 in hits][0]
            m1 = mid(i)                # on edge i → i+1
            m2 = mid((i - 1) % 3)      # on edge i-1 → i
            V, J, K = corner[i], corner[(i + 1) % 3], corner[(i + 2) % 3]
            parts = [(V, m1, m2), (m1, J, K), (m1, K, m2)]
        for tri in parts:
            out_t.append([x[0] for x in tri])
            out_uv.append(np.array([x[1] for x in tri]))
            out_o.append(o)
            out_b.append(np.array([x[2] for x in tri]))
    st['tris'] = np.array(out_t, int)
    st['tri_uv'] = np.array(out_uv)
    st['torig'] = np.array(out_o, int)
    st['cbary'] = np.array(out_b)
    return len(keys)


def height_within(lo, hi):
    """Faces whose three corners lie in [lo, hi] of the rest height."""
    def sel(st):
        y = st['region']['y'][st['tris']]
        return ((y >= lo) & (y <= hi)).all(1)
    return sel


# The body corners the cut vertices are solved at (sheets.corner_weights of
# penetration.CORNERS): each adds its morphs to the adult man, so the corners'
# morph rows form a square, invertible system over the basis and the nine
# shape morphs.
SOLVE_CORNERS = ({}, {'female': 1}, {'child': 1}, {'youth': 1}, {'elder': 1},
                 {'female': 1, 'child': 1, 'child_f': 1}, {'female': 1, 'youth': 1, 'youth_f': 1},
                 {'female': 1, 'elder': 1, 'elder_f': 1}, {'slight': 1}, {'stout': 1})
DEFAULT_REACH = 45


def split_edges(st, edges):
    """Halve every edge in `edges` ((a, b), a < b) of the mesh state `st`: the
    midpoint takes the mean of its ends' per-vertex arrays (position, weights,
    morph deltas) and of `tri_uv`; a face with one, two or three halved edges
    becomes two, three or four, winding kept, no hanging vertex."""
    n0 = len(st['pos'])
    keys = sorted(edges)
    a = np.array([k[0] for k in keys])
    b = np.array([k[1] for k in keys])
    mid = {e: n0 + k for k, e in enumerate(keys)}
    half = lambda x: 0.5 * (x[a] + x[b])  # noqa: E731
    st['pos'] = np.concatenate([st['pos'], half(st['pos'])])
    st['W'] = np.concatenate([st['W'], half(st['W'])])
    st['morph_pos'] = {m: np.concatenate([v, half(v)]) for m, v in st['morph_pos'].items()}
    out_t, out_uv = [], []
    for f, tv in enumerate(st['tris']):
        tv = [int(x) for x in tv]
        uv = st['tri_uv'][f]
        on = [mid.get((min(tv[e], tv[(e + 1) % 3]), max(tv[e], tv[(e + 1) % 3]))) for e in range(3)]
        cor = [(tv[k], uv[k]) for k in range(3)]
        m = [None if on[e] is None else (on[e], 0.5 * (uv[e] + uv[(e + 1) % 3])) for e in range(3)]
        hits = [e for e in range(3) if on[e] is not None]
        if not hits:
            parts = [cor]
        elif len(hits) == 1:
            e = hits[0]
            parts = [(cor[e], m[e], cor[(e + 2) % 3]), (m[e], cor[(e + 1) % 3], cor[(e + 2) % 3])]
        elif len(hits) == 2:
            i = [k for k in range(3) if k in hits and (k - 1) % 3 in hits][0]
            m1, m2 = m[i], m[(i - 1) % 3]
            V, J, K = cor[i], cor[(i + 1) % 3], cor[(i + 2) % 3]
            parts = [(V, m1, m2), (m1, J, K), (m1, K, m2)]
        else:
            parts = [(cor[0], m[0], m[2]), (m[0], cor[1], m[1]), (m[2], m[1], cor[2]), (m[0], m[1], m[2])]
        for t in parts:
            out_t.append([x[0] for x in t])
            out_uv.append(np.array([x[1] for x in t]))
    st['tris'] = np.array(out_t, int)
    st['tri_uv'] = np.array(out_uv)
    return keys


def on_surface(body, st, n1, keys, mh):
    """The midpoints n1.. of the edges `keys` (split_edges order) onto the
    MakeHuman surface: nearest full-mesh point of the chord midpoint plus the
    ends' mean offset; position, morph deltas and weights read there, as
    build_body reads them for a decimated vertex; body['map'] extended."""
    idx, bary, off = body['map']
    a = np.array([k[0] for k in keys])
    b = np.array([k[1] for k in keys])
    ids = np.arange(n1, n1 + len(keys))
    i2, b2, _o = surface_map(mh, body['basis_full'], st['pos'][ids])
    o2 = 0.5 * (off[a] + off[b])
    pos = apply_map(body['basis_full'], i2, b2, o2)
    st['pos'][ids] = pos
    for m, d in body['deltas_full'].items():
        st['morph_pos'][m][ids] = apply_map(body['basis_full'] + d, i2, b2, o2) - pos
    st['W'][ids] = (body['Wfull'][i2] * b2[:, :, None]).sum(1)
    body['map'] = (np.concatenate([idx, i2]), np.concatenate([bary, b2]), np.concatenate([off, o2]))


def subdivide(body, cuts, split, mh=None):
    """Halve the long edges in a band round every cut level (revision 10): an
    edge of a face whose cut-scalar range overlaps c ± band (inside the cut's
    height interval, if it has one) while longer than `lmax` and its
    Σ|ΔW| · length above `tau`, round after round. The cut vertices then sit
    on short edges, where a four-bone vertex can follow the surface; the
    subdivided, uncut body is the cut's reference (body['split']).

    With the MakeHuman mesh `mh`, each midpoint is then taken as build_body
    takes a decimated vertex: mapped onto the full mesh's surface (its ends'
    mean offset kept), its position, morph deltas and weights read there. A
    mean of its ends' weights would blend the far joints of a long edge into
    the midpoint (a mid-shin vertex a quarter on the thigh sinks under the
    knelt shin), and a midpoint on the flat chord leaves the band faceted
    against the smooth coarse shading round it."""
    st = {k: body[k] for k in ('pos', 'tris', 'tri_uv', 'W', 'morph_pos')}
    n0 = len(st['pos'])
    for _ in range(split['rounds']):
        reg = region_scalars(st['pos'], st['W'])
        tr = st['tris']
        band = np.zeros(len(tr), bool)
        for key, c, within in cuts:
            v = reg[key][tr]
            d = split['band']['y' if key == 'y' else 'arm']
            sel = (v.min(1) <= c + d) & (v.max(1) >= c - d)
            if within is not None:
                y = reg['y'][tr]
                sel &= (y.max(1) >= within[0]) & (y.min(1) <= within[1])
            band |= sel
        e = np.concatenate([tr[band][:, [0, 1]], tr[band][:, [1, 2]], tr[band][:, [2, 0]]])
        e = np.unique(np.sort(e, 1), axis=0)
        P, W = st['pos'], st['W']
        ln = np.linalg.norm(P[e[:, 0]] - P[e[:, 1]], axis=1)
        dw = np.abs(W[e[:, 0]] - W[e[:, 1]]).sum(1)
        e = e[(ln > split['lmax']) & (ln * dw > split['tau'])]
        if not len(e):
            break
        n1 = len(st['pos'])
        keys = split_edges(st, {(int(x), int(y)) for x, y in e})
        if mh is not None:
            on_surface(body, st, n1, keys, mh)
    for k in st:
        body[k] = st[k]
    ids = np.arange(n0, len(body['pos']))
    if mh is None and len(ids):
        assert 'map' not in body, 'a mapped body subdivides with its MakeHuman mesh'
    print(f'[body] band subdivision: {n0} -> {len(body["pos"])} vertices, {len(body["tris"])} triangles')
    return body


def refit_poses(joints, bones, reach=None):
    """The weight refit's pose set for the bones a vertex carries, as A-pose
    world turns and heads: the design pose (the arms hanging, as the game's
    hung body nearly stands), and on it ±reach and ±reach/2 about two axes
    across each carried bone (`reach` degrees per bone name without side)."""
    import rig
    from garments import design_pose
    q0 = design_pose({'joints': joints})
    out = [rig.fk(joints, q0)]
    for b in bones:
        r = (reach or {}).get(SK.NAMES[b].split('.')[0], DEFAULT_REACH) * np.pi / 180
        d = joints[b, 3:] - joints[b, :3]
        d = d / (np.linalg.norm(d) or 1)
        a1 = np.cross(d, [0, 1.0, 0]) if abs(d[1]) < 0.9 else np.cross(d, [1.0, 0, 0])
        a1 /= np.linalg.norm(a1)
        a2 = np.cross(d, a1)
        for ax in (a1, a2):
            for ang in (-r, -r / 2, r / 2, r):
                q = q0.copy()
                q[b] = qnorm(qmul(q0[b], qaxis(ax, ang)))
                out.append(rig.fk(joints, q))
    return out


def simplex_lsq(A, y, most=None):
    """min |A w − y|² over w ≥ 0, Σ w = 1 (few columns: every support of at
    most `most` columns tried)."""
    from itertools import combinations
    n = A.shape[1]
    best, bw = np.inf, None
    for r in range(1, min(n, most or n) + 1):
        for sup in combinations(range(n), r):
            M = A[:, sup]
            K = np.zeros((r + 1, r + 1))
            K[:r, :r] = 2 * M.T @ M
            K[:r, r] = 1
            K[r, :r] = 1
            rhs = np.concatenate([2 * M.T @ y, [1.0]])
            try:
                sol = np.linalg.lstsq(K, rhs, rcond=None)[0][:r]
            except np.linalg.LinAlgError:
                continue
            if (sol < -1e-12).any():
                continue
            w = np.zeros(n)
            w[list(sup)] = np.clip(sol, 0, None)
            w /= w.sum()
            e = float(np.sum((A @ w - y) ** 2))
            if e < best:
                best, bw = e, w
    return bw


def corner_state(body, pos, morph_pos, mw):
    """One body corner's rest positions and joints for morph weights `mw`."""
    p = pos.copy()
    j = body['joints'].copy()
    jd = body.get('joint_deltas', {})
    for m, x in mw.items():
        p += x * morph_pos[m]
        if m in jd:
            j += x * jd[m]
    return p, j


def refit(st, body, W0, tris0, ids, reach=None):
    """The cut vertices made to follow their parent triangle along the game's
    drawing path (gamepath.Person.draw: the hang bake, then the clip skin,
    both with the vertex's four weights). Returns each vertex's worst
    residual over the pose set.

    1. Weights: four bones out of the six heaviest interpolated ones, fitted
       (non-negative, sum one) so the clip skin of the vertex's hung point
       follows the point of its parent triangle drawn with the reference
       corners' weights, over `refit_poses`. Linear: the hung point is the
       target's.
    2. Rest position and shape-morph deltas: at every SOLVE_CORNERS corner the
       A-pose point the hang bake takes exactly onto the parent triangle's
       hung point (the bake is affine per vertex), then the basis and the
       shape deltas solved from the corners. The hung body carries every cut
       vertex on the reference surface at every corner; in the A pose, which
       the game never draws, it may sit off its edge.
    Written back as four nonzero full-width entries, so export.py's `top4`
    is the identity on them."""
    import gamepath as GP
    i0, w0 = top4(W0['W'])
    parent = tris0[st['vparent'][ids]]
    bary = st['vbary'][ids]
    person = GP.Person(body['joints'])
    hung = np.einsum('kj,kji->ki', bary, person.bake(W0['pos'], i0, w0)[parent])
    cache = {}

    def poses(b):
        if b not in cache:
            cache[b] = [(np.array([qmat(q) for q in person.drawn(wr)]), wp,
                         np.einsum('kj,kji->ki', bary, person.draw(W0['pos'], i0, w0, wr, wp)[parent]))
                        for wr, wp in refit_poses(body['joints'], [b], reach)]
        return cache[b]

    resid = np.zeros(len(ids))
    for k, v in enumerate(ids):
        cand = np.argsort(-st['W'][v])[:6]
        cand = cand[st['W'][v, cand] > 1e-3] if (st['W'][v, cand] > 1e-3).any() else cand[:1]
        rows, ys = [], []
        for b in cand:
            for Rd, wp, tgt in poses(int(b)):
                rows.append(np.array([Rd[c] @ (hung[k] - person.heads[c]) + wp[c] for c in cand]).T)
                ys.append(tgt[k])
        A, y = np.concatenate(rows), np.concatenate(ys)
        full = np.zeros(st['W'].shape[1])
        full[cand] = simplex_lsq(A, y, most=4)
        bi, bw = top4(full[None])
        st['W'][v] = 0
        st['W'][v, bi[0]] = bw[0]
        resid[k] = np.linalg.norm((A @ st['W'][v, cand] - y).reshape(-1, 3), axis=1).max()
    shape = [m for m in MORPHS if m not in HAND_MORPHS and m in st['morph_pos']]
    corners = [c for c in SOLVE_CORNERS if all(m in shape for m in c)]
    used = [m for m in shape if any(m in c for c in corners)]
    C = np.array([[1.0] + [c.get(m, 0.0) for m in used] for c in corners])
    if C.shape[0] != C.shape[1]:
        raise ValueError(f'refit: {len(corners)} corners for {len(used)} shape morphs')
    i1, w1 = top4(st['W'][ids])
    n0 = len(W0['pos'])
    P = []
    for c in corners:
        p0, j = corner_state(body, W0['pos'], {m: st['morph_pos'][m][:n0] for m in c}, c)
        pc = GP.Person(j)
        tgt = np.einsum('kj,kji->ki', bary, pc.bake(p0, i0, w0)[parent])
        zero = pc.bake(np.zeros((len(ids), 3)), i1, w1)
        Rh = np.array([qmat(q) for q in pc.hang])
        A = np.einsum('vk,vkij->vij', w1, Rh[i1]) / np.maximum(w1.sum(1), 1e-12)[:, None, None]
        P.append(np.linalg.solve(A, (tgt - zero)[:, :, None])[:, :, 0])
    X = np.linalg.solve(C, np.array(P).reshape(len(corners), -1)).reshape(len(corners), len(ids), 3)
    st['pos'][ids] = X[0]
    for k, m in enumerate(used):
        st['morph_pos'][m][ids] = X[k + 1]
    return resid


def _cut(body, cuts, refit_weights, reach):
    """One pass of the cut on `body` (untouched): the mesh state and the
    inserted vertices' residuals."""
    n0, m0 = len(body['pos']), len(body['tris'])
    st = {k: body[k] for k in ('pos', 'tris', 'tri_uv', 'W', 'morph_pos')}
    st['morph_pos'] = dict(st['morph_pos'])
    st['region'] = {k: v.copy() for k, v in body['region'].items()}
    st['vparent'] = -np.ones(n0, int)
    st['vbary'] = np.zeros((n0, 3))
    st['vedge'] = -np.ones((n0, 2), int)
    st['vcut'] = -np.ones(n0, int)
    st['torig'] = np.arange(m0)
    st['cbary'] = np.tile(np.eye(3), (m0, 1, 1))
    for k, (key, c, within) in enumerate(cuts):
        n = split_level(st, key, c, None if within is None else height_within(*within), tag=k)
        print(f'[body] split {key} at {c:.4f}: {n} vertices')
    ids = np.arange(n0, len(st['pos']))
    W0 = {'pos': body['pos'], 'W': body['W']}
    resid = refit(st, body, W0, body['tris'], ids, reach) if refit_weights and len(ids) else np.zeros(len(ids))
    return st, ids, resid


def snaps(st, ids, resid, cuts, region, limit):
    """Revision 10's snap fallback: per cut vertex left more than `limit` off
    by the refit, whose edge has two reference ends, the nearer end's cut
    scalar set to the level — unless that carries it across another level of
    the same scalar. Returns {(scalar, vertex): level}."""
    out = {}
    n0 = len(region['y'])
    for k in np.nonzero(resid > limit)[0]:
        v = ids[k]
        a, b = (int(x) for x in st['vedge'][v])
        key, c, _ = cuts[int(st['vcut'][v])]
        if a >= n0 or b >= n0:
            continue
        s = region[key]
        end = a if abs(s[a] - c) <= abs(s[b] - c) else b
        lo, hi = sorted((s[end], c))
        if any(kk == key and lo < cc < hi for kk, cc, _w in cuts):
            continue
        out[(key, end)] = c
    return out


def presplit(body, cuts, mh=None, refit_weights=True, split=None):
    """Cut `body` in place along `cuts` ([(scalar, value, (lo, hi) or None)],
    in order); inserted vertices take the refit (`refit`) and, with `mh`,
    their surface map; a vertex the refit cannot follow within
    split['snapLimit'] is snapped (`snaps`) and the cut redone. Records
    body['split'] (the reference: the body before the cut) for the
    regression."""
    split = split or {}
    reach = split.get('reach')
    n0 = len(body['pos'])
    st, ids, resid = _cut(body, cuts, refit_weights, reach)
    snapped = snaps(st, ids, resid, cuts, body['region'], split['snapLimit']) if 'snapLimit' in split else {}
    if snapped:
        body['region'] = {k: v.copy() for k, v in body['region'].items()}
        for (key, v), c in snapped.items():
            body['region'][key][v] = c
        print(f'[body] snapped {len(snapped)} cut edges to their nearer end')
        st, ids, resid = _cut(body, cuts, refit_weights, reach)
    tris0 = body['tris']
    W0 = {'pos': body['pos'], 'W': body['W']}
    for k in ('pos', 'tris', 'tri_uv', 'W', 'morph_pos', 'region'):
        body[k] = st[k]
    if mh is not None and len(ids):
        idx, bary, off = body['map']
        i2, b2, o2 = surface_map(mh, body['basis_full'], body['pos'][ids])
        body['map'] = (np.concatenate([idx, i2]), np.concatenate([bary, b2]), np.concatenate([off, o2]))
    body['split'] = {'n0': n0, 'tris0': tris0, 'pos0': W0['pos'], 'W0': W0['W'], 'parent': st['vparent'][ids],
                     'bary': st['vbary'][ids], 'edge': st['vedge'][ids], 'torig': st['torig'],
                     'resid': resid, 'snapped': len(snapped)}
    return body


def helper_mesh(mh, group, basis, deltas):
    """A helper part of the base mesh (eyes, hair cap) with its morphs."""
    fs = mh.faces[group]
    used = mh.groups[group]
    remap = {int(i): k for k, i in enumerate(used)}
    tris = []
    for f, _t in fs:
        for k in range(1, len(f) - 1):
            tris.append([remap[f[0]], remap[f[k]], remap[f[k + 1]]])
    return basis[used].copy(), np.array(tris), {k: d[used] for k, d in deltas.items()}


def _toy_body():
    pos = np.array([[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [1.0, 1.0, 0.0]])
    tris = np.array([[0, 1, 2], [1, 3, 2]])
    W = np.zeros((4, len(SK.NAMES)))
    W[0, SK.INDEX['hips']] = 1
    W[1, SK.INDEX['thigh.L']] = 1
    W[2, SK.INDEX['spine']] = 0.6
    W[2, SK.INDEX['upperArm.L']] = 0.4
    W[3, SK.INDEX['spine']] = 1
    joints = np.array([[0.1 * k, 0.05 * k, 0.0, 0.1 * k, 0.05 * k + 0.1, 0.02] for k in range(len(SK.NAMES))])
    body = {'pos': pos, 'tris': tris, 'tri_uv': np.zeros((2, 3, 2)), 'W': W, 'joints': joints,
            'morph_pos': {'female': pos * 0.1}}
    body['region'] = region_scalars(pos, W)
    return body


def _check_mesh(body, new):
    """Every edge shared by at most two faces, no vertex of `new` hanging on
    another face's edge, every face's normal still +z."""
    edges = {}
    for t in body['tris']:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            edges[(min(a, b), max(a, b))] = edges.get((min(a, b), max(a, b)), 0) + 1
    assert max(edges.values()) <= 2
    for t in body['tris']:
        P = body['pos'][t]
        for k in new:
            if k in t:
                continue
            for e in range(3):
                a, b = P[e], P[(e + 1) % 3]
                d = np.linalg.norm(np.cross(b - a, body['pos'][k] - a)) / np.linalg.norm(b - a)
                s = np.dot(body['pos'][k] - a, b - a) / np.dot(b - a, b - a)
                assert not (d < 1e-9 and 1e-9 < s < 1 - 1e-9), 'hanging vertex'
    for t in body['tris']:
        P = body['pos'][t]
        assert np.cross(P[1] - P[0], P[2] - P[0])[2] > 0


def selftest_split():
    """The split tool on a toy square (no Blender needed): interpolation and
    the exact level value without the refit; with it, four non-negative
    normalised weights, the region scalars untouched and every cut vertex's
    hang bake on its parent triangle at both morph corners; the snap fallback;
    the band subdivision's conformity and midpoints."""
    import gamepath as GP
    # plain cut: interpolation, exact level value
    body = _toy_body()
    presplit(body, [('y', 0.5, None)], refit_weights=False)
    n = len(body['pos'])
    assert n == 7, n  # edges 0-2, 1-2 (the diagonal) and 1-3
    assert len(body['tris']) == 6, len(body['tris'])
    new = np.arange(4, n)
    assert (body['region']['y'][new] == 0.5).all()
    assert np.allclose(body['pos'][new][:, 1], 0.5)
    assert np.allclose(body['morph_pos']['female'][new], body['pos'][new] * 0.1)
    _check_mesh(body, new)
    # with the refit
    body = _toy_body()
    arm0 = body['region']['arm'].copy()
    ref = {k: body[k].copy() for k in ('pos', 'W')}
    ref['female'] = body['morph_pos']['female'].copy()
    presplit(body, [('y', 0.5, None)])
    assert len(body['pos']) == 7
    on02 = [k for k in new if np.isclose(body['region']['arm'][k], 0.5 * (arm0[0] + arm0[2]))]
    assert on02, 'the arm scalar interpolated, never re-read from the refitted weights'
    w = body['W'][new]
    assert (w >= 0).all() and np.allclose(w.sum(1), 1) and ((w > 0).sum(1) <= 4).all()
    sp = body['split']
    i0, w0 = top4(ref['W'])
    i1, w1 = top4(body['W'])
    P = GP.Person(body['joints'])
    for x in (0.0, 1.0):
        tgt = np.einsum('kj,kji->ki', sp['bary'], P.bake(ref['pos'] + x * ref['female'], i0, w0)[sp['tris0'][sp['parent']]])
        got = P.bake((body['pos'] + x * body['morph_pos']['female'])[new], i1[new], w1[new])
        assert np.abs(got - tgt).max() < 1e-9, ('hang bake off the parent triangle', x, np.abs(got - tgt).max())
    # the snap fallback: every cut vertex over a negative limit, so every
    # crossing moves to its edge's nearer end and nothing is inserted
    body = _toy_body()
    presplit(body, [('y', 0.5, None)], split={'snapLimit': -1.0})
    assert len(body['pos']) == 4 and body['split']['snapped'] == 2, (len(body['pos']), body['split']['snapped'])
    assert body['region']['y'][0] == 0.5 and body['region']['y'][1] == 0.5 and np.allclose(body['pos'][:2, 1], 0)
    # band subdivision: every band edge ends at most lmax long, conforming
    body = _toy_body()
    subdivide(body, [('y', 0.5, None)], {'rounds': 8, 'band': {'y': 0.1, 'arm': 0.1}, 'lmax': 0.3, 'tau': 0.0})
    _check_mesh(body, np.arange(4, len(body['pos'])))
    tr = body['tris']
    y = body['pos'][tr][:, :, 1]
    band = (y.min(1) <= 0.6) & (y.max(1) >= 0.4)
    e = np.concatenate([tr[band][:, [0, 1]], tr[band][:, [1, 2]], tr[band][:, [2, 0]]])
    assert np.linalg.norm(body['pos'][e[:, 0]] - body['pos'][e[:, 1]], axis=1).max() <= 0.3
    assert np.allclose(body['morph_pos']['female'], body['pos'] * 0.1) and np.allclose(body['pos'][:, 2], 0)
    assert np.allclose(body['W'].sum(1), 1)
    print('body split selftest: ok')
