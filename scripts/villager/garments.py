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
        self._hulls = {}

    def section(self, y, mask, slab=0.012):
        m = self.mask_body & mask & (np.abs(self.v[:, 1] - y) < slab)
        return self.v[m][:, [0, 2]]

    def outline(self, y, mask, slab=0.012):
        """The body's section outline at height y (convex hull) and its centre."""
        key = ('o', round(float(y), 4), hash(mask.tobytes()))
        if key not in self._hulls:
            pts = self.section(y, mask, slab)
            if len(pts) < 3:
                pts = self.section(y, mask, slab * 3)
            h = hull2d(pts)
            self._hulls[key] = (h, h.mean(0))
        return self._hulls[key]

    def outline_down(self, y0, y, mask):
        """The outline of everything in `mask` between heights y0 and y
        (below y0): what cloth hanging from y0 must clear at y."""
        key = ('d', round(float(y0), 4), round(float(y), 4), hash(mask.tobytes()))
        if key not in self._hulls:
            m = self.mask_body & mask & (self.v[:, 1] <= y0 + 0.012) & (self.v[:, 1] >= y - 0.012)
            h = hull2d(self.v[m][:, [0, 2]])
            # centred on the body's axis (the hips): a centre taken from each
            # section wanders from height to height and rippled the cloth
            hips = self.wp[SK.INDEX['hips']]
            self._hulls[key] = (h, np.array([hips[0], hips[2]]))
        return self._hulls[key]

    def ring(self, y, mask, ease, center=None, n=N_RADIAL, slab=0.012, thetas=None):
        """(centre, radii) of the eased convex outline at height y, along
        the N_RADIAL ring directions or along `thetas` (rad, 0 the front)."""
        pts = self.section(y, mask, slab)
        if len(pts) < 3:
            pts = self.section(y, mask, slab * 3)
        h = hull2d(pts)
        c = np.array(center) if center is not None else h.mean(0)
        dirs = angles(n) if thetas is None else np.stack([np.sin(thetas), np.cos(thetas)], 1)
        r = np.array([ray_hull(h, c, d) for d in dirs])
        return c, r + ease

    def ring_star(self, y, mask, ease, n=N_RADIAL, slab=0.012):
        """Like ring(), but each direction's radius is the farthest body
        point within its own sector, not the convex hull's: the outline
        follows a hollow (the small of the back) instead of bridging it."""
        pts = self.section(y, mask, slab)
        if len(pts) < 3:
            pts = self.section(y, mask, slab * 3)
        c, hull_r = self.ring(y, mask, 0.0, n=n, slab=slab)
        return c, star_radii(pts, c, hull_r) + ease

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
                # a point deeper than the clearance is left where it is: it is
                # cloth an upper arm passes through (fit.settle cuts it as an
                # armhole) or cloth the settle takes out at every body corner;
                # pushed out here it lay folded in the armpit crease, which no
                # settle cleared (measured 09.10.2026)
                if dist >= clearance:
                    continue
                if inside(tree, p.tolist()):
                    out[k] = p + n * (clearance + dist)
                elif dist > 1e-9:
                    # outside: away from the nearest skin, never along a face
                    # normal that points into a cavity (the mouth's slit)
                    out[k] = co + (p - co) * (clearance / dist)
        return out

    def hug(self, pts, reach):
        """A garment edge pulled onto the drawn body (the decimated surface
        the game shows): every vertex outside it by less than `reach` comes to
        PUSH_CLEARANCE off its nearest point; vertices inside it or farther
        off stay (push_out still clears the inside ones)."""
        from fit import inside
        out = pts.copy()
        for k, p in enumerate(out):
            co, _n, _fi, dist = self.dtree.find_nearest(p)
            out[k] = hug_point(p, np.array(co), dist, inside(self.dtree, p.tolist()), PUSH_CLEARANCE, reach)
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

    def weights_trunk(self, pts):
        """Data transfer from the skin off the arms alone (every arm bone
        under 0.3): cloth over a shoulder that took the upper arm's weights
        lifted off as a flap with every arm swing once the armhole was cut."""
        from mathutils.bvhtree import BVHTree
        from body import barycentric
        if not hasattr(self, 'tree_noarm'):
            self.tris_noarm = self.tris[(self.arm[self.tris] < 0.3).all(1)]
            self.tree_noarm = BVHTree.FromPolygons(self.v.tolist(), self.tris_noarm.tolist(), all_triangles=True)
        out = np.zeros((len(pts), len(SK.NAMES)))
        for k, p in enumerate(pts):
            co, _n, fi, _d = self.tree_noarm.find_nearest(p)
            bc = barycentric(np.array(co), *self.v[self.tris_noarm[fi]])
            out[k] = (self.W[self.tris_noarm[fi]] * bc[:, None]).sum(0)
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
            verts.append([c[0] + A[ii, 0] * r[ii], y[ii] if np.ndim(y) else y, c[1] + A[ii, 1] * r[ii]])
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


def diagonal(side, top, low, start=-0.1, power=1.0):
    """The top of a column on a bare shoulder's diagonal edge: `top` on the
    covered side (side ≤ start), falling to `low` under the bare arm (side 1)
    — linearly, or faster at first with a `power` below 1."""
    return top - (top - low) * min(1.0, max(0.0, (side - start) / (1 - start))) ** power


def column_sweep(ring_at, top_of, bottom, rows, n=N_RADIAL, opening=None):
    """A sweep whose every column runs from its own top down to `bottom` in
    `rows` rows, so an edge across the columns (a bare shoulder's diagonal)
    is a straight line through the column tops, never a staircase of quads.
    `ring_at(y, angles)` → (centre, radii) of the outline at height y;
    `top_of(angle)` a column's top; `opening(y)` (optional) the half-angle of
    a front opening at height y: the columns spread over the rest of the ring
    and its two edges (the first and last column) part there."""
    verts, uv = [], []
    base = 2 * np.pi * np.arange(n + 1) / n
    tops = np.array([top_of(a) for a in base])
    for k in range(rows):
        f = k / (rows - 1)
        for i in range(n + 1):
            y = tops[i] + (bottom - tops[i]) * f
            a0 = opening(y) if opening else 0.0
            th = a0 + (2 * np.pi - 2 * a0) * i / n
            c, r = ring_at(y, np.array([th]))
            verts.append([c[0] + np.sin(th) * r[0], y, c[1] + np.cos(th) * r[0]])
            uv.append([i / n, f])
    tris = []
    for k in range(rows - 1):
        for i in range(n):
            a = k * (n + 1) + i
            b = a + 1
            c2 = a + n + 1
            d = c2 + 1
            tris += [[a, c2, b], [b, c2, d]]
    return np.array(verts), np.array(tris), np.array(uv)


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


