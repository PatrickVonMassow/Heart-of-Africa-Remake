"""Step 2: the Quaternius clips (CC0) retargeted onto the villager skeleton.

Retargeting copies WORLD rotations: for each villager bone b with source bone s,
  W_b(t) = W_s(t) · W_s(ref)⁻¹
where W_s(ref) is the source bone posed into the villager's rest posture. The
trunk keeps the source's rest orientation (both stand upright facing +z); a limb
is swung from the source's T-pose direction onto the villager's A-pose one, so
an arm the source holds level comes out level here too. Local rotations follow
as W_parent⁻¹ · W_b; the villager's rest rotations are the identity. The hips
take the source's hip travel scaled by the hip heights.

Each clip is then put on the ground with the villager's own feet (heel, ball and
toe-tip contact points, scripts/villager/rig.py FK), its natural ground speed is
measured off the planted foot, and a loop is rotated to start at the left
foot's contact — so walk and sprint share a phase and blend without a jump.
"""
import numpy as np

import rig
import skeleton as SK
from gltfio import Gltf, qfrom_to, qinv, qmul, qnorm, qrot, qslerp, world_pose

FPS = 30

# name in the game → (library, source clip, kind)
SOURCES = {
    'idle': ('UAL1', 'Idle_Loop', 'loop'),
    'walk': ('UAL1', 'Walk_Loop', 'gait'),
    'sprint': ('UAL1', 'Sprint_Loop', 'gait'),
    'kneelWork': ('UAL1', 'Fixing_Kneeling', 'once'),
}
# The kneel transitions cut from Fixing_Kneeling (seconds): going down, the
# held kneel (one frame), getting up.
KNEEL_CUTS = {'kneelDown': (0.0, 0.75), 'kneel': (1.2, 1.2), 'kneelUp': (4.1, 4.85)}
FILES = {'UAL1': 'quaternius/AnimationLibrary_Godot_Standard.gltf'}
MAPS = {'UAL1': SK.UAL1}


class Source:
    def __init__(self, path, bone_map):
        self.g = Gltf(path)
        g = self.g
        n = len(g.j['nodes'])
        order = []

        def visit(i):
            order.append(i)
            for c in g.j['nodes'][i].get('children', []):
                visit(c)

        for r in [i for i in range(n) if g.parent[i] < 0]:
            visit(r)
        self.order = order
        self.par = [order.index(g.parent[i]) if g.parent[i] >= 0 else -1 for i in order]
        self.rest_t = [g.trs(i)[0] for i in order]
        self.rest_r = [g.trs(i)[1] for i in order]
        self.map = bone_map
        self.slot = {b: order.index(g.node_index(s)) for b, s in bone_map.items()}
        wt, wr = world_pose(self.par, self.rest_t, self.rest_r)
        self.rest_wt = wt
        self.rest_wr = wr

    def pose(self, anim, t):
        smp = self.g.sample(anim, t)
        T = list(self.rest_t)
        Rr = list(self.rest_r)
        for k, node in enumerate(self.order):
            s = smp.get(node)
            if s:
                if 'translation' in s:
                    T[k] = s['translation']
                if 'rotation' in s:
                    Rr[k] = s['rotation']
        return world_pose(self.par, T, Rr)


def bone_dir_target(joints, b):
    i = SK.INDEX[b]
    d = joints[i, 3:] - joints[i, :3]
    return d / np.linalg.norm(d)


def _frame(d, s):
    d = d / np.linalg.norm(d)
    s = s - d * np.dot(s, d)
    s = s / np.linalg.norm(s)
    return np.stack([d, s, np.cross(d, s)], 1)


def _mat_quat(m):
    from mathutils import Matrix
    q = Matrix(m.tolist()).to_quaternion()
    return np.array([q.x, q.y, q.z, q.w])


