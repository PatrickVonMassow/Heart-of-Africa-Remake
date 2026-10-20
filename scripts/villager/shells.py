"""Shell garments (stage 1 of docs/garment-merge-r9-1347.md): cloth that is the
body's own surface, offset along the body normal over a region of the body.

A region is a closed height interval on the rest height `y` with the arm
bones' summed weight `arm` <= 0.2 (body['region'], body.py). The body is cut
along every region's level sets before export (body.py `presplit`), so every
face lies inside or outside each region; each vertex carries a 32-bit region
word, a face carries a bit when all three corners do.

A worn shell draws the region's faces at offset (base + rank x step) x scale,
weights, normal and push copied from its source vertex. Faces under a worn
shell of higher rank are cut (the body's too), and at each of its boundary
rows the shell drops one rim strip from its own offset down to the surface
across the seam: the skin (0) or a lower worn shell's offset; a seam whose far
side stands as high or higher carries nothing from this side. The game builds
the same shells (src/render/villagerShell.ts) from the same words, rows,
ranks and offsets.
"""
import numpy as np

ARM_LEVEL = 0.2

# name, rank, region (lo, hi) as functions of the landmarks (garments.landmarks)
SHELLS = (
    ('g-trousers-waist', 2, lambda L: (hem(L), L['girdle'])),
    ('g-breastCloth-chest', 1, lambda L: (L['waist'] - 0.01 * L['H'], L['chestTop'])),
    ('g-neckBeads-neck', 1, lambda L: (L['neck'] - 0.008 * L['H'], L['neck'] + 0.002 * L['H'])),
    ('g-neckBeads-chest', 2, lambda L: (L['chestTop'] - 0.06 * L['H'], L['neck'] - 0.008 * L['H'])),
    ('g-waistBeads-waist', 3, lambda L: (L['hip'] + 0.013 * L['H'], L['hip'] + 0.027 * L['H'])),
)
NAMES = [n for n, _r, _f in SHELLS]
BIT = {n: k for k, n in enumerate(NAMES)}
RANK = {n: r for n, r, _f in SHELLS}


def hem(L):
    """The trousers' hem: half way from the knee to the ankle (both legs)."""
    return L['knee'] - 0.5 * (L['knee'] - L['ankle'])


def intervals(L):
    return {n: f(L) for n, _r, f in SHELLS}


def cuts(L):
    """The pre-split's level sets in order: (scalar, value, height interval or None)."""
    H = L['H']
    ys = [L['girdle'], L['hip'] + 0.013 * H, L['hip'] + 0.027 * H, hem(L), L['chestTop'], L['waist'] - 0.01 * H,
          L['chestTop'] - 0.06 * H, L['neck'] - 0.008 * H, L['neck'] + 0.002 * H]
    return [('y', y, None) for y in ys] + [('arm', ARM_LEVEL, (hem(L), L['neck'] + 0.002 * H))]


def region_words(region, L):
    """Per vertex its region word: bit k when the vertex satisfies shell k's predicate."""
    y, arm = region['y'], region['arm']
    out = np.zeros(len(y), np.uint32)
    for n, (lo, hi) in intervals(L).items():
        out |= np.where((y >= lo) & (y <= hi) & (arm <= ARM_LEVEL), np.uint32(1 << BIT[n]), np.uint32(0))
    return out


def face_masks(words, tris):
    """Per face the AND of its corners' words."""
    t = np.asarray(tris)
    return words[t[:, 0]] & words[t[:, 1]] & words[t[:, 2]]


def boundary_loops(tris, faces):
    """The boundary edges of the face set `faces`, directed as their face
    winds them and chained into closed loops of vertex indices."""
    t = np.asarray(tris)[np.asarray(faces, int)]
    count = {}
    for a, b, c in t:
        for p, q in ((a, b), (b, c), (c, a)):
            k = (min(p, q), max(p, q))
            count[k] = count.get(k, 0) + 1
    nxt = {}
    for a, b, c in t:
        for p, q in ((a, b), (b, c), (c, a)):
            if count[(min(p, q), max(p, q))] == 1:
                if int(p) in nxt:
                    raise ValueError(f'shell region: vertex {p} on two boundary edges (non-manifold boundary)')
                nxt[int(p)] = int(q)
    loops = []
    while nxt:
        start = min(nxt)
        loop = [start]
        v = nxt.pop(start)
        while v != start:
            loop.append(v)
            v = nxt.pop(v)
        loops.append(loop)
    return loops


