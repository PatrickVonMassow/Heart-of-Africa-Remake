"""Step 3: the dress — every garment form of the appearance table
(src/systems/appearance.ts) built round the villager body, its skin weights
transferred from the body, and exported skinned to the same skeleton with the
body's morph targets (work-order "glTF villager body", final states 3 and 6).

How a garment is made:
1. The body is posed into a DESIGN POSE — the arms hanging at the sides, as a
   garment is worn — because a cloak or a robe tailored round MakeHuman's
   A-pose would stand off the arms like a tent once they hang.
2. The garment is swept as rings: at each height the body's horizontal outline
   (the convex hull of the body's section there: the torso, the legs together
   below the crotch, the arms too for a cloak), eased off it and flared toward
   a hem. Sleeves, trouser legs, bands and head pieces are swept the same way
   round their limb or the head.
3. WEIGHTS BY TRANSFER: each garment vertex takes the skin weights of the
   nearest point of the posed body's surface (barycentric over that triangle —
   Blender's Data Transfer "nearest face interpolated"), then they are smoothed
   along the garment (a skirt spans both legs, so its weights must blend from
   one thigh to the other, never tear between them).
4. The garment is UNPOSED into the rest pose by inverting its own blend of bone
   transforms, so in the game it is skinned exactly like the body.
5. Morphs: each garment vertex is bound to the rest body's surface and follows
   every morph target there, so a child's or a woman's dress fits that body.
"""
import numpy as np

import rig
import skeleton as SK
from body import MORPHS, apply_map, surface_map, triangulate
from gltfio import qfrom_to, qinv, qmul, qnorm, qmat

N_RADIAL = 24


# ---- the design pose ---------------------------------------------------------------


def design_pose(body):
    """Local rotations that let both arms hang (a hand's breadth off the
    thigh, the forearm nearly in line)."""
    j = body['joints']
    q = np.tile([0, 0, 0, 1.0], (len(SK.NAMES), 1))
    for s, sx in (('L', 1), ('R', -1)):
        iu, il, ih = SK.INDEX['upperArm.' + s], SK.INDEX['forearm.' + s], SK.INDEX['hand.' + s]
        u0 = j[il, :3] - j[iu, :3]
        f0 = j[ih, :3] - j[il, :3]
        u1 = np.array([sx * 0.34, -1.0, 0.0])
        f1 = np.array([sx * 0.28, -1.0, 0.12])
        Wu = qfrom_to(u0, u1)
        Wf = qfrom_to(f0, f1)
        q[iu] = Wu
        q[il] = qnorm(qmul(qinv(Wu), Wf))
    return q


def skin_full(verts, W, joints, wr, wp):
    """Linear blend skinning with every bone's weight (n × bones)."""
    h = joints[:, :3]
    out = np.zeros_like(verts)
    for b in range(len(SK.NAMES)):
        w = W[:, b]
        m = w > 1e-6
        if not m.any():
            continue
        R = qmat(wr[b])
        out[m] += w[m, None] * ((verts[m] - h[b]) @ R.T + wp[b])
    return out


def unskin(verts, W, joints, wr, wp):
    """Invert the blend: the rest position that `W` skins to `verts`."""
    h = joints[:, :3]
    out = np.zeros_like(verts)
    Rs = [qmat(q) for q in wr]
    for k, v in enumerate(verts):
        A = np.zeros((3, 3))
        t = np.zeros(3)
        for b in np.nonzero(W[k] > 1e-6)[0]:
            A += W[k, b] * Rs[b]
            t += W[k, b] * (wp[b] - Rs[b] @ h[b])
        out[k] = np.linalg.solve(A, v - t)
    return out


# ---- outlines --------------------------------------------------------------------------


def hull2d(pts):
    pts = sorted(set(map(tuple, np.round(pts, 6))))
    if len(pts) < 3:
        return np.array(pts)

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return np.array(lower[:-1] + upper[:-1])


def angles(n=N_RADIAL):
    """Ring directions in (x, z): k = 0 is the front (+z), turning toward +x."""
    a = 2 * np.pi * np.arange(n) / n
    return np.stack([np.sin(a), np.cos(a)], 1)


def ray_hull(hull, c, d):
    """Distance from c along d to the hull's boundary (c inside)."""
    best = 0.0
    m = len(hull)
    for i in range(m):
        a = hull[i] - c
        b = hull[(i + 1) % m] - c
        e = b - a
        den = d[0] * e[1] - d[1] * e[0]
        if abs(den) < 1e-12:
            continue
        t = (a[0] * e[1] - a[1] * e[0]) / den
        u = (a[0] * d[1] - a[1] * d[0]) / den
        if t > 0 and -1e-9 <= u <= 1 + 1e-9:
            best = max(best, t)
    return best