def breast_cloth_span(L):
    """The breast cloth's top and hem: over the bust down to the waist.
    The top is 0.045 H under the shoulder, not L['chestTop'] (0.065 H under
    it): the hung rest tilts the chest forward, and at chestTop the cloth's
    front edge stood only 5 mm above the bust's peak, the upper bust bare
    (measured 04.11.2026, work-order point 1477; calibratable). The hem is the girdle (where a skirt or wrapper begins), 0.01 H lower so
    the cloth laps over it — not L['waist'], which is the chest bone's head
    (0.66 H on a woman, under the bust) and left only a band beneath the bust
    (work-order point 1477). shells.py cuts the pre-split body at the hem."""
    H = L['H']
    return L['shoulder'] - 0.045 * H, L['girdle'] - 0.01 * H


def skirt_profile(form, wear, L):
    """A wrapped skirt's (ease, flare, ease_top) in figure units: the short
    skirt sits close at the hips with little flare (with the old 0.012 H ease
    and 0.035 flare it stood off a child's hips as a stiff ring and ballooned
    off a digging woman's), and a wrapper tied over the chest starts close to
    the bust (its top edge stood off the chest as a pointed wing). Values from
    VILLAGER_ASSET.garmentFit (src/config/balance.ts, calibratable)."""
    H = L['H']
    fit = L['fit']
    if form == 'skirtShort':
        return fit['skirtShortEase'] * H, fit['skirtShortFlare'], fit['skirtShortEaseTop'] * H
    flare = 0.05 if form == 'wrapLong' else 0.035
    return 0.012 * H, flare, fit['chestWrapEaseTop'] * H if wear == 'chest' else None


def chest_wrap_top(L):
    """A wrapper tied over the chest: its top edge under the armpits, above
    the breasts (VILLAGER_ASSET.garmentFit chestWrapTop, calibratable)."""
    return L['shoulder'] - L['fit']['chestWrapTop'] * L['H']


def chest_wrap_column_top(L, top, n=N_RADIAL):
    """A chest wrapper's top edge per ring direction: over the breasts in
    front and over the shoulder blades behind at `top`, dipping at the sides
    by chestWrapSideDrop H under the armpits (smoothly between
    chestWrapSideFrom and chestWrapSideTo degrees off the front or back).
    Level all round at `top`, the edge ran through the hanging upper arm in
    the build pose: the arm cut it (fit.settle armholes) and the settle
    pushed the cloth round it radially, over the limb, into a cushion off
    chest, upper arms and waist (work-order point 1482, pass 5)."""
    fit = L['fit']
    s = np.abs(angles(n)[:, 0])
    lo, hi = np.sin(np.radians(fit['chestWrapSideFrom'])), np.sin(np.radians(fit['chestWrapSideTo']))
    x = np.clip((s - lo) / (hi - lo), 0, 1)
    return top - fit['chestWrapSideDrop'] * L['H'] * x * x * (3 - 2 * x), L['waist']


def chest_wrap_heights(L, top, bottom, rings=10):
    """A chest wrapper's ring heights, top to hem: every chestWrapBustStep H
    from the top down to the chest bone's head (L['waist']), then `rings`
    rings evenly to the hem. The wrapper is cut on the man's body and a
    woman's breast is carried onto it by the surface map ring by ring
    (finish): with the hem's 7 cm spacing the cloth between two rings cut
    through the breast."""
    step = L['fit']['chestWrapBustStep'] * L['H']
    n = max(1, int(np.ceil((top - L['waist']) / step)))
    bust = top + (L['waist'] - top) * np.arange(n) / n
    return [float(y) for y in np.concatenate([bust, np.linspace(L['waist'], bottom, rings)])]


def tube(B, top, bottom, ease, flare, mask, rings=10, below_crotch_legs=True, ease_top=None, heights=None, column_top=None):
    """A garment round the trunk (and the legs together below the crotch).
    `ease_top` (optional): the ease at the top ring, blending to `ease` at
    the hem, so a wrapped top edge lies on the body instead of standing off.
    `heights` (optional): the ring heights top to hem instead of `rings`
    evenly spaced ones. `column_top` (optional, (tops[N_RADIAL], floor)):
    each ring direction's own top edge; the rings above `floor` are spread
    per direction between floor and that top, and each direction's radius is
    the body's outline at its own height (sweep takes a ring's height per
    column)."""
    out = []
    ys = heights if heights is not None else [top + (bottom - top) * k / (rings - 1) for k in range(rings)]
    for y in ys:
        t = (y - top) / (bottom - top)
        m = mask & (B.arm < 0.3)
        e = ease if ease_top is None else ease_top + (ease - ease_top) * t
        c, r = B.ring(y, m, e)
        if column_top is not None and y > column_top[1]:
            tops, floor = column_top
            yc = floor + (y - floor) * (tops - floor) / (top - floor)
            r = r.copy()
            for yi in np.unique(np.round(yc, 5)):
                at = np.round(yc, 5) == yi
                r[at] = B.ring(float(yi), m, e, center=c)[1][at]
            y = yc
        fl = flare * B.body['joints'][0, 1] * t * t
        A = angles(len(r))
        # the hem flares mostly sideways (a deep fore-aft flare becomes the
        # shins' depth below the ground when kneeling)
        r = r + fl * (0.45 + 0.55 * np.abs(A[:, 0]))
        out.append((y, c, r))
    return out


def tarboosh(B, L, steps=5):
    """The tarboosh (fez): a truncated cone of felt from the brow to a flat
    top above the crown. Its rim is measured from the drawn chin as the cap's
    (`jaw`); its wall never lies inside the head at its own height and tapers
    from the rim to garmentFit.tarbooshTopScale of it at the top, closed."""
    H, fit = L['H'], L['fit']
    lo = L['jaw'] + 0.07 * H + 0.02 * H
    top = L['crown'] + fit['tarbooshRise'] * H
    ease = 0.008 * H
    c0, r0 = B.ring(lo, B.head > 0.5, ease)
    rings = []
    for k in range(steps):
        y = lo + (top - lo) * k / (steps - 1)
        _c, r = B.ring(min(y, L['crown'] - 0.006 * H), B.head > 0.5, ease)
        wall = r0 * (1 - (1 - fit['tarbooshTopScale']) * k / (steps - 1))
        rings.append((y, c0, np.maximum(r, wall) if y < L['crown'] else wall))
    # built from the rim up; sweep takes its rings top to bottom (the head
    # pieces' winding), the flat top the closed end
    return sweep(rings[::-1], closed_top=True)


