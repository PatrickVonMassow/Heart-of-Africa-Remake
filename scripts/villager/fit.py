"""Step 3b: fit the dress to the motion — the garments, built round the body
in one design pose (garments.py), are posed through the exported clips at
every body corner (the frames, corners and skinning the penetration report
measures), and wherever a garment vertex comes closer to the skinned body
than `garmentFitMargin` — or lies inside it — the push that would clear it is
taken back into the rest pose through the transpose of that vertex's bone
blend, at most `garmentFitStep` per pass. Per vertex the largest push over
the frames is kept, spread a little onto its neighbours (no spike in the
cloth), and added to the rest position; the morphs keep their deltas, so
every corner moves with it. A pass that leaves a garment deeper than before
is undone for that garment, and the shallowest state is kept.

Measured 06.10.2026: this lowers most garments' deepest point but cannot
reach the tolerance. A static rest offset cannot follow a pose — a skirt's
front stays where a lifted knee needs it gone, and cloth caught between two
body parts (between the legs, under the arm) is pushed from one into the
other — so the passes oscillate instead of converging.
OPEN: zero penetration needs pose-driven correction (e.g. corrective morphs
driven by the leg and arm angles, evaluated alike here and in the game).
"""
import numpy as np

import rig
from body import top4
from export import EXPORT_CLIPS
from gltfio import qmat
from sheets import corner_weights, morphed


def garment_pos(g, weights):
    p = g['pos'].copy()
    for m, w in weights.items():
        if w:
            p += w * g['morph_pos'][m]
    return p


def nearest(tree, pts):
    """Nearest surface point and its normal for every point."""
    co = np.empty_like(pts)
    nrm = np.empty_like(pts)
    for k, p in enumerate(pts.tolist()):
        c, n, _i, _d = tree.find_nearest(p)
        co[k] = c
        nrm[k] = n
    return co, nrm


def neighbours(n, tris, verts):
    """Each vertex's ring, vertices on the same spot (a uv seam) counted as one."""
    nb = [set() for _ in range(n)]
    for a, b, c in tris:
        nb[a].update((b, c))
        nb[b].update((a, c))
        nb[c].update((a, b))
    key = {}
    for i, p in enumerate(np.round(verts, 6)):
        key.setdefault(tuple(p), []).append(i)
    for group in key.values():
        if len(group) > 1:
            u = set().union(*(nb[i] for i in group))
            for i in group:
                nb[i] = u | set(group)
    for i in range(n):
        nb[i].discard(i)
    return [np.array(sorted(s), int) for s in nb], [g for g in key.values() if len(g) > 1]


def spread(D, nb, twins, rounds=2):
    """Every vertex keeps at least its own push; its neighbours take part of it."""
    out = D.copy()
    for _ in range(rounds):
        mag = np.linalg.norm(out, axis=1)
        nxt = out.copy()
        for i in range(len(out)):
            if len(nb[i]) == 0:
                continue
            m = mag[nb[i]]
            k = nb[i][np.argmax(m)]
            cand = 0.5 * out[k]
            if np.linalg.norm(cand) > mag[i]:
                nxt[i] = cand
        out = nxt
    for g in twins:
        out[g] = out[g][np.argmax(np.linalg.norm(out[g], axis=1))]
    return out


def corners():
    from penetration import CORNERS
    return CORNERS


def fit(body, clips, garments, cfg, passes=6, stride=2, log=lambda *x: print(*x, flush=True)):
    from mathutils.bvhtree import BVHTree
    margin = cfg['VILLAGER_ASSET']['garmentFitMargin']
    jidx, jw = top4(body['W'])
    names = [n for n in garments['meshes'] if n.startswith('g-')]
    G = garments['meshes']
    skin = {n: top4(G[n]['W']) for n in names}
    topo = {n: neighbours(len(G[n]['pos']), G[n]['tris'], G[n]['pos']) for n in names}
    step = cfg['VILLAGER_ASSET']['garmentFitStep']
    best = {n: (np.inf, G[n]['pos'].copy()) for n in names}
    for it in range(passes):
        push = {n: np.zeros_like(G[n]['pos']) for n in names}
        deep = {n: 0.0 for n in names}
        worst = 0.0
        for (sex, age, build) in corners():
            w = corner_weights(sex, age, build)
            pos, j = morphed(body, w)
            gpos = {n: garment_pos(G[n], w) for n in names}
            for cname in EXPORT_CLIPS:
                c = clips['clips'][cname]
                for f in range(it % stride, len(c['times']), stride):
                    wr, wp = rig.fk(j, c['q'][f], c['hips'][f])
                    bv = rig.skin(pos, jidx, jw, j, wr, wp)
                    tree = BVHTree.FromPolygons(bv.tolist(), body['tris'].tolist(), all_triangles=True)
                    R = np.array([qmat(q) for q in wr])
                    for n in names:
                        gi, gw = skin[n]
                        gv = rig.skin(gpos[n], gi, gw, j, wr, wp)
                        co, nrm = nearest(tree, gv)
                        s = np.einsum('ij,ij->i', gv - co, nrm)
                        bad = np.nonzero(s < margin)[0]
                        if not len(bad):
                            continue
                        worst = max(worst, float(-s[bad].min()))
                        # back into the rest pose through the transpose of the
                        # vertex's bone blend (its inverse for one bone; never
                        # the blow-up a near-singular blend's inverse gives)
                        A = np.einsum('vk,vkij->vij', gw[bad], R[gi[bad]])
                        u = np.einsum('vji,vj->vi', A, nrm[bad])
                        un = np.maximum(np.linalg.norm(u, axis=1), 0.5)
                        d = u / un[:, None] * np.minimum(margin - s[bad], step)[:, None]
                        P = push[n]
                        deep[n] = max(deep[n], float(-s[bad].min()))
                        take = np.einsum('ij,ij->i', d, d) > np.einsum('ij,ij->i', P[bad], P[bad])
                        P[bad[take]] = d[take]
        moved = 0
        for n in names:
            # a pass that made a garment worse is undone, and the garment rests
            if deep[n] <= best[n][0]:
                best[n] = (deep[n], G[n]['pos'].copy())
            else:
                G[n]['pos'] = best[n][1].copy()
                continue
            D = push[n]
            if not D.any():
                continue
            nb, twins = topo[n]
            D = spread(D, nb, twins)
            G[n]['pos'] = G[n]['pos'] + D
            moved += int((np.abs(D).sum(1) > 0).sum())
        log(f'fit pass {it + 1}: deepest {worst:.4f}, {moved} vertices pushed')
        if not moved:
            break
    for n in names:
        G[n]['pos'] = best[n][1]
    return garments