class Body:
    """The posed full-resolution body, for outlines and the weight transfer."""

    def __init__(self, mh, body, q):
        self.body = body
        self.j = body['joints']
        self.idx = mh.groups['body']
        self.W = body['Wfull']
        wr, wp = rig.fk(self.j, q, None)
        self.wr, self.wp = wr, wp
        self.v = skin_full(body['basis_full'], self.W, self.j, wr, wp)
        self.tris = np.array([t for t, _ in triangulate(mh.body_quads())])
        from mathutils.bvhtree import BVHTree
        self.tree = BVHTree.FromPolygons(self.v.tolist(), self.tris.tolist(), all_triangles=True)
        # the body the game draws (decimated) in the same pose: a garment must
        # clear it too — decimation moves the surface by up to ~2 cm
        from body import top4
        di, dw = top4(body['W'])
        self.dv = rig.skin(body['pos'], di, dw, self.j, wr, wp)
        self.dtree = BVHTree.FromPolygons(self.dv.tolist(), body['tris'].tolist(), all_triangles=True)
        W = self.W

        def w(*names):
            return sum(W[:, SK.INDEX[n]] for n in names)

        self.arm = w('upperArm.L', 'forearm.L', 'hand.L', 'upperArm.R', 'forearm.R', 'hand.R')
        self.lower_arm = w('forearm.L', 'hand.L', 'forearm.R', 'hand.R')
        self.head = w('head')
        self.leg = {s: w('thigh.' + s, 'shin.' + s, 'foot.' + s, 'toe.' + s) for s in 'LR'}
        self.mask_body = np.zeros(len(W), bool)
        self.mask_body[self.idx] = True

    def section(self, y, mask, slab=0.012):
        m = self.mask_body & mask & (np.abs(self.v[:, 1] - y) < slab)
        return self.v[m][:, [0, 2]]

    def ring(self, y, mask, ease, center=None, n=N_RADIAL, slab=0.012):
        pts = self.section(y, mask, slab)
        if len(pts) < 3:
            pts = self.section(y, mask, slab * 3)
        h = hull2d(pts)
        c = np.array(center) if center is not None else h.mean(0)
        r = np.array([ray_hull(h, c, d) for d in angles(n)])
        return c, r + ease

    def push_out(self, pts, clearance):
        """Every garment vertex at least `clearance` outside the body's surface
        (along the surface normal at its nearest point)."""
        from fit import inside
        out = pts.copy()
        for tree in (self.tree, self.dtree, self.tree, self.dtree):
            for k, p in enumerate(out):
                co, n, _fi, dist = tree.find_nearest(p)
                co = np.array(co)
                n = np.array(n)
                if dist >= clearance:
                    continue
                if inside(tree, p.tolist()):
                    out[k] = p + n * (clearance + dist)
                elif dist > 1e-9:
                    # outside: away from the nearest skin, never along a face
                    # normal that points into a cavity (the mouth's slit)
                    out[k] = co + (p - co) * (clearance / dist)
        return out

    def weights_on_arm(self, pts, side):
        """Data transfer from one arm's skin alone (upper arm, forearm and
        hand of `side` weighing at least half)."""
        from mathutils.bvhtree import BVHTree
        from body import barycentric
        a = sum(self.W[:, SK.INDEX[f'{b}.{side}']] for b in ('upperArm', 'forearm', 'hand'))
        tris = self.tris[(a[self.tris] >= 0.5).all(1)]
        tree = BVHTree.FromPolygons(self.v.tolist(), tris.tolist(), all_triangles=True)
        out = np.zeros((len(pts), len(SK.NAMES)))
        for k, p in enumerate(pts):
            co, _n, fi, _d = tree.find_nearest(p)
            bc = barycentric(np.array(co), *self.v[tris[fi]])
            out[k] = (self.W[tris[fi]] * bc[:, None]).sum(0)
        return out

    def weights_at(self, pts, lower_arms=True):
        """Data transfer: the body's weights at the nearest surface point.
        Without `lower_arms` the forearms and hands are left out of the
        search: a robe's side beside the hanging hand took the hand's weights
        and swung through the thigh with every arm swing and stroke."""
        out = np.zeros((len(pts), len(SK.NAMES)))
        if lower_arms:
            tree, tris = self.tree, self.tris
        else:
            if not hasattr(self, 'tree_trunk'):
                from mathutils.bvhtree import BVHTree
                keep = (self.lower_arm[self.tris] < 0.3).all(1)
                self.tris_trunk = self.tris[keep]
                self.tree_trunk = BVHTree.FromPolygons(self.v.tolist(), self.tris_trunk.tolist(), all_triangles=True)
            tree, tris = self.tree_trunk, self.tris_trunk
        for k, p in enumerate(pts):
            co, _n, fi, _d = tree.find_nearest(p)
            a, b, c = self.v[tris[fi]]
            from body import barycentric
            bc = barycentric(np.array(co), a, b, c)
            out[k] = (self.W[tris[fi]] * bc[:, None]).sum(0)
        return out


# ---- sweeping -------------------------------------------------------------------------------


