"""The tool clips: digging with the shovel, and walking / standing with it carried
on the shoulder.

The Quaternius libraries (CC0) have no shovel work, so `dig` is AUTHORED here:
the shovel's path through a stroke is keyed (set the blade, push it in, lever,
lift, throw to the side, back), the trunk follows it (hips down, lean, turn),
and both arms are solved onto the shaft by two-bone IK — the right hand lower
(the tool is attached to it), the left higher up near the handle — with the
legs re-solved so the feet stay where the idle stance put them. `carry` and
`carryIdle` are the retargeted walk and idle with the right arm solved onto a
shovel lying over the right shoulder, its blade behind and above it.

The tool's frame is the game's (scenes/place/PlaceLife.tsx digging tool): +y
along the shaft toward the handle, the blade at −y, its face toward +z; the
right hand holds the shaft at `grip` along y — that and the hand-to-tool
rotation are the per-clip `tool` metadata the runtime attaches the tool by.
"""
import numpy as np

import rig
import skeleton as SK
from gltfio import qinv, qmul, qnorm, qrot

FPS = 30


def _mat_quat(m):
    from mathutils import Matrix
    q = Matrix(np.asarray(m).tolist()).to_quaternion()
    return np.array([q.x, q.y, q.z, q.w])


def _quat_mat(q):
    from gltfio import qmat
    return qmat(q)


def frame(d, s):
    d = d / np.linalg.norm(d)
    s = s - d * np.dot(s, d)
    s = s / np.linalg.norm(s)
    return np.stack([d, s, np.cross(d, s)], 1)


def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


# ---- the shovel (scenes/place/PlaceLife.tsx, figure units) -----------------------

SHOVEL = None  # VILLAGER_ASSET.shovel, set by build_tool_clips


def hand_frame(body, side):
    """The hand's rest axes: along the fingers, the palm's normal, and the
    knuckle line (pinky → index)."""
    j = body['joints']
    i = SK.INDEX['hand.' + side]
    d = unit(j[i, 3:] - j[i, :3])
    p = unit(body['palm'][side])
    p = unit(p - d * np.dot(p, d))
    return d, p, np.cross(p, d) if side == 'L' else np.cross(d, p)


def grip_rotation(body, side, thumb_up=True):
    """Tool-in-hand rotation R_g (tool axes in the hand's rest frame): the shaft
    (+y) runs along the knuckle line through the closed fist, the blade's face
    (+z) to the back of the hand."""
    d, p, k = hand_frame(body, side)
    y = k if thumb_up else -k
    z = -p
    x = np.cross(y, z)
    return np.stack([x, y, z], 1)  # columns: tool x, y, z in hand rest frame


def grip_offset(body, side):
    """Where the shaft's axis passes through the closed fist (the grip morph's
    hole, measured off the mesh: ~6.5 cm along the hand, 3.5 cm to the palm
    side at an adult's stature), from the wrist, in the hand's rest frame."""
    d, p, _k = hand_frame(body, side)
    return d * 0.065 + p * 0.035


# ---- inverse kinematics on the villager skeleton ---------------------------------


def world_of(joints, q, hips):
    return rig.fk(joints, q, hips)


def set_world_rot(q, wr, bone, W):
    """Write bone's LOCAL rotation so its world rotation becomes W (parents fixed)."""
    i = SK.INDEX[bone]
    p = SK.PARENT[bone]
    q[i] = W if p is None else qnorm(qmul(qinv(wr[SK.INDEX[p]]), W))