def recipes(body, L, cfg):
    """The five shell entries of garments['meshes'] (no geometry: a recipe)."""
    a = cfg['VILLAGER_ASSET']
    fm = face_masks(body['region_bits'], body['tris'])
    out = {}
    for n in NAMES:
        faces = np.nonzero(fm & np.uint32(1 << BIT[n]))[0]
        out[n] = {'part': 'shell', 'bit': BIT[n], 'faces': faces, 'rows': boundary_loops(body['tris'], faces),
                  'rank': RANK[n], 'base': float(a.get('garmentShellBaseOverride', {}).get(n, a['garmentShellBase']))}
    return out


def offset(sh, step):
    return sh['base'] + sh['rank'] * step


def edge_faces(tris):
    """{(a, b) directed edge: face index}."""
    out = {}
    for f, (a, b, c) in enumerate(np.asarray(tris)):
        for p, q in ((a, b), (b, c), (c, a)):
            out[(int(p), int(q))] = f
    return out


def cut_body(fmask, worn_bits):
    """Per body face: drawn (no worn shell's bit in its mask)."""
    return (fmask & np.uint32(worn_bits)) == 0


def build(pos, tris, normals, fmask, shells, worn, step, scale=1.0, hidden=None, ef=None):
    """Every worn shell (`worn` names of `shells`, {name: recipe}) on the body
    `pos`/`tris` with vertex normals `normals` (body.vertex_normals over the
    full index): {name: {'src', 'pos', 'tris', 'rim' (per face), 'off'}}.
    `hidden` (per body vertex, the legacy worn garments' hide) cuts shell faces
    with three hidden sources and rim quads with two."""
    tris = np.asarray(tris)
    ef = ef if ef is not None else edge_faces(tris)
    worn = [n for n in worn if n in shells]
    off = {n: offset(shells[n], step) * scale for n in worn}
    above = {n: sum(1 << shells[o]['bit'] for o in worn if shells[o]['rank'] > shells[n]['rank']) for n in worn}
    bit = {n: np.uint32(1 << shells[n]['bit']) for n in worn}

    def drawn(n, f):
        return bool(fmask[f] & bit[n]) and not (fmask[f] & np.uint32(above[n]))

    out = {}
    for n in worn:
        faces = [f for f in np.nonzero(fmask & bit[n])[0] if not (fmask[f] & np.uint32(above[n]))]
        if hidden is not None:
            faces = [f for f in faces if not hidden[tris[f]].all()]
        srcs = sorted(set(tris[faces].ravel().tolist())) if faces else []
        at = {(s, off[n]): k for k, s in enumerate(srcs)}
        vsrc = list(srcs)
        voff = [off[n]] * len(srcs)
        ft = [[at[(int(v), off[n])] for v in tris[f]] for f in faces]
        rim = [False] * len(ft)

        def vert(s, o):
            if (s, o) not in at:
                at[(s, o)] = len(vsrc)
                vsrc.append(s)
                voff.append(o)
            return at[(s, o)]

        for loop in shells[n]['rows']:
            for i, a in enumerate(loop):
                b = loop[(i + 1) % len(loop)]
                inner = ef.get((a, b))
                if inner is None or not drawn(n, inner):
                    continue
                across = ef.get((b, a))
                far = 0.0
                if across is not None:
                    best = None
                    for o in worn:
                        if o != n and drawn(o, across) and (best is None or shells[o]['rank'] > shells[best]['rank']):
                            best = o
                    if best is not None:
                        far = off[best]
                if far >= off[n]:
                    continue
                if hidden is not None and hidden[a] and hidden[b]:
                    continue
                ah, bh, al, bl = vert(a, off[n]), vert(b, off[n]), vert(a, far), vert(b, far)
                ft += [[ah, al, bl], [ah, bl, bh]]
                rim += [True, True]
        vsrc = np.array(vsrc, int)
        o = np.array(voff, float)
        out[n] = {'src': vsrc, 'off': o, 'pos': pos[vsrc] + o[:, None] * normals[vsrc] if len(vsrc) else np.zeros((0, 3)),
                  'tris': np.array(ft, int).reshape(-1, 3), 'rim': np.array(rim, bool)}
    return out


