"""The game's own skinning path, in numpy (src/render/villagerFigureBody.ts,
villagerClipPose.ts, villagerRig.ts), so the penetration report and the fit
see what the game draws:

1. the person's morphed A-pose mesh is skinned ONCE onto the hanging skeleton
   (`hangRotations`, `hungHeads`, `bakePose`) and baked;
2. a clip pose is solved on the A-pose skeleton (forward kinematics; a gait's
   stride warped by two-bone IK on the legs, `clipGaitPose`);
3. the baked mesh is skinned AGAIN by the hung bones, whose world turn is the
   pose's W · hang⁻¹ (`toHung`).

Two linear blends in a row are not one: a vertex blended between bones moves
otherwise than a single blend would move it. The game's uniform scale and sole
offset are left out (the report states depths in the pipeline's units).
"""
import math

import numpy as np

import rig
import skeleton as SK
from gltfio import qfrom_to, qinv, qmul, qnorm, qmat

DOWN = np.array([0.0, -1.0, 0.0])
I = SK.INDEX


def hang_rotations(h):
    """villagerFigureBody.ts hangRotations: arms and legs turned to hang."""
    q = np.tile([0, 0, 0, 1.0], (len(SK.NAMES), 1))

    def down(a, b):
        return qfrom_to(h[I[b]] - h[I[a]], DOWN)
    for s in ('L', 'R'):
        q[I['upperArm.' + s]] = down('upperArm.' + s, 'forearm.' + s)
        q[I['forearm.' + s]] = down('forearm.' + s, 'hand.' + s)
        q[I['hand.' + s]] = q[I['forearm.' + s]]
        q[I['thigh.' + s]] = down('thigh.' + s, 'shin.' + s)
        q[I['shin.' + s]] = down('shin.' + s, 'foot.' + s)
    return q


def hung_heads(h, hang):
    """villagerFigureBody.ts hungHeads: each child placed by its parent's turn."""
    out = np.zeros_like(h)
    for i in rig.ORDER:
        p = rig.PARENT_IDX[i]
        out[i] = h[i] if p < 0 else out[p] + qmat(hang[p]) @ (h[i] - h[p])
    return hang_columns(out)


def hang_columns(heads):
    """villagerFigureBody.ts hangColumns: the column bones' knee pivots
    (`col.L` heads) at the mean hung `shin` height (stage-3 plan section 3.2)."""
    knee = 0.5 * (heads[I['shin.L'], 1] + heads[I['shin.R'], 1])
    for n in SK.COLUMN_NAMES:
        if n.startswith('col.L.'):
            heads[I[n], 1] = knee
    return heads


def bake(verts, jidx, jw, h, heads, hang):
    """villagerFigureBody.ts bakePose: one blend from rest `h` onto the hung
    skeleton (normalised by the total weight)."""
    R = np.array([qmat(q) for q in hang])
    out = np.zeros_like(verts)
    for k in range(jidx.shape[1]):
        b = jidx[:, k]
        out += jw[:, k, None] * (np.einsum('vij,vj->vi', R[b], verts - h[b]) + heads[b])
    t = jw.sum(1)
    return np.where(t[:, None] > 0, out / np.maximum(t, 1e-12)[:, None], verts)


class Person:
    """One body corner as the game builds it: A-pose heads, hang, hung heads."""

    def __init__(self, joints):
        self.h = joints[:, :3].copy()
        self.hang = hang_rotations(self.h)
        self.heads = hung_heads(self.h, self.hang)
        self.hang_inv = np.array([qinv(q) for q in self.hang])

    def bake(self, verts, jidx, jw):
        return bake(verts, jidx, jw, self.h, self.heads, self.hang)

    def pose(self, q, hips, stride=1.0):
        """A clip frame's world turns and heads (A-pose) on this person's
        skeleton, a gait's stride warped by `stride` — the one pose path the
        fit, the report and the sheets share."""
        return rig.fk(self.h, stride_pose(self.h, q, hips, stride), hips)

    def drawn(self, wr):
        """The hung bones' world turns for a pose's A-pose world turns."""
        return np.array([qnorm(qmul(wr[i], self.hang_inv[i])) for i in range(len(wr))])

    def skin(self, baked, jidx, jw, wr, wp):
        """villagerClipPose.ts toHung + three's skinning of the baked mesh."""
        return rig.skin(baked, jidx, jw, self.heads, self.drawn(wr), wp)

    def draw(self, verts, jidx, jw, wr, wp):
        """Rest positions as the game draws them in a pose: baked, then skinned."""
        return self.skin(self.bake(verts, jidx, jw), jidx, jw, wr, wp)

    def blend(self, jidx, jw, wr):
        """Per vertex the linear part (n × 3 × 3) of `draw`: the skinning
        blend after the bake blend (both normalised by the total weight)."""
        Rh = np.array([qmat(q) for q in self.hang])
        Rd = np.array([qmat(q) for q in self.drawn(wr)])
        t = np.maximum(jw.sum(1), 1e-12)[:, None, None]
        A1 = np.einsum('vk,vkij->vij', jw, Rh[jidx]) / t
        A2 = np.einsum('vk,vkij->vij', jw, Rd[jidx])
        return np.einsum('vij,vjk->vik', A2, A1)

    def undraw(self, posed, jidx, jw, wr, wp):
        """The rest positions `draw` takes to `posed` (it is affine per vertex)."""
        zero = self.draw(np.zeros_like(posed), jidx, jw, wr, wp)
        return np.linalg.solve(self.blend(jidx, jw, wr), (posed - zero)[:, :, None])[:, :, 0]

    def build_pose(self, q):
        """The A-pose world turns and heads of the build (design) pose."""
        return self.pose(q, None)


# ---- the gait's stride warp (villagerClipPose.ts clipGaitPose, body null) ----------


def _mat_quat(m):
    from mathutils import Matrix
    q = Matrix(m.tolist()).to_quaternion()
    return np.array([q.x, q.y, q.z, q.w])


def _frame(d, n):
    return np.stack([d, n, np.cross(d, n)], axis=1)


def _unit(v):
    return v / np.linalg.norm(v)


def _set_world(q, wr, i, W):
    p = rig.PARENT_IDX[i]
    q[i] = W if p < 0 else qnorm(qmul(qinv(wr[p]), W))


def solve_limb(h, q, hips, upper, lower, end, target, pole):
    """villagerRig.ts solveLimb on local rotations `q` (mutated)."""
    u0 = h[lower] - h[upper]
    f0 = h[end] - h[lower]
    a, b = np.linalg.norm(u0), np.linalg.norm(f0)
    u0, f0 = u0 / a, f0 / b
    n0 = np.cross(u0, f0)
    if n0 @ n0 < 1e-10:
        n0 = np.cross([1.0, 0, 0], u0)
    n0 = _unit(n0)
    wr, wp = rig.fk(h, q, hips)
    d = target - wp[upper]
    want = np.linalg.norm(d)
    dist = min(a + b - 1e-5, max(abs(a - b) + 1e-5, want))
    d = d / want
    cos_a = (a * a + dist * dist - b * b) / (2 * a * dist)
    side = pole - d * (pole @ d)
    if side @ side < 1e-10:
        side = np.array([0, 0, 1.0]) - d * d[2]
    side = _unit(side)
    u1 = _unit(d * cos_a + side * np.sqrt(max(0.0, 1 - cos_a * cos_a)))
    f1 = _unit(d * dist - u1 * a)
    n1 = _unit(np.cross(u1, f1))
    _set_world(q, wr, upper, _mat_quat(_frame(u1, n1) @ _frame(u0, n0).T))
    wr, wp = rig.fk(h, q, hips)
    _set_world(q, wr, lower, _mat_quat(_frame(f1, n1) @ _frame(f0, n0).T))


def stride_pose(h, q, hips, stride):
    """A gait frame with its stride warped by `stride` (the foot's reach fore
    and aft of the hips scaled), each foot keeping its world turn."""
    q = q.copy()
    if abs(stride - 1) < 1e-9:
        return q
    hp = I['hips']
    for s in ('L', 'R'):
        th, sh, ft = I['thigh.' + s], I['shin.' + s], I['foot.' + s]
        wr, wp = rig.fk(h, q, hips)
        t = wp[ft].copy()
        t[2] += (wp[ft][2] - wp[hp][2]) * (stride - 1)
        keep = wr[ft].copy()
        solve_limb(h, q, hips, th, sh, ft, t, np.array([0, 0, 1.0]))
        wr, wp = rig.fk(h, q, hips)
        _set_world(q, wr, ft, keep)
    return q


def strides(cfg):
    """The stride factors the game can draw a gait at (VILLAGER_GLTF)."""
    g = cfg['VILLAGER_GLTF']
    return (g['strideMin'], 1.0, g['strideMax'])


def poses(clips, names, cfg):
    """Every (clip, frame, stride, q, hips) the measurement covers: each frame
    of each clip; a gait's at the shortest, natural and longest stride."""
    for cname in names:
        c = clips['clips'][cname]
        ks = strides(cfg) if c['kind'] == 'gait' else (1.0,)
        for f in range(len(c['times'])):
            for k in ks:
                yield cname, f, k, c['q'][f], c['hips'][f]


def drawn_garment(person, g, weights, wr, wp):
    """A garment as the game draws it on `person` in a pose: morphed, hung and
    baked, skinned by the hung bones."""
    from body import top4
    gi, gw = top4(g['W'])
    p = g['pos'].copy()
    for m, x in weights.items():
        if x:
            p += x * g['morph_pos'][m]
    return person.skin(person.bake(p, gi, gw), gi, gw, wr, wp)


# ---- the runtime's composed poses (src/render/villagerRuntimePose.test.tsx) --------
#
# The Vitest exporter records the game's own figure (SkinnedFigure) frame by
# frame: the root group's transform with its scale, the chain from the root to
# the skeleton, every hung bone's local translation/rotation/scale, the morph
# weights and three's world matrices. Positions are the game's: the drawn body
# in figure units, (p − sole·ŷ) × scale of the pipeline's (villagerFigureBody.ts
# gltfPerson). Nothing below may be used as evidence before `runtime_check`
# has passed on the same export.

RUNTIME_TOLERANCE = 1e-4


def load_runtime(path):
    import json
    with open(path) as f:
        rt = json.load(f)
    if rt.get('version') != 1:
        raise RuntimeError(f'runtime poses {path}: unknown version {rt.get("version")}')
    if list(rt['bones']) != list(SK.NAMES):
        raise RuntimeError(f'runtime poses {path}: bone list differs from the pipeline skeleton')
    return rt