def two_bone(joints, q, hips, upper, lower, target, pole, end_rot=None, end=None):
    """Bend `upper`→`lower` so that `lower`'s tail (the wrist / ankle — the head
    of `end`) reaches `target`, the middle joint toward `pole`; keeps the
    rest hinge plane. Optionally sets `end`'s world rotation."""
    wr, wp = world_of(joints, q, hips)
    iu, il = SK.INDEX[upper], SK.INDEX[lower]
    h = joints[:, :3]
    u0 = h[il] - h[iu]
    tip_rest = h[SK.INDEX[end]] if end else joints[il, 3:]
    f0 = tip_rest - h[il]
    a, b = np.linalg.norm(u0), np.linalg.norm(f0)
    S = wp[iu]
    t = np.asarray(target, float)
    D = t - S
    dist = np.clip(np.linalg.norm(D), abs(a - b) + 1e-5, a + b - 1e-5)
    dn = unit(D)
    cos_a = (a * a + dist * dist - b * b) / (2 * a * dist)
    side = np.asarray(pole, float) - dn * np.dot(pole, dn)
    side = unit(side)
    u1 = unit(dn * cos_a + side * np.sqrt(max(0.0, 1 - cos_a * cos_a)))
    E = S + u1 * a
    T = S + dn * dist
    f1 = unit(T - E)
    n0 = unit(np.cross(u0, f0))
    n1 = unit(np.cross(u1, f1))
    Wu = _mat_quat(frame(u1, n1) @ frame(unit(u0), n0).T)
    Wl = _mat_quat(frame(f1, n1) @ frame(unit(f0), n0).T)
    set_world_rot(q, wr, upper, Wu)
    wr, wp = world_of(joints, q, hips)
    set_world_rot(q, wr, lower, Wl)
    if end_rot is not None and end:
        wr, wp = world_of(joints, q, hips)
        set_world_rot(q, wr, end, end_rot)
    return np.linalg.norm(T - t)


def hand_on_tool(body, joints, q, hips, side, tool_pos, tool_rot, grip_y, pole, thumb_up=True):
    """Solve one arm so that its closed hand holds the shaft at `grip_y`."""
    Rg = grip_rotation(body, side, thumb_up)
    Wh = tool_rot @ Rg.T  # hand world rotation (matrix), since tool = hand · Rg
    grip_world = tool_pos + tool_rot @ np.array([0, grip_y, 0])
    wrist = grip_world - Wh @ grip_offset(body, side)
    return two_bone(joints, q, hips, 'upperArm.' + side, 'forearm.' + side, wrist, pole, _mat_quat(Wh), 'hand.' + side)


def tool_from_hand(body, side, wr, wp, thumb_up=True):
    """The tool's world frame as the hand holds it (grip at the tool origin)."""
    i = SK.INDEX['hand.' + side]
    Wh = _quat_mat(wr[i])
    Rg = grip_rotation(body, side, thumb_up)
    pos = wp[i] + Wh @ grip_offset(body, side)
    return pos, Wh @ Rg


def shaft_clearance(body, joints, q, hips, grip, side='R'):
    """How far the shaft and blade stay off the body (hands and forearms
    excluded — they hold it): min distance of points along the tool to the
    skinned body's vertices, less the shaft's radius."""
    from body import top4
    wr, wp = world_of(joints, q, hips)
    jidx, jw = top4(body['W'])
    v = rig.skin(body['pos'], jidx, jw, joints, wr, wp)
    hold = sum(body['W'][:, SK.INDEX[b + '.' + s]] for b in ('hand', 'forearm') for s in 'LR') > 0.3
    v = v[~hold]
    pos, rot = tool_from_hand(body, side, wr, wp)
    origin = pos - rot @ np.array([0, grip, 0])
    ys = np.linspace(SHOVEL['tip'], SHOVEL['top'], 40)
    pts = origin + np.outer(ys, rot[:, 1])
    d = min(np.min(np.linalg.norm(v - p, axis=1)) for p in pts)
    return d - SHOVEL['shaftRadius']


# ---- keyed motion ------------------------------------------------------------------


