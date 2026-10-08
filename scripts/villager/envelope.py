"""Step 3a: the rigid ornaments (limb rings, neck and waist beads) sized to
the limb they hang on in EVERY pose — a shape and a skin weight, no per-pose
offset.

A ring of beads does not stretch: each closed piece (a ring, a string of
beads) is skinned as ONE piece — every vertex of it takes the mean skin
weights of the piece, so it moves as one blend of its bones and never shears
into the skin it hangs round. Its radius is then the limb's envelope: the
piece is posed along the game's own path (gamepath.py) through every frame
the penetration report measures, at every body corner, and wherever any of
it lies inside the body (or nearer than `garmentFitMargin`), the whole piece
is widened round its own axis by the deepest amount, until no pose brings
skin into it. A wrist bent in the carry or a belly folded in the kneel
widens the ring once, for all poses.
"""
import numpy as np

import gamepath as GP
from body import top4

# The forms built of closed rigid pieces.
FORMS = ('limbRings', 'neckBeads', 'waistBeads')

_S = {}


def pieces(tris, n):
    """Connected pieces of a mesh (uv seams welded by their triangles): a
    label per vertex."""
    up = list(range(n))

    def find(a):
        while up[a] != a:
            up[a] = up[up[a]]
            a = up[a]
        return a
    for a, b, c in np.asarray(tris).tolist():
        ra, rb, rc = find(a), find(b), find(c)
        up[rb] = ra
        up[find(rc)] = ra
    roots = np.array([find(i) for i in range(n)])
    return np.unique(roots, return_inverse=True)[1]


def radial(pos, label):
    """Per vertex the unit direction away from its piece's axis (the axis of
    least spread through the piece's centre: a ring's normal)."""
    out = np.zeros_like(pos)
    for p in np.unique(label):
        m = label == p
        v = pos[m] - pos[m].mean(0)
        axis = np.linalg.svd(v, full_matrices=False)[2][-1]
        r = v - np.outer(v @ axis, axis)
        out[m] = r / np.maximum(np.linalg.norm(r, axis=1), 1e-9)[:, None]
    return out


def one_blend(W, label):
    """Every vertex of a piece takes the piece's mean weights (top four)."""
    out = W.copy()
    for p in np.unique(label):
        m = label == p
        w = W[m].mean(0)
        idx, ww = top4(w[None])
        dense = np.zeros_like(w)
        dense[idx[0]] = ww[0]
        out[m] = dense
    return out


def inflate(state, worst, margin, eps=1e-4):
    """One widening step: `state` {key: widening so far}, `worst` {key: the
    deepest signed depth measured (negative: clear by that much)}. A piece
    nearer than `margin` widens by what it lacks; none ever narrows.
    Returns the new state and whether anything moved."""
    out = dict(state)
    moved = False
    for k, d in worst.items():
        need = d + margin
        if need > eps:
            out[k] = out.get(k, 0.0) + need
            moved = True
    return out, moved


def _corner(c):
    """One body corner: per (garment, piece) the deepest signed depth of its
    vertices and the cloth between them over every pose."""
    from mathutils.bvhtree import BVHTree
    from fit import depths, garment_pos
    from sheets import corner_weights, morphed
    S = _S
    body, clips, cfg, G = S['body'], S['clips'], S['cfg'], S['G']
    w = corner_weights(*c)
    pos, j = morphed(body, w)
    person = GP.Person(j)
    bh = person.bake(pos, S['jidx'], S['jw'])
    gh = {n: person.bake(garment_pos(G[n], w), *S['skin'][n]) for n in S['names']}
    worst = {}
    from export import EXPORT_CLIPS
    for cname, f, kst, q, hips in GP.poses(clips, EXPORT_CLIPS, cfg):
        wr, wp = person.pose(q, hips, kst)
        bv = person.skin(bh, S['jidx'], S['jw'], wr, wp)
        tree = BVHTree.FromPolygons(bv.tolist(), body['tris'].tolist(), all_triangles=True)
        for n in S['names']:
            gv = person.skin(gh[n], *S['skin'][n], wr, wp)
            fi, fw = S['faces'][n]
            pts = np.concatenate([gv, np.einsum('kj,kji->ki', fw, gv[fi])])
            lab = S['plabel'][n]
            # only points near the skin can be inside it: the rest read clear
            hit = [tree.find_nearest(x) for x in pts.tolist()]
            near = np.array([h[3] < 0.05 for h in hit])
            d = np.full(len(pts), -0.05)
            if near.any():
                d[near] = depths(tree, pts[near])[0]
            for p in np.unique(lab):
                k = (n, int(p))
                dd = float(d[lab == p].max())
                worst[k] = max(worst.get(k, -np.inf), dd)
    return worst


