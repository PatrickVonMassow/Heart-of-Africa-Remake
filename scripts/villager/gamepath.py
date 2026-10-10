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

4. a garment's skinned cloth is pushed out of the body's per-bone capsules
   (capsules.py, `Dresser`): the pose-time push the game is to run on the
   posed cloth (work-order point 1315 ships it).
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
        self.t = joints[:, 3:6].copy()
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

    def hung_tails(self):
        """Every bone's tail on the hanging skeleton (the baked frame)."""
        R = np.array([qmat(q) for q in self.hang])
        return self.heads + np.einsum('bij,bj->bi', R, self.t - self.h)

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


def garment_margin(name, cfg):
    """How far outside the capsules the push sets a garment's cloth: the
    clearance, and a layer gap per layer outward (mask.LAYER)."""
    import mask as M
    a = cfg['VILLAGER_ASSET']
    return a['garmentCapsuleClearance'] + M.layer(name) * a['garmentLayerGap']


class Dresser:
    """The pose-time capsule push (capsules.py) for one person: the body's
    capsules fitted on its baked mesh, each garment's build-pose distances to
    them, and the push of a posed garment. `garmentCapsulePasses` 0 turns it off."""

    def __init__(self, person, baked_body, W, q_build, cfg):
        import capsules as CP
        self.person, self.cfg = person, cfg
        self.passes = int(cfg['VILLAGER_ASSET']['garmentCapsulePasses'])
        self.caps = CP.fit(baked_body, W, person.heads, person.hung_tails())
        self.build = person.build_pose(q_build)
        self.s_rest = {}

    def _frame(self, wr):
        return np.array([qmat(q) for q in self.person.drawn(wr)])

    def rest(self, name, baked, gi, gw):
        """Garment `name`'s build-pose distances (its cloth baked as `baked`)."""
        import capsules as CP
        if name not in self.s_rest and self.passes:
            wr, wp = self.build
            posed = self.person.skin(baked, gi, gw, wr, wp)
            self.s_rest[name] = CP.rest(self.caps, posed, self._frame(wr), wp, self.person.heads)
        return self.s_rest.get(name)

    def __call__(self, name, posed, wr, wp):
        """Garment `name` posed (skinned) in a pose, pushed out of the capsules."""
        import capsules as CP
        if not self.passes:
            return posed
        return CP.push(self.caps, posed, self._frame(wr), wp, self.person.heads, self.s_rest[name],
                       garment_margin(name, self.cfg), self.passes)


def drawn_garment(person, g, weights, wr, wp, dress=None, name=None):
    """A garment as the game draws it on `person` in a pose: morphed, hung and
    baked, skinned by the hung bones, pushed out of the body's capsules by
    `dress` (a Dresser; None: not pushed — hair, eyes)."""
    from body import top4
    gi, gw = top4(g['W'])
    p = g['pos'].copy()
    for m, x in weights.items():
        if x:
            p += x * g['morph_pos'][m]
    baked = person.bake(p, gi, gw)
    posed = person.skin(baked, gi, gw, wr, wp)
    if dress is None or name is None:
        return posed
    dress.rest(name, baked, gi, gw)
    return dress(name, posed, wr, wp)