def sweep(rings, closed_top=False, closed_bottom=False, keep=None):
    """Rings [(y, (cx, cz), radii[N])] top to bottom → verts, tris, uv.
    `keep(k, i)` (ring, column) drops whole quads — clean column edges for an
    opening or a flap, never a sawtooth through the triangles."""
    n = len(rings[0][2])
    A = angles(n)
    verts, uv = [], []
    for k, (y, c, r) in enumerate(rings):
        for i in range(n + 1):  # a seam column for the uv
            ii = i % n
            verts.append([c[0] + A[ii, 0] * r[ii], y, c[1] + A[ii, 1] * r[ii]])
            uv.append([i / n, k / (len(rings) - 1)])
    tris = []
    for k in range(len(rings) - 1):
        for i in range(n):
            if keep is not None and not (keep(k, i) and keep(k, (i + 1) % n) and keep(k + 1, i) and keep(k + 1, (i + 1) % n)):
                continue
            a = k * (n + 1) + i
            b = a + 1
            c2 = a + n + 1
            d = c2 + 1
            tris += [[a, c2, b], [b, c2, d]]
    verts = np.array(verts)
    uv = np.array(uv)
    if closed_top:
        y, c, _ = rings[0]
        verts = np.vstack([verts, [c[0], y, c[1]]])
        uv = np.vstack([uv, [0.5, 0]])
        top = len(verts) - 1
        tris += [[top, i, i + 1] for i in range(n)]
    if closed_bottom:
        y, c, _ = rings[-1]
        verts = np.vstack([verts, [c[0], y, c[1]]])
        uv = np.vstack([uv, [0.5, 1]])
        bot = len(verts) - 1
        base = (len(rings) - 1) * (n + 1)
        tris += [[bot, base + i + 1, base + i] for i in range(n)]
    v, t, u = verts, np.array(tris), uv
    return compact(v, t, u)


def compact(v, t, u):
    used = sorted({int(i) for tr in t for i in tr})
    remap = {o: k for k, o in enumerate(used)}
    return v[used], np.array([[remap[int(i)] for i in tr] for tr in t]), u[used]


def ang(i, n=N_RADIAL):
    """Column i's angle, wrapped to (−π, π]: 0 the front, +π/2 the left (+x)."""
    a = 2 * np.pi * i / n
    return a - 2 * np.pi if a > np.pi else a


def cut(verts, tris, uv, drop):
    """Remove the triangles whose centroid `drop` says go; compact the vertices."""
    keep = [t for t in tris if not drop(verts[t].mean(0))]
    used = sorted({i for t in keep for i in t})
    remap = {o: k for k, o in enumerate(used)}
    return verts[used], np.array([[remap[i] for i in t] for t in keep]), uv[used]


def merge(parts):
    vs, ts, us = [], [], []
    off = 0
    for v, t, u in parts:
        vs.append(v)
        ts.append(np.asarray(t) + off)
        us.append(u)
        off += len(v)
    return np.vstack(vs), np.vstack(ts), np.vstack(us)


def smooth_weights(verts, tris, W, iterations):
    """Average each vertex's weights with its neighbours' — vertices on the
    same spot (a uv seam) count as one, so the seam never opens."""
    n = len(W)
    nb = [set() for _ in range(n)]
    for a, b, c in tris:
        nb[a].update((b, c))
        nb[b].update((a, c))
        nb[c].update((a, b))
    key = {}
    for i, p in enumerate(np.round(verts, 6)):
        key.setdefault(tuple(p), []).append(i)
    twins = [key[tuple(p)] for p in np.round(verts, 6)]
    for i in range(n):
        for j in twins[i]:
            nb[i] |= nb[j]
        nb[i].discard(i)
    for _ in range(iterations):
        W2 = W.copy()
        for i in range(n):
            if nb[i]:
                W2[i] = 0.5 * W[i] + 0.5 * W[list(nb[i])].mean(0)
        W = W2
    # twins share one weight exactly
    for group in key.values():
        if len(group) > 1:
            W[group] = W[group].mean(0)
    s = W.sum(1)
    s[s == 0] = 1
    return W / s[:, None]


# ---- the forms -------------------------------------------------------------------------------


def landmarks(j, H):
    def y(b):
        return j[SK.INDEX[b], 1]

    hip = y('hips')
    return {
        'H': H, 'hip': hip, 'knee': y('shin.L'), 'ankle': y('foot.L'), 'waist': y('chest'), 'neck': y('neck'),
        'chin': y('head'), 'shoulder': y('upperArm.L'), 'girdle': hip + 0.06 * H,
        'chestTop': y('upperArm.L') - 0.065 * H, 'crown': H,
    }


def tube(B, top, bottom, ease, flare, mask, rings=10, below_crotch_legs=True):
    """A garment round the trunk (and the legs together below the crotch)."""
    out = []
    for k in range(rings):
        t = k / (rings - 1)
        y = top + (bottom - top) * t
        m = mask & (B.arm < 0.3)
        c, r = B.ring(y, m, ease)
        fl = flare * B.body['joints'][0, 1] * t * t
        A = angles(len(r))
        # the hem flares mostly sideways (a deep fore-aft flare becomes the
        # shins' depth below the ground when kneeling)
        r = r + fl * (0.45 + 0.55 * np.abs(A[:, 0]))
        out.append((y, c, r))
    return out


