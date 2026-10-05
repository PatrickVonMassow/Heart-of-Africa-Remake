"""Step 1: the villager's base body from MakeHuman — one decimated mesh in the
game's figure units with morph targets for sex, age and build, the skeleton's
joints per morph, skin weights mapped onto the villager bones, and a closed-hand
(grip) morph per hand.

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
from gltfio import qaxis, qrot, qmul, qnorm, qinv
from mhbody import MakeHuman

AGES = ['child', 'youth', 'adult', 'elder']
SEXES = ['female', 'male']
MORPHS = ['female', 'child', 'youth', 'elder', 'child_f', 'youth_f', 'elder_f', 'slight', 'stout', 'grip.L', 'grip.R']


def corner_shapes(mh, cfg):
    """{(sex, age, build): (verts in figure units, joints dict head/tail)} for
    every corner plus the adult man's two build extremes."""
    A = cfg['VILLAGER_ASSET']
    body = mh.groups['body']
    out = {}

    def make(sex, age, build):
        w = 0.5 + build * A['buildWeight']
        v = mh.shape(1.0 if sex == 'male' else 0.0, A['makeHumanAge'][age], w, A['makeHumanRace'])
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


def grip_shape(mh, v, weights_full, side):
    """The basis shape with one hand closed round a shaft (fingers curled at
    each phalanx, the thumb wrapped across): linear blend skinning of the
    MakeHuman game_engine finger bones on the full-resolution mesh."""
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
    curl = {1: 1.15, 2: 1.35, 3: 0.95}
    for f in FINGERS:
        q = np.array([0, 0, 0, 1.0])
        for k in (1, 2, 3):
            b = f'{f}_0{k}{s}'
            d = tail(b) - head(b)
            axis = np.cross(d, palm)
            q = qnorm(qmul(qaxis(axis, curl[k]), q))
            world[b] = q
    # The thumb folds across the palm toward the fingers.
    q = np.array([0, 0, 0, 1.0])
    for k, ang in ((1, 0.55), (2, 0.6), (3, 0.5)):
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
        vg.add([k], 0.85 if (hand or foot) else 0.6 if face else 1.0, 'REPLACE')
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
    C = corner_shapes(mh, cfg)
    basis, deltas = morph_deltas(C)
    Wfull, raw = full_weights(mh)
    deltas['grip.L'] = grip_shape(mh, basis, raw, 'L') - basis
    deltas['grip.R'] = grip_shape(mh, basis, raw, 'R') - basis
    # Joints per corner → per morph.
    J = {k: joints_of(mh, v) for k, v in C.items()}
    jarr = {k: np.array([[*J[k][n][0], *J[k][n][1]] for n in SK.NAMES]) for k in C}
    jbasis, jdel = morph_deltas(jarr)
    jdel['grip.L'] = np.zeros_like(jbasis)
    jdel['grip.R'] = np.zeros_like(jbasis)

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
    return {
        'C': C, 'basis_full': basis, 'deltas_full': deltas, 'Wfull': Wfull,
        'pos': pos, 'tris': tris, 'tri_uv': tri_uv, 'morph_pos': morph_pos, 'W': W,
        'joints': jbasis, 'joint_deltas': jdel, 'map': (idx, bary, off), 'palm': palm,
    }


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