def build_form(B, form, wear, L):
    H = L['H']
    allm = np.ones(len(B.W), bool)
    trunk = allm
    parts = []
    if form in FLAPS:
        long = L['knee'] + 0.02 * H if form == 'apron' else L['hip'] - (0.14 if form == 'girdleTails' else 0.10) * H
        # the girdle a flat band on the waist (0.008 H high, flapGirdleBand H
        # thick), as the game's own builder draws it (figureDress.ts girdle):
        # a round cord 0.008 H thick stood off the waist as a torus, and the
        # settle pushed its inner half out of the skin further still
        parts.append(girdle(B, L['girdle'], 0.008 * H, L['fit']['flapGirdleBand'] * H))
        # the front flap a trapezoid over the hip bones (front_flap)
        fit = L['fit']
        parts.append(front_flap(B, L['girdle'], long, 0.009 * H, 0.03, fit['flapFrontHalfAngleTop'], fit['flapFrontHalfAngle']))
        back_long = L['knee'] + 0.05 * H if form == 'girdleTails' else long
        back = 0.9 if form == 'apron' else 0.75
        parts.append(sweep(tube(B, L['girdle'], back_long, 0.009 * H, 0.03, trunk, 8), keep=lambda k, i: abs(ang(i)) >= np.pi - back - 1e-6))
        return merge(parts), 4
    if form in ('skirtShort', 'skirtKnee', 'wrapLong'):
        top = chest_wrap_top(L) if wear == 'chest' else L['girdle']
        bottom = (L['hip'] + L['knee']) / 2 if form == 'skirtShort' else L['knee'] - 0.015 * H if form == 'skirtKnee' else L['knee'] - 0.6 * (L['knee'] - L['ankle'])
        ease, flare, ease_top = skirt_profile(form, wear, L)
        heights = chest_wrap_heights(L, top, bottom) if wear == 'chest' else None
        column_top = chest_wrap_column_top(L, top) if wear == 'chest' else None
        return sweep(tube(B, top, bottom, ease, flare, trunk, 12, ease_top=ease_top, heights=heights, column_top=column_top)), 8
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
        return sweep(tube(B, *breast_cloth_span(L), 0.011 * H, 0.01, trunk, 6)), 3
    if form in ('shirt', 'robe', 'toga', 'coat', 'gown'):
        # the coat: the Western jacket to mid-thigh; the gown: the Western
        # woman's long skirt and bodice to the ground (docs/giza-1890.md §4.1)
        bottom = (L['knee'] + 0.02 * H if form == 'shirt' else (L['hip'] + L['knee']) / 2 if form == 'coat'
                  else L['ankle'] + 0.03 * H)
        top = L['neck'] - 0.01 * H
        flare = 0.03 if form == 'shirt' else 0.02 if form == 'coat' else 0.06
        if form == 'toga':
            bare = 1 if wear == 'rightShoulder' else -1  # the figure's left is +x
            body_only, yoke = trunk & (B.arm < 0.3), trunk & (B.lower_arm < 0.3)

            def toga_ring(y, th):
                # the covered shoulder's cap inside the outline, as a robe's yoke
                h, c = B.outline(y, yoke if y > L['chestTop'] else body_only)
                t = (top - y) / (top - bottom)
                fl = flare * B.body['joints'][0, 1] * t * t * (0.45 + 0.55 * np.abs(np.sin(th)))
                return c, np.array([ray_hull(h, c, (np.sin(a), np.cos(a))) for a in th]) + 0.013 * H + fl
            # the bare shoulder's edge runs diagonally from the covered
            # shoulder's neck to under the bare arm: every column has its own
            # top on that line (dropping whole quads left it stair-stepped)
            low = L['chestTop'] - 0.08 * H
            v = column_sweep(toga_ring, lambda th: diagonal(np.sin(th) * bare, top, low), bottom, 24)
            # all of it body cloth: weights off the arms (finish)
            return v, 8, np.zeros(len(v[0]), int)
        # the yoke: below the neckline (kept as it was: neck beads lie on
        # it) down to the chest's top the outline holds the shoulders' arm
        # caps too, so the cloth covers the tops of the shoulders and the
        # sleeves begin under it (the upper arm comes out through the armhole
        # fit.settle cuts); below it the trunk alone
        yoke = L['chestTop']
        ys = list(np.linspace(top, yoke, 5)) + list(np.linspace(yoke, bottom, 15))[1:]
        rings = []
        for y in ys:
            t = (top - y) / (top - bottom)
            c, r = B.ring(y, trunk & ((B.lower_arm < 0.3) if yoke + 1e-9 < y < top - 1e-9 else (B.arm < 0.3)), 0.013 * H)
            A = angles(len(r))
            rings.append((y, c, r + flare * B.body['joints'][0, 1] * t * t * (0.45 + 0.55 * np.abs(A[:, 0]))))
        parts.append(sweep(rings))
        for s in 'LR':
            parts.append(sleeve(B, s, L, long=form in ('coat', 'gown')))
        # the sleeves' vertices, by side (1 left, 2 right): they take their
        # weights from their own arm, the body cloth (0) from the skin off
        # the arms (finish)
        limb = np.concatenate([np.full(len(p[0]), k) for k, p in enumerate(parts)])
        # a sleeve's cap ring lies above the shoulder joint: weighted to the
        # upper arm it swung the other way round the joint and stood off the
        # shoulder as a shard; it takes the shoulder's own skin weights (3)
        start = len(parts[0][0])
        for p in parts[1:]:
            limb[start:start + SLEEVE_RING] = 3
            start += len(p[0])
        return merge(parts), 8, limb
    if form in ('cloak', 'cape'):
        bottom = L['knee'] + 0.03 * H if form == 'cloak' else L['waist'] - 0.02 * H
        # the collar below the jaw: a woman's or an elder's chin came down
        # into a higher one
        collar, cap = L['neck'] - 0.005 * H, L['shoulder'] + 0.012 * H
        drape = L['shoulder'] + 0.005 * H
        # below the shoulders the outline holds the arms (it drapes them) and
        # everything above it: the cloth falls straight from its widest point
        # instead of tucking back in under the hands (that hull ballooned)
        below = B.head < 0.3

        def cloak_ring(y, th):
            if y >= drape:
                # the collar and the shoulders' tops, arm caps included
                h, c = B.outline(y, below)
            else:
                h, c = B.outline_down(drape, y, below)
            ease = 0.012 * H + (0.008 * H) * min(1.0, (collar - y) / (collar - cap)) + 0.012 * H * max(0.0, (cap - y) / (cap - bottom))
            t = (collar - y) / (collar - bottom)
            return c, np.array([ray_hull(h, c, (np.sin(a), np.cos(a))) for a in th]) + ease + 0.03 * H * t * t
        # a cloak opens in front; a cape is closed (its opening, narrow at the
        # chest, let a breast cloth under it bulge out of it)
        opened = form == 'cloak'
        bare = 1 if wear == 'rightShoulder' else -1 if wear == 'leftShoulder' else 0
        # an open front parts from the collar down, widening toward the hem
        # (a straight-sided opening read as a notch cut into the chest)
        widest = 0.3
        # tied over the breast ('chest', figureDress.ts): a cape stays closed,
        # a knee-long cloak opens only below the waist
        start = L['waist'] if wear == 'chest' else cap
        opening = (lambda y: widest * min(1.0, max(0.0, (start - y) / (start - bottom)))) if opened else None
        # a bare shoulder's edge runs diagonally from the collar over the
        # covered side to under the bare arm
        low = L['waist'] + 0.05 * H
        top = (lambda th: diagonal(np.sin(th) * bare, collar, low, power=0.5)) if bare else (lambda th: collar)
        return column_sweep(cloak_ring, top, bottom, 18, opening=opening), 6
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
    if form == 'tarboosh':
        return tarboosh(B, L), 0
    if form in ('turban', 'cap', 'headband'):
        # a cap and a headband from the drawn chin, not the head joint
        # (`chin`), which stands some centimetres above it: measured from the
        # joint they began above the crown and hovered over the head as flat
        # discs. OPEN: the turban keeps the joint — measured from the chin it
        # swelled under the hood and the garment settle diverged
        hc = (L['chin'] if form == 'turban' else L['jaw']) + 0.07 * H
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
        # built from the brim up; sweep takes its rings top to bottom (its
        # winding faces outward only so), so they are reversed and the crown,
        # now the first ring, is the closed end (closing the brim left a disc
        # across the brow and the crown open)
        return sweep(rings[::-1], closed_top=form != 'headband'), 0
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
        # against the back of the skull, measured at the bag's height: a fixed
        # depth left it 1-1.6 cm behind the head. Its front starts 4 cm inside
        # the skull so the settle's push (fit.settle_once) lays it onto the
        # scalp at its clearance at EVERY body corner: from 1.5 cm the child's
        # smaller head left the morphed bag 1.4 cm off, never pushed
        y, r = L['jaw'] + 0.09 * H, 0.045 * H
        near = B.mask_body & (B.head > 0.5) & (np.abs(B.v[:, 1] - y) < 0.03)
        back = float(B.v[near][:, 2].min())
        return blob((0, y, back - 0.9 * r + 0.04), r, (1, 0.8, 0.9)), 0
    if form == 'neckBeads' and wear == 'chest':
        # layered strings built into a wide, deep collar over the breast
        # (figureDress.ts neckBeads 'chest'): close on the body, so a cloak
        # tied or open over it keeps it inside (the layer settle)
        lo, hi = L['chestTop'] - 0.06 * H, L['neck'] - 0.008 * H
        rings = []
        for k in range(6):
            y = hi - (hi - lo) * k / 5
            c, r = B.ring(y, B.arm < 0.2, 0.008 * H)
            rings.append((y, c, r))
        return sweep(rings), 2
    if form == 'neckBeads':
        c, r = B.ring(L['neck'] - 0.012 * H, B.arm < 0.2, 0.012 * H)
        return torus(c, L['neck'] - 0.012 * H, r, 0.01 * H), 2
    if form == 'babySling':
        # an infant carried on the back in the mantle (figureDress.ts
        # babySling): a hide bundle standing off the mantle's back, the small
        # head above it; its uv v lifted by 2 marks the head, which the game
        # paints in the infant's skin (export.py _INFANT)
        r = 0.07 * H
        y = L['chestTop'] - 0.06 * H
        h, c = B.outline(y, B.arm < 0.3)
        back = ray_hull(h, c, (0.0, -1.0))
        z = c[1] - (back + 0.065 * H + r * 0.6)
        bv, bt, bu = blob((c[0], y, z), r, (1, 1.2, 0.7))
        hv, ht, hu = blob((c[0], y + r * 1.2 + 0.02 * H, z + 0.01 * H), 0.036 * H, (1, 1, 1))
        hu = hu + [0.0, 2.0]
        return merge([(bv, bt, bu), (hv, ht, hu)]), 0
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