def catmull(keys, t, period):
    """Periodic Catmull-Rom through (time, value) keys; values are arrays."""
    ts = [k[0] for k in keys]
    n = len(keys)
    t = t % period
    i = max(k for k in range(n) if ts[k] <= t + 1e-9)
    t0 = ts[i]
    t1 = ts[i + 1] if i + 1 < n else period
    u = (t - t0) / max(1e-9, t1 - t0)
    p0 = np.asarray(keys[(i - 1) % n][1], float)
    p1 = np.asarray(keys[i][1], float)
    p2 = np.asarray(keys[(i + 1) % n][1], float)
    p3 = np.asarray(keys[(i + 2) % n][1], float)
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)


# The dig stroke (seconds; body frame: +z ahead, +x the figure's left, y up).
# tool: where the upper (left) hand holds the shaft, the shaft's direction from
# there down to the blade, and a hint for the blade's face (+z of the tool:
# the side that carries the soil — AWAY from the digger while the blade goes
# in, so the lever turns it up with the soil on it, then tipped to the right
# to throw). The face turns with the lever, never about the shaft: a hint that
# began toward the digger and ended up turned the tool half round its own
# shaft through the lever, and both wrists flipped (~0.8 rad in one frame).
# trunk: hip drop, forward lean of the spine, turn of the chest (+ to the left).
DIG_PERIOD = 2.4
DIG_KEYS = [
    # t,    upper hand (x, y, z),  shaft dir to blade,   face hint,       drop, lean, turn
    (0.00, (-0.05, 0.80, 0.28), (0.04, -0.86, 0.50), (0.0, 0.5, 0.86), 0.05, 0.28, 0.00),
    (0.45, (-0.05, 0.72, 0.32), (0.04, -0.90, 0.43), (0.0, 0.43, 0.9), 0.08, 0.26, 0.00),
    (0.85, (-0.12, 0.66, 0.20), (0.15, -0.70, 0.70), (0.0, 0.7, 0.7), 0.10, 0.36, 0.05),
    (1.30, (-0.16, 0.70, 0.24), (0.15, -0.38, 0.91), (0.0, 1.0, 0.0), 0.07, 0.34, 0.05),
    (1.70, (-0.08, 0.76, 0.26), (-0.62, -0.28, 0.73), (-0.7, 0.3, 0.0), 0.05, 0.30, -0.40),
    (2.00, (-0.04, 0.80, 0.28), (-0.20, -0.66, 0.72), (0.0, 0.6, 0.8), 0.05, 0.30, -0.20),
]
DIG_GRIP = {'R': -0.03, 'L': 0.13}


def max_turn_per_frame(Q):
    """Per bone, the largest local turn between consecutive frames (rad) — a
    flip of an IK hinge shows here as a jump far above the stroke's own speed."""
    out = {}
    for b in SK.NAMES:
        i = SK.INDEX[b]
        d = np.abs((Q[1:, i] * Q[:-1, i]).sum(1)).clip(0, 1)
        out[b] = float(2 * np.arccos(d).max())
    return out