def trs_matrix(t):
    """three's Object3D.matrix: translation · rotation · scale."""
    m = np.eye(4)
    m[:3, :3] = qmat(np.asarray(t['q'], float)) * np.asarray(t['s'], float)[None, :]
    m[:3, 3] = t['p']
    return m


def runtime_root(frame):
    """The figure-body mesh's world matrix: the root group, then the chain."""
    m = trs_matrix(frame['root'])
    for c in frame['chain']:
        m = m @ trs_matrix(c)
    return m


def runtime_bones(frame, root=None):
    """Every bone's world matrix (bones × 4 × 4), from the exported locals."""
    root = runtime_root(frame) if root is None else root
    out = np.zeros((len(SK.NAMES), 4, 4))
    for i in rig.ORDER:
        p = rig.PARENT_IDX[i]
        out[i] = (root if p < 0 else out[p]) @ trs_matrix(frame['bones'][i])
    return out


def runtime_weights(identity, cfg):
    """villagerBody.ts morphInfluences: the body's morph weights for a figure."""
    from sheets import corner_weights
    by_age = cfg['VILLAGER_GLTF']['buildByAge'][identity['age']]
    b = max(-1.0, min(1.0, identity['build'])) * by_age
    return corner_weights(identity['sex'], identity['age'], b)


def runtime_person(body, subject, cfg):
    """The pipeline's person for a subject, with its morph weights."""
    from sheets import morphed
    w = runtime_weights(subject['identity'], cfg)
    pos, j = morphed(body, w)
    return Person(j), pos, w


def to_game(subject, v):
    """Pipeline (hung, baked) positions onto the drawn body's: (p − sole·ŷ) × scale."""
    pr = subject['person']
    out = np.asarray(v, float).copy()
    out[:, 1] -= pr['sole']
    return out * pr['scale']


def runtime_check(body, rt, cfg, tol=RUNTIME_TOLERANCE, log=print):
    """THE ROUND TRIP. For every subject and frame: the world joints rebuilt
    here from the exported root, chain and bone locals match three's
    (matrixWorld) within `tol`; the morph weights rebuilt from the identity
    by the game's rule match the exported ones; and the pipeline's hung rest
    heads of that body, put on the drawn body, match the runtime's rest. Raises
    on any miss; returns the worst values."""
    worst = {'joint': 0.0, 'matrix': 0.0, 'morph': 0.0, 'rest': 0.0}
    for s in rt['subjects']:
        person, _pos, w = runtime_person(body, s, cfg)
        rest = to_game(s, person.heads)
        worst['rest'] = max(worst['rest'], float(np.abs(rest - np.asarray(s['person']['rest']).reshape(-1, 3)).max()))
        for f in s['frames']:
            got = runtime_bones(f)
            want = np.array([np.asarray(m, float).reshape(4, 4).T for m in f['world']])
            # a NaN (JSON null) would pass `max` unseen: a nonfinite matrix fails outright
            if not (np.isfinite(got).all() and np.isfinite(want).all()):
                raise RuntimeError(f'runtime check FAILED: {s["id"]} t {f["t"]} carries a nonfinite bone matrix')
            worst['joint'] = max(worst['joint'], float(np.linalg.norm(got[:, :3, 3] - want[:, :3, 3], axis=1).max()))
            worst['matrix'] = max(worst['matrix'], float(np.abs(got - want).max()))
            exported = f['morph']['influences']
            if not all(isinstance(x, (int, float)) and math.isfinite(x) for x in exported.values()):
                raise RuntimeError(f'runtime check FAILED: {s["id"]} t {f["t"]} carries a nonfinite morph weight')
            names = set(exported) | {k for k, x in w.items() if x}
            worst['morph'] = max([worst['morph']] + [abs(exported.get(k, 0.0) - w.get(k, 0.0)) for k in names])
            # the live hand shapes the mesh draws: by name, each a body morph, in [0, 1]
            from body import HAND_MORPHS
            for k, x in f['morph']['mesh'].items():
                if k not in HAND_MORPHS or not (isinstance(x, (int, float)) and math.isfinite(x) and -1e-6 <= x <= 1 + 1e-6):
                    raise RuntimeError(f'runtime check FAILED: {s["id"]} t {f["t"]} draws mesh morph {k} = {x}, not a hand shape weight in [0, 1]')
    frames = sum(len(s['frames']) for s in rt['subjects'])
    log(f'runtime check: {len(rt["subjects"])} subjects, {frames} frames; worst joint {worst["joint"]:.2e}, matrix {worst["matrix"]:.2e}, '
        f'morph {worst["morph"]:.2e}, rest {worst["rest"]:.2e} (tolerance {tol:g})')
    bad = {k: v for k, v in worst.items() if not v <= tol}
    if bad:
        raise RuntimeError(f'runtime check FAILED: {bad} over {tol:g} — the runtime export is no evidence until the round trip matches')
    return worst


def shell_round_trip(body, garments, rt, cfg, tol=RUNTIME_TOLERANCE, log=print):
    """The shells' round trip (src/render/villagerRuntimePose.test.tsx): for
    every exported outfit, the composed rest body's normals recomputed here
    (body.vertex_normals over the full index) match the game's (D17), and the
    shells rebuilt here (shells.py `build`) from that rest body with the
    exported scale match the game's vertex for vertex, rim quads included and
    a covered seam's inner row on the lower shell's edge. Raises on a miss."""
    import shells as SHL
    from body import vertex_normals
    meshes = garments['meshes']
    sh = {n: meshes[n] for n in SHL.names_of(meshes)}
    outfits = rt.get('shells') or []
    if not sh and not outfits:
        return {'normal': 0.0, 'shell': 0.0}
    # coverage: every built shell worn by some exported outfit
    if not outfits or set(sh) - {n for o in outfits for n in o['worn']}:
        raise RuntimeError(f'shell round trip FAILED: the export covers {len(outfits)} outfits, '
                           f'leaving {sorted(set(sh) - {n for o in outfits for n in o["worn"]})} unworn')
    tris = np.asarray(body['tris'])
    fm = SHL.face_masks(body['region_bits'], tris)
    worst = {'normal': 0.0, 'shell': 0.0}
    bad = []

    def finite(*xs):
        return all(np.isfinite(np.asarray(x, float)).all() for x in xs)

    def note(k, got, want):
        # a nonfinite value is a miss (max would keep the previous value past a NaN)
        d = float(np.abs(got - want).max()) if len(got) else 0.0
        if not math.isfinite(d):
            return False
        worst[k] = max(worst[k], d)
        return True

    for o in outfits:
        label = f"{o['sex']} {o['age']} {'+'.join(o['worn'])}"
        pos = np.asarray(o['body']['pos'], float).reshape(-1, 3)
        normal = np.asarray(o['body']['normal'], float).reshape(-1, 3)
        if not finite(pos, normal, o['scale']) or len(pos) != len(body['pos']):
            bad.append(f'{label}: nonfinite or wrong-sized rest body')
            continue
        nrm = vertex_normals(pos, tris)
        if not note('normal', nrm, normal):
            bad.append(f'{label}: nonfinite normal comparison')
        g = SHL.build(pos, tris, nrm, fm, sh, o['worn'], cfg['VILLAGER_ASSET']['garmentShellStep'], scale=o['scale'])
        # the exported shell set equals the expected one, and is not empty
        if not g or set(g) != set(o['shells']):
            bad.append(f'{label}: exported shells {sorted(o["shells"])}, expected {sorted(g)}')
            continue
        for n, x in o['shells'].items():
            if len(g[n]['src']) != len(x['src']) or (g[n]['src'] != np.asarray(x['src'])).any() \
                    or len(g[n]['tris'].ravel()) != len(x['index']) or (g[n]['tris'].ravel() != np.asarray(x['index'])).any() \
                    or len(g[n]['rim']) != len(x['rim']) or (g[n]['rim'] != np.asarray(x['rim'], bool)).any():
                bad.append(f'{label}: {n} differs in its vertices, faces or rims')
                continue
            xp = np.asarray(x['pos'], float).reshape(-1, 3)
            if not finite(xp, g[n]['pos']) or not note('shell', g[n]['pos'], xp):
                bad.append(f'{label}: {n} carries a nonfinite position')
    log(f"shell round trip: {len(outfits)} outfits; worst normal {worst['normal']:.2e}, shell position {worst['shell']:.2e} (tolerance {tol:g})")
    if bad or not all(v <= tol for v in worst.values()):
        raise RuntimeError(f'shell round trip FAILED: {bad or worst}')
    return worst


def selftest_shell_round_trip():
    """shell_round_trip on a toy tube (no Blender needed): a faithful export
    passes; an empty shell dict, a missing outfit, a NaN position or a NaN
    normal fail."""
    import copy
    import shells as SHL
    from body import vertex_normals
    pos, tris, _vid = SHL._tube(8, 4)
    y = pos[:, 1]
    words = (np.where(y <= 2, 1, 0) | np.where(y >= 2, 2, 0)).astype(np.uint32)
    fm = SHL.face_masks(words, tris)
    meshes = {}
    for n, bit, rank in (('g-a-x', 0, 1), ('g-b-x', 1, 2)):
        faces = np.nonzero(fm & np.uint32(1 << bit))[0]
        meshes[n] = {'part': 'shell', 'bit': bit, 'rank': rank, 'base': 0.1, 'faces': faces, 'rows': SHL.boundary_loops(tris, faces)}
    body = {'pos': pos, 'tris': tris, 'region_bits': words}
    cfg = {'VILLAGER_ASSET': {'garmentShellStep': 0.05}}
    nrm = vertex_normals(pos, tris)
    g = SHL.build(pos, tris, nrm, fm, meshes, ['g-a-x', 'g-b-x'], 0.05, scale=1.5)
    rt = {'shells': [{'sex': 'female', 'age': 'adult', 'worn': ['g-a-x', 'g-b-x'], 'scale': 1.5,
                      'body': {'pos': pos.ravel().tolist(), 'normal': nrm.ravel().tolist()},
                      'shells': {n: {'pos': x['pos'].ravel().tolist(), 'src': x['src'].tolist(), 'index': x['tris'].ravel().tolist(),
                                     'rim': x['rim'].astype(int).tolist()} for n, x in g.items()}}]}
    quiet = lambda *_a: None  # noqa: E731
    shell_round_trip(body, {'meshes': meshes}, rt, cfg, log=quiet)

    def fails(edit, why):
        bad = copy.deepcopy(rt)
        edit(bad)
        try:
            shell_round_trip(body, {'meshes': meshes}, bad, cfg, log=quiet)
        except RuntimeError:
            return
        raise AssertionError(f'shell round trip passed {why}')
    fails(lambda r: r['shells'][0].update(shells={}), 'an empty shell dict')
    fails(lambda r: r.update(shells=[]), 'no outfit')
    fails(lambda r: r['shells'][0]['shells'].pop('g-b-x'), 'a missing shell')
    fails(lambda r: r['shells'][0]['shells']['g-a-x']['pos'].__setitem__(0, float('nan')), 'a NaN shell position')
    fails(lambda r: r['shells'][0]['body']['normal'].__setitem__(0, float('nan')), 'a NaN body normal')
    print('shell round trip selftest: ok')