FLAPS = ('loinFlap', 'apron', 'girdleTails')
TORUS_TUBE = 6  # a torus's segments round its tube (torus `m`)


def girdle_count(n=N_RADIAL, m=TORUS_TUBE):
    """The vertex count of girdle(): (n + 1) ring columns × (m + 1) tube rows."""
    return (n + 1) * (m + 1)


def star_radii(pts, c, hull_r):
    """Per ring direction (angles(len(hull_r))) the farthest of `pts`
    (x, z) from `c` within that direction's sector, blurred 1-2-1 round the
    ring; an empty sector keeps the hull's radius."""
    n = len(hull_r)
    d = np.asarray(pts, float) - c
    a = np.arctan2(d[:, 0], d[:, 1])
    rho = np.linalg.norm(d, axis=1)
    r = np.array(hull_r, float)
    for i in range(n):
        da = np.abs(np.angle(np.exp(1j * (a - 2 * np.pi * i / n))))
        m = da <= np.pi / n
        if m.any():
            r[i] = min(r[i], float(rho[m].max()))
    return 0.25 * np.roll(r, 1) + 0.5 * r + 0.25 * np.roll(r, -1)


def flap_half_angles(rings, top, hem):
    """A front flap's half-angle (rad) per ring, top to hem: `top` at the
    girdle tapering linearly to `hem`."""
    return [top + (hem - top) * k / (rings - 1) for k in range(rings)]


def front_flap(B, y_top, y_bottom, ease, flare, half_top, half_hem, rings=8, step=2 * np.pi / N_RADIAL):
    """The front flap of a flap form (loin flap, apron, girdle tails): a
    trapezoid of columns spread evenly over ±half-angle round the hips, wide
    at the girdle (over the hip bones) and narrower at the hem, every column
    on the eased outline. Its edges lie on the body, so no oblique view
    looks behind them onto the groin. The 24 fixed ring columns of
    a tube cut at ±π/4 left a flat panel ~±7 cm wide standing 3-4 cm off the
    groin: from the front three-quarter the near groin showed beside it."""
    halves = flap_half_angles(rings, half_top, half_hem)
    cols = 2 * max(1, int(round(max(half_top, half_hem) / step))) + 1
    verts, uv, tris = [], [], []
    for k in range(rings):
        t = k / (rings - 1)
        y = y_top + (y_bottom - y_top) * t
        th = np.linspace(-halves[k], halves[k], cols)
        c, r = B.ring(y, B.arm < 0.3, ease, thetas=th)
        fl = flare * B.body['joints'][0, 1] * t * t
        r = r + fl * (0.45 + 0.55 * np.abs(np.sin(th)))
        for i in range(cols):
            verts.append([c[0] + np.sin(th[i]) * r[i], y, c[1] + np.cos(th[i]) * r[i]])
            uv.append([i / (cols - 1), t])
    for k in range(rings - 1):
        for i in range(cols - 1):
            a = k * cols + i
            tris += [[a, a + cols, a + 1], [a + 1, a + cols, a + cols + 1]]
    return np.array(verts), np.array(tris), np.array(uv)


def girdle(B, y, thick, band=None):
    """A ring round the waist at height y: `thick` its half-height, `band`
    (optional) its radial half-thickness — a flat band, else a round cord."""
    # the sector outline, not the convex hull: over the hull's chord across
    # the small of the back the band stood off as a loop above the buttocks
    c, r = B.ring_star(y, B.arm < 0.3, 0.006 * B.body['joints'][0, 1] / 0.7)
    return torus(c, y, r, thick, radial=band)