def far_surfaces(tris, fmask, shells, worn, ef=None):
    """Per worn shell and boundary loop the set of far surfaces its drawn row
    edges see ('skin' or a shell name); stage 1 has one per loop."""
    ef = ef if ef is not None else edge_faces(tris)
    worn = [n for n in worn if n in shells]
    above = {n: sum(1 << shells[o]['bit'] for o in worn if shells[o]['rank'] > shells[n]['rank']) for n in worn}

    def drawn(n, f):
        return bool(fmask[f] & np.uint32(1 << shells[n]['bit'])) and not (fmask[f] & np.uint32(above[n]))

    out = {}
    for n in worn:
        per = []
        for loop in shells[n]['rows']:
            seen = set()
            for i, a in enumerate(loop):
                b = loop[(i + 1) % len(loop)]
                inner = ef.get((a, b))
                if inner is None or not drawn(n, inner):
                    seen.add('covered')
                    continue
                across = ef.get((b, a))
                best = None
                for o in worn:
                    if across is not None and o != n and drawn(o, across) and (best is None or shells[o]['rank'] > shells[best]['rank']):
                        best = o
                seen.add(best or 'skin')
            per.append(seen)
        out[n] = per
    return out


def check_regions(body, shells, log=print):
    """The region predicates on the real body (round-8 B2): no face carrying a
    bit has a corner with arm > 0.2, each contour corner lies on a boundary
    loop, each region is one connected component; trousers and waist band
    have arm == 0 everywhere; waist band and both collars have two loops.
    Returns the failures (empty when every predicate holds)."""
    arm = body['region']['arm']
    tris = np.asarray(body['tris'])
    bad = []
    for n, sh in shells.items():
        f = np.asarray(sh['faces'], int)
        if not len(f):
            bad.append(f'{n}: empty region')
            continue
        v = np.unique(tris[f])
        if (arm[v] > ARM_LEVEL).any():
            bad.append(f'{n}: {int((arm[v] > ARM_LEVEL).sum())} corners with arm > {ARM_LEVEL}')
        on = set(x for loop in sh['rows'] for x in loop)
        contour = [int(x) for x in v if arm[x] == ARM_LEVEL]
        off_loop = [x for x in contour if x not in on]
        if off_loop:
            bad.append(f'{n}: {len(off_loop)} contour corners off every boundary loop')
        if components(tris[f]) != 1:
            bad.append(f'{n}: {components(tris[f])} connected components')
        if n in ('g-trousers-waist', 'g-waistBeads-waist') and (arm[v] != 0).any():
            bad.append(f'{n}: {int((arm[v] != 0).sum())} corners with arm != 0')
        if n in ('g-waistBeads-waist', 'g-neckBeads-neck', 'g-neckBeads-chest') and len(sh['rows']) != 2:
            bad.append(f'{n}: {len(sh["rows"])} boundary loops (two expected)')
        log(f'[shells] {n}: {len(f)} faces, {len(v)} vertices, {len(sh["rows"])} loops')
    for b in bad:
        log(f'[shells] REGION CHECK: {b}')
    return bad


def components(t):
    """Edge-connected components of a face set (union-find over vertices)."""
    par = {}

    def find(x):
        while par.setdefault(x, x) != x:
            par[x] = par[par[x]]
            x = par[x]
        return x

    for a, b, c in t:
        ra, rb, rc = find(int(a)), find(int(b)), find(int(c))
        par[rb] = ra
        par[find(rc)] = ra
    return len({find(x) for x in par})


# ---- selftests (no Blender needed) -------------------------------------------------


def _tube(nx, ny):
    """A closed tube round the y axis (normals outward), vertex (i, j) at
    angle i / nx round and height j: bands of it are annuli, as on the body."""
    a = 2 * np.pi * np.arange(nx) / nx
    pos = np.array([[np.cos(t), j, -np.sin(t)] for j in range(ny + 1) for t in a])
    vid = lambda i, j: j * nx + (i % nx)  # noqa: E731
    tris = []
    for j in range(ny):
        for i in range(nx):
            p, q, r, s = vid(i, j), vid(i + 1, j), vid(i + 1, j + 1), vid(i, j + 1)
            tris += [[p, q, r], [p, r, s]]
    return pos, np.array(tris), vid


def _rim_quads(g):
    """{undirected source edge: [(shell, inner offset)]} of the rim strips built."""
    quads = {}
    for n, x in g.items():
        rt = x['tris'][x['rim']]
        for k in range(0, len(rt), 2):
            ah, al, bl = rt[k]
            e = (min(x['src'][ah], x['src'][bl]), max(x['src'][ah], x['src'][bl]))
            quads.setdefault(e, []).append((n, round(float(x['off'][al]), 9)))
    return quads


