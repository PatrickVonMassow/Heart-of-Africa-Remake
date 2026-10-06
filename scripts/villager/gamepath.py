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

    def drawn(self, wr):
        """The hung bones' world turns for a pose's A-pose world turns."""
        return np.array([qnorm(qmul(wr[i], self.hang_inv[i])) for i in range(len(wr))])

    def skin(self, baked, jidx, jw, wr, wp):
        """villagerClipPose.ts toHung + three's skinning of the baked mesh."""
        return rig.skin(baked, jidx, jw, self.heads, self.drawn(wr), wp)


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