def torus(c, y, radii, thick, n=None, m=TORUS_TUBE, radial=None):
    """A ring of tube round (c, y); the tube's section `thick` high and
    `radial` (default `thick`) deep."""
    radii = np.asarray(radii, float)
    n = n or len(radii)
    radial = thick if radial is None else radial
    A = angles(n)
    verts, uv, tris = [], [], []
    for i in range(n + 1):
        ii = i % n
        for k in range(m + 1):
            a = 2 * np.pi * k / m
            rr = radii[ii] + radial * np.cos(a)
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


SLEEVE_RING = 13  # vertices per sleeve ring (12 columns and the uv seam)


def sleeve_radius(rad, k, fit):
    """A sleeve ring's radius round an arm slice of radius `rad` (ring k from
    the shoulder): close round the arm. With 1.12 × rad + 6 mm + 4 mm per ring
    the far sleeve stood off the arm as a separate tube (VILLAGER_ASSET.
    garmentFit, calibratable)."""
    return rad * fit['sleeveScale'] + fit['sleeveEase'] + fit['sleeveEaseStep'] * k


def sleeve(B, s, L, long=False):
    """A sleeve round the arm: short (to just above the elbow), or `long` on
    down the forearm to the wrist (the coat and the gown)."""
    iu, il, ih = SK.INDEX['upperArm.' + s], SK.INDEX['forearm.' + s], SK.INDEX['hand.' + s]
    a = B.wp[iu]
    b = B.wp[il]
    rings = []
    fit = L['fit']
    if long:
        # one arm slice set over the upper arm and the forearm: at the elbow
        # neither bone holds half the weight alone
        pts = B.v[B.mask_body & (B.W[:, iu] + B.W[:, il] > 0.5)]
        h = B.wp[ih]
        span = [(a, b, f) for f in (0.1, 0.45, 0.78, 1.0)] + [(b, h, f) for f in (0.35, 0.7, fit['longSleeveWrist'])]
    else:
        pts = B.v[B.mask_body & (B.W[:, iu] > 0.5)]
        span = [(a, b, f) for f in (0.1, 0.45, 0.78)]
    for k, (p0, p1, f) in enumerate(span):
        ax = (p1 - p0) / np.linalg.norm(p1 - p0)
        p = p0 + (p1 - p0) * f
        rel = pts - p
        along = rel @ ax
        sl = pts[np.abs(along) < 0.015]
        rad = np.max(np.linalg.norm((sl - p) - np.outer((sl - p) @ ax, ax), axis=1)) if len(sl) else 0.035
        rings.append((p, long_sleeve_radius(rad, k, fit) if long else sleeve_radius(rad, k, fit), ax))
    # a cap ring at the shoulder joint, under the body cloth's yoke: a
    # sleeve begun below the joint left the top of the shoulder bare between
    # the two (one begun above it lay in the shoulder, and the settle pulled
    # it out into ribbons)
    rings.insert(0, (a, rings[0][1], rings[0][2]))
    return arm_sweep(rings)


def long_sleeve_radius(rad, k, fit):
    """A long sleeve's ring round an arm slice of radius `rad`: the short
    sleeve's fit over the upper arm (rings 0-2), from the elbow on a fixed
    ease (VILLAGER_ASSET.garmentFit.longSleeveEase, calibratable) — the short
    sleeve's growing step would open the cuff into a bell."""
    if k < 3:
        return sleeve_radius(rad, k, fit)
    return rad * fit['sleeveScale'] + fit['longSleeveEase']


def arm_sweep(rings, n=12):
    """Rings [(centre, radius, axis)] down an arm → verts, tris, uv: each ring
    square to its own segment (the elbow bends a long sleeve)."""
    verts, uv, tris = [], [], []
    for k, (p, rad, ax) in enumerate(rings):
        e1 = np.cross(ax, [0, 0, 1.0])
        e1 /= np.linalg.norm(e1)
        e2 = np.cross(ax, e1)
        for i in range(n + 1):
            th = 2 * np.pi * (i % n) / n
            verts.append(p + rad * (np.cos(th) * e1 + np.sin(th) * e2))
            uv.append([i / n, k / (len(rings) - 1)])
    for k in range(len(rings) - 1):
        for i in range(n):
            a0 = k * (n + 1) + i
            tris += [[a0, a0 + n + 1, a0 + 1], [a0 + 1, a0 + n + 1, a0 + n + 2]]
    return np.array(verts), np.array(tris), np.array(uv)


# ---- the set ---------------------------------------------------------------------------------

GARMENTS = [
    ('loinFlap', 'waist'), ('girdleTails', 'waist'), ('apron', 'waist'), ('skirtShort', 'waist'), ('skirtKnee', 'waist'),
    ('wrapLong', 'waist'), ('wrapLong', 'chest'), ('trousers', 'waist'), ('breastCloth', 'chest'),
    ('shirt', 'chest'), ('robe', 'chest'), ('toga', 'leftShoulder'), ('toga', 'rightShoulder'),
    ('cloak', 'bothShoulders'), ('cloak', 'chest'), ('cape', 'chest'), ('cape', 'leftShoulder'), ('cape', 'rightShoulder'),
    ('babySling', 'bothShoulders'),
    ('hood', 'overHead'), ('turban', 'aroundHead'), ('cap', 'crown'), ('headband', 'aroundHead'), ('veil', 'face'),
    ('headRing', 'crown'), ('topknot', 'crown'), ('hairBag', 'crown'), ('neckBeads', 'neck'), ('neckBeads', 'chest'),
    ('waistBeads', 'waist'), ('limbRings', 'limbs'),
    # the 1890 Western dress and the dragoman's fez (docs/giza-1890.md §4.1);
    # the long trousers and the footwear are shells (shells.py)
    ('coat', 'chest'), ('gown', 'chest'), ('tarboosh', 'crown'),
    ('trousersLong', 'waist'), ('shoes', 'feet'), ('boots', 'feet'),
]
# The set is the (form, wear) pairs the game's outfit generator puts on a
# figure (src/systems/appearance.ts appearanceFor; villagerFigureBody.test.ts
# holds every generated pair to a mesh here): the game draws only these, no
# code-built layer, and the cover mask holds at most 32 (mask.BITS).
# The slot's ease order: an outer layer stands off the inner one.
OUTER = {'cloak': 0.012, 'cape': 0.012, 'hood': 0.006}
SKIRTS = {'loinFlap', 'apron', 'girdleTails', 'skirtShort', 'skirtKnee', 'wrapLong', 'shirt', 'robe', 'toga', 'cloak', 'coat', 'gown'}
RIGID_HEAD = {'turban', 'cap', 'headband', 'headRing', 'topknot', 'hairBag', 'tarboosh'}
# rigid on the chest bone: the infant rides it as one piece (figureDress.ts babySling)
RIGID_CHEST = {'babySling'}


