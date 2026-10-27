"""Step 2: the Quaternius clips (CC0) retargeted onto the villager skeleton.

Retargeting copies WORLD rotations: for each villager bone b with source bone s,
  W_b(t) = W_s(t) · W_s(ref)⁻¹
where W_s(ref) is the source bone posed into the villager's rest posture. The
trunk keeps the source's rest orientation (both stand upright facing +z); a limb
is swung from the source's T-pose direction onto the villager's A-pose one, so
an arm the source holds level comes out level here too. Local rotations follow
as W_parent⁻¹ · W_b; the villager's rest rotations are the identity. The hips
take the source's hip travel scaled by the hip heights.

The walk, sprint and idle are then restyled (`restyle`, VILLAGER_ASSET.clipStyle):
the source's hunched walk and diving sprint straightened, the idle squared.
The jog's stance is lengthened (`restance`, VILLAGER_ASSET.gaitStance).

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
    'jog': ('UAL1', 'Jog_Fwd_Loop', 'gait'),
    'sprint': ('UAL1', 'Sprint_Loop', 'gait'),
    'kneelWork': ('UAL1', 'Fixing_Kneeling', 'once'),
}
# The kneel transitions cut from Fixing_Kneeling (seconds): going down, the
# held kneel (one frame), getting up.
KNEEL_CUTS = {'kneelDown': (0.0, 0.75), 'kneel': (1.2, 1.2), 'kneelUp': (4.1, 4.85)}
FILES = {'UAL1': 'quaternius/AnimationLibrary_Godot_Standard.gltf', 'UAL2': 'quaternius/UAL2_Standard.glb'}
MAPS = {'UAL1': SK.UAL1, 'UAL2': SK.UAL2}


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


def contact_intervals(an, nf, touch=0.02):
    """Per foot and contact (heel, ball, tip) the phase intervals [a, b) of
    the cycle (0 … 1 from the left landing) in which it carries — within
    `touch` of the ground; b > 1 where an interval wraps past the seam."""
    n = nf - 1  # the last frame repeats the first
    out = {}
    for s in ('L', 'R'):
        out[s] = {}
        for k in ('heel', 'ball', 'tip'):
            down = an['heights'][s][k][:n] < touch
            if down.all():
                out[s][k] = [[0.0, 1.0]]
                continue
            spans = []
            for i in range(n):
                if down[i] and not down[i - 1]:
                    j = 1
                    while down[(i + j) % n]:
                        j += 1
                    spans.append([i / n, (i + j) / n])
            out[s][k] = sorted(spans)
    return out


def best_loop_end(c, search=0.25):
    """Cut a loop at the frame of its last quarter that best meets its first
    (the worst bone's angle): a source loop whose ends do not meet (the
    Quaternius sprint) is closed where it nearly does instead of having a
    wide gap smeared over the whole cycle. Returns the seam left at that cut."""
    Q = c['q']
    n = len(Q)

    def gap(k):
        d = np.abs((Q[0] * Q[k]).sum(1)).clip(0, 1)
        return float(2 * np.arccos(d).max())
    first = max(2, int(n * (1 - search)))
    best = min(range(first, n), key=gap)
    if best < n - 1 and gap(best) < gap(n - 1):
        dt = c['times'][1] - c['times'][0]
        c['q'] = Q[:best + 1].copy()
        c['hips'] = c['hips'][:best + 1].copy()
        c['times'] = c['times'][:best + 1].copy()
        c['duration'] = float(best * dt)
    return gap(len(c['q']) - 1)


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


# ---- clip style (natural-villager-motion step 6) ----------------------------------

X, Y, Z = np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, 1.0])


def tilt(wr, b):
    """A bone's forward tilt (rad, + leaning forward): its up axis off the vertical, seen from the side."""
    y = qrot(wr[SK.INDEX[b]], Y)
    return float(np.arctan2(y[2], y[1]))


def tilt_after(turn, wr, b):
    """`b`'s forward tilt once the whole figure is turned by the world `turn`."""
    y = qrot(qmul(turn, wr[SK.INDEX[b]]), Y)
    return float(np.arctan2(y[2], y[1]))