def build_form(B, form, wear, L):
    H = L['H']
    allm = np.ones(len(B.W), bool)
    trunk = allm
    parts = []
    if form in ('loinFlap', 'apron', 'girdleTails'):
        long = L['knee'] + 0.02 * H if form == 'apron' else L['hip'] - (0.14 if form == 'girdleTails' else 0.10) * H
        half = (0.075 if form == 'apron' else 0.05) * H
        parts.append(girdle(B, L['girdle'], 0.008 * H))
        front = 0.75 if form == 'apron' else 0.5
        parts.append(sweep(tube(B, L['girdle'], long, 0.009 * H, 0.03, trunk, 8), keep=lambda k, i: abs(ang(i)) <= front + 1e-6))
        back_long = L['knee'] + 0.05 * H if form == 'girdleTails' else long
        back = 0.9 if form == 'apron' else 0.75
        parts.append(sweep(tube(B, L['girdle'], back_long, 0.009 * H, 0.03, trunk, 8), keep=lambda k, i: abs(ang(i)) >= np.pi - back - 1e-6))
        return merge(parts), 4
    if form in ('skirtShort', 'skirtKnee', 'wrapLong'):
        top = L['chestTop'] if wear == 'chest' else L['girdle']
        bottom = (L['hip'] + L['knee']) / 2 if form == 'skirtShort' else L['knee'] - 0.015 * H if form == 'skirtKnee' else L['knee'] - 0.6 * (L['knee'] - L['ankle'])
        return sweep(tube(B, top, bottom, 0.012 * H, 0.05 if form == 'wrapLong' else 0.035, trunk, 12)), 8
    if form == 'trousers':
        bottom = L['knee'] - 0.5 * (L['knee'] - L['ankle'])
        # the seat reaches below a child's crotch too: skin between the leg
        # tubes and above the seat's hem would lie outside every part
        parts.append(sweep(tube(B, L['girdle'], L['hip'] - 0.08 * H, 0.013 * H, 0, trunk, 6)))
        for s in 'LR':
            rings = []
            for k in range(8):
                y = L['hip'] - 0.04 * H + (bottom - L['hip'] + 0.04 * H) * k / 7
                c, r = B.ring(y, B.leg[s] > 0.5, 0.016 * H, n=16)
                rings.append((y, c, r))
            parts.append(sweep(rings))
        return merge(parts), 3
    if form == 'breastCloth':
        return sweep(tube(B, L['chestTop'], L['waist'] - 0.01 * H, 0.011 * H, 0.01, trunk, 6)), 3
    if form in ('shirt', 'robe', 'toga'):
        bottom = L['knee'] + 0.02 * H if form == 'shirt' else L['ankle'] + 0.03 * H
        rings = tube(B, L['neck'] - 0.01 * H, bottom, 0.013 * H, 0.03 if form == 'shirt' else 0.06, trunk, 16)
        if form == 'toga':
            bare = 1 if wear == 'rightShoulder' else -1  # the figure's left is +x

            def keep_toga(k, i):
                side = np.sin(ang(i)) * bare
                return not (side > 0.05 and rings[k][0] > L['chestTop'] - 0.08 * H * side)
            return sweep(rings, keep=keep_toga), 8
        parts.append(sweep(rings))
        for s in 'LR':
            parts.append(sleeve(B, s, L))
        # the sleeves' vertices, by side (1 left, 2 right): they take their
        # weights from their own arm (finish)
        limb = np.concatenate([np.full(len(p[0]), k) for k, p in enumerate(parts)])
        return merge(parts), 8, limb
    if form in ('cloak', 'cape'):
        bottom = L['knee'] + 0.03 * H if form == 'cloak' else L['waist'] - 0.02 * H
        rings = []
        ys = [L['neck'] + 0.01 * H, L['shoulder'] + 0.012 * H]
        y = L['shoulder'] - 0.03 * H
        while y > bottom + 0.02 * H:
            ys.append(y)
            y -= 0.06 * H
        ys.append(bottom)
        for k, y in enumerate(ys):
            # over the shoulders the outline holds the arms too: it drapes them
            m = allm if y < L['shoulder'] + 0.005 * H else (B.arm < 0.2)
            ease = (0.02 + 0.012 * k / len(ys)) * H if k else 0.012 * H
            c, r = B.ring(y, m & (B.head < 0.3), ease)
            t = (k / (len(ys) - 1))
            r = r + 0.03 * H * t * t
            rings.append((y, c, r))
        y_open = L['shoulder'] - 0.03 * H
        opened = wear == 'bothShoulders' or form == 'cloak'
        bare = 1 if wear == 'rightShoulder' else -1 if wear == 'leftShoulder' else 0

        def keep_cloak(k, i):
            y = rings[k][0]
            if opened and abs(ang(i)) < 0.36 and y < y_open:
                return False
            if bare and np.sin(ang(i)) * bare > 0.05 and y > L['waist'] + 0.05 * H:
                return False
            return True
        return sweep(rings, keep=keep_cloak), 6
    if form == 'hood':
        rings = []
        for y, ease in ((L['waist'] + 0.04 * H, 0.025), (L['shoulder'] + 0.01 * H, 0.022), (L['neck'] + 0.01 * H, 0.03),
                        (L['chin'] + 0.04 * H, 0.012), (L['chin'] + 0.08 * H, 0.012), (L['crown'] - 0.02 * H, 0.012)):
            # the hood's cape drapes the arms as a cloak does
            m = allm
            c, r = B.ring(y, m, ease * H)
            rings.append((y, c, r))
        face_lo = L['chin'] - 0.02 * H
        face_hi = L['chin'] + 0.10 * H
        # the rings run from the waist up: the crown, the LAST ring, is the
        # closed end (a cap on the first ring is a disc through the chest)
        return sweep(rings, closed_bottom=True, keep=lambda k, i: not (abs(ang(i)) < 0.7 and face_lo < rings[k][0] < face_hi)), 2
    if form in ('turban', 'cap', 'headband'):
        hc = L['chin'] + 0.07 * H
        lo = hc + (0.02 if form == 'headband' else 0.01 if form == 'turban' else 0.03) * H
        hi = lo + 0.025 * H if form == 'headband' else L['crown'] + (0.045 if form == 'turban' else 0.006) * H
        ease = (0.03 if form == 'turban' else 0.007) * H
        rings = []
        steps = 2 if form == 'headband' else 5
        for k in range(steps):
            y = lo + (hi - lo) * k / (steps - 1)
            yy = min(y, L['crown'] - 0.006 * H)
            c, r = B.ring(yy, B.head > 0.5, ease)
            if form != 'headband' and k == steps - 1:
                r = r * 0.35
            rings.append((y, c, r))
        return sweep(rings, closed_top=form != 'headband'), 0
    if form == 'veil':
        rings = []
        # rings close enough that the chin, the lips and the nose between
        # them lie inside the face's outline at their own height (three rings
        # left a chord the chin came through: `chin` is the head joint, above
        # the chin's tip)
        lo, hi = L['neck'], L['chin'] + 0.055 * H
        for y, e in [(lo + (hi - lo) * k / 9, 0.012 - 0.0002 * k) for k in range(10)]:
            c, r = B.ring(y, B.arm < 0.2, e * H)
            rings.append((y, c, r))
        return sweep(rings), 1
    if form == 'headRing':
        c, r = B.ring(L['crown'] - 0.02 * H, B.head > 0.5, 0.008 * H)
        return torus(c, L['crown'] - 0.015 * H, r * 0.75, 0.011 * H), 0
    if form == 'topknot':
        return blob((0, L['crown'] + 0.005 * H, -0.01 * H), 0.04 * H, (1, 0.8, 0.95)), 0
    if form == 'hairBag':
        return blob((0, L['chin'] + 0.09 * H, -0.075 * H), 0.045 * H, (1, 0.8, 0.9)), 0
    if form == 'neckBeads':
        c, r = B.ring(L['neck'] - 0.012 * H, B.arm < 0.2, 0.012 * H)
        return torus(c, L['neck'] - 0.012 * H, r, 0.01 * H), 2
    if form == 'waistBeads':
        # below the girdle of a loin flap, apron or girdle tails (hip + 0.06 H):
        # two rings at one height cross each other whatever settles them, and
        # beads tucked under the girdle's tube read as through its solid
        return girdle(B, L['hip'] + 0.02 * H, 0.007 * H), 2
    if form == 'limbRings':
        for s in 'LR':
            wi = SK.INDEX['hand.' + s]
            ai = SK.INDEX['foot.' + s]
            fa = SK.INDEX['forearm.' + s]
            for k in range(4):
                # wrist rings along the forearm, ankle rings above the ankle
                p = B.wp[wi] + (B.wp[fa] - B.wp[wi]) * (0.08 + 0.09 * k)
                parts.append(torus((p[0], p[2]), p[1], np.full(12, 0.024), 0.004 * H, n=12))
                a = B.wp[ai]
                parts.append(torus((a[0], a[2] + 0.004), a[1] + 0.02 * H + 0.012 * H * k, np.full(12, 0.03), 0.004 * H, n=12))
        return merge(parts), 0
    return None, 0