def mesh_name(form, wear):
    return f'g-{form}-{wear}'


def cloth_names(meshes):
    """The garments built as meshes (every `g-` entry but a shell recipe, shells.py)."""
    return [n for n in meshes if n.startswith('g-') and meshes[n].get('part') != 'shell']


def shell_names(meshes):
    return [n for n in meshes if meshes[n].get('part') == 'shell']


def girdle_weights(W, n):
    """The first `n` vertices (a girdle cord) ride the pelvis and spine alone:
    taken from the nearest skin, the cord's back took the buttocks' thigh
    weights, and a striding thigh lifted it off the waist as a hooked loop
    above the rear flap."""
    W = W.copy()
    keep = np.zeros(W.shape[1], bool)
    keep[[SK.INDEX['hips'], SK.INDEX['spine']]] = True
    W[:n, ~keep] = 0
    s = W[:n].sum(1)
    W[:n][s <= 1e-9, SK.INDEX['hips']] = 1
    s[s <= 1e-9] = 1
    W[:n] /= s[:, None]
    return W


def mirror_bones():
    """Each bone's index paired with its mirror's (a `.L` with its `.R`; a
    middle bone with itself)."""
    out = np.arange(len(SK.NAMES))
    for i, name in enumerate(SK.NAMES):
        for a, b in (('.L', '.R'), ('.R', '.L')):
            if name.endswith(a) and name[:-2] + b in SK.INDEX:
                out[i] = SK.INDEX[name[:-2] + b]
    return out


def flap_weights(v, W, n, front_z, crotch, hem, hem_share, hips_x=0.0, core=np.pi, edge=np.pi):
    """A front flap (every vertex after the first `n`, the girdle cord, in
    front of `front_z`) rides both legs alike in its middle: its weights are
    averaged with their mirror, fully above the crotch (over the pubic area)
    and fading to `hem_share` of that at the hem. From the nearest skin each
    half of the flap took its own groin's thigh, and a stride sheared the
    flap sideways onto the forward hip, baring the pubic area beside it.
    Round the hips (angle about (hips_x, front_z), 0 the front) the mirror
    blend holds within `core` and fades out at `edge`: a side edge rides its
    own thigh and stays on it, where a mirrored edge left the striding thigh
    and stood off it. The rear flap and the cord keep their weights."""
    W = W.copy()
    m = np.zeros(len(v), bool)
    m[n:] = v[n:, 2] > front_z
    if not m.any():
        return W
    sym = 0.5 * (W[m] + W[m][:, mirror_bones()])
    f = np.clip((crotch - v[m, 1]) / max(1e-6, crotch - hem), 0, 1)
    f = 1 - f * (1 - hem_share)
    a = np.abs(np.arctan2(v[m, 0] - hips_x, v[m, 2] - front_z))
    f = (f * np.clip((edge - a) / max(1e-6, edge - core), 0, 1))[:, None]
    W[m] = W[m] * (1 - f) + sym * f
    W[m] /= W[m].sum(1, keepdims=True)
    return W


PUSH_CLEARANCE = 0.007  # finish(): every garment vertex this far off the skin
# clear_corners outlines the trunk without the armpit skin the arms partly
# ride (B.arm < 0.3 took a child's armpit into the chest outline and stood
# the wrapper off her sides, work-order point 1482 pass 5)
CLEAR_ARM = 0.05
TUBES = ('breastCloth', 'skirtShort', 'skirtKnee', 'wrapLong')


def hug_point(p, co, dist, is_inside, clearance, reach):
    """One vertex of a hugged edge (Body.hug): outside the skin by less than
    `reach` it comes to `clearance` off its nearest skin point `co` along the
    line from it; inside, at the skin or farther off it stays."""
    if is_inside or dist <= 1e-9 or dist >= reach:
        return p
    return co + (p - co) * (clearance / dist)


def edge_masks(form, v, limb=None, girdle_y=None):
    """(hug, pin) per vertex of a built garment. `pin`: held out of the clip
    fit's pushes (fit.fit) — the fit pushes a vertex outward wherever the body
    comes near it in ANY frame of ANY clip, so the rest geometry of an edge
    became the union of every pose's body: the top edge of a breast cloth, a
    wrapper or a short skirt stood off as a stiff ring one looked into from
    above, the girdle cord rose off the back as a loop, a sleeve's cap ring
    rose over the shoulder. `hug` (within pin): pulled onto the skin (Body.hug)
    and weighted by the skin under it (finish), so it rides the body in every
    pose. Hugged: a tube garment's top ring (the highest vertices), a flap
    form's flap tops at the girdle (`girdle_y`), a sleeve's cap ring (`limb`
    3). Pinned only: the girdle cord (a flap form's first girdle_count()
    vertices, its torus kept round)."""
    n = len(v)
    hug = np.zeros(n, bool)
    pin = np.zeros(n, bool)
    if form in TUBES:
        hug = v[:, 1] >= v[:, 1].max() - 1e-6
    elif form in FLAPS:
        cord = np.arange(n) < girdle_count()
        hug = ~cord & np.isclose(v[:, 1], girdle_y, atol=1e-6)
        pin = cord
    elif limb is not None:
        hug = np.asarray(limb) == 3
    return hug, pin | hug


def held(push, pin):
    """The clip fit's pushes (fit.fit) with a pinned vertex's taken out (its neighbours spread
    theirs onto it)."""
    push = push.copy()
    push[pin] = 0
    return push


def skirt_blend(form, fit):
    """(blur width in radians, share of crotch-to-hem over which the blend
    fades in) for skirt_weights: a long wrapper blends both thighs fully a
    short way below the crotch, a loin flap's or apron's rear flap likewise,
    so the cloth no longer follows the forward thigh alone (it closed round
    it like a trouser leg when digging and kneeling, and the rear flap lifted
    off the buttocks as a stiff panel). VILLAGER_ASSET.garmentFit, calibratable.
    The third value, the blur width at the hem: a long wrapper's narrows
    back to wrapHemBlurWidth, so its hem front follows the forward leg in a
    stride (blurred wide it stayed between the legs and the forward shin
    stood through it)."""
    if form == 'wrapLong':
        return fit['wrapBlurWidth'], fit['wrapBlendReach'], fit['wrapHemBlurWidth']
    # a flap's ring holds the front and the rear flap: a wide blur would tie them together
    if form in ('loinFlap', 'apron'):
        return 0.9, fit['wrapBlendReach'], 0.9
    return 0.9, 1.0, 0.9