def heading(wr, b):
    """A bone's facing about the vertical (rad, + to the figure's left)."""
    z = qrot(wr[SK.INDEX[b]], Z)
    return float(np.arctan2(z[0], z[2]))


def _set_world(joints, q, hips, bone, W):
    wr, _wp = rig.fk(joints, q, hips)
    p = SK.PARENT[bone]
    q[SK.INDEX[bone]] = qnorm(W) if p is None else qnorm(qmul(qinv(wr[SK.INDEX[p]]), W))


def _turn(joints, q, hips, bone, axis, ang):
    """Turn `bone` (its children with it) by `ang` about the world `axis`."""
    from gltfio import qaxis
    wr, _wp = rig.fk(joints, q, hips)
    _set_world(joints, q, hips, bone, qmul(qaxis(axis, ang), wr[SK.INDEX[bone]]))


def _hold(joints, q, hips, bones, world):
    """Give `bones` their world rotations `world` back (a parent moved)."""
    for b in bones:
        _set_world(joints, q, hips, b, world[SK.INDEX[b]])


def restyle(c, name, joints, style):
    """The clip-style offsets (VILLAGER_ASSET.clipStyle) on a retargeted clip,
    per frame: the hips' and the chest's MEAN forward tilt brought to
    `hipsTilt` and `chestTilt` by one offset each (each keeps its swing; the legs keeping their world turn so the feet stay
    put; the rest on the chest), the chest's twist against the hips scaled by
    `chestTwist`; the head keeping its world turn through it all (the twist
    moves the chest's tilt, so a second pass brings its mean back to
    `chestTilt`). `elbowMean` shifts each elbow's bend by one offset to that
    mean, kept in [`elbowMin`, `elbowMax`]; `armIn` brings the upper arm toward the body;
    `square` takes a standing clip's constant turns out (hips and head) and
    puts the feet side by side."""
    s = style.get(name)
    if not s:
        return {}
    from toolclips import two_bone
    Q, P = c['q'], c['hips']
    n = len(Q)
    fk = lambda f: rig.fk(joints, Q[f], P[f])  # noqa: E731
    hips_yaw = float(np.mean([heading(fk(f)[0], 'hips') for f in range(n)])) if s.get('square') else 0.0
    # the tilts the offsets correct, read as the frame loop below meets them:
    # after the square's yaw is out (a turn about the vertical changes what a
    # tilt seen from the side measures)
    from gltfio import qaxis
    unyaw = qaxis(Y, -hips_yaw)
    before = {}
    for b in ('hips', 'chest', 'head'):
        before[b] = float(np.degrees(np.mean([tilt_after(unyaw, fk(f)[0], b) for f in range(n)])))
    # constant offsets to the means, so each bone keeps its own swing through the cycle
    hips_off = np.radians(0.0) + (s['hipsTilt'] - np.radians(before['hips']) if 'hipsTilt' in s else 0.0)
    chest_off = s['chestTilt'] - np.radians(before['chest']) - hips_off if 'chestTilt' in s else 0.0

    def bend_of(wp, side):
        iu, il, ih = SK.INDEX['upperArm.' + side], SK.INDEX['forearm.' + side], SK.INDEX['hand.' + side]
        u, fa = wp[il] - wp[iu], wp[ih] - wp[il]
        return u, fa, float(np.arccos(np.clip(np.dot(u, fa) / np.linalg.norm(u) / np.linalg.norm(fa), -1, 1)))

    # the elbow's bend is the arm's own: the trunk offsets below leave it as it is
    bend_mean = {side: float(np.mean([bend_of(fk(f)[1], side)[2] for f in range(n)])) for side in ('L', 'R')}
    for f in range(n):
        q, h = Q[f], P[f]
        wr0, wp0 = rig.fk(joints, q, h)
        head0 = wr0[SK.INDEX['head']].copy()
        if hips_yaw:
            _turn(joints, q, h, 'hips', Y, -hips_yaw)
            wr0, wp0 = rig.fk(joints, q, h)
            head0 = wr0[SK.INDEX['head']].copy()
        if 'hipsTilt' in s:
            _turn(joints, q, h, 'hips', X, hips_off)
            _hold(joints, q, h, ['thigh.L', 'thigh.R'], wr0)
            # the turned hips carry the thigh heads along, and the legs kept
            # their world turn moved the feet with them, by a little more or
            # less every frame: a planted sprint foot slid under the runtime
            # hold (0.0041 per 120 Hz frame for the no-slide test's 0.004).
            # Each leg is bent back onto its foot's own place and turn, its
            # knee toward where it was.
            for side in ('L', 'R'):
                fi, si = SK.INDEX['foot.' + side], SK.INDEX['shin.' + side]
                hip = rig.fk(joints, q, h)[1][SK.INDEX['thigh.' + side]]
                two_bone(joints, q, h, 'thigh.' + side, 'shin.' + side, wp0[fi], wp0[si] - hip, wr0[fi], 'foot.' + side)
        if 'chestTilt' in s:
            _turn(joints, q, h, 'chest', X, chest_off)
        if 'chestTwist' in s:
            wr, _wp = rig.fk(joints, q, h)
            tw = heading(wr, 'chest') - heading(wr, 'hips')
            _turn(joints, q, h, 'spine1', Y, -tw * (1 - s['chestTwist']))
        if s.get('square'):
            # the head facing the hips' way: its constant turn removed
            wr, _wp = rig.fk(joints, q, h)
            from gltfio import qaxis
            head0 = qmul(qaxis(Y, heading(wr, 'hips') - heading(wr0, 'head')), head0)
        _set_world(joints, q, h, 'head', head0)
    if 'chestTilt' in s:
        # the twist turned the tilted chest about the vertical, which moves its
        # tilt (the jog came out 13.4° for 10.9°): the mean brought back
        res = s['chestTilt'] - float(np.mean([tilt(fk(f)[0], 'chest') for f in range(n)]))
        for f in range(n):
            q, h = Q[f], P[f]
            head0 = rig.fk(joints, q, h)[0][SK.INDEX['head']].copy()
            _turn(joints, q, h, 'chest', X, res)
            _set_world(joints, q, h, 'head', head0)
    for f in range(n):
        q, h = Q[f], P[f]
        if 'elbowMin' in s:
            for side, sg in (('L', 1.0), ('R', -1.0)):
                wr, wp = rig.fk(joints, q, h)
                fwd = qrot(wr[SK.INDEX['chest']], Z)
                if s.get('armIn'):
                    _turn(joints, q, h, 'upperArm.' + side, fwd, -sg * s['armIn'])
                    wr, wp = rig.fk(joints, q, h)
                u, fa, bend = bend_of(wp, side)
                want = bend + (s['elbowMean'] - bend_mean[side]) if 'elbowMean' in s else bend
                want = min(max(want, s['elbowMin']), s.get('elbowMax', np.pi))
                # in the elbow's own plane (a near-straight arm has none: bent forward)
                axis = np.cross(u, fa) if bend > 0.05 else np.cross(u, fwd)
                if abs(want - bend) > 1e-6 and np.linalg.norm(axis) > 1e-6:
                    _turn(joints, q, h, 'forearm.' + side, axis / np.linalg.norm(axis), want - bend)
        if s.get('square'):
            wr, wp = rig.fk(joints, q, h)
            mid = 0.5 * (wp[SK.INDEX['foot.L']][2] + wp[SK.INDEX['foot.R']][2])
            half = 0.5 * (wp[SK.INDEX['foot.L']][0] - wp[SK.INDEX['foot.R']][0])
            for side, sg in (('L', 1.0), ('R', -1.0)):
                fi = SK.INDEX['foot.' + side]
                t = wp[fi].copy()
                t[2] = mid
                # side by side, the same span, centred under the hips
                t[0] = wp[SK.INDEX['hips']][0] + sg * half
                frot = wr[fi].copy()
                # each foot pointing the hips' way
                from gltfio import qaxis
                frot = qmul(qaxis(Y, heading(wr, 'hips') - heading(wr, 'foot.' + side)), frot)
                two_bone(joints, q, h, 'thigh.' + side, 'shin.' + side, t, Z, frot, 'foot.' + side)
    for f in range(1, n):
        flip = (Q[f] * Q[f - 1]).sum(1) < 0
        Q[f, flip] *= -1
    after = {b: float(np.degrees(np.mean([tilt(fk(f)[0], b) for f in range(n)]))) for b in ('hips', 'chest', 'head')}
    elbows = [np.degrees(bend_of(fk(f)[1], side)[2]) for f in range(n) for side in ('L', 'R')]
    print(f'clip {name}: style — tilt (deg) before {before}, after {after}; elbow (deg) '
          f'{np.degrees(min(bend_mean.values())):.1f}-{np.degrees(max(bend_mean.values())):.1f} mean before, '
          f'{min(elbows):.1f}-{max(elbows):.1f} after')
    return after


