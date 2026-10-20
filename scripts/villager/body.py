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
    body['region'] = region_scalars(pos, W)
    presplit(body, SHL.cuts(L), mh=mh)
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


def split_level(st, key, c, within=None):
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


def refit_poses(joints, bones):
    """The refit's pose set for the bones a vertex carries: rest, the design
    pose, and ±45° and ±90° about two axes across each bone."""
    import rig
    from garments import design_pose
    from gltfio import qaxis
    rest = np.tile([0, 0, 0, 1.0], (len(SK.NAMES), 1))
    out = [rig.fk(joints, rest), rig.fk(joints, design_pose({'joints': joints}))]
    for b in bones:
        d = joints[b, 3:] - joints[b, :3]
        d = d / (np.linalg.norm(d) or 1)
        a1 = np.cross(d, [0, 1.0, 0]) if abs(d[1]) < 0.9 else np.cross(d, [1.0, 0, 0])
        a1 /= np.linalg.norm(a1)
        a2 = np.cross(d, a1)
        for ax in (a1, a2):
            for ang in (-np.pi / 2, -np.pi / 4, np.pi / 4, np.pi / 2):
                q = rest.copy()
                q[b] = qaxis(ax, ang)
                out.append(rig.fk(joints, q))
    return out


def simplex_lsq(A, y):
    """min |A w − y|² over w ≥ 0, Σ w = 1 (few columns: every support tried)."""
    from itertools import combinations
    n = A.shape[1]
    best, bw = np.inf, None
    for r in range(1, n + 1):
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


def refit(st, joints, W0, tris0, ids):
    """Each inserted vertex's four bones (`top4` of its interpolated weights)
    refitted over the pose set to follow the point of its parent triangle
    posed with the uncut corners' weights; written back as four nonzero
    full-width entries, so export.py's `top4` is the identity on them."""
    from garments import skin_full
    cache = {}

    def poses(b):
        if b not in cache:
            cache[b] = refit_poses(joints, [b])[2:]
        return cache[b]

    base = refit_poses(joints, [])
    h = joints[:, :3]
    for v in ids:
        bi, bw = top4(st['W'][v:v + 1])
        bi, bw = bi[0], bw[0]
        bi = bi[bw > 0] if (bw > 0).any() else bi[:1]
        carried = sorted(set(np.nonzero(st['W'][v] > 1e-3)[0].tolist()) | set(bi.tolist()))
        ps = base + [p for b in carried for p in poses(b)]
        x = st['pos'][v]
        corners = tris0[st['vparent'][v]]
        rows, ys = [], []
        for wr, wp in ps:
            tgt = st['vbary'][v] @ skin_full(W0['pos'][corners], W0['W'][corners], joints, wr, wp)
            cols = [qmat(wr[b]) @ (x - h[b]) + wp[b] for b in bi]
            rows.append(np.array(cols).T)
            ys.append(tgt)
        w = simplex_lsq(np.concatenate(rows), np.concatenate(ys))
        st['W'][v] = 0
        st['W'][v, bi] = w


def presplit(body, cuts, mh=None, refit_weights=True):
    """Cut `body` in place along `cuts` ([(scalar, value, (lo, hi) or None)],
    in order); inserted vertices take refitted weights (`refit`) and, with
    `mh`, their surface map. Records body['split'] for the regression."""
    n0, m0 = len(body['pos']), len(body['tris'])
    st = {k: body[k] for k in ('pos', 'tris', 'tri_uv', 'W', 'morph_pos', 'region')}
    st['region'] = {k: v.copy() for k, v in st['region'].items()}
    st['vparent'] = -np.ones(n0, int)
    st['vbary'] = np.zeros((n0, 3))
    st['torig'] = np.arange(m0)
    st['cbary'] = np.tile(np.eye(3), (m0, 1, 1))
    for key, c, within in cuts:
        k = split_level(st, key, c, None if within is None else height_within(*within))
        print(f'[body] split {key} at {c:.4f}: {k} vertices')
    ids = np.arange(n0, len(st['pos']))
    W0 = {'pos': body['pos'], 'W': body['W']}
    tris0 = body['tris']
    if refit_weights and len(ids):
        refit(st, body['joints'], W0, tris0, ids)
    for k in ('pos', 'tris', 'tri_uv', 'W', 'morph_pos', 'region'):
        body[k] = st[k]
    if mh is not None and len(ids):
        idx, bary, off = body['map']
        i2, b2, o2 = surface_map(mh, body['basis_full'], body['pos'][ids])
        body['map'] = (np.concatenate([idx, i2]), np.concatenate([bary, b2]), np.concatenate([off, o2]))
    body['split'] = {'n0': n0, 'tris0': tris0, 'pos0': W0['pos'], 'W0': W0['W'], 'parent': st['vparent'][ids],
                     'bary': st['vbary'][ids], 'torig': st['torig']}
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


def selftest_split():
    """The split tool on a toy triangle (no Blender needed): interpolation,
    the exact level value, four non-negative normalised refitted weights, the
    region scalars untouched by the refit, no hanging vertex."""
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
    arm0 = body['region']['arm'].copy()
    presplit(body, [('y', 0.5, None)])
    n = len(body['pos'])
    assert n == 7, n  # edges 0-2, 1-2 (the diagonal) and 1-3
    assert len(body["tris"]) == 6, len(body["tris"])
    new = np.arange(4, n)
    assert np.allclose(body['region']['y'][new], 0.5) and (body['region']['y'][new] == 0.5).all()
    assert np.allclose(body['pos'][new][:, 1], 0.5)
    assert np.allclose(body['morph_pos']['female'][new], body['pos'][new] * 0.1)
    # the arm scalar interpolated, never re-read from the refitted weights
    on02 = [k for k in new if np.isclose(body['pos'][k, 0], 0.0)][0]
    assert np.isclose(body['region']['arm'][on02], 0.5 * (arm0[0] + arm0[2]))
    w = body['W'][new]
    assert (w >= 0).all() and np.allclose(w.sum(1), 1) and ((w > 0).sum(1) <= 4).all()
    # every edge of the cut mesh is shared by at most two faces and no face
    # has a vertex on its edge's interior (no hanging vertex)
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
    # windings kept: every face's normal still +z
    for t in body['tris']:
        P = body['pos'][t]
        assert np.cross(P[1] - P[0], P[2] - P[0])[2] > 0
    print('body split selftest: ok')