def girdle(B, y, thick):
    c, r = B.ring(y, B.arm < 0.3, 0.006 * B.body['joints'][0, 1] / 0.7)
    return torus(c, y, r, thick)


def torus(c, y, radii, thick, n=None, m=6):
    radii = np.asarray(radii, float)
    n = n or len(radii)
    A = angles(n)
    verts, uv, tris = [], [], []
    for i in range(n + 1):
        ii = i % n
        for k in range(m + 1):
            a = 2 * np.pi * k / m
            rr = radii[ii] + thick * np.cos(a)
            verts.append([c[0] + A[ii, 0] * rr, y + thick * np.sin(a), c[1] + A[ii, 1] * rr])
            uv.append([i / n, k / m])
    for i in range(n):
        for k in range(m):
            a = i * (m + 1) + k
            b = a + 1
            c2 = a + m + 1
            d = c2 + 1
            tris += [[a, b, c2], [b, d, c2]]
    return np.array(verts), np.array(tris), np.array(uv)


def blob(center, r, scale, n=12, m=8):
    verts, uv, tris = [], [], []
    for k in range(m + 1):
        phi = np.pi * k / m
        for i in range(n + 1):
            th = 2 * np.pi * i / n
            verts.append([center[0] + r * scale[0] * np.sin(phi) * np.sin(th), center[1] + r * scale[1] * np.cos(phi),
                          center[2] + r * scale[2] * np.sin(phi) * np.cos(th)])
            uv.append([i / n, k / m])
    for k in range(m):
        for i in range(n):
            a = k * (n + 1) + i
            b = a + 1
            c2 = a + n + 1
            d = c2 + 1
            tris += [[a, c2, b], [b, c2, d]]
    return np.array(verts), np.array(tris), np.array(uv)