def skirt_weights(v, W, crotch, hem, width=0.9, reach=1.0, hem_width=None):
    """Below the crotch a skirt hangs round both legs: each ring's weights are
    blurred round the ring (the sides still lean to their own leg, the middle
    takes both; `width` the blur's standard deviation in radians, blending
    linearly to `hem_width` at the hem when given) and the
    shin's share goes to the thigh — cloth does not bend at the knee — fading
    in from the crotch down over `reach` of the way to the hem."""
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
        wy = width if hem_width is None else width + (hem_width - width) * min(1.0, max(0.0, (crotch - y) / max(1e-6, crotch - hem)))
        k = np.exp(-0.5 * (d / wy) ** 2)
        k /= k.sum(1, keepdims=True)
        out[ring] = k @ W[ring]
    f = np.clip((crotch - v[:, 1]) / max(1e-6, (crotch - hem) * reach), 0, 1)[:, None] * below[:, None]
    W = W * (1 - f) + out * f
    return W / W.sum(1, keepdims=True)


def radial_clear(pts, skin, mask, clearance, slab=0.012, drape=0.0, front=np.cos(np.radians(45))):
    """Every point at least `clearance` outside the convex outline of
    `skin[mask]` at its own height, pushed out radially from the outline's
    centre; a point outside it, or at a height with no skin, stays. In front
    (within acos(`front`) of +z round its own outline's centre) the outline
    reaches `drape` above the point: cloth hangs straight down from the
    breast, never tucked under it. At the sides and the back the outline is
    the point's own section: an outline over the whole drape there took in
    the wider chest and the armpits and stood the cloth off the waist and
    the arms all round (work-order point 1482, pass 5)."""
    out = pts.copy()
    hulls = {}

    def outline(y, up):
        key = (round(float(y), 3), up > 0)
        if key not in hulls:
            sec = skin[mask & (skin[:, 1] > y - slab) & (skin[:, 1] < y + slab + up)][:, [0, 2]]
            h = hull2d(sec) if len(sec) >= 3 else None
            hulls[key] = (h, h.mean(0)) if h is not None and len(h) >= 3 else None
        return hulls[key]

    for k, p in enumerate(pts):
        own = outline(p[1], 0.0)
        if own is None:
            continue
        h, c = own
        d = p[[0, 2]] - c
        if drape > 0 and d[1] > front * np.linalg.norm(d):
            hc = outline(p[1], drape)
            if hc is not None:
                h, c = hc
        d = p[[0, 2]] - c
        r = float(np.linalg.norm(d))
        if r < 1e-9:
            continue
        need = ray_hull(h, c, d / r) + clearance
        if r < need:
            out[k, [0, 2]] = c + d / r * need
    return out


# A woman's corners in the order their own morph is cleared (clear_corners):
# each corner's weights are an earlier one's plus its own morph (fit.SETTLE_ORDER).
FEMALE_CORNERS = ((('female',), 'female'), (('female', 'child', 'child_f'), 'child_f'),
                  (('female', 'youth', 'youth_f'), 'youth_f'), (('female', 'elder', 'elder_f'), 'elder_f'))


def clear_corners(pos, morph, basis, deltas, mask, clearance, drape=0.0):
    """A garment cut on the man's body carried onto every woman's corner by
    the surface map clears her trunk's section outline there (radial_clear):
    the map carries a ring vertex with its own skin triangle, so the cloth
    between rings over a breast ran through it, and under the bust the
    vertices of the inframammary skin stayed behind the breast (`drape`:
    the cloth hangs straight down that far from a bulge). Each corner's
    correction goes into its own morph. Each corner is cleared from its own
    mapped cloth, not from the cloth an earlier corner's correction moved:
    the woman's bust push rode on into the girl's, the youth's and the
    elder's corners (they share the female morph) and stood the cloth off a
    girl's flat chest by the woman's breast depth (work-order point 1482,
    pass 5). Returns new morphs."""
    raw = morph
    morph = dict(morph)
    for names, own in FEMALE_CORNERS:
        skin = basis + sum(deltas[n] for n in names)
        mapped = pos + sum(raw[n] for n in names)
        p = pos + sum(morph[n] for n in names)
        morph[own] = morph[own] + (radial_clear(mapped, skin, mask, clearance, drape=drape) - p)
    return morph


def finish(mh, body, B, v, t, uv, smooth, rigid_head=False, hair=False, skirt=None, lower_arms=False, limb=None, rigid_chest=False, girdle_n=0,
           hug=None, pin=None, reach=0.0, flap=None, clear=None):
    """Push the garment off the body, transfer weights, unpose to rest, bind the morphs.
    Only a garment worn on the lower arm (`lower_arms`: the limb rings) takes
    weights from the forearms and hands; a sleeve (`limb`: 1 left, 2 right)
    takes them from its own arm alone, so it goes where the arm goes (from
    the nearest trunk skin it stayed at the shoulder while the arm swung out
    of it). A hugged edge (`hug`, edge_masks) is pulled onto the skin first
    and takes the weights of the skin under it, after every blend; `pin`
    goes with the garment (g['pin']) to the clip fit, which leaves it.
    `flap` (front_z, crotch, hem, hem_share): a flap form's front flap rides
    both legs alike (flap_weights). `clear` (a drape height, or None): every
    woman's corner morph clears her trunk (clear_corners)."""
    if hug is not None and hug.any():
        v = v.copy()
        v[hug] = B.hug(v[hug], reach)
    v = B.push_out(v, PUSH_CLEARANCE)
    W = B.weights_at(v, lower_arms)
    if limb is not None:
        if (limb == 0).any():
            W[limb == 0] = B.weights_trunk(v[limb == 0])
        for k, s in ((1, 'L'), (2, 'R')):
            m = limb == k
            if m.any():
                W[m] = B.weights_on_arm(v[m], s)
        if (limb == 3).any():
            W[limb == 3] = B.weights_at(v[limb == 3], False)
    if rigid_head or rigid_chest:
        W[:] = 0
        W[:, SK.INDEX['head' if rigid_head else 'chest']] = 1
    elif smooth:
        W = smooth_weights(v, t, W, smooth)
    if skirt is not None:
        W = skirt_weights(v, W, *skirt)
    if hug is not None and hug.any():
        # the skin's own weights: a sleeve's cap ring from the skin round the
        # shoulder (its arm included), body cloth from the skin off the arms
        cap = limb is not None and (np.asarray(limb)[hug] == 3).all()
        W[hug] = B.weights_at(v[hug], False) if cap else B.weights_trunk(v[hug])
    if girdle_n:
        W = girdle_weights(W, girdle_n)
    if flap is not None:
        W = flap_weights(v, W, girdle_n, *flap)
    W[W < 0.02] = 0
    W /= W.sum(1, keepdims=True)
    rest = unskin(v, W, B.j, B.wr, B.wp)
    idx, bary, off = surface_map(mh, body['basis_full'], rest)
    pos = apply_map(body['basis_full'], idx, bary, off)
    morph = {k: apply_map(body['basis_full'] + body['deltas_full'][k], idx, bary, off) - pos for k in MORPHS}
    if clear is not None:
        morph = clear_corners(pos, morph, body['basis_full'], body['deltas_full'], B.mask_body & (B.arm < CLEAR_ARM), PUSH_CLEARANCE, clear)
    g = {'pos': pos, 'tris': np.asarray(t), 'uv': uv, 'W': W, 'morph_pos': morph}
    if pin is not None and pin.any():
        g['pin'] = np.asarray(pin, bool)
    # which vertices are a sleeve's (its cap ring included): armholes reports
    # the sleeve cloth it cuts
    if limb is not None and (limb != 0).any():
        g['sleeve'] = np.asarray(limb) != 0
    return g