def envelope(body, clips, garments, cfg, passes=6, log=lambda *x: print(*x, flush=True)):
    """Skin each rigid ornament's pieces as one and widen them until no
    measured pose brings skin into them (`garmentFitMargin` clear)."""
    import multiprocessing as mp
    from penetration import CORNERS, face_points
    G = garments['meshes']
    names = [n for n in G if n.startswith('g-') and n.split('-')[1] in FORMS]
    margin = cfg['VILLAGER_ASSET']['garmentFitMargin']
    jidx, jw = top4(body['W'])
    label, out = {}, {}
    for n in names:
        label[n] = pieces(G[n]['tris'], len(G[n]['pos']))
        G[n]['W'] = one_blend(G[n]['W'], label[n])
        out[n] = radial(G[n]['pos'], label[n])
    base = {n: G[n]['pos'].copy() for n in names}
    spacing = cfg['VILLAGER_ASSET']['garmentFaceSpacing']
    state, best, frozen = {}, {}, set()
    for it in range(passes + 1):
        faces = {n: face_points(G[n]['tris'], G[n]['pos'], spacing) for n in names}
        plabel = {n: np.concatenate([label[n], label[n][faces[n][0][:, 0]]]) for n in names}
        _S.update(body=body, clips=clips, cfg=cfg, G=G, names=names, jidx=jidx, jw=jw,
                  skin={n: top4(G[n]['W']) for n in names}, faces=faces, plabel=plabel)
        worst = {}
        with mp.get_context('fork').Pool(max(1, min(len(CORNERS), 15))) as pool:
            for part in pool.imap(_corner, CORNERS):
                for k, d in part.items():
                    worst[k] = max(worst.get(k, -np.inf), d)
        # a piece a widening drove deeper (another body part folds into the
        # wider ring) goes back to its best width and widens no more
        reverted = False
        for k, d in worst.items():
            if k in frozen:
                continue
            if k in best and d > best[k][0]:
                state[k] = best[k][1]
                frozen.add(k)
                reverted = True
            else:
                best[k] = (d, state.get(k, 0.0))
        log(f'envelope pass {it + 1}: ' + ', '.join(f'{n[2:]}#{p} {d:+.4f}' for (n, p), d in sorted(worst.items())))
        if it == passes:
            break
        state, moved = inflate(state, {k: d for k, d in worst.items() if k not in frozen}, margin)
        if not moved and not reverted:
            break
        for n in names:
            grow = np.zeros(len(G[n]['pos']))
            for (m, p), v in state.items():
                if m == n:
                    grow[label[n] == p] = v
            G[n]['pos'] = base[n] + out[n] * grow[:, None]
    for k, (d, _w) in sorted(best.items()):
        if d > 0:
            log(f'envelope: {k[0]} piece {k[1]} stays {d:.4f} inside at its best width (a body part folds into it)')
    return garments


def selftest():
    """pieces/radial/one_blend/inflate on toy data (no Blender needed)."""
    # two triangles sharing an edge and one apart: two pieces
    assert pieces([[0, 1, 2], [1, 2, 3], [4, 5, 6]], 7).tolist() == [0, 0, 0, 0, 1, 1, 1]
    # a ring in the xz plane: radial is the in-plane direction, axis y ignored
    a = np.linspace(0, 2 * np.pi, 8, endpoint=False)
    ring = np.stack([np.cos(a), 0.3 + 0 * a, np.sin(a)], 1)
    r = radial(ring, np.zeros(8, int))
    assert np.allclose(r, ring - [0, 0.3, 0], atol=1e-9), r
    W = np.array([[1.0, 0, 0], [0, 1.0, 0]])
    assert np.allclose(one_blend(W, np.array([0, 0])), [[0.5, 0.5, 0], [0.5, 0.5, 0]])
    # widening only grows, by what the margin lacks; a clear piece stays
    s, moved = inflate({}, {'a': 0.01, 'b': -0.05}, 0.002)
    assert moved and abs(s['a'] - 0.012) < 1e-12 and 'b' not in s, s
    s, moved = inflate(s, {'a': -0.002, 'b': -0.05}, 0.002)
    assert not moved and abs(s['a'] - 0.012) < 1e-12, s
    print('envelope selftest: ok')