def sleeve(B, s, L):
    """A short sleeve round the upper arm (to just above the elbow)."""
    iu, il = SK.INDEX['upperArm.' + s], SK.INDEX['forearm.' + s]
    a = B.wp[iu]
    b = B.wp[il]
    ax = (b - a) / np.linalg.norm(b - a)
    rings = []
    W = B.W[:, iu]
    pts = B.v[B.mask_body & (W > 0.5)]
    for k, f in enumerate((0.1, 0.45, 0.78)):
        p = a + (b - a) * f
        rel = pts - p
        along = rel @ ax
        sl = pts[np.abs(along) < 0.015]
        rad = np.max(np.linalg.norm((sl - p) - np.outer((sl - p) @ ax, ax), axis=1)) if len(sl) else 0.035
        rings.append((p, rad * 1.25 + 0.006 + 0.004 * k))
    # sweep round the arm axis
    n = 12
    e1 = np.cross(ax, [0, 0, 1.0])
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(ax, e1)
    verts, uv, tris = [], [], []
    for k, (p, rad) in enumerate(rings):
        for i in range(n + 1):
            th = 2 * np.pi * (i % n) / n
            verts.append(p + rad * (np.cos(th) * e1 + np.sin(th) * e2))
            uv.append([i / n, k / 2])
    for k in range(len(rings) - 1):
        for i in range(n):
            a0 = k * (n + 1) + i
            tris += [[a0, a0 + n + 1, a0 + 1], [a0 + 1, a0 + n + 1, a0 + n + 2]]
    return np.array(verts), np.array(tris), np.array(uv)


# ---- the set ---------------------------------------------------------------------------------

GARMENTS = [
    ('loinFlap', 'waist'), ('girdleTails', 'waist'), ('apron', 'waist'), ('skirtShort', 'waist'), ('skirtKnee', 'waist'),
    ('wrapLong', 'waist'), ('wrapLong', 'chest'), ('skirtShort', 'chest'), ('skirtKnee', 'chest'), ('trousers', 'waist'), ('breastCloth', 'chest'),
    ('shirt', 'chest'), ('robe', 'chest'), ('toga', 'leftShoulder'), ('toga', 'rightShoulder'),
    ('cloak', 'bothShoulders'), ('cloak', 'leftShoulder'), ('cloak', 'rightShoulder'),
    ('cape', 'bothShoulders'), ('cape', 'leftShoulder'), ('cape', 'rightShoulder'),
    ('hood', 'overHead'), ('turban', 'aroundHead'), ('cap', 'crown'), ('headband', 'aroundHead'), ('veil', 'face'),
    ('headRing', 'crown'), ('topknot', 'crown'), ('hairBag', 'crown'), ('neckBeads', 'neck'), ('waistBeads', 'waist'), ('limbRings', 'limbs'),
]
# The slot's ease order: an outer layer stands off the inner one.
OUTER = {'cloak': 0.012, 'cape': 0.012, 'hood': 0.006}
SKIRTS = {'apron', 'girdleTails', 'skirtShort', 'skirtKnee', 'wrapLong', 'shirt', 'robe', 'toga', 'cloak'}
RIGID_HEAD = {'turban', 'cap', 'headband', 'headRing', 'topknot', 'hairBag'}


def mesh_name(form, wear):
    return f'g-{form}-{wear}'


def skirt_weights(v, W, crotch, hem):
    """Below the crotch a skirt hangs round both legs: each ring's weights are
    blurred round the ring (the sides still lean to their own leg, the middle
    takes both) and the shin's share goes to the thigh — cloth does not bend at
    the knee — fading in from the crotch down."""
    W = W.copy()
    I = {n: SK.INDEX[n] for n in SK.NAMES}
    below = v[:, 1] < crotch
    if not below.any():
        return W
    for s in 'LR':
        for b in ('shin.', 'foot.', 'toe.'):
            W[below, I['thigh.' + s]] += W[below, I[b + s]]
            W[below, I[b + s]] = 0
    a = np.arctan2(v[:, 0], v[:, 2] - np.median(v[:, 2]))
    ys = np.round(v[:, 1], 4)
    out = W.copy()
    for y in np.unique(ys[below]):
        ring = np.nonzero(below & (ys == y))[0]
        d = a[ring][:, None] - a[ring][None, :]
        d = np.abs(np.arctan2(np.sin(d), np.cos(d)))
        k = np.exp(-0.5 * (d / 0.9) ** 2)
        k /= k.sum(1, keepdims=True)
        out[ring] = k @ W[ring]
    f = np.clip((crotch - v[:, 1]) / max(1e-6, crotch - hem), 0, 1)[:, None] * below[:, None]
    W = W * (1 - f) + out * f
    return W / W.sum(1, keepdims=True)


