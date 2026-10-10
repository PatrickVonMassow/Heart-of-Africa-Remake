"""Posed cloth pushed out of the body against simplified per-bone capsules.

The garments are skinned like the body, so in motion a garment vertex and
the skin it lies on can follow different bones (a skirt's front and the
thigh swinging into it, a wrap's chest and the arm folding over it) and the
cloth sinks into the body. A static rest offset cannot follow a pose (fit.py),
a per-pose offset table is not shippable; this push runs per pose on the
posed cloth, from a handful of numbers per bone, as a vertex shader can.

THE CAPSULES. Each bone gets one, fitted per body corner in the baked (hung)
frame the game skins from: a segment along the bone (head to tail, extended
to cover every vertex the bone dominates), an elliptic cross-section whose
two radii follow the bone's principal directions and taper linearly along
the segment, and ellipsoidal end caps. Every vertex the bone dominates lies
inside it (`fit`): cloth outside a capsule is clear of that bone's body.

THE PUSH. In a pose each garment vertex is taken into each bone's baked frame
(the inverse of that bone's skinning transform) and measured by its
normalised elliptic distance `s` (1 on the capsule's surface). Its target is
1 + margin/radius — the margin grows by the garment's layer (mask.LAYER), so
an outer garment stays outside an inner one — but never more than the vertex
had in the build pose (`rest`): cloth the garment is tailored to lie closer
than the capsule (where the body is slimmer than its ellipse) is left where
it was tailored, and the build pose is never moved. A vertex below its target
is moved out radially from the capsule's axis onto it; a few passes over the
bones settle cloth caught between two capsules. No per-pose data: per
vertex the build-pose distances (fixed), per bone the capsule (per corner).
"""
import numpy as np


