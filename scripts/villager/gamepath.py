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
    return out


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