def restance(c, joints, cp, s):
    """A run's stance lengthened (VILLAGER_ASSET.gaitStance): the source jog
    keeps each foot down ~11 % of its cycle and reads as floating. The whole
    clip is retimed by one smooth warp that plays each foot's stance, at its
    middle, at 1 − `slow` of the source's pace and the flights faster;
    the hips' rise over their lowest is scaled by `bounce` (a flight played
    faster with the same height reads as low gravity), and a foot the lower
    hips put under the ground is bent back onto it (its world turn kept), so
    it carries there. Expects the clip grounded and started at the left landing."""
    from sheets import sample
    from toolclips import two_bone
    n = len(c['times'])
    an = analyse_gait(c, joints, cp)
    sup = contact_intervals(an, n)
    centres = []
    for side in ('L', 'R'):
        spans = [x for k in ('heel', 'ball', 'tip') for x in sup[side][k]]
        a = min(x[0] for x in spans)
        centres.append(0.5 * (a + max(x[1] for x in spans if x[0] - a < 0.5)))
    # the source's pace through its cycle: 1 − slow at each stance's middle
    # (each foot's own: the source sprint lands its right foot off the half
    # cycle), rising as cos² to 1 half a step away
    grid = np.linspace(0, 1, 2001)
    pace = np.ones_like(grid)
    for m in centres:
        d = (grid - m + 0.5) % 1 - 0.5
        pace -= s['slow'] * np.where(np.abs(d) < 0.25, np.cos(2 * np.pi * d) ** 2, 0.0)
    took = np.concatenate([[0], np.cumsum(0.5 * (1 / pace[1:] + 1 / pace[:-1]) * np.diff(grid))])
    phi = np.interp(np.linspace(0, 1, n) * took[-1], took, grid)
    Q = np.zeros_like(c['q'])
    P = np.zeros_like(c['hips'])
    for k, p in enumerate(phi):
        Q[k], P[k] = sample(c, (p % 1) * c['duration'])
    Q[-1], P[-1] = Q[0], P[0]
    low = P[:, 1].min()
    P[:, 1] = low + s['bounce'] * (P[:, 1] - low)
    for f in range(n):
        q, h = Q[f], P[f]
        fp = foot_points(joints, q, h, cp)
        for side in ('L', 'R'):
            under = min(fp[side][k][1] for k in ('heel', 'ball', 'tip'))
            if under < 0:
                wr, wp = rig.fk(joints, q, h)
                t = wp[SK.INDEX['foot.' + side]].copy()
                t[1] -= under
                pole = wp[SK.INDEX['shin.' + side]] - wp[SK.INDEX['thigh.' + side]]
                two_bone(joints, q, h, 'thigh.' + side, 'shin.' + side, t, pole, wr[SK.INDEX['foot.' + side]], 'foot.' + side)
    # the carrying foot swept back at one pace: its ankle moved evenly over the
    # hips from where it touches down to where it lifts (the clamp above catches
    # the swing still reaching forward, then slows, so it would stand on the
    # ground at an uneven pace and the runtime hold would drag the leg)
    for side in ('L', 'R'):
        fi = SK.INDEX['foot.' + side]
        low = np.array([min(p[1] for k, p in foot_points(joints, Q[f], P[f], cp)[side].items() if k != 'knee') for f in range(n - 1)])
        down = low < 0.02
        if down.all() or not down.any():
            continue
        m = n - 1
        start = next(f for f in range(m) if down[f] and not down[f - 1])
        span = 1
        while down[(start + span) % m]:
            span += 1
        ends = [rig.fk(joints, Q[f % m], P[f % m]) for f in (start, start + span - 1)]
        rel = [wp[fi] - wp[SK.INDEX['hips']] for _wr, wp in ends]
        for k in range(1, span - 1):
            f = (start + k) % m
            q, h = Q[f], P[f]
            wr, wp = rig.fk(joints, q, h)
            t = wp[fi].copy()
            a = k / (span - 1)
            t[[0, 2]] = (wp[SK.INDEX['hips']] + rel[0] * (1 - a) + rel[1] * a)[[0, 2]]
            pole = wp[SK.INDEX['shin.' + side]] - wp[SK.INDEX['thigh.' + side]]
            two_bone(joints, q, h, 'thigh.' + side, 'shin.' + side, t, pole, wr[fi], 'foot.' + side)
    Q[-1], P[-1] = Q[0], P[0]
    for f in range(1, n):
        flip = (Q[f] * Q[f - 1]).sum(1) < 0
        Q[f, flip] *= -1
    c['q'], c['hips'] = Q, P


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