def dig_clip(body, clips, cfg):
    joints = body['joints']
    idle = clips['clips']['idle']
    from sheets import sample
    q_stand, hips_stand = sample(idle, 0.0)
    cp = clips['contact_points']
    # feet: where the idle stance plants them (ankle positions)
    wr0, wp0 = world_of(joints, q_stand, hips_stand)
    ankles = {s: wp0[SK.INDEX['foot.' + s]].copy() for s in 'LR'}
    foot_rot = {s: wr0[SK.INDEX['foot.' + s]].copy() for s in 'LR'}
    n = int(round(DIG_PERIOD * FPS)) + 1
    times = np.linspace(0, DIG_PERIOD, n)
    Q = np.zeros((n, len(SK.NAMES), 4))
    P = np.zeros((n, 3))
    misses = []
    solvers, needs = [], []
    for f, t in enumerate(times):
        k = catmull([(kk[0], np.concatenate([kk[1], kk[2], kk[3], kk[4:]])) for kk in DIG_KEYS], t, DIG_PERIOD)
        sdir = -unit(k[3:6])
        face = unit(k[6:9])
        tip = k[0:3] - sdir * (DIG_GRIP['L'] - SHOVEL['tip'])
        drop, lean, turn = k[9], k[10], k[11]
        # the tool, from its keyed blade tip and shaft
        rot = frame(sdir, face)
        y_ax = rot[:, 0]
        z_ax = rot[:, 1]
        tool_rot = np.stack([np.cross(y_ax, z_ax), y_ax, z_ax], 1)
        tool_pos = tip - tool_rot @ np.array([0, SHOVEL['tip'], 0])

        def solve(extra, tool_pos=tool_pos, tool_rot=tool_rot, lean=lean, drop=drop, turn=turn):
            from gltfio import qaxis
            q = q_stand.copy()
            hips = hips_stand.copy()
            L = lean + extra
            hips[1] -= drop + 0.1 * extra
            hips[2] -= 0.06 * L
            q[SK.INDEX['hips']] = qaxis([1, 0, 0], 0.25 * L)
            q[SK.INDEX['spine']] = qnorm(qmul(qaxis([0, 1, 0], turn * 0.4), qaxis([1, 0, 0], L * 0.5)))
            q[SK.INDEX['chest']] = qnorm(qmul(qaxis([0, 1, 0], turn * 0.6), qaxis([1, 0, 0], L * 0.25)))
            q[SK.INDEX['neck']] = qaxis([1, 0, 0], -L * 0.15)
            q[SK.INDEX['head']] = qaxis([1, 0, 0], 0.12)
            # legs back onto their planted ankles, knees ahead
            for s_ in 'LR':
                two_bone(joints, q, hips, 'thigh.' + s_, 'shin.' + s_, ankles[s_], np.array([0, 0, 1.0]), foot_rot[s_], 'foot.' + s_)
            # elbows out, down and back IN THE CHEST'S FRAME: a pole fixed in
            # the world swung through the shoulder→wrist line as the trunk
            # turned, and the hinge flipped (the left forearm jumped ~0.6 rad
            # between two frames at the lever)
            wr_, _wp = world_of(joints, q, hips)
            Wc = _quat_mat(wr_[SK.INDEX['chest']])
            mr = hand_on_tool(body, joints, q, hips, 'R', tool_pos, tool_rot, DIG_GRIP['R'], Wc @ np.array([-0.6, -0.5, -0.3]), thumb_up=True)
            ml = hand_on_tool(body, joints, q, hips, 'L', tool_pos, tool_rot, DIG_GRIP['L'], Wc @ np.array([0.6, -0.4, -0.4]), thumb_up=True)
            solve.last = (mr, ml)
            return q, hips, max(mr, ml)

        # the least extra lean (and dip) that brings both hands onto the shaft
        need = 0.88
        for extra in np.arange(0.0, 0.9, 0.02):
            if solve(extra)[2] < 0.004:
                need = extra
                break
        solvers.append(solve)
        needs.append(need)
    # One smooth lean through the stroke: the needs dilated, then blurred, so
    # no frame bends less than it must and none jerks between steps.
    needs = np.array(needs[:-1])
    m = len(needs)
    dil = np.array([max(needs[(i + k) % m] for k in range(-5, 6)) for i in range(m)])
    ker = np.exp(-0.5 * (np.arange(-8, 9) / 3.5) ** 2)
    ker /= ker.sum()
    smooth = np.array([sum(ker[k + 8] * dil[(i + k) % m] for k in range(-8, 9)) for i in range(m)])
    smooth = np.append(smooth, smooth[0])
    clear = []
    for f in range(n):
        q, hips, miss = solvers[f](float(smooth[f]))
        misses.append(miss)
        clear.append(shaft_clearance(body, joints, q, hips, DIG_GRIP['R']))
        Q[f] = q
        P[f] = hips
    for f in range(1, n):
        flip = (Q[f] * Q[f - 1]).sum(1) < 0
        Q[f, flip] *= -1
    clear = np.array(clear)
    jumps = max_turn_per_frame(Q)
    print('dig: largest turn between frames (rad):', {b: round(v, 3) for b, v in jumps.items() if v > 0.12})
    print('dig shaft clearance (min over frames, by key):', round(float(clear.min()), 3), 'at t=%.2f' % times[int(np.argmin(clear))], [round(float(clear[int(round(k[0] * FPS))]), 3) for k in DIG_KEYS])
    print('dig needs', np.round(needs[::6], 2), 'last R/L', np.round(solvers[0].last if hasattr(solvers[0], 'last') else (0, 0), 3))
    print(f'dig: worst hand miss {max(misses):.4f} at t={times[int(np.argmax(misses))]:.2f}; misses at keys', [round(misses[int(round(k[0] * FPS))], 3) for k in DIG_KEYS])
    return {'times': times, 'q': Q, 'hips': P, 'duration': DIG_PERIOD, 'kind': 'loop', 'source': 'authored (scripts/villager/toolclips.py)',
            'tool': {'hand': 'R', 'grip': DIG_GRIP['R'], 'other': DIG_GRIP['L'], 'thumbUp': True},
            'grip': {'L': 1, 'R': 1}, 'misses': misses}