def runtime_hand_deltas(person, pos, body, jidx, jw):
    """Per hand shape (body.HAND_MORPHS) its delta on the person's BAKED body
    (the game carries the live morphs through the hang bake, villagerFigureBody.ts
    bakePose): bake(pos + d) − bake(pos), the bake being affine per vertex."""
    from body import HAND_MORPHS
    base = person.bake(pos, jidx, jw)
    return {m: person.bake(pos + body['morph_pos'][m], jidx, jw) - base for m in HAND_MORPHS}


def runtime_hands(frame, deltas):
    """The hand shapes a frame draws, as one delta on the baked body (zero
    when it draws none)."""
    out = 0.0
    for m, x in frame['morph']['mesh'].items():
        if x and m in deltas:
            out = out + x * deltas[m]
    return out


def runtime_skin(subject, frame, baked, jidx, jw, space='figure'):
    """Baked pipeline positions (Person.bake) skinned by the frame's bones as
    three skins them (bone world · bind inverse, the bind the hung rest with
    identity rotations). `space`: 'world' (the root included), 'figure' (in
    the figure-body mesh's frame, the root left out) or 'pipeline' (figure
    space back in pipeline units, the root's squash left to runtime_squash,
    which three applies after the shader's local mask push)."""
    root = runtime_root(frame)
    bones = runtime_bones(frame, root)
    rest = np.asarray(subject['person']['rest'], float).reshape(-1, 3)
    v = to_game(subject, baked)
    if space != 'world':
        bones = np.einsum('ij,bjk->bik', np.linalg.inv(root), bones)
    out = np.zeros_like(v)
    t = jw.sum(1)
    for k in range(jidx.shape[1]):
        b = jidx[:, k]
        rel = v - rest[b]
        out += jw[:, k, None] * (np.einsum('vij,vj->vi', bones[b][:, :3, :3], rel) + bones[b][:, :3, 3])
    out = np.where(t[:, None] > 0, out / np.maximum(t, 1e-12)[:, None], v)
    if space != 'pipeline':
        return out
    pr = subject['person']
    out = out / pr['scale']
    out[:, 1] += pr['sole']
    return out


def runtime_squash(subject, frame):
    """The root's y-squash relative to its uniform scale, on pipeline
    positions (runtime_skin 'pipeline'): applied AFTER the mask push, as three
    applies the root after the shader pushes in the mesh's local space."""
    lin = trs_matrix(frame['root'])[:3, :3]
    r = np.linalg.norm(lin[:, 1]) / np.linalg.norm(lin[:, 0])
    sole = subject['person']['sole']

    def apply(v):
        out = np.array(v, float)
        out[..., 1] = (out[..., 1] - sole) * r + sole
        return out
    return apply


def runtime_tool(frame):
    """The shovel's world matrix (4 × 4) when drawn, else None."""
    t = frame.get('tool')
    if not t or not t['visible']:
        return None
    return np.asarray(t['matrix'], float).reshape(4, 4).T


# ---------------------------------------------------------------------------
# THE COLUMN DRIVER MIRROR (docs/garment-stage3-plan-1398.md sections 3.4 to
# 3.7): src/render/villagerSkirtDriver.ts `ColumnDriver`, step for step, on
# plain lists (column-major 4×4 matrices as three stores them). It replays a
# fixed-dt sequence statefully from the reset state; `column_round_trip`
# compares its column locals with the game's export within 1e-4.

_DEG = math.pi / 180


def _sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def _add(a, b):
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


def _mul(a, s):
    return [a[0] * s, a[1] * s, a[2] * s]


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def _len(a):
    return math.sqrt(_dot(a, a))


def _norm(a):
    n = _len(a) or 1.0
    return _mul(a, 1.0 / n)


def _at(a, i):
    return [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]]


def col_rotate(v, k, th):
    """Rodrigues: v turned by th about the unit axis k (right-handed)."""
    c = math.cos(th)
    s = math.sin(th)
    kv = _cross(k, v)
    kd = _dot(k, v) * (1 - c)
    return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd]


def _xform(m, p):
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
            m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
            m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]


def _xdir(m, p):
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
            m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
            m[2] * p[0] + m[6] * p[1] + m[10] * p[2]]


def _apply(m, p):
    """three's Vector3.applyMatrix4 (with the perspective divide)."""
    w = 1.0 / (m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15])
    return [(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) * w,
            (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) * w,
            (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) * w]