def secondary(b, palm):
    """The axis that fixes a limb bone's twist: the palm's facing for the arm
    (the source holds its T-pose palms down), forward for thigh and shin
    (knees ahead), the left side for foot and toe, up for the clavicle."""
    part, _, side = b.partition('.')
    if part in ('upperArm', 'forearm', 'hand'):
        return palm[side], np.array([0, -1.0, 0])
    if part in ('thigh', 'shin'):
        return np.array([0, 0, 1.0]), np.array([0, 0, 1.0])
    if part in ('foot', 'toe'):
        return np.array([1.0, 0, 0]), np.array([1.0, 0, 0])
    return np.array([0, 1.0, 0]), np.array([0, 1.0, 0])


def reference(src, joints, palm):
    """W_s(ref) for every villager bone: the source bone turned so that its
    direction AND twist match the villager's rest (the trunk is upright in both)."""
    ref = {}
    for b in SK.NAMES:
        k = src.slot[b]
        w = src.rest_wr[k]
        if b in SK.LIMBS:
            ds = qrot(w, [0, 1, 0])
            dt = bone_dir_target(joints, b)
            st, ss = secondary(b, palm)
            align = _frame(dt, st) @ _frame(ds, ss).T
            w = qnorm(qmul(_mat_quat(align), w))
        ref[b] = w
    return ref


def retarget(src, anim, joints, ref):
    dur = src.g.duration(anim)
    nf = max(2, int(round(dur * FPS)) + 1)
    times = np.linspace(0, dur, nf)
    hips_k = src.slot['hips']
    src_hip_y = src.rest_wt[hips_k][1]
    tgt_hip = joints[SK.INDEX['hips'], :3]
    scale = tgt_hip[1] / src_hip_y
    Q = np.zeros((nf, len(SK.NAMES), 4))
    P = np.zeros((nf, 3))
    for f, t in enumerate(times):
        wt, wr = src.pose(anim, t)
        W = {}
        for b in SK.NAMES:
            W[b] = qnorm(qmul(wr[src.slot[b]], qinv(ref[b])))
        for b in SK.NAMES:
            p = SK.PARENT[b]
            Q[f, SK.INDEX[b]] = W[b] if p is None else qnorm(qmul(qinv(W[p]), W[b]))
        P[f] = tgt_hip + (wt[hips_k] - src.rest_wt[hips_k]) * scale
    # keep quaternion signs continuous for interpolation
    for f in range(1, nf):
        flip = (Q[f] * Q[f - 1]).sum(1) < 0
        Q[f, flip] *= -1
    return {'times': times, 'q': Q, 'hips': P, 'duration': dur}


# ---- the feet -------------------------------------------------------------------


def contact_points(body):
    """Heel and ball on each foot bone, toe tip on each toe bone — bone-local
    offsets from the rest mesh (the sole's lowest points)."""
    pos = body['pos']
    W = body['W']
    j = body['joints']
    out = {}
    for s in ('L', 'R'):
        fi = SK.INDEX['foot.' + s]
        ti = SK.INDEX['toe.' + s]
        foot = W[:, fi] + W[:, ti] > 0.5
        fp = pos[foot]
        sole = fp[:, 1].min()
        ankle = j[fi, :3]
        ball = j[ti, :3]
        tip = j[ti, 3:]
        heel_z = fp[:, 2].min()
        heel = np.array([ankle[0], sole, heel_z + 0.012])
        ballp = np.array([ball[0], sole, ball[2]])
        tipp = np.array([tip[0], sole, fp[:, 2].max() - 0.008])
        knee = j[SK.INDEX['shin.' + s], :3]
        shin = W[:, SK.INDEX['shin.' + s]] > 0.5
        front = pos[shin & (np.abs(pos[:, 1] - knee[1]) < 0.03)]
        kneep = np.array([knee[0], knee[1], front[:, 2].max() if len(front) else knee[2] + 0.03])
        out[s] = {'heel': heel - ankle, 'ball': ballp - ankle, 'tip': tipp - ball, 'knee': kneep - knee}
    return out