# Carried over the right shoulder: in the CHEST's frame, the shaft runs from the
# blade (behind and above the shoulder) forward and down to the right hand.
CARRY = {'grip': 0.08, 'over': (-0.105, 0.0, 0.0), 'lift': 0.055, 'dir': (0.06, -0.28, 0.96), 'face': (0.0, 0.96, 0.28), 'ahead': 0.20}


def carry_clip(body, clips, base, name):
    joints = body['joints']
    c = clips['clips'][base]
    n = len(c['times'])
    Q = c['q'].copy()
    P = c['hips'].copy()
    misses = []
    for f in range(n):
        q = Q[f].copy()
        wr, wp = world_of(joints, q, P[f])
        ci = SK.INDEX['chest']
        Wc = _quat_mat(wr[ci])
        # the shaft rests on the right shoulder: the shoulder joint + lift
        sh = wp[SK.INDEX['upperArm.R']] + Wc @ np.array([0.0, CARRY['lift'], 0.0])
        sdir = Wc @ unit(np.array(CARRY['dir']))
        face = Wc @ unit(np.array(CARRY['face']))
        y_ax = unit(sdir)
        z_ax = unit(face - y_ax * np.dot(face, y_ax))
        tool_rot = np.stack([np.cross(y_ax, z_ax), y_ax, z_ax], 1)
        # the grip lies `ahead` along the shaft in front of the shoulder
        grip_world = sh + y_ax * CARRY['ahead']
        tool_pos = grip_world - tool_rot @ np.array([0, CARRY['grip'], 0])
        m = hand_on_tool(body, joints, q, P[f], 'R', tool_pos, tool_rot, CARRY['grip'], Wc @ np.array([-0.3, -0.8, -0.4]), thumb_up=True)
        misses.append(m)
        Q[f] = q
    print(f'{name}: worst hand miss {max(misses):.4f}')
    out = {k: v for k, v in c.items()}
    out.update({'q': Q, 'hips': P, 'source': c['source'] + ' + shovel on the right shoulder (authored arm)',
                'tool': {'hand': 'R', 'grip': CARRY['grip'], 'thumbUp': True}, 'grip': {'R': 1}, 'misses': misses})
    return out


def build_tool_clips(body, clips, cfg):
    global SHOVEL
    SHOVEL = cfg['VILLAGER_ASSET']['shovel']
    clips['clips']['dig'] = dig_clip(body, clips, cfg)
    clips['clips']['carry'] = carry_clip(body, clips, 'walk', 'carry')
    clips['clips']['carryIdle'] = carry_clip(body, clips, 'idle', 'carryIdle')
    return clips