def build_clips(src_dir, body, cfg, only=None, style=True):
    """The retargeted clips; `style=False` leaves the clip style out, a dict
    puts that style on instead of VILLAGER_ASSET.clipStyle (the motion the
    garments are tailored to, fit.tailor)."""
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
            seam = best_loop_end(c)
            close_loop(c)
            c['seam'] = seam
            limit = cfg['VILLAGER_ASSET']['loopSeamMax']
            if seam > limit:
                # a seam this wide is a different pose at the loop's two ends:
                # spread over the cycle it smears the whole clip — refused
                raise RuntimeError(f'clip {name}: loop seam {seam:.2f} rad over VILLAGER_ASSET.loopSeamMax = {limit}')
            if seam > 0.05:
                print(f'clip {name}: loop seam closed ({seam:.2f} rad at the worst bone)')
        if name in ('sprint', 'jog'):
            # the jog snaps its knee straight at the strike as the sprint does (~28 rad/s)
            soften(c, 2)
        # the style offsets (natural-villager-motion step 6), before the grounding
        if style:
            restyle(c, name, joints, cfg['VILLAGER_ASSET']['clipStyle'] if style is True else style)
        if kind == 'gait':
            ground(c, joints, cp, per_frame=(name != 'sprint' and name != 'jog'))
            an = analyse_gait(c, joints, cp)
            c['phase0'] = rotate_to_contact(c, an)
            stance = cfg['VILLAGER_ASSET'].get('gaitStance', {}).get(name)
            if stance:
                restance(c, joints, cp, stance)
                ground(c, joints, cp, per_frame=False)
                rotate_to_contact(c, analyse_gait(c, joints, cp))
            an = analyse_gait(c, joints, cp)
            c['speed'] = an['speed']
            c['heights'] = an['heights']
            c['contacts'] = {'seam': float(c['seam']), 'support': contact_intervals(an, len(c['times']))}
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


def selftest():
    """The square's yaw comes out before the hips' tilt is read (no Blender
    needed): a bone turned 60° about the vertical and tilted 30° forward in its
    own frame reads ≈ 13.9° seen from the side, 30° once the turn is out, and
    the offset from that brings it exactly to its target."""
    from gltfio import qaxis
    w = {SK.INDEX['hips']: qmul(qaxis(Y, np.radians(60)), qaxis(X, np.radians(30)))}
    wr = [w.get(i, np.array([0, 0, 0, 1.0])) for i in range(len(SK.BONES))]
    unyaw = qaxis(Y, -np.radians(60))
    assert abs(np.degrees(tilt(wr, 'hips')) - 30) > 10
    assert abs(np.degrees(tilt_after(unyaw, wr, 'hips')) - 30) < 1e-6
    target = np.radians(5)
    off = target - tilt_after(unyaw, wr, 'hips')
    turned = qmul(qaxis(X, off), qmul(unyaw, wr[SK.INDEX['hips']]))
    wr2 = list(wr)
    wr2[SK.INDEX['hips']] = turned
    assert abs(tilt(wr2, 'hips') - target) < 1e-6
    print('clips selftest: ok')