def foot_points(joints, q, hips, cp):
    """World heel / ball / tip of both feet for one frame."""
    wr, wp = rig.fk(joints, q, hips)
    out = {}
    for s in ('L', 'R'):
        out[s] = {
            'heel': rig.point_on('foot.' + s, cp[s]['heel'], wr, wp),
            'ball': rig.point_on('foot.' + s, cp[s]['ball'], wr, wp),
            'tip': rig.point_on('toe.' + s, cp[s]['tip'], wr, wp),
            'knee': rig.point_on('shin.' + s, cp[s]['knee'], wr, wp),
        }
    return out


def ground(clip, joints, cp, per_frame):
    """Put the clip on the ground: per frame (a walk: one foot always
    carries) or by one shift for the whole clip (a run's flight is kept)."""
    lows = []
    for f in range(len(clip['times'])):
        fp = foot_points(joints, clip['q'][f], clip['hips'][f], cp)
        lows.append(min(p[1] for s in fp.values() for k, p in s.items() if k != 'knee' or not per_frame))
    lows = np.array(lows)
    if per_frame:
        clip['hips'][:, 1] -= lows
    else:
        clip['hips'][:, 1] -= lows.min()
    return lows


def analyse_gait(clip, joints, cp):
    """Contact timeline and natural ground speed of a gait loop: per frame the
    height of each foot's heel, ball and tip; the planted foot's backward speed
    (its lowest point while within 1 cm of the ground) gives the speed."""
    nf = len(clip['times'])
    H = {s: {k: np.zeros(nf) for k in ('heel', 'ball', 'tip')} for s in ('L', 'R')}
    Z = {s: np.zeros(nf) for s in ('L', 'R')}
    for f in range(nf):
        fp = foot_points(joints, clip['q'][f], clip['hips'][f], cp)
        for s in ('L', 'R'):
            for k in ('heel', 'ball', 'tip'):
                H[s][k][f] = fp[s][k][1]
            Z[s][f] = fp[s]['ball'][2]
    dt = clip['times'][1] - clip['times'][0]
    speeds = []
    for s in ('L', 'R'):
        low = np.minimum(np.minimum(H[s]['heel'], H[s]['ball']), H[s]['tip'])
        planted = low < 0.02
        for f in range(nf - 1):
            if planted[f] and planted[f + 1]:
                speeds.append(-(Z[s][f + 1] - Z[s][f]) / dt)
    speed = float(np.median(speeds)) if speeds else 0.0
    return {'heights': H, 'speed': speed}


def lowest(an, side):
    H = an['heights'][side]
    return np.minimum(np.minimum(H['heel'], H['ball']), H['tip'])


def rotate_to_contact(clip, an, side='L', touch=0.02):
    """Start the loop at `side`'s landing: the first frame within `touch` of
    the ground after a swing that rose clear of it (≥ 3 × touch over the six
    frames before) — the heel strike of a walk, the ball strike of a run."""
    low = lowest(an, side)
    nf = len(low) - 1  # the last frame repeats the first
    land = None
    for f in range(nf):
        before = [low[(f - k) % nf] for k in range(1, 7)]
        if low[f] < touch and max(before) > 3 * touch and before[0] >= touch:
            land = f
            break
    if land is None:
        return 0
    for key in ('q', 'hips'):
        body = clip[key][:nf]
        rolled = np.concatenate([body[land:], body[:land]])
        clip[key] = np.concatenate([rolled, rolled[:1]])
    return land


def close_loop(c):
    """Make a loop's last frame its first again: a source loop whose end does
    not quite meet its start (Quaternius' Sprint_Loop: the right shin ~1 rad
    apart) jumps at the seam every cycle. The gap is spread over the cycle —
    frame k turned by k/(n−1) of it — so the motion stays smooth."""
    Q, P = c['q'], c['hips']
    n = len(Q)
    worst = 0.0
    for i in range(Q.shape[1]):
        d = qnorm(qmul(Q[0, i], qinv(Q[-1, i])))
        if d[3] < 0:
            d = -d
        worst = max(worst, 2 * float(np.arccos(min(1.0, d[3]))))
        for k in range(n):
            Q[k, i] = qnorm(qmul(qslerp(np.array([0, 0, 0, 1.0]), d, k / (n - 1)), Q[k, i]))
    gap = P[0] - P[-1]
    gap[1] = 0  # the height is grounded per frame afterwards
    for k in range(n):
        P[k] = P[k] + gap * (k / (n - 1))
    return worst