def _compose(p, q, s):
    """three's Matrix4.compose (column-major)."""
    x, y, z, w = q
    x2, y2, z2 = x + x, y + y, z + z
    xx, xy, xz = x * x2, x * y2, x * z2
    yy, yz, zz = y * y2, y * z2, z * z2
    wx, wy, wz = w * x2, w * y2, w * z2
    sx, sy, sz = s
    return [(1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0.0,
            (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0.0,
            (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0.0,
            p[0], p[1], p[2], 1.0]


def _matmul(a, b):
    r = [0.0] * 16
    for c in range(4):
        for rr in range(4):
            s = 0.0
            for k in range(4):
                s += a[k * 4 + rr] * b[c * 4 + k]
            r[c * 4 + rr] = s
    return r


def _inverse(m):
    a = np.array(m, float).reshape(4, 4).T
    return np.linalg.inv(a).T.ravel().tolist()


def _axis_quat(axis, th):
    s = math.sin(th / 2)
    return [axis[0] * s, axis[1] * s, axis[2] * s, math.cos(th / 2)]


def col_point_segment(p, a, b):
    ab = _sub(b, a)
    l2 = _dot(ab, ab)
    t = min(1.0, max(0.0, _dot(_sub(p, a), ab) / l2)) if l2 > 0 else 0.0
    return _len(_sub(p, _add(a, _mul(ab, t))))


def col_sector_of(a, b, ref, n, p):
    """The sector of p about the axis a -> b: n sectors from -pi, measured from ref toward
    axis x ref (as villagerSkirtDriver.ts sectorOf)."""
    u = _norm(_sub(b, a))
    w = _sub(p, a)
    ang = math.atan2(_dot(w, _cross(u, ref)), _dot(w, ref))
    return min(n - 1, max(0, math.floor((ang + math.pi) / (2 * math.pi) * n)))


def col_capsule_radius(cap, p):
    """The envelope radius a posed capsule (a, b, radius, ry, sectors, ref) holds toward p: its
    sector's radius when it has sectors, else its radius (section 3.5; as capsuleRadius)."""
    a, b, radius, _ry, sectors, ref = cap
    if not sectors or len(sectors) < 2 or ref is None:
        return radius
    return sectors[col_sector_of(a, b, ref, len(sectors), p)]


def col_rest_height(ry, p):
    """A posed point's height in a capsule bone's REST frame (as villagerSkirtDriver.ts restHeight)."""
    return ry[0] * p[0] + ry[1] * p[1] + ry[2] * p[2] + ry[3]


def col_rest_height_row(m, rest_y):
    """inverse(posed bone matrix)'s y row plus the bone's rest y (as villagerSkirtDriver.ts restHeightRow)."""
    e = _inverse(m)
    return (e[1], e[5], e[9], e[13] + rest_y)


def col_capsule_active(ry, hy, p, bottom):
    """A capsule constrains a posed point below the profile bottom in its bone's rest frame OR in the
    posed hips frame (section 3.5, owner decision 03.11.2026 22:19; as villagerSkirtDriver.ts capsuleActive)."""
    return col_rest_height(ry, p) < bottom or col_rest_height(hy, p) < bottom


def col_clip_active(tri, ry, hy, bottom):
    """The part of a triangle where a capsule is active (as villagerSkirtDriver.ts clipActive)."""
    out = col_clip_below(tri, [col_rest_height(ry, x) for x in tri], bottom)
    for t in col_clip_below(tri, [-col_rest_height(ry, x) for x in tri], -bottom, True):
        out += col_clip_below(t, [col_rest_height(hy, x) for x in t], bottom)
    return out


def col_segment_segment(p1, q1, p2, q2):
    """Ericson 5.1.9, as villagerSkirtDriver.ts segmentSegment."""
    d1 = _sub(q1, p1)
    d2 = _sub(q2, p2)
    r = _sub(p1, p2)
    a = _dot(d1, d1)
    e = _dot(d2, d2)
    f = _dot(d2, r)
    eps = 1e-12
    if a <= eps and e <= eps:
        return _len(r)
    if a <= eps:
        s = 0.0
        t = min(1.0, max(0.0, f / e))
    else:
        c = _dot(d1, r)
        if e <= eps:
            t = 0.0
            s = min(1.0, max(0.0, -c / a))
        else:
            b = _dot(d1, d2)
            den = a * e - b * b
            s = min(1.0, max(0.0, (b * f - c * e) / den)) if den > eps else 0.0
            t = (b * s + f) / e
            if t < 0:
                t = 0.0
                s = min(1.0, max(0.0, -c / a))
            elif t > 1:
                t = 1.0
                s = min(1.0, max(0.0, (b - c) / a))
    return _len(_sub(_add(p1, _mul(d1, s)), _add(p2, _mul(d2, t))))


def col_point_triangle(p, a, b, c):
    """Ericson 5.1.5, as villagerSkirtDriver.ts pointTriangle."""
    ab = _sub(b, a)
    ac = _sub(c, a)
    ap = _sub(p, a)
    d1 = _dot(ab, ap)
    d2 = _dot(ac, ap)
    if d1 <= 0 and d2 <= 0:
        return a
    bp = _sub(p, b)
    d3 = _dot(ab, bp)
    d4 = _dot(ac, bp)
    if d3 >= 0 and d4 <= d3:
        return b
    vc = d1 * d4 - d3 * d2
    if vc <= 0 and d1 >= 0 and d3 <= 0:
        return _add(a, _mul(ab, d1 / (d1 - d3)))
    cp = _sub(p, c)
    d5 = _dot(ab, cp)
    d6 = _dot(ac, cp)
    if d6 >= 0 and d5 <= d6:
        return c
    vb = d5 * d2 - d1 * d6
    if vb <= 0 and d2 >= 0 and d6 <= 0:
        return _add(a, _mul(ac, d2 / (d2 - d6)))
    va = d3 * d6 - d5 * d4
    if va <= 0 and d4 - d3 >= 0 and d5 - d6 >= 0:
        return _add(b, _mul(_sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))))
    den = 1 / (va + vb + vc)
    return _add(a, _add(_mul(ab, vb * den), _mul(ac, vc * den)))


def col_clip_below(pts, h, bottom, inclusive=False):
    """The part of triangle pts whose height h (affine, given at its corners) lies below bottom
    (or at it, inclusive): 0-2 triangles. The inclusive side keeps a triangle lying wholly at the height."""
    poly = []

    def inside(x):
        return x <= bottom if inclusive else x < bottom
    for i in range(3):
        j = (i + 1) % 3
        in_i = inside(h[i])
        if in_i:
            poly.append(tuple(pts[i]))
        if in_i != inside(h[j]):
            u = (bottom - h[i]) / (h[j] - h[i])
            poly.append(tuple(pts[i][e] + (pts[j][e] - pts[i][e]) * u for e in range(3)))
    return [(poly[0], poly[i], poly[i + 1]) for i in range(1, len(poly) - 1)]


def col_segment_triangle(p, q, a, b, c):
    e1 = _sub(b, a)
    e2 = _sub(c, a)
    d = _sub(q, p)
    h = _cross(d, e2)
    det = _dot(e1, h)
    if abs(det) > 1e-14:
        s = _sub(p, a)
        u = _dot(s, h) / det
        qv = _cross(s, e1)
        v = _dot(d, qv) / det
        t = _dot(e2, qv) / det
        if u >= 0 and v >= 0 and u + v <= 1 and 0 <= t <= 1:
            return 0.0
    return min(_len(_sub(p, col_point_triangle(p, a, b, c))), _len(_sub(q, col_point_triangle(q, a, b, c))),
               col_segment_segment(p, q, a, b), col_segment_segment(p, q, b, c), col_segment_segment(p, q, c, a))


def _wrap(a):
    t = math.fmod(a, 2 * math.pi)
    return t + 2 * math.pi if t < 0 else t


def _angle_dist(a, b):
    d = _wrap(a - b)
    return min(d, 2 * math.pi - d)


class PelvisProfile:
    """villagerSkirtDriver.ts PelvisProfile: per column and height bin the
    largest posed radius among the samples posed there; empty bins from the
    nearest populated one (same column first, lower on a tie; else other
    columns by angle, then height, larger value on a tie)."""

    def __init__(self, angles, bottom, top, bin_, margin=0.0, band=float('inf')):
        # margin: added to a query below bottom + band (the profile margin x scale, section 3.5)
        self.margin = margin
        self.band = band
        self.angles = list(angles)
        self.bottom = bottom
        self.top = top
        self.bin = bin_
        self.columns = len(self.angles)
        self.bins = max(1, math.ceil((top - bottom) / bin_ - 1e-9))
        self.value = [0.0] * (self.columns * self.bins)

    def column(self, a):
        best, bd = 0, math.inf
        for k, c in enumerate(self.angles):
            d = _angle_dist(a, c)
            if d < bd - 1e-12:
                bd, best = d, k
        return best

    def bin_of(self, y):
        return min(self.bins - 1, max(0, math.floor((y - self.bottom) / self.bin)))

    def rebuild(self, samples):
        nb = self.bins
        filled = [0] * (self.columns * nb)
        self.value = [0.0] * (self.columns * nb)
        for a, y, r in samples:
            # a sample posed below the bottom is dropped, not clamped into the bottom bin (section 3.5)
            if y < self.bottom:
                continue
            i = self.column(a) * nb + self.bin_of(y)
            if not filled[i] or r > self.value[i]:
                self.value[i] = r
            filled[i] = 1
        out = list(self.value)
        for k in range(self.columns):
            for b in range(nb):
                if filled[k * nb + b]:
                    continue
                found = -1
                d = 1
                while d < nb and found < 0:
                    if b - d >= 0 and filled[k * nb + b - d]:
                        found = k * nb + b - d
                    elif b + d < nb and filled[k * nb + b + d]:
                        found = k * nb + b + d
                    d += 1
                if found >= 0:
                    out[k * nb + b] = self.value[found]
                    continue
                best, ba, bh = -1, math.inf, math.inf
                for j in range(self.columns):
                    if j == k:
                        continue
                    da = _angle_dist(self.angles[j], self.angles[k])
                    for c in range(nb):
                        i = j * nb + c
                        if not filled[i]:
                            continue
                        dh = abs(c - b)
                        if da < ba - 1e-12 or (abs(da - ba) <= 1e-12 and (dh < bh or (dh == bh and self.value[i] > self.value[best]))):
                            best, ba, bh = i, da, dh
                if best < 0:
                    raise RuntimeError('PelvisProfile: no populated bin')
                out[k * nb + b] = self.value[best]
        self.value = out

    def query(self, a, y):
        n = self.columns
        order = sorted(((_wrap(c), k) for k, c in enumerate(self.angles)), key=lambda x: x[0])
        aw = _wrap(a)
        k0 = k1 = 0
        f = 0.0
        for i in range(n):
            pc, pk = order[i]
            qc, qk = order[(i + 1) % n]
            span = qc - pc if i + 1 < n else qc + 2 * math.pi - pc
            d = aw - pc if aw >= pc else aw + 2 * math.pi - pc
            if d <= span + 1e-12:
                k0, k1 = pk, qk
                f = d / span if span > 0 else 0.0
                break
        return (1 - f) * self._column_at(k0, y) + f * self._column_at(k1, y) + (self.margin if y < self.bottom + self.band else 0.0)

    def _column_at(self, k, y):
        nb = self.bins
        c = (y - self.bottom) / self.bin - 0.5
        if c <= 0:
            return self.value[k * nb]
        if c >= nb - 1:
            return self.value[k * nb + nb - 1]
        b = math.floor(c)
        t = c - b
        return (1 - t) * self.value[k * nb + b] + t * self.value[k * nb + b + 1]


def _skin_point(p, idx, w, o, M, rest, override=None):
    x = y = z = 0.0
    for c in range(4):
        wt = w[o + c]
        if not wt > 0:
            continue
        i = idx[o + c]
        m = (override(i) if override else None) or M[i]
        q = _xform(m, [p[0] - rest[i * 3], p[1] - rest[i * 3 + 1], p[2] - rest[i * 3 + 2]])
        x += q[0] * wt
        y += q[1] * wt
        z += q[2] * wt
    return [x, y, z]


def _sign(x):
    return (x > 0) - (x < 0)


class ColumnDriver:
    """villagerSkirtDriver.ts ColumnDriver: segment s < n is the upper of
    column s, else the lower of column s − n. `rig` is the game's ColumnRig
    (exported as JSON), `cfg` VILLAGER_ASSET.drivenGarments.driver."""

    def __init__(self, rig, cfg):
        self.rig = rig
        self.cfg = cfg
        self.n = len(rig['upper'])
        self.theta = [0.0] * (2 * self.n)
        self.held = [0] * (2 * self.n)
        self.hold = [0] * (2 * self.n)
        self.cur = [0.0] * (2 * self.n)
        self.violation = [0.0] * (2 * self.n)
        self.counters = {'frames': 0, 'residual': 0, 'groundFallback': 0, 'repairs': 0, 'jointSearches': 0, 'rateBreaks': 0}
        self.fresh = True
        self.dt = 0.0
        self.rated = True
        self.P = None
        self.carried = self._carried_sets()
        self.cloth = self._cloth_stations()

    def reset(self):
        self.fresh = True

    # ----- frames -----
    def compose(self, bones):
        """Figure-frame matrices from the bone locals [{p, q, s}] (composeFigureMatrices)."""
        rig = self.rig
        M = [None] * rig['bones']
        for i in rig['order']:
            b = bones[i]
            m = _compose(b['p'], b['q'], b['s'])
            p = rig['parents'][i]
            M[i] = m if p < 0 else _matmul(M[p], m)
        return M

    def step(self, bones, dt):
        """One frame: solve, then return the 24 column locals [{p, q, s}] (upper then lower)."""
        self.solve(bones, dt)
        return self.locals()

    def solve(self, bones, dt):
        cfg = self.cfg
        reset = self.fresh or not dt > 0 or dt > cfg['resetDt']
        self.dt = 0.0 if reset else dt
        self.rated = not reset
        self.P = self._pose(bones)
        if reset:
            for s in range(2 * self.n):
                self.theta[s] = 0.0 if s < self.n else self.P['gravity'][s - self.n]
                self.held[s] = 0
            self.fresh = False
        self.cur = list(self.theta)
        self.hold = list(self.held)
        for _pass in range(2):
            for s in range(2 * self.n):
                self.cur[s] = self._search(s, False)
        self._final_evaluation()
        self.counters['frames'] += 1
        lim = cfg['omegaMax'] * _DEG * self.dt
        for s in range(2 * self.n):
            if self.rated and abs(self.cur[s] - self.theta[s]) > lim + 1e-12:
                self.counters['rateBreaks'] += 1
            self.theta[s] = self.cur[s]
            self.held[s] = 1 if self.hold[s] and self.cur[s] > cfg['thetaMax'] * _DEG + 1e-9 else 0
        return self.theta

    def locals(self):
        P = self.P
        rig = self.rig
        up, lo = [], []
        for k in range(self.n):
            axis = rig['tangent'][k]
            up.append({'p': _apply(P['hipsInv'], P['head'][k]), 'q': _axis_quat(axis, self.theta[k]), 's': [1.0, 1.0, 1.0]})
            lo.append({'p': list(rig['upperOffset'][k]), 'q': _axis_quat(axis, self.theta[self.n + k] - self.theta[k]), 's': [1.0, 1.0, 1.0]})
        return up + lo

    def _pose(self, bones):
        rig = self.rig
        cfg = self.cfg
        M = self.compose(bones)
        hipsM = M[rig['hips']]
        hips_at = _at(rig['rest'], rig['hips'])
        up = _norm(_xdir(hipsM, [0, 1, 0]))
        hipsInv = _inverse(hipsM)
        form = rig.get('form')
        head, radial, tangent = [], [], []
        for k in range(self.n):
            radial.append(_norm(_xdir(hipsM, rig['radial'][k])))
            tangent.append(_norm(_xdir(hipsM, rig['tangent'][k])))
            if form:
                an = form['anchors'][k]
                pa = _skin_point(an['a'], an['ia'], an['wa'], 0, M, rig['rest'])
                pb = _skin_point(an['b'], an['ib'], an['wb'], 0, M, rig['rest'])
                head.append(_add(_mul(pa, 1 - an['t']), _mul(pb, an['t'])))
            else:
                head.append(_xform(hipsM, rig['headOffset'][k]))
        caps = []
        for c in rig['capsules']:
            m = M[c['bone']]
            r = _at(rig['rest'], c['bone'])
            # the capsule constrains a point only below the profile bottom in its bone's rest frame (section 3.5)
            # a thigh's sector reference turns with the bone (per-sector thigh envelope)
            ref = _norm(_xdir(m, c['ref'])) if c.get('sectors') and c.get('ref') else None
            caps.append((_xform(m, _sub(c['a'], r)), _xform(m, _sub(c['b'], r)), c['radius'], col_rest_height_row(m, r[1]),
                         c.get('sectors') if ref is not None else None, ref))
        angles = [math.atan2(r[2], r[0]) for r in rig['radial']]
        pr = rig['profile']
        profile = PelvisProfile(angles, pr['bottom'], pr['top'], pr['bin'], pr['margin'], pr.get('band', float('inf')))
        pv = rig['pelvis']
        samples = []
        for k in range(len(pv['pos']) // 3):
            p = _skin_point(_at(pv['pos'], k), pv['idx'], pv['w'], k * 4, M, rig['rest'])
            samples.append(self._hips_local(p, hipsInv, hips_at))
        profile.rebuild(samples)
        gravity = []
        for r in radial:
            down = [0.0, -1.0, 0.0]
            th = math.atan2(_dot(down, r), -_dot(down, up))
            gravity.append(min(cfg['thetaMax'] * _DEG, max(0.0, cfg['gravityBlend'] * th)))
        return {'M': M, 'hipsM': hipsM, 'up': up, 'hipsInv': hipsInv, 'head': head, 'radial': radial, 'tangent': tangent,
                'capsules': caps, 'hy': col_rest_height_row(hipsM, hips_at[1]), 'profile': profile, 'gravity': gravity}

    @staticmethod
    def _hips_local(p, hipsInv, hips_at):
        q = _apply(hipsInv, p)
        return (math.atan2(q[2], q[0]), q[1] + hips_at[1], math.hypot(q[0], q[2]))

    # ----- segment geometry -----
    def _direction(self, k, th, offset):
        # turned in the hips frame first, then carried by the hips matrix (the skeleton's order)
        return _xdir(self.P['hipsM'], col_rotate(offset, self.rig['tangent'][k], th))

    def _pivot(self, s, th):
        P = self.P
        if s < self.n:
            return P['head'][s]
        k = s - self.n
        return _add(P['head'][k], self._direction(k, th[k], self.rig['upperOffset'][k]))

    def _stations(self, s, theta, th):
        # with a worn form the segment's own skinned panel points (_cloth_stations, possibly none)
        if self.cloth is not None:
            own = self.cloth[s]
            if not own['at']:
                return []
            rig = self.rig
            panel = rig['form']['panel']
            trial = list(th)
            trial[s] = theta
            mats = {}
            for k in own['columns']:
                U, L = self._column_matrices(k, trial)
                mats[rig['upper'][k]] = U
                mats[rig['lower'][k]] = L

            def skin(v):
                return _skin_point(_at(panel['pos'], v), panel['idx'], panel['w'], v * 4, self.P['M'], rig['rest'], mats.get)
            return [_add(_mul(skin(v0), 1 - u), _mul(skin(v1), u)) for v0, v1, u in own['at']]
        k = s % self.n
        top = self._pivot(s, th)
        off = self.rig['upperOffset'][k] if s < self.n else self.rig['lowerOffset'][k]
        d = self._direction(k, theta, off)
        return [_add(top, _mul(d, f)) for f in self.cfg['stations']]

    # ----- constraints -----
    def _evaluate(self, s, theta, th, triangles):
        P = self.P
        rig = self.rig
        cfg = self.cfg
        n = self.n
        k = s % n
        level = 0 if s < n else n
        trial = list(th)
        trial[s] = theta
        st = self._stations(s, theta, trial)
        nb = [level + ((k + n - 1) % n), level + ((k + 1) % n)]
        nst = [self._stations(o, trial[o], trial) for o in nb]
        seg_len = _len(rig['upperOffset'][k] if s < n else rig['lowerOffset'][k])
        worst = -math.inf
        ground = -math.inf
        hips_at = _at(rig['rest'], rig['hips'])
        for j, p in enumerate(st):
            # the chord to the farther neighbour that has cloth stations (none: no chord)
            chord = max([0.0] + [_len(_sub(p, o[j])) for o in nst if o])
            ha, hy, hr = self._hips_local(p, P['hipsInv'], hips_at)
            # the profile at or above its bottom in the hips frame; a capsule below the profile bottom
            # in its own bone's rest frame or in the hips frame (section 3.5)
            above = hy >= rig['profile']['bottom']
            for cap in P['capsules']:
                a, b, _radius, ry = cap[:4]
                if not col_capsule_active(ry, P['hy'], p, rig['profile']['bottom']):
                    continue
                C = col_capsule_radius(cap, p) + rig['clearance']
                target = math.sqrt(C * C + (chord / 2) * (chord / 2))
                worst = max(worst, target - col_point_segment(p, a, b))
            if above:
                worst = max(worst, P['profile'].query(ha, hy) + rig['clearance'] - hr)
            g = rig['ground'] - p[1]
            ground = max(ground, g)
            worst = max(worst, g)
        for o in nb:
            if self.hold[s] and self.hold[o]:
                continue
            worst = max(worst, (abs(theta - trial[o]) - cfg['neighbourLimit'] * _DEG) * seg_len)
        bound = (cfg['thetaGround'] if self.hold[s] else cfg['thetaMax']) * _DEG
        worst = max(worst, (theta - bound) * seg_len, -theta * seg_len)
        tri = 0.0
        if triangles and rig.get('form'):
            if s < n:
                trial[n + k] = th[n + k] + (theta - th[s])
            tri = self._triangle_depth(s, trial)
            if tri > 0:
                worst = max(worst, tri)
        return worst, ground, tri

    def _column_matrices(self, k, th):
        P = self.P
        rig = self.rig
        axis = rig['tangent'][k]
        local = _compose(_apply(P['hipsInv'], P['head'][k]), _axis_quat(axis, th[k]), [1.0, 1.0, 1.0])
        U = _matmul(P['hipsM'], local)
        lower = _compose(rig['upperOffset'][k], _axis_quat(axis, th[self.n + k] - th[k]), [1.0, 1.0, 1.0])
        return U, _matmul(U, lower)

    def _carried_sets(self):
        rig = self.rig
        n = self.n
        out = [{'vertices': [], 'triangles': []} for _ in range(2 * n)]
        form = rig.get('form')
        if not form:
            return out
        panel = form['panel']
        owner = {}
        for k in range(n):
            owner[rig['upper'][k]] = [k]
            owner[rig['lower'][k]] = [k, n + k]
        sets = [set() for _ in out]
        for v in range(len(panel['pos']) // 3):
            for c in range(4):
                if not panel['w'][v * 4 + c] > 0:
                    continue
                for s in owner.get(panel['idx'][v * 4 + c], []):
                    sets[s].add(v)
        for s, st in enumerate(sets):
            out[s]['vertices'] = sorted(st)
            out[s]['triangles'] = [t for t in range(len(panel['index']) // 3) if any(panel['index'][t * 3 + j] in st for j in range(3))]
        return out

    def _cloth_stations(self):
        """Per segment its stations on the cloth (as villagerSkirtDriver.ts clothStations): per panel row
        the point of the row's edge crossing the column's own rest angle; the upper owns the rows
        without col.L weight, the lower the rows with it; the owned rows at the station fractions."""
        rig = self.rig
        form = rig.get('form')
        if not form:
            return None
        panel = form['panel']
        n = self.n
        out = [{'at': [], 'columns': []} for _ in range(2 * n)]
        hips_at = _at(rig['rest'], rig['hips'])
        column = {}
        for k in range(n):
            column[rig['upper'][k]] = k
            column[rig['lower'][k]] = k
        lower_set = set(rig['lower'])

        def low_w(v):
            return sum(panel['w'][v * 4 + c] for c in range(4) if panel['idx'][v * 4 + c] in lower_set)
        for k in range(n):
            def ang(v, k=k):
                d = (panel['pos'][v * 3] - hips_at[0], 0.0, panel['pos'][v * 3 + 2] - hips_at[2])
                return math.atan2(_dot(d, rig['tangent'][k]), _dot(d, rig['radial'][k]))
            rows = {}
            idx = panel['index']
            for t in range(len(idx) // 3):
                for e in range(3):
                    i, j = idx[t * 3 + e], idx[t * 3 + (e + 1) % 3]
                    v0, v1 = min(i, j), max(i, j)
                    r = panel['row'][v0]
                    if panel['row'][v1] != r or r in rows:
                        continue
                    a0, a1 = ang(v0), ang(v1)
                    if abs(a0) >= math.pi / 2 or abs(a1) >= math.pi / 2 or a0 * a1 > 0:
                        continue
                    rows[r] = (v0, v1, 0.0 if a0 == a1 else a0 / (a0 - a1))
            for lower in (False, True):
                lst = sorted((r, x) for r, x in rows.items() if (low_w(x[0]) + low_w(x[1]) > 0) == lower)
                if not lst:
                    continue
                seg = out[n + k if lower else k]
                # JS Math.round: halves up
                seg['at'] = [lst[int(math.floor(f * (len(lst) - 1) + 0.5))][1] for f in self.cfg['stations']]
                cols = set()
                for v0, v1, _u in seg['at']:
                    for v in (v0, v1):
                        for c in range(4):
                            if panel['w'][v * 4 + c] > 0 and panel['idx'][v * 4 + c] in column:
                                cols.add(column[panel['idx'][v * 4 + c]])
                seg['columns'] = sorted(cols)
        return out

    def _triangle_depth(self, s, th):
        rig = self.rig
        panel = rig['form']['panel']
        tris = self.carried[s]['triangles']
        if not tris:
            return 0.0
        P = self.P
        mats = {}
        for k in range(self.n):
            U, L = self._column_matrices(k, th)
            mats[rig['upper'][k]] = U
            mats[rig['lower'][k]] = L
        posed = {}

        def vert(v):
            if v not in posed:
                posed[v] = _skin_point(_at(panel['pos'], v), panel['idx'], panel['w'], v * 4, P['M'], rig['rest'], mats.get)
            return posed[v]
        hips_at = _at(rig['rest'], rig['hips'])
        depth = 0.0
        for t in tris:
            ids = [panel['index'][t * 3], panel['index'][t * 3 + 1], panel['index'][t * 3 + 2]]
            if all(panel['exempt'][v] for v in ids):
                continue
            a, b, c = (vert(v) for v in ids)
            C = max(panel['clearance'][v] for v in ids)
            centre = _mul(_add(_add(a, b), c), 1 / 3)
            rad = max(_len(_sub(a, centre)), _len(_sub(b, centre)), _len(_sub(c, centre)))
            hv = [self._hips_local(x, P['hipsInv'], hips_at) for x in (a, b, c)]
            # a capsule meets only the part of a triangle where it is active: clipped at the profile
            # bottom in its bone's rest frame and in the hips frame (section 3.5; as villagerSkirtDriver.ts)
            for cap in P['capsules']:
                ca, cb, radius, ry = cap[:4]
                mid = _mul(_add(ca, cb), 0.5)
                bound = _len(_sub(cb, ca)) / 2 + radius + C
                if _len(_sub(mid, centre)) > bound + rad:
                    continue
                below = col_clip_active((a, b, c), ry, P['hy'], rig['profile']['bottom'])
                if not below:
                    continue
                # per clipped piece its sectors' radius over its vertices and centroid (section 3.5)
                d = -math.inf
                for p, q, r in below:
                    cen = _mul(_add(_add(p, q), r), 1 / 3)
                    R = max(col_capsule_radius(cap, x) for x in (p, q, r, cen))
                    d = max(d, R + C - col_segment_triangle(ca, cb, p, q, r))
                if d > 0:
                    depth += d
            # row 1 is exempt from the profile test like row 0 and the band; a triangle with two
            # profile-exempt vertices skips the centroid's profile test (sections 3.5, 3.6)
            free = [panel['exempt'][v] == 1 or panel['row'][v] == 1 for v in ids]
            band_edge = sum(1 for f in free if f) >= 2
            pts = [(x, panel['exempt'][v], h, not fr) for x, v, h, fr in zip((a, b, c), ids, hv, free)]
            pts.append((centre, 0, self._hips_local(centre, P['hipsInv'], hips_at), not band_edge))
            for p, ex, (ha, hy, hr), prof in pts:
                if ex:
                    continue
                if prof and hy >= rig['profile']['bottom']:
                    d = P['profile'].query(ha, hy) + C - hr
                    if d > 0:
                        depth += d
                g = rig['ground'] - p[1]
                if g > 0:
                    depth += g
        return depth

    # ----- the search -----
    def _search(self, s, triangles):
        cfg = self.cfg
        P = self.P
        k = s % self.n
        target = 0.0 if s < self.n else P['gravity'][k]
        prev = self.theta[s]
        held = self.hold[s] == 1
        top = (cfg['thetaGround'] if held else cfg['thetaMax']) * _DEG
        rel = min(top, max(0.0, target + (prev - target) * math.exp(-self.dt / cfg['tau'])))

        def score(th):
            return self._evaluate(s, th, self.cur, triangles)[0]

        def feasible(th):
            return score(th) <= 0
        if feasible(rel):
            chosen = rel
        else:
            pool = []
            d = 0.0
            while d <= cfg['thetaMax'] + 1e-9:
                pool.append(d * _DEG)
                d += cfg['coarseStep']
            if held:
                d = cfg['thetaMax'] + cfg['groundStep']
                while d <= cfg['thetaGround'] + 1e-9:
                    pool.append(d * _DEG)
                    d += cfg['groundStep']
            scored = [(th, score(th)) for th in pool]
            best = _pick_best(scored, rel)
            for r in cfg['refine']:
                for sg in (-1, 1):
                    th = best[0] + sg * r * _DEG
                    if 0 <= th <= top + 1e-12:
                        scored.append((th, score(th)))
            pick = _pick_best(scored, rel)
            if pick[1] <= 0:
                lo, hi = rel, pick[0]
                while abs(hi - lo) > cfg['bisect'] * _DEG:
                    mid = 0.5 * (lo + hi)
                    if feasible(mid):
                        hi = mid
                    else:
                        lo = mid
                chosen = hi
            else:
                chosen = pick[0] if pick[1] < score(rel) else rel
        if self.rated:
            lim = cfg['omegaMax'] * _DEG * self.dt
            if abs(chosen - prev) > lim:
                clamped = prev + _sign(chosen - prev) * lim
                if feasible(clamped) or not feasible(chosen):
                    chosen = clamped
        return chosen

    # ----- final evaluation, repair, ground fallback -----
    def _final_evaluation(self):
        cfg = self.cfg
        n = self.n
        S = 2 * n

        def all_():
            return [self._evaluate(s, self.cur[s], self.cur, True) for s in range(S)]
        ev = all_()
        for _round in range(cfg['repairRounds']):
            bad = [s for s in range(S) if ev[s][0] > 0]
            if not bad:
                break
            self.counters['repairs'] += 1
            for s in bad:
                before = self.cur[s]
                th = self._search(s, True)
                if abs(th - before) <= 1e-12 and self._evaluate(s, th, self.cur, True)[2] > 0:
                    self._joint_search(s)
                else:
                    self.cur[s] = th
                if s < n and self.cur[s] != before:
                    self.cur[n + s] = self._search(n + s, True)
            ev = all_()
        # a station below ground, or a carried panel vertex (its depth is in the triangle score)
        for s in range(S):
            if ev[s][1] > 0 or self._lowest_row(s, self.cur[s]) < self.rig['ground']:
                self._ground_fallback(s)
                if s < n:
                    self.cur[n + s] = self._search(n + s, True)
        ev = all_()
        for s in range(S):
            self.violation[s] = ev[s][0]
            if ev[s][0] > 0:
                self.counters['residual'] += 1

    def _joint_search(self, s):
        cfg = self.cfg
        n = self.n
        k = s % n
        level = 0 if s < n else n
        cand = [level + ((k + n - 1) % n), level + ((k + 1) % n)]
        partner = cand[0]
        for b in cand[1:]:
            if self._evaluate(b, self.cur[b], self.cur, True)[2] > self._evaluate(partner, self.cur[partner], self.cur, True)[2]:
                partner = b
        self.counters['jointSearches'] += 1
        samples = []
        d = 0.0
        while d <= cfg['thetaMax'] + 1e-9:
            samples.append(d * _DEG)
            d += cfg['coarseStep']
        save = list(self.cur)
        best = (self.cur[s], self.cur[partner], math.inf, math.inf)

        def try_pair(a, b, best):
            self.cur[s] = a
            self.cur[partner] = b
            w = max(self._evaluate(s, a, self.cur, True)[0], self._evaluate(partner, b, self.cur, True)[0])
            dd = abs(a - save[s]) + abs(b - save[partner])
            better = (w <= 0 and best[2] > 0) or (w <= 0 and best[2] <= 0 and dd < best[3] - 1e-12) or (w > 0 and best[2] > 0 and w < best[2])
            return (a, b, w, dd) if better else best
        for a in samples:
            for b in samples:
                best = try_pair(a, b, best)
        # refine about the coarse pick, as the single search does: each refine step round the pair
        ca, cb = best[0], best[1]
        top = cfg['thetaMax'] * _DEG + 1e-12
        for r in cfg['refine']:
            for i in (-1, 0, 1):
                for j in (-1, 0, 1):
                    if i == 0 and j == 0:
                        continue
                    a = ca + i * r * _DEG
                    b = cb + j * r * _DEG
                    if 0 <= a <= top and 0 <= b <= top:
                        best = try_pair(a, b, best)
        self.cur = save

        # no feasible pair: the rate limit holds, as in the single search
        def limited(th, seg):
            if best[2] <= 0 or not self.rated:
                return th
            prev = self.theta[seg]
            lim = cfg['omegaMax'] * _DEG * self.dt
            return prev + _sign(th - prev) * lim if abs(th - prev) > lim else th
        self.cur[s] = limited(best[0], s)
        self.cur[partner] = limited(best[1], partner)

    def _ground_fallback(self, s):
        cfg = self.cfg
        self.counters['groundFallback'] += 1
        chosen = cfg['thetaGround'] * _DEG
        d = cfg['thetaMax'] + cfg['groundStep']
        while d <= cfg['thetaGround'] + 1e-9:
            if self._lowest_row(s, d * _DEG) >= self.rig['ground']:
                chosen = d * _DEG
                break
            d += cfg['groundStep']
        self.cur[s] = max(self.cur[s], chosen)
        self.hold[s] = 1

    def _lowest_row(self, s, theta):
        n = self.n
        trial = list(self.cur)
        if s < n:
            trial[n + s] = self.cur[n + s] + (theta - self.cur[s])
        trial[s] = theta
        form = self.rig.get('form')
        if form and self.carried[s]['vertices']:
            panel = form['panel']
            # every column at the trial angles: a vertex blended across columns sees its neighbours as drawn
            mats = {}
            for k in range(n):
                U, L = self._column_matrices(k, trial)
                mats[self.rig['upper'][k]] = U
                mats[self.rig['lower'][k]] = L
            return min(_skin_point(_at(panel['pos'], v), panel['idx'], panel['w'], v * 4, self.P['M'], self.rig['rest'], mats.get)[1]
                       for v in self.carried[s]['vertices'])
        # no stations (a column no panel crosses): Infinity, as Math.min() in the game
        low = min((p[1] for p in self._stations(s, theta, trial)), default=math.inf)
        if s < n:
            low = min([low] + [p[1] for p in self._stations(n + s, trial[n + s], trial)])
        return low


def _pick_best(scored, rel):
    """The feasible candidate nearest to rel (the larger angle on a tie), else the least violating."""
    best = scored[0]
    for c in scored:
        cf = c[1] <= 0
        bf = best[1] <= 0
        if cf and not bf:
            best = c
        elif cf and bf:
            dc = abs(c[0] - rel)
            db = abs(best[0] - rel)
            if dc < db - 1e-12 or (abs(dc - db) <= 1e-12 and c[0] > best[0]):
                best = c
        elif not cf and not bf and c[1] < best[1]:
            best = c
    return best


def column_round_trip(rt, tol=RUNTIME_TOLERANCE, log=print):
    """THE COLUMN ROUND TRIP (plan section 3.14): for every exported fixed-dt
    sequence, the mirror replays the bone locals from the reset state with the
    game's rig and config and recomputes the 24 column locals (translation,
    rotation, scale) and the counters; each must match the game's within
    `tol`. Raises on a miss or a nonfinite value; returns the worst values."""
    seqs = rt.get('columns') or []
    if not seqs:
        raise RuntimeError('column round trip FAILED: the export carries no column sequence')
    worst = {'p': 0.0, 'q': 0.0, 's': 0.0, 'frames': 0}
    bad = []
    for sq in seqs:
        if not sq.get('frames'):
            bad.append(f"{sq.get('id')}: no frames (an empty replay recomputes nothing)")
            continue
        d = ColumnDriver(sq['rig'], sq['config'])
        cols = sq['rig']['upper'] + sq['rig']['lower']
        for fi, f in enumerate(sq['frames']):
            got = d.step(f['bones'], f['dt'])
            for j, i in enumerate(cols):
                want = f['bones'][i]
                # every component finite before any max: max() can drop a NaN that follows a number
                comps = [x for key in ('p', 'q', 's') for x in list(got[j][key]) + list(want[key])]
                if len(comps) != 20 or not all(isinstance(x, (int, float)) and math.isfinite(x) for x in comps):
                    bad.append(f"{sq['id']} frame {fi} bone {i}: a nonfinite or missing component")
                    continue
                for key in ('p', 's'):
                    worst[key] = max(worst[key], max(abs(x - y) for x, y in zip(got[j][key], want[key])))
                # q and −q are one rotation
                e = min(max(abs(x - y) for x, y in zip(got[j]['q'], want['q'])), max(abs(x + y) for x, y in zip(got[j]['q'], want['q'])))
                worst['q'] = max(worst['q'], e)
            worst['frames'] += 1
        if d.counters != sq['counters']:
            bad.append(f"{sq['id']}: counters {d.counters} != game {sq['counters']}")
    log(f"column round trip: {len(seqs)} sequences, {worst['frames']} frames; worst translation {worst['p']:.2e}, "
        f"rotation {worst['q']:.2e}, scale {worst['s']:.2e} (tolerance {tol:g})")
    if bad or not all(worst[k] <= tol for k in ('p', 'q', 's')):
        raise RuntimeError(f'column round trip FAILED: {bad or worst}')
    return worst


def toy_column_rig(n=4, capsules=(), form=None, head_r=0.15):
    """A toy rig for the driver's selftests: hips at (0, 1, 0), one thigh bone
    at (0.1, 1, 0) carrying the given capsules [(a, b, radius)], n columns of
    two 0.4-long segments hanging from the girdle (radius head_r, y 1.05), a
    ring of pelvis samples. Bones: hips, thigh, n uppers, n lowers."""
    rest = [0.0, 1.0, 0.0, 0.1, 1.0, 0.0]
    upper = list(range(2, 2 + n))
    lower = list(range(2 + n, 2 + 2 * n))
    parents = [-1, 0] + [0] * n + upper
    radial, tangent, head_off = [], [], []
    heads = []
    for k in range(n):
        a = 2 * math.pi * k / n
        r = [math.cos(a), 0.0, math.sin(a)]
        radial.append(r)
        tangent.append(_norm(_cross(r, [0.0, 1.0, 0.0])))
        h = [head_r * r[0], 1.05, head_r * r[2]]
        heads.append(h)
        head_off.append(_sub(h, [0.0, 1.0, 0.0]))
    for h in heads:
        rest += h
    for h in heads:
        rest += [h[0], h[1] - 0.4, h[2]]
    pos, idx, w = [], [], []
    for y in (0.95, 1.0, 1.05):
        for j in range(16):
            a = 2 * math.pi * j / 16
            pos += [0.1 * math.cos(a), y, 0.1 * math.sin(a)]
            idx += [0, 0, 0, 0]
            w += [1.0, 0.0, 0.0, 0.0]
    return {
        'bones': 2 + 2 * n, 'order': list(range(2 + 2 * n)), 'parents': parents, 'rest': rest, 'hips': 0,
        'upper': upper, 'lower': lower, 'radial': radial, 'tangent': tangent, 'headOffset': head_off,
        'upperOffset': [[0.0, -0.4, 0.0]] * n, 'lowerOffset': [[0.0, -0.4, 0.0]] * n,
        'capsules': [{'bone': 1, 'a': list(a), 'b': list(b), 'radius': r} for a, b, r in capsules],
        'pelvis': {'pos': pos, 'idx': idx, 'w': w}, 'profile': {'bottom': 0.9, 'top': 1.1, 'bin': 0.05, 'margin': 0.0},
        'crotch': 0.92, 'clearance': 0.006, 'ground': 0.002, 'form': form,
    }


def toy_column_bones(rig, hips=(0.0, 1.0, 0.0), thigh=(0.1, 0.0, 0.0)):
    """The toy rig's bone locals: hips and thigh as given, the columns at rest."""
    out = [{'p': list(hips), 'q': [0.0, 0.0, 0.0, 1.0], 's': [1.0, 1.0, 1.0]},
           {'p': list(thigh), 'q': [0.0, 0.0, 0.0, 1.0], 's': [1.0, 1.0, 1.0]}]
    while len(out) < rig['bones']:
        out.append({'p': [0.0, 0.0, 0.0], 'q': [0.0, 0.0, 0.0, 1.0], 's': [1.0, 1.0, 1.0]})
    return out


TOY_DRIVER_CONFIG = {
    'thetaMax': 80, 'thetaGround': 110, 'coarseStep': 10, 'refine': [5, 2.5], 'bisect': 0.25, 'groundStep': 2.5,
    'tau': 0.25, 'omegaMax': 400, 'neighbourLimit': 60, 'repairRounds': 3, 'stations': [1 / 3, 2 / 3, 1],
    'groundClearance': 0.002, 'clearance': 0.006, 'gravityBlend': 1, 'crotch': 0.03, 'pelvisBin': 0.02,
    'pelvisSamples': 240, 'pelvisArm': 0.2, 'resetDt': 0.25,
}


def selftest_column_driver():
    """The mirror's solve on toy capsules (plan section 5): the continuous
    relaxation, determinism, the reset, the rate limit and its feasible break,
    the lift-outward ground fallback on the carried rows, the bounded repair
    with triangle scoring (an upper's trial carrying its lower), the joint
    two-column search, and no column scale."""
    cfg = TOY_DRIVER_CONFIG
    dt = 1 / 60
    # relaxation: a free hem released at 30° follows θg + (θs − θg)·e^(−t/τ), never sticking to a sample
    rig = toy_column_rig()
    d = ColumnDriver(rig, cfg)
    d.step(toy_column_bones(rig), dt)
    assert all(abs(x) < 1e-12 for x in d.theta), d.theta
    d.theta[0] = 30 * _DEG
    for f in range(1, 91):
        d.step(toy_column_bones(rig), dt)
        want = 30 * _DEG * math.exp(-f * dt / cfg['tau'])
        assert abs(d.theta[0] - want) < 1e-9, (f, d.theta[0], want)
    assert d.theta[0] < 0.5 * _DEG
    # reset: a step above resetDt re-enters from the gravity solution
    d.theta[0] = 30 * _DEG
    d.step(toy_column_bones(rig), 1.0)
    assert d.theta[0] == 0.0
    # a leg capsule inside column 0 pushes it outward; θ stays in [0, θmax]; locals carry no scale
    caps = [([0.1, 1.0, 0.0], [0.1, 0.5, 0.0], 0.04)]
    rig = toy_column_rig(capsules=caps)
    seq = [toy_column_bones(rig, thigh=(0.1 + 0.002 * f, 0.0, 0.0)) for f in range(40)]

    def run(r, frames, step_dt=dt):
        dd = ColumnDriver(r, cfg)
        trace = []
        for b in frames:
            loc = dd.step(b, step_dt)
            assert all(x['s'] == [1.0, 1.0, 1.0] for x in loc)
            trace.append(list(dd.theta))
        return dd, trace
    d1, t1 = run(rig, seq)
    d2, t2 = run(rig, seq)
    assert t1 == t2 and d1.counters == d2.counters, 'the mirror is not deterministic'
    assert t1[-1][0] > 5 * _DEG, t1[-1]
    assert all(0 <= x <= cfg['thetaMax'] * _DEG + 1e-12 for tr in t1 for x in tr)
    lim = cfg['omegaMax'] * _DEG * dt
    breaks = sum(1 for a, b in zip(t1, t1[1:]) for x, y in zip(a, b) if abs(y - x) > lim + 1e-12)
    assert breaks == d1.counters['rateBreaks'], (breaks, d1.counters)
    # a capsule that jumps onto the column: only the larger step is feasible
    jump = [toy_column_bones(rig, thigh=(-0.5, 0.0, 0.0))] * 3 + [toy_column_bones(rig, thigh=(0.1, 0.0, 0.0))] * 3
    dj, tj = run(rig, jump)
    assert dj.counters['rateBreaks'] >= 1, dj.counters
    assert any(abs(y - x) > lim + 1e-12 for x, y in zip(tj[2], tj[3])), (tj[2], tj[3])
    # ground fallback: hips so low the tips reach under the ground; lifted past θmax, carried rows clear
    rig = toy_column_rig()
    dg = ColumnDriver(rig, cfg)
    dg.step(toy_column_bones(rig, hips=(0.0, 0.05, 0.0)), dt)
    assert dg.counters['groundFallback'] > 0
    assert any(x > cfg['thetaMax'] * _DEG for x in dg.theta) and all(x <= cfg['thetaGround'] * _DEG + 1e-12 for x in dg.theta)
    for s in range(2 * dg.n):
        assert dg._lowest_row(s, dg.cur[s]) >= rig['ground'] - 1e-12 or dg.cur[s] >= cfg['thetaGround'] * _DEG - 1e-12
    # triangle scoring: a triangle weighted only to col.L.0; an upper trial that swings it into a capsule is infeasible
    n = 4
    tri_form = {'anchors': None, 'clearance': 0.006, 'top': 1.1,
                'panel': {'pos': [0.15, 0.4, -0.05, 0.15, 0.4, 0.05, 0.15, 0.3, 0.0], 'idx': [2 + n, 0, 0, 0] * 3,
                          'w': [1.0, 0.0, 0.0, 0.0] * 3, 'index': [0, 1, 2], 'exempt': [0, 0, 0], 'clearance': [0.006] * 3, 'row': [1, 2, 3]}}
    rig = toy_column_rig(n=n, capsules=[([0.6, 0.51, -0.2], [0.6, 0.51, 0.2], 0.03)], form=tri_form)
    rig['form']['anchors'] = [{'a': h, 'ia': [0, 0, 0, 0], 'wa': [1, 0, 0, 0], 'b': h, 'ib': [0, 0, 0, 0], 'wb': [1, 0, 0, 0], 't': 0.0}
                              for h in (_at(rig['rest'], u) for u in rig['upper'])]
    dt_ = ColumnDriver(rig, cfg)
    dt_.step(toy_column_bones(rig), dt)
    clear = dt_._evaluate(0, 0.0, dt_.cur, True)
    hit = dt_._evaluate(0, 40 * _DEG, dt_.cur, True)
    plain = dt_._evaluate(0, 40 * _DEG, dt_.cur, False)
    assert clear[2] == 0 and hit[2] > 0 and hit[0] > 0 and plain[2] == 0, (clear, hit, plain)
    # bounded repair and the joint search: a capsule through the triangle; rate-limited steps repeat an angle
    rig['capsules'] = [{'bone': 1, 'a': [0.13, 0.35, -0.3], 'b': [0.13, 0.35, 0.3], 'radius': 0.02}]
    dr = ColumnDriver(rig, cfg)
    dr.step(toy_column_bones(rig, thigh=(-0.5, 0.0, 0.0)), dt)
    before = dr._triangle_depth(n, dr.cur)
    dr.step(toy_column_bones(rig), 1e-3)
    assert dr.counters['repairs'] >= 1, dr.counters
    assert dr.counters['repairs'] <= 2 * cfg['repairRounds']
    assert before == 0.0
    # no single segment clears an enclosing capsule: the rate-limited search repeats its
    # angle with the triangle still hit, so the two columns are searched jointly, still bounded
    rig['capsules'] = [{'bone': 1, 'a': [0.15, 0.35, -0.01], 'b': [0.15, 0.35, 0.01], 'radius': 1.0}]
    dj2 = ColumnDriver(rig, cfg)
    dj2.step(toy_column_bones(rig, thigh=(-5.0, 0.0, 0.0)), dt)
    dj2.step(toy_column_bones(rig), 1e-3)
    assert dj2.counters['jointSearches'] >= 1, dj2.counters
    # no feasible pair: the joint search keeps the rate limit
    assert dj2.counters['rateBreaks'] == 0, dj2.counters
    assert dj2.counters['repairs'] <= 2 * cfg['repairRounds'] and dj2.counters['residual'] > 0, dj2.counters
    print('column driver selftest: ok')


def selftest_column_rest_frame():
    """Section 3.5 (owner decision 03.11.2026 20:56): a capsule constrains a point below the
    profile bottom in its bone's REST frame; the row inverts the posed bone matrix (the cases
    of villagerSkirtDriver.test.ts)."""
    # a bone resting at (0, 1, 0), posed rotated 90 degrees about z (its rest -y points to +x) and lifted by 0.5
    m = [0.0, 1.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.5, 0.0, 1.0]
    ry = col_rest_height_row(m, 1.0)
    # the bone's rest point 0.4 below its head now lies at (0.4, 1.5, 0): posed high, rest-frame height 0.6
    assert abs(col_rest_height(ry, (0.4, 1.5, 0.0)) - 0.6) < 1e-12
    # equality: a triangle lying wholly at the profile bottom is not below it, so no capsule meets it
    tri = ((0.0, 0.5, 0.0), (1.0, 0.5, 0.0), (0.0, 0.5, 1.0))
    assert col_clip_below(tri, [0.5, 0.5, 0.5], 0.5) == []
    print('column rest-frame selftest: ok')


def selftest_column_scale():
    """Stations under a nonuniform hips scale lie where the written locals draw them."""
    rig = toy_column_rig()
    d = ColumnDriver(rig, TOY_DRIVER_CONFIG)
    bones = toy_column_bones(rig, thigh=(-5.0, 0.0, 0.0))
    bones[0]['s'] = [1.0, 2.0, 1.0]
    d.step(bones, 1 / 60)
    d.theta = [0.0] * 8
    d.theta[0] = 30 * _DEG
    d.theta[4] = 50 * _DEG
    loc = d.locals()
    for j, i in enumerate(rig['upper'] + rig['lower']):
        bones[i] = loc[j]
    M = d.compose(bones)
    knee = _xform(M[rig['upper'][0]], rig['upperOffset'][0])
    ankle = _xform(M[rig['lower'][0]], rig['lowerOffset'][0])
    up = d._stations(0, d.theta[0], d.theta)[-1]
    lo = d._stations(4, d.theta[4], d.theta)[-1]
    assert _len(_sub(up, knee)) < 1e-9 and _len(_sub(lo, ankle)) < 1e-9, (up, knee, lo, ankle)
    print('column scale selftest: ok')


def _toy_low_hem():
    """Hips so low the lowers must lift; a hem vertex below the ankle pivots, one blended
    half and half across columns 0 and 1; the columns' incoming locals hang straight.
    Returns the driver, the rig and the drawn heights of the three hem vertices."""
    n = 4
    form = {'anchors': None, 'clearance': 0.006, 'top': 1.1,
            'panel': {'pos': [0.075, 0.25, 0.075, 0.15, 0.25, 0.0, 0.0, 0.25, 0.15],
                      'idx': [2 + n, 3 + n, 0, 0, 2 + n, 0, 0, 0, 3 + n, 0, 0, 0],
                      'w': [0.5, 0.5, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
                      'index': [0, 1, 2], 'exempt': [0, 0, 0], 'clearance': [0.006] * 3, 'row': [1, 2, 3]}}
    rig = toy_column_rig(n=n, form=form)
    form['anchors'] = [{'a': _at(rig['rest'], u), 'ia': [0, 0, 0, 0], 'wa': [1, 0, 0, 0], 'b': [0.0, 0.0, 0.0],
                        'ib': [0, 0, 0, 0], 'wb': [0, 0, 0, 0], 't': 0.0} for u in rig['upper']]
    bones = toy_column_bones(rig, hips=(0.0, 0.12, 0.0))
    for k, u in enumerate(rig['upper']):
        bones[u]['p'] = list(rig['headOffset'][k])
    for k, lo in enumerate(rig['lower']):
        bones[lo]['p'] = list(rig['upperOffset'][k])
    d = ColumnDriver(rig, TOY_DRIVER_CONFIG)
    loc = d.step(bones, 1 / 60)
    for j, i in enumerate(rig['upper'] + rig['lower']):
        bones[i] = loc[j]
    M = d.compose(bones)
    p = form['panel']
    drawn = [_skin_point(_at(p['pos'], v), p['idx'], p['w'], v * 4, M, rig['rest'])[1] for v in range(3)]
    return d, rig, drawn


def selftest_column_ground_panel():
    """A carried panel vertex below the ground with its stations above lifts the segment."""
    d, rig, drawn = _toy_low_hem()
    assert d.counters['groundFallback'] > 0 and min(drawn) >= rig['ground'] - 1e-9, (d.counters, drawn)
    print('column ground-panel selftest: ok')


def selftest_column_ground_blend():
    """The fallback measures the hem as drawn, every column at its solved angle: no lift to θground
    for a vertex blended across columns that a smaller lift clears."""
    d, rig, drawn = _toy_low_hem()
    assert max(d.theta) < TOY_DRIVER_CONFIG['thetaGround'] * _DEG - 1e-9 and min(drawn) >= rig['ground'] - 1e-9, (d.theta, drawn)
    print('column ground-blend selftest: ok')


def _toy_column_export():
    """A faithful toy column export: the mirror's own replay of a short sequence, as the game writes it."""
    import copy
    rig = toy_column_rig(capsules=[([0.1, 1.0, 0.0], [0.1, 0.5, 0.0], 0.04)])
    d = ColumnDriver(rig, TOY_DRIVER_CONFIG)
    frames = []
    for f in range(6):
        bones = toy_column_bones(rig, thigh=(0.1 + 0.004 * f, 0.0, 0.0))
        loc = d.step(bones, 1 / 60)
        for j, i in enumerate(rig['upper'] + rig['lower']):
            bones[i] = loc[j]
        frames.append({'dt': 1 / 60, 'bones': copy.deepcopy(bones)})
    return {'columns': [{'id': 'toy', 'rig': rig, 'config': TOY_DRIVER_CONFIG, 'counters': dict(d.counters), 'frames': frames}]}


def _round_trip_fails(rt, why):
    try:
        column_round_trip(rt, log=lambda *_a: None)
    except RuntimeError:
        return
    raise AssertionError(f'column round trip passed {why}')


def selftest_column_round_trip_finite():
    """A faithful export passes; a NaN in any translation, rotation or scale component fails."""
    import copy
    rt = _toy_column_export()
    column_round_trip(rt, log=lambda *_a: None)
    col = rt['columns'][0]['rig']['upper'][0]
    for key, comp in (('p', 1), ('q', 2), ('s', 1)):
        bad = copy.deepcopy(rt)
        bad['columns'][0]['frames'][3]['bones'][col][key][comp] = float('nan')
        _round_trip_fails(bad, f'a NaN in {key}[{comp}]')
    print('column round trip finite selftest: ok')


def selftest_column_round_trip_nonempty():
    """A sequence without frames is no evidence: the round trip refuses it."""
    import copy
    rt = _toy_column_export()
    bad = copy.deepcopy(rt)
    bad['columns'][0]['frames'] = []
    bad['columns'][0]['counters'] = {k: 0 for k in bad['columns'][0]['counters']}
    _round_trip_fails(bad, 'a sequence without frames')
    print('column round trip nonempty selftest: ok')
