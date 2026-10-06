"""Step 3b: fit the dress to the motion — the garments, built round the body
in one design pose (garments.py), are posed through every exported clip at
every body corner (the same frames, corners and skinning the penetration
report measures), and wherever a garment vertex comes closer to the skinned
body than `garmentFitMargin` — or lies inside it — the push that would clear
it is taken back into the rest pose through the inverse of that vertex's own
bone blend. Per vertex the largest push over all frames is kept, spread a
little onto its neighbours (no spike in the cloth), and added to the rest
position; the morphs keep their deltas, so every corner moves with it. Passes
repeat until no frame asks for a push.
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


def fit(body, clips, garments, cfg, passes=6, stride=2, log=print):
    from mathutils.bvhtree import BVHTree
    margin = cfg['VILLAGER_ASSET']['garmentFitMargin']
    jidx, jw = top4(body['W'])
    names = [n for n in garments['meshes'] if n.startswith('g-')]
    G = garments['meshes']
    skin = {n: top4(G[n]['W']) for n in names}
    topo = {n: neighbours(len(G[n]['pos']), G[n]['tris'], G[n]['pos']) for n in names}
    for it in range(passes):
        push = {n: np.zeros_like(G[n]['pos']) for n in names}
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
                        A = np.einsum('vk,vkij->vij', gw[bad], R[gi[bad]])
                        d = np.linalg.solve(A, (nrm[bad] * (margin - s[bad])[:, None])[..., None])[..., 0]
                        P = push[n]
                        take = np.einsum('ij,ij->i', d, d) > np.einsum('ij,ij->i', P[bad], P[bad])
                        P[bad[take]] = d[take]
        moved = 0
        for n in names:
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
    return garments