def finish(mh, body, B, v, t, uv, smooth, rigid_head=False, hair=False, skirt=None, lower_arms=False, limb=None):
    """Push the garment off the body, transfer weights, unpose to rest, bind the morphs.
    Only a garment worn on the lower arm (`lower_arms`: the limb rings) takes
    weights from the forearms and hands; a sleeve (`limb`: 1 left, 2 right)
    takes them from its own arm alone, so it goes where the arm goes (from
    the nearest trunk skin it stayed at the shoulder while the arm swung out
    of it)."""
    v = B.push_out(v, 0.007)
    W = B.weights_at(v, lower_arms)
    if limb is not None:
        for k, s in ((1, 'L'), (2, 'R')):
            m = limb == k
            if m.any():
                W[m] = B.weights_on_arm(v[m], s)
    if rigid_head:
        W[:] = 0
        W[:, SK.INDEX['head']] = 1
    elif smooth:
        W = smooth_weights(v, t, W, smooth)
    if skirt is not None:
        W = skirt_weights(v, W, *skirt)
    W[W < 0.02] = 0
    W /= W.sum(1, keepdims=True)
    rest = unskin(v, W, B.j, B.wr, B.wp)
    idx, bary, off = surface_map(mh, body['basis_full'], rest)
    pos = apply_map(body['basis_full'], idx, bary, off)
    morph = {k: apply_map(body['basis_full'] + body['deltas_full'][k], idx, bary, off) - pos for k in MORPHS}
    return {'pos': pos, 'tris': np.asarray(t), 'uv': uv, 'W': W, 'morph_pos': morph}


def refine(g, maxlen):
    """Split every cloth edge longer than `maxlen` at its midpoint (every
    attribute interpolated there) until none is: the same cloth, but with
    vertices close enough that it can follow a curved body part instead of
    cutting it by a chord. A triangle is split by how many of its edges are
    (one: two triangles, two: three across the shorter diagonal, three: four),
    so no edge is left with a vertex in its middle."""
    attrs = {'pos': g['pos'], 'uv': g['uv'], 'W': g['W'], **{'m:' + k: v for k, v in g['morph_pos'].items()}}
    t = np.asarray(g['tris'])
    while True:
        p = attrs['pos']
        e = np.sort(np.concatenate([t[:, [0, 1]], t[:, [1, 2]], t[:, [2, 0]]]), axis=1)
        u = np.unique(e, axis=0)
        long = u[np.linalg.norm(p[u[:, 0]] - p[u[:, 1]], axis=1) > maxlen]
        if not len(long):
            break
        mid = {(int(a), int(b)): len(p) + k for k, (a, b) in enumerate(long)}
        attrs = {k: np.concatenate([v, 0.5 * (v[long[:, 0]] + v[long[:, 1]])]) for k, v in attrs.items()}
        p = attrs['pos']
        out = []
        for tri in t.tolist():
            m = [mid.get((min(tri[i], tri[(i + 1) % 3]), max(tri[i], tri[(i + 1) % 3]))) for i in range(3)]
            n = sum(x is not None for x in m)
            if n == 0:
                out.append(tri)
                continue
            if n == 3:
                a, b, c = tri
                ab, bc, ca = m
                out += [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]
                continue
            # rotate so edge 0 (a→b) is split and, with two, edge 1 (b→c) too
            r = next(i for i in range(3) if m[i] is not None and (n == 1 or m[(i + 1) % 3] is not None))
            a, b, c = tri[r:] + tri[:r]
            ab, bc = m[r], m[(r + 1) % 3]
            if n == 1:
                out += [[a, ab, c], [ab, b, c]]
                continue
            out.append([ab, b, bc])
            if np.linalg.norm(p[a] - p[bc]) <= np.linalg.norm(p[ab] - p[c]):
                out += [[a, ab, bc], [a, bc, c]]
            else:
                out += [[a, ab, c], [ab, bc, c]]
        t = np.array(out)
    g = dict(g)
    g['pos'], g['uv'], g['W'], g['tris'] = attrs['pos'], attrs['uv'], attrs['W'], t
    g['morph_pos'] = {k[2:]: v for k, v in attrs.items() if k.startswith('m:')}
    return g


ARM_BONES = tuple(f'upperArm.{s}' for s in 'LR')