def selftest():
    from body import vertex_normals
    nx = 8
    pos, tris, vid = _tube(nx, 8)
    nrm = vertex_normals(pos, tris)
    assert (np.einsum('ij,ij->i', nrm[:, [0, 2]], pos[:, [0, 2]]) > 0).all()
    y = pos[:, 1]
    # A rank 1 on rows 0..6; B rank 2 nested inside it on 2..4; C rank 3 abutting it on 6..8
    words = (np.where(y <= 6, 1, 0) | np.where((y >= 2) & (y <= 4), 2, 0) | np.where(y >= 6, 4, 0)).astype(np.uint32)
    fm = face_masks(words, tris)
    assert (fm == (words[tris[:, 0]] & words[tris[:, 1]] & words[tris[:, 2]])).all()
    sh = {}
    for n, bit, rank in (('A', 0, 1), ('B', 1, 2), ('C', 2, 3)):
        faces = np.nonzero(fm & np.uint32(1 << bit))[0]
        sh[n] = {'bit': bit, 'rank': rank, 'base': 0.1, 'faces': faces, 'rows': boundary_loops(tris, faces)}
        assert len(sh[n]['rows']) == 2 and all(len(r) == nx for r in sh[n]['rows'])
        assert components(tris[faces]) == 1
    # rows chained from the region face set, in the region's winding
    assert sorted(sh['B']['rows'][0]) == [vid(i, 2) for i in range(nx)]
    step, scale = 0.1, 2.0
    g = build(pos, tris, nrm, fm, sh, ['A', 'B', 'C'], step, scale=scale)
    off = {'A': 0.4, 'B': 0.6, 'C': 0.8}
    for n, x in g.items():
        face = ~np.isin(np.arange(len(x['src'])), np.unique(x['tris'][x['rim']])) | np.isclose(x['off'], off[n])
        top = np.isclose(x['off'], off[n])
        # the offset along the source normal, scaled
        assert np.allclose(x['pos'][top], pos[x['src'][top]] + off[n] * nrm[x['src'][top]])
        assert face.any()
    # cut rule: A is cut under B (rank 2) and not by C; B and C are whole; nothing cut by a lower rank
    assert (~g['A']['rim']).sum() == len(sh['A']['faces']) - len(sh['B']['faces'])
    assert (~g['B']['rim']).sum() == len(sh['B']['faces'])
    assert (~g['C']['rim']).sum() == len(sh['C']['faces'])
    assert cut_body(fm, 7).sum() == 0 and cut_body(fm, 2).sum() == len(tris) - len(sh['B']['faces'])
    # rims (B1): every seam edge carries exactly one quad, owned by the higher
    # side, its inner row at the far surface's offset; skin rows close to zero
    quads = _rim_quads(g)
    row = lambda j: [(min(vid(i, j), vid(i + 1, j)), max(vid(i, j), vid(i + 1, j))) for i in range(nx)]  # noqa: E731
    want = {0: [('A', 0.0)], 2: [('B', 0.4)], 4: [('B', 0.4)], 6: [('C', 0.4)], 8: [('C', 0.0)]}
    for j, w in want.items():
        for e in row(j):
            assert quads.get(e) == w, (j, e, quads.get(e))
    assert sum(len(v) for v in quads.values()) == nx * len(want)
    # the strip's inner row coincides with the lower shell's edge vertices
    ka = {(int(s_), round(float(o), 9)) for s_, o in zip(g['A']['src'], g['A']['off'])}
    for n in ('B', 'C'):
        for t in g[n]['tris'][g[n]['rim']]:
            for v in t:
                o = round(float(g[n]['off'][v]), 9)
                if 0 < o < off[n]:
                    assert (int(g[n]['src'][v]), o) in ka
    # one far surface per loop
    fs = far_surfaces(tris, fm, sh, ['A', 'B', 'C'])
    assert fs == {'A': [{'skin'}, {'C'}], 'B': [{'A'}, {'A'}], 'C': [{'A'}, {'skin'}]}, fs
    # alone, A closes to the skin on both of its rows
    g1 = build(pos, tris, nrm, fm, sh, ['A'], step)
    assert g1['A']['rim'].sum() == 2 * 2 * nx and np.isclose(g1['A']['off'].min(), 0.0)
    # hidden-source rule: faces with three hidden sources, rim quads with two
    hidden = np.zeros(len(pos), bool)
    hidden[[vid(i, 0) for i in range(nx)] + [vid(i, 1) for i in range(nx)]] = True
    gh = build(pos, tris, nrm, fm, sh, ['A'], step, hidden=hidden)
    assert (~gh['A']['rim']).sum() == len(sh['A']['faces']) - 2 * nx
    assert gh['A']['rim'].sum() == g1['A']['rim'].sum() - 2 * nx
    print('shells selftest: ok')