def refine(g, maxlen):
    """Split every cloth edge longer than `maxlen` at its midpoint (every
    attribute interpolated there) until none is: the same cloth, but with
    vertices close enough that it can follow a curved body part instead of
    cutting it by a chord. A triangle is split by how many of its edges are
    (one: two triangles, two: three across the shorter diagonal, three: four),
    so no edge is left with a vertex in its middle. A sleeve's membership
    (`sleeve`) carries over: a sleeve and the body cloth share no edge."""
    attrs = {'pos': g['pos'], 'uv': g['uv'], 'W': g['W'], **{'m:' + k: v for k, v in g['morph_pos'].items()}}
    if 'sleeve' in g:
        attrs['sleeve'] = np.asarray(g['sleeve'], float)
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
    if 'sleeve' in attrs:
        g['sleeve'] = attrs['sleeve'] > 0
    return g


ARM_BONES = tuple(f'upperArm.{s}' for s in 'LR')


def armhole_keep(t, sleeve, vin, cin):
    """The triangles armholes keeps — none with a vertex inside an upper arm
    (`vin`, per vertex) or its centre inside one (`cin`, called per triangle
    index) — and how many of those cut are a sleeve's (any vertex in
    `sleeve`). A sleeve's cloth inside its arm is cut too: kept, the settle
    could not take it out (measured 10.10.2026: 133 shirt and 144 robe
    sleeve triangles kept left up to 0.0237 of cloth in the arm after five
    rounds of settling again, 0.0000 cut). The penetration step's hole and
    cut columns count only hidden skin, so they do not prove that such an
    opening stays covered where skin shows."""
    t = np.asarray(t)
    keep = ~vin[t].any(1)
    for k in np.flatnonzero(keep):
        if cin(k):
            keep[k] = False
    return keep, int((~keep & sleeve[t].any(1)).sum())


def armholes(body, g):
    """Cut the body cloth an upper arm passes through in the build pose:
    every triangle with a vertex or its centre inside the drawn body where
    that is an upper arm (the nearest body triangle's bone). Cloth round the
    trunk would otherwise cut through the upper arm where it meets the trunk
    at the armpit — no settling can take a surface across that crease without
    folding it into one or the other — and the arm comes out through an
    opening instead, its sleeve's cloth inside the arm too (armhole_keep).
    Returns the garment, the triangles cut and how many are a sleeve's."""
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
    # a vertex inside an upper arm takes every triangle round it along, so no
    # cloth is left inside the arm at the hole's edge
    def in_arm(p):
        _co, _n, fi, _d = tree.find_nearest(p)
        return dom[body['tris'][fi][0]] in arm and inside(tree, p)
    vin = np.fromiter((in_arm(p) for p in gv.tolist()), bool, len(gv))
    sleeve = np.asarray(g.get('sleeve', np.zeros(len(gv), bool)), bool)
    cen = gv[t].mean(1)
    keep, of_sleeve = armhole_keep(t, sleeve, vin, lambda k: in_arm(cen[k].tolist()))
    if keep.all():
        return g, 0, 0
    used = np.unique(t[keep])
    remap = np.full(len(g['pos']), -1)
    remap[used] = np.arange(len(used))
    out = dict(g)
    out['tris'] = remap[t[keep]]
    for key in ('pos', 'uv', 'W'):
        out[key] = g[key][used]
    out['morph_pos'] = {m: d[used] for m, d in g['morph_pos'].items()}
    if 'sleeve' in g:
        out['sleeve'] = sleeve[used]
    return out, int((~keep).sum()), of_sleeve


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


def build_garments(mh, body, clips, cfg, shell_body=None):
    """Every garment of GARMENTS on `body`; the shells' recipes (shells.py)
    on `shell_body`, the cut body they are drawn on (`body` when None)."""
    H = cfg['VILLAGER_ASSET']['stature']
    q = design_pose(body)
    B = Body(mh, body, q)
    L = landmarks(body['joints'], H)
    L['fit'] = cfg['VILLAGER_ASSET']['garmentFit']
    # the drawn chin: the lowest point of the head's own skin (as the game
    # measures `chinY`, render/villagerFigureBody.ts measureProportions)
    L['jaw'] = float(B.v[B.mask_body & (B.head > 0.5)][:, 1].min())
    meshes = {}
    meta = {}
    import shells as SHL
    shell = SHL.recipes(body if shell_body is None else shell_body, L, cfg)
    for form, wear in GARMENTS:
        name = mesh_name(form, wear)
        if name in shell:
            # a shell garment: a recipe on the body's own surface (shells.py),
            # no mesh, no weight transfer, no fit
            meshes[name] = shell[name]
            meta[name] = {'form': form, 'wear': wear, 'kind': 'shell'}
            print(f'garment {name:28s} shell: {len(shell[name]["faces"]):5d} body faces, {len(shell[name]["rows"])} rows')
            continue
        res = build_form(B, form, wear, L)
        geo, smooth = res[:2]
        limb = res[2] if len(res) > 2 else None
        if geo is None:
            continue
        v, t, uv = geo
        crotch = L['hip'] - 0.03 * H
        skirt = (crotch, float(v[:, 1].min()), *skirt_blend(form, L['fit'])) if form in SKIRTS and v[:, 1].min() < crotch else None
        # the girdle cord is the first part of a flap form (build_form)
        girdle_n = girdle_count() if form in FLAPS else 0
        hug, pin = edge_masks(form, v, limb, L['girdle'])
        # the front flap in front of the hips joint, its own hem the flap's
        flap = None
        if form in FLAPS:
            front = v[girdle_n:][v[girdle_n:, 2] > B.wp[SK.INDEX['hips']][2]]
            hips = B.wp[SK.INDEX['hips']]
            flap = (float(hips[2]), crotch, float(front[:, 1].min()), L['fit']['flapHemSymmetry'], float(hips[0]),
                    L['fit']['flapSymmetryCore'], L['fit']['flapFrontHalfAngleTop'])
        g = finish(mh, body, B, v, t, uv, smooth, rigid_head=form in RIGID_HEAD, skirt=skirt, lower_arms=form == 'limbRings', limb=limb,
                   rigid_chest=form in RIGID_CHEST, girdle_n=girdle_n, hug=hug, pin=pin, reach=L['fit']['edgeHugReach'], flap=flap,
                   clear=L['fit']['chestWrapDrape'] * H if (form, wear) == ('wrapLong', 'chest') else None)
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