def soften(c, passes=1):
    """A circular [1 2 1]/4 filter over a loop's frames (rotations by
    normalized weighted sums in one hemisphere, the hips linearly): the
    Quaternius sprint snaps each knee straight at the strike — ~1 rad between
    two frames and a little past straight — which reads as a pop at 30 fps."""
    for _ in range(passes):
        Q, P = c['q'], c['hips']
        body_q, body_p = Q[:-1], P[:-1]  # the last frame repeats the first
        n = len(body_q)
        out_q = np.zeros_like(body_q)
        out_p = np.zeros_like(body_p)
        for k in range(n):
            a, m, b = body_q[(k - 1) % n], body_q[k], body_q[(k + 1) % n]
            sa = np.where((a * m).sum(1, keepdims=True) < 0, -1.0, 1.0)
            sb = np.where((b * m).sum(1, keepdims=True) < 0, -1.0, 1.0)
            q = sa * a + 2 * m + sb * b
            out_q[k] = q / np.linalg.norm(q, axis=1, keepdims=True)
            out_p[k] = (body_p[(k - 1) % n] + 2 * body_p[k] + body_p[(k + 1) % n]) / 4
        c['q'] = np.concatenate([out_q, out_q[:1]])
        c['hips'] = np.concatenate([out_p, out_p[:1]])


def slice_clip(c, t0, t1, name):
    """A part of a clip, from t0 to t1, resampled at FPS (a hold when t0 = t1)."""
    from sheets import sample
    n = max(2, int(round((t1 - t0) * FPS)) + 1)
    times = np.linspace(0, max(t1 - t0, 1.0 / FPS), n)
    Q = np.zeros((n, len(SK.NAMES), 4))
    P = np.zeros((n, 3))
    for k, t in enumerate(times):
        q, h = sample(c, t0 + min(t, t1 - t0))
        Q[k] = q
        P[k] = h
    return {'times': times, 'q': Q, 'hips': P, 'duration': float(times[-1]), 'kind': 'hold' if t0 == t1 else 'once',
            'source': c['source'] + f' {t0:.2f}–{t1:.2f}s'}


def build_clips(src_dir, body, cfg, only=None):
    import os
    joints = body['joints']
    cp = contact_points(body)
    libs = {}
    out = {'contact_points': cp, 'clips': {}, 'shovel': cfg['VILLAGER_ASSET']['shovel']}
    for name, (lib, clip_name, kind) in SOURCES.items():
        if only and name not in only:
            continue
        if lib not in libs:
            libs[lib] = Source(os.path.join(src_dir, FILES[lib]), MAPS[lib])
        src = libs[lib]
        ref = reference(src, joints, body['palm'])
        c = retarget(src, src.g.animation(clip_name), joints, ref)
        c['source'] = f'{lib}:{clip_name}'
        c['kind'] = kind
        if kind in ('gait', 'loop'):
            seam = close_loop(c)
            if seam > 0.05:
                print(f'clip {name}: loop seam closed ({seam:.2f} rad at the worst bone)')
        if name == 'sprint':
            soften(c, 2)
        if kind == 'gait':
            ground(c, joints, cp, per_frame=(name != 'sprint' and name != 'jog'))
            an = analyse_gait(c, joints, cp)
            c['phase0'] = rotate_to_contact(c, an)
            an = analyse_gait(c, joints, cp)
            c['speed'] = an['speed']
            c['heights'] = an['heights']
        else:
            ground(c, joints, cp, per_frame=False)
        out['clips'][name] = c
        if name == 'kneelWork':
            for cut, (t0, t1) in KNEEL_CUTS.items():
                out['clips'][cut] = slice_clip(c, t0, t1, cut)
        print(f'clip {name:10s} {c["source"]:28s} {c["duration"]:.2f}s speed={c.get("speed", 0):.3f}')
    import toolclips
    toolclips.build_tool_clips(body, out, cfg)
    return out