def _unit(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v


def fit(baked, W, heads, tails, min_verts=12):
    """Capsules (one per bone with at least `min_verts` dominated vertices) of
    the baked body `baked` (n × 3) with weights `W` (n × bones), bone heads
    and tails in the same frame. Returns a dict of per-capsule arrays."""
    dom = np.argmax(W, 1)
    out = {k: [] for k in ('bone', 'head', 'e', 'u', 'v', 'lo', 'hi', 'r0', 'r1', 'aspect')}
    for b in range(W.shape[1]):
        sel = (dom == b) & (W[:, b] >= 0.4)
        if sel.sum() < min_verts:
            continue
        p = baked[sel] - heads[b]
        e = _unit(tails[b] - heads[b])
        if np.linalg.norm(tails[b] - heads[b]) < 1e-6:
            e = _unit(np.linalg.svd(p - p.mean(0), full_matrices=False)[2][0])
        t = p @ e
        off = p - t[:, None] * e
        # principal directions of the cross-section
        _s, _sv, vt = np.linalg.svd(off - off.mean(0), full_matrices=False)
        u = _unit(vt[0] - (vt[0] @ e) * e)
        v = np.cross(e, u)
        du, dv = off @ u, off @ v
        aspect = max(np.std(du), 1e-4) / max(np.std(dv), 1e-4)
        rad = np.sqrt(du * du + (dv * aspect) ** 2)
        lo, hi = float(t.min()), float(t.max())
        span = max(hi - lo, 1e-6)
        x = (t - lo) / span
        r0, r1 = _envelope(x, rad)
        for k, val in (('bone', b), ('head', heads[b]), ('e', e), ('u', u), ('v', v), ('lo', lo), ('hi', hi),
                       ('r0', r0), ('r1', r1), ('aspect', aspect)):
            out[k].append(val)
    return {k: np.array(v) for k, v in out.items()}


def _envelope(x, rad):
    """The line r(x) = r0 + (r1 − r0) x over x ∈ [0, 1] with r ≥ `rad` at
    every sample and the least mean radius (a slope search)."""
    top = float(rad.max())
    best = (2 * top, top, top)
    for slope in np.linspace(-2 * top, 2 * top, 161):
        r0 = float(np.max(rad - slope * x))
        r1 = r0 + slope
        if min(r0, r1) <= 0.2 * top:
            continue
        if r0 + r1 < best[0]:
            best = (r0 + r1, r0, r1)
    return best[1], best[2]


def _measure(c, k, x):
    """Capsule k's normalised distance `s` of baked-frame points `x` (m × 3),
    the axis point each is measured from, and the local u-radius there."""
    p = x - c['head'][k]
    e, u, v = c['e'][k], c['u'][k], c['v'][k]
    lo, hi = c['lo'][k], c['hi'][k]
    t = p @ e
    tc = np.clip(t, lo, hi)
    f = (tc - lo) / max(hi - lo, 1e-6)
    ru = c['r0'][k] + (c['r1'][k] - c['r0'][k]) * f
    rv = ru / c['aspect'][k]
    rc = np.minimum(ru, rv)
    off = p - tc[:, None] * e
    du, dv, da = off @ u, off @ v, t - tc
    s = np.sqrt((du / ru) ** 2 + (dv / rv) ** 2 + (da / rc) ** 2)
    return s, c['head'][k] + tc[:, None] * e, ru


def to_bone(posed, Rd, wp, heads, b):
    """Posed points in bone b's baked frame (the inverse of its skinning)."""
    return (posed - wp[b]) @ Rd[b] + heads[b]


def rest(c, posed, Rd, wp, heads):
    """Every vertex's normalised distance to every capsule in the build pose
    (posed by the build pose's `Rd`, `wp`): n × capsules."""
    return np.stack([_measure(c, k, to_bone(posed, Rd, wp, heads, c['bone'][k]))[0] for k in range(len(c['bone']))], 1)


def push(c, posed, Rd, wp, heads, s_rest, margin, passes=3):
    """`posed` (n × 3) pushed out of every capsule to its target: 1 +
    margin/radius, at most the build pose's `s_rest` (n × capsules)."""
    out = posed.copy()
    for _ in range(passes):
        moved = False
        for k in range(len(c['bone'])):
            b = c['bone'][k]
            x = to_bone(out, Rd, wp, heads, b)
            s, axis, ru = _measure(c, k, x)
            target = np.minimum(1.0 + margin / ru, s_rest[:, k])
            m = s < target - 1e-9
            if not m.any():
                continue
            moved = True
            # a point on the axis itself leaves along the capsule's u
            on = m & (s < 1e-6)
            x[on] += 1e-6 * c['u'][k]
            s[on] = 1e-6 / ru[on]
            scale = target[m] / np.maximum(s[m], 1e-6)
            nx = axis[m] + (x[m] - axis[m]) * scale[:, None]
            out[m] += (nx - x[m]) @ Rd[b].T
        if not moved:
            break
    return out


def selftest():
    """A capsule encloses what it was fitted to, the push clears a point inside
    it onto its target, and a point at its build-pose distance stays put."""
    rng = np.random.default_rng(1)
    # a tapered cylinder of points along +y, radius 0.1 → 0.05, flattened in z
    n = 400
    y = rng.uniform(0, 1, n)
    a = rng.uniform(0, 2 * np.pi, n)
    r = 0.1 - 0.05 * y
    pts = np.stack([r * np.cos(a), y, 0.6 * r * np.sin(a)], 1)
    W = np.ones((n, 1))
    heads, tails = np.zeros((1, 3)), np.array([[0, 1.0, 0]])
    c = fit(pts, W, heads, tails)
    assert len(c['bone']) == 1
    Rd, wp = np.eye(3)[None], np.zeros((1, 3))
    s = rest(c, pts, Rd, wp, heads)[:, 0]
    assert s.max() <= 1 + 1e-9, s.max()
    # a point on the axis is pushed onto the surface plus the margin
    q = np.array([[0.0, 0.5, 0.0], [0.0, 0.5, 0.001]])
    far = np.full((2, 1), 10.0)
    out = push(c, q, Rd, wp, heads, far, 0.002)
    s2, _ax, _ru = _measure(c, 0, out)
    assert (s2 >= 1.0 - 1e-6).all(), s2
    # a point tailored inside the capsule (its build-pose s) is not moved
    inner = np.array([[0.02, 0.5, 0.0]])
    sr = rest(c, inner, Rd, wp, heads)
    assert np.allclose(push(c, inner, Rd, wp, heads, sr, 0.002), inner)
    # a rotated bone: the push follows its transform
    th = 0.7
    R = np.array([[np.cos(th), -np.sin(th), 0], [np.sin(th), np.cos(th), 0], [0, 0, 1]])
    wp2 = np.array([[0.3, 0.1, 0.0]])
    on_axis = (np.array([[0.0, 0.5, 0.0]]) - heads[0]) @ R.T + wp2
    out = push(c, on_axis, R[None], wp2, heads, far[:1], 0.002)
    s3 = _measure(c, 0, to_bone(out, R[None], wp2, heads, 0))[0]
    assert s3[0] >= 1.0 - 1e-6, s3
    print('capsules selftest ok')