def armholes(body, g):
    """Cut the cloth an upper arm passes through in the build pose: every
    triangle whose centre lies inside the drawn body where that is an upper
    arm (the nearest body triangle's bone). Cloth round the trunk would otherwise cut
    through the upper arm where it meets the trunk at the armpit — no
    settling can take a surface across that crease without folding it into
    one or the other — and the arm comes out through an opening instead."""
    import gamepath as GP
    from body import top4
    from fit import inside
    from mathutils.bvhtree import BVHTree
    arm = {SK.INDEX[b] for b in ARM_BONES}
    dom = np.argmax(body['W'], 1)
    person = GP.Person(body['joints'])
    wr, wp = person.pose(design_pose(body), None)
    bv = person.draw(body['pos'], *top4(body['W']), wr, wp)
    tree = BVHTree.FromPolygons(bv.tolist(), body['tris'].tolist(), all_triangles=True)
    gv = person.draw(g['pos'], *top4(g['W']), wr, wp)
    t = np.asarray(g['tris'])
    keep = np.ones(len(t), bool)
    # a vertex inside an upper arm takes every triangle round it along, so no
    # cloth is left inside the arm at the hole's edge
    def in_arm(p):
        _co, _n, fi, _d = tree.find_nearest(p)
        return dom[body['tris'][fi][0]] in arm and inside(tree, p)
    vin = np.fromiter((in_arm(p) for p in gv.tolist()), bool, len(gv))
    keep &= ~vin[t].any(1)
    for k, c in enumerate(gv[t].mean(1).tolist()):
        if keep[k] and in_arm(c):
            keep[k] = False
    if keep.all():
        return g, 0
    used = np.unique(t[keep])
    remap = np.full(len(g['pos']), -1)
    remap[used] = np.arange(len(used))
    out = dict(g)
    out['tris'] = remap[t[keep]]
    for key in ('pos', 'uv', 'W'):
        out[key] = g[key][used]
    out['morph_pos'] = {m: d[used] for m, d in g['morph_pos'].items()}
    return out, int((~keep).sum())


def hair_cap(mh, body, B):
    """Short hair: the scalp above the hairline, eased off the skull."""
    j = body['joints']
    H = j[SK.INDEX['head'], 1]
    eye = mh.centroid(body['basis_full'], 'helper-l-eye')[1]
    rings = []
    lo = eye + 0.012
    hi = B.v[B.mask_body][:, 1].max()
    for k in range(6):
        y = lo + (hi - 0.004 - lo) * k / 5
        c, r = B.ring(y, B.head > 0.6, 0.004)
        if k == 5:
            r = r * 0.4
        rings.append((y, c, r))
    # the forehead and the face stay bare: the front below the brow line is open
    v, t, uv = sweep(rings, closed_top=True, keep=lambda k, i: not (abs(ang(i)) < 0.95 and rings[k][0] < lo + 0.03))
    del H
    return finish(mh, body, B, v, t, uv, 0, rigid_head=True)


def eyes(mh, body):
    """The base mesh's eyeballs, rigid on the head."""
    from body import helper_mesh
    parts = []
    for g in ('helper-l-eye', 'helper-r-eye'):
        v, t, d = helper_mesh(mh, g, body['basis_full'], body['deltas_full'])
        parts.append((v, t, d))
    v = np.vstack([p[0] for p in parts])
    t = np.vstack([parts[0][1], parts[1][1] + len(parts[0][0])])
    morph = {k: np.vstack([p[2][k] for p in parts]) for k in MORPHS}
    W = np.zeros((len(v), len(SK.NAMES)))
    W[:, SK.INDEX['head']] = 1
    return {'pos': v, 'tris': t, 'uv': np.zeros((len(v), 2)), 'W': W, 'morph_pos': morph}


def build_garments(mh, body, clips, cfg):
    H = cfg['VILLAGER_ASSET']['stature']
    q = design_pose(body)
    B = Body(mh, body, q)
    L = landmarks(body['joints'], H)
    meshes = {}
    meta = {}
    for form, wear in GARMENTS:
        res = build_form(B, form, wear, L)
        geo, smooth = res[:2]
        limb = res[2] if len(res) > 2 else None
        if geo is None:
            continue
        v, t, uv = geo
        name = mesh_name(form, wear)
        crotch = L['hip'] - 0.03 * H
        skirt = (crotch, float(v[:, 1].min())) if form in SKIRTS and v[:, 1].min() < crotch else None
        g = finish(mh, body, B, v, t, uv, smooth, rigid_head=form in RIGID_HEAD, skirt=skirt, lower_arms=form == 'limbRings', limb=limb)
        g['part'] = 'garment'
        g['extras'] = {'form': form, 'wear': wear, 'bottom': float(v[:, 1].min())}
        meshes[name] = g
        meta[name] = {'form': form, 'wear': wear}
        print(f'garment {name:28s} {len(g["pos"]):5d} verts {len(g["tris"]):5d} tris')
    hc = hair_cap(mh, body, B)
    hc['part'] = 'hair'
    meshes['hair'] = hc
    ey = eyes(mh, body)
    ey['part'] = 'eyes'
    meshes['eyes'] = ey
    return {'meshes': meshes, 'meta': meta}
