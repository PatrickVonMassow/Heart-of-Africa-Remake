"""Step: write public/models/villager.glb.

One skeleton of nodes named after the villager bones ('.' → '_', which three's
PropertyBinding would strip), identity rest rotations, the body as a skinned
mesh with its morph targets (POSITION only, sparse where a target moves few
vertices; names in mesh.extras.targetNames — the game bakes the fixed sex, age
and build morphs per figure on load and recomputes the normals, leaving only the
closing hands as live morphs), every garment as a skinned mesh on the same skin with
the same morph targets, the garment cover mask (mask.py) as attribute _COVER
with its garment order in scene.extras.villager.garmentMask, the clips as animations (bone rotations, hips
translation), and the runtime metadata in scene.extras.villager: the joints'
morph deltas, the feet's contact points, each clip's natural ground speed and
tool grip. src/render/villagerAsset.ts reads it.
"""
import numpy as np

import skeleton as SK
from body import MORPHS, top4, vertex_normals
from gltfio import GlbWriter

FLOAT, U8, U16, U32 = 5126, 5121, 5123, 5125
# A garment's morph delta below this (figure units, ≈ 0.25 mm) is left out of
# the file: far under the garments' fit margin, and it keeps the shipped file
# small (the hand-closing morphs barely touch any garment).
GARMENT_MORPH_EPS = 2e-4


def unit_shorts(jw):
    """Weights as normalized unsigned shorts summing to exactly 65535 (the
    rounding remainder on each vertex's largest weight)."""
    q = np.round(jw * 65535).astype(np.int64)
    top = q.argmax(1)
    q[np.arange(len(q)), top] += 65535 - q.sum(1)
    return q.astype(np.uint16)


def node_name(b):
    return b.replace('.', '_')


def add_skinned_mesh(w, name, pos, tris, W, morphs, skin, parent_list, normals=True, extra_attrs=None, extras=None, cover=None, compact=False,
                     region=None):
    """`compact` (the garments): weights as normalized unsigned shorts, morph
    deltas as normalized shorts with those under GARMENT_MORPH_EPS left out
    — the game reads no file normal of a garment (it recomputes them after
    baking the morphs)."""
    jidx, jw = top4(W)
    attrs = {
        'POSITION': w.accessor(pos.astype(np.float32), FLOAT, 'VEC3', target=34962, minmax=True),
        'JOINTS_0': w.accessor(jidx.astype(np.uint8), U8, 'VEC4', target=34962),
        'WEIGHTS_0': (w.accessor(unit_shorts(jw), U16, 'VEC4', target=34962, normalized=True) if compact
                      else w.accessor(jw.astype(np.float32), FLOAT, 'VEC4', target=34962)),
    }
    n0 = vertex_normals(pos, tris)
    if normals:
        attrs['NORMAL'] = w.accessor(n0.astype(np.float32), FLOAT, 'VEC3', target=34962)
    for k, v in (extra_attrs or {}).items():
        kind = 'SCALAR' if v.ndim == 1 else 'VEC2' if v.shape[1] == 2 else 'VEC3' if v.shape[1] == 3 else 'VEC4'
        attrs[k] = w.accessor(v.astype(np.float32), FLOAT, kind, target=34962)
    if cover is not None:
        # the garment cover mask (mask.py): hide lo, hide hi, push lo, push hi
        attrs['_COVER'] = w.accessor(np.asarray(cover, np.uint16), U16, 'VEC4', target=34962)
    if region is not None:
        # the shell regions' words (shells.py): bits 0-15, bits 16-31, 0, 0
        r = np.asarray(region, np.uint32)
        attrs['_REGION'] = w.accessor(np.stack([r & 0xFFFF, r >> 16, 0 * r, 0 * r], 1).astype(np.uint16), U16, 'VEC4', target=34962)
    targets = []
    for m in MORPHS:
        d = morphs[m]
        t = {'POSITION': w.sparse_accessor(d.astype(np.float32), eps=GARMENT_MORPH_EPS if compact else 1e-6, quantize=compact)}
        targets.append(t)
    idx = w.accessor(tris.reshape(-1).astype(np.uint16 if len(pos) < 65536 else np.uint32), U16 if len(pos) < 65536 else U32, 'SCALAR', target=34963)
    mesh = {'name': name, 'primitives': [{'attributes': attrs, 'indices': idx, 'targets': targets, 'material': 0}],
            'weights': [0.0] * len(MORPHS), 'extras': {'targetNames': MORPHS, **(extras or {})}}
    w.j['meshes'].append(mesh)
    ni = w.node({'name': name, 'mesh': len(w.j['meshes']) - 1, 'skin': skin})
    parent_list.append(ni)
    return ni


def write_clip(w, name, clip, bone_nodes):
    times = clip['times'].astype(np.float32)
    inp = w.accessor(times[:, None], FLOAT, 'SCALAR', minmax=True)
    samplers, channels = [], []
    for b in SK.NAMES:
        q = clip['q'][:, SK.INDEX[b]].astype(np.float32)
        samplers.append({'input': inp, 'output': w.accessor(q, FLOAT, 'VEC4'), 'interpolation': 'LINEAR'})
        channels.append({'sampler': len(samplers) - 1, 'target': {'node': bone_nodes[b], 'path': 'rotation'}})
    hp = clip['hips'].astype(np.float32)
    samplers.append({'input': inp, 'output': w.accessor(hp, FLOAT, 'VEC3'), 'interpolation': 'LINEAR'})
    channels.append({'sampler': len(samplers) - 1, 'target': {'node': bone_nodes['hips'], 'path': 'translation'}})
    w.j['animations'].append({'name': name, 'samplers': samplers, 'channels': channels})


def export(path, mh, body, clips, garments, cfg, mask=None):
    w = GlbWriter()
    w.j['materials'].append({'name': 'villager', 'pbrMetallicRoughness': {'baseColorFactor': [0.4, 0.27, 0.18, 1], 'metallicFactor': 0, 'roughnessFactor': 0.85}})
    j = body['joints']
    heads = j[:, :3]
    bone_nodes = {}
    for b in SK.NAMES:
        p = SK.PARENT[b]
        t = heads[SK.INDEX[b]] - (heads[SK.INDEX[p]] if p else 0)
        bone_nodes[b] = w.node({'name': node_name(b), 'translation': [float(x) for x in t]})
    for b in SK.NAMES:
        kids = [bone_nodes[c] for c in SK.NAMES if SK.PARENT[c] == b]
        if kids:
            w.j['nodes'][bone_nodes[b]]['children'] = kids
    # Inverse bind matrices: identity rotation, translation −head (column-major).
    ibm = np.zeros((len(SK.NAMES), 16), np.float32)
    for i in range(len(SK.NAMES)):
        m = np.eye(4)
        m[:3, 3] = -heads[i]
        ibm[i] = m.T.reshape(-1)
    skin = {'joints': [bone_nodes[b] for b in SK.NAMES], 'skeleton': bone_nodes['hips'],
            'inverseBindMatrices': w.accessor(ibm, FLOAT, 'MAT4')}
    w.j['skins'].append(skin)
    roots = [bone_nodes['hips']]
    add_skinned_mesh(w, 'body', body['pos'], body['tris'], body['W'], body['morph_pos'], 0, roots, extras={'part': 'skin'},
                     cover=None if mask is None else mask['body'], region=body.get('region_bits'))
    shells = {}
    for name, g in (garments or {}).get('meshes', {}).items():
        if g.get('part') == 'shell':
            # a shell garment ships as its recipe (shells.py): the game builds
            # it on the drawn body from the region words, rows, rank and base
            shells[name] = g
            continue
        # the infant's head in a baby sling (garments.py babySling: uv v ≥ 2),
        # painted in the infant's skin by the game
        infant = np.asarray(g['uv'])[:, 1] >= 2 if (g.get('extras') or {}).get('form') == 'babySling' else None
        add_skinned_mesh(w, name, g['pos'], g['tris'], g['W'], g['morph_pos'], 0, roots, extras={'part': g.get('part', 'garment'), **g.get('extras', {})},
                         cover=None if mask is None else mask['inner'].get(name),
                         extra_attrs=None if infant is None else {'_INFANT': infant.astype(np.float32)}, normals=False, compact=True)
    clip_meta = {}
    for name, c in (clips or {}).get('clips', {}).items():
        if name not in EXPORT_CLIPS:
            continue
        write_clip(w, name, c, bone_nodes)
        clip_meta[name] = {k: c[k] for k in ('duration', 'kind', 'source') if k in c}
        for k in ('speed', 'phase0', 'strike'):
            if k in c:
                clip_meta[name][k] = float(c[k])
        for k in ('tool', 'grip', 'contacts', 'phases'):
            if k in c:
                clip_meta[name][k] = c[k]
    meta = {
        'bones': SK.NAMES,
        'parents': {b: SK.PARENT[b] for b in SK.NAMES},
        'morphs': MORPHS,
        'jointDeltas': {m: {b: [float(x) for x in body['joint_deltas'][m][SK.INDEX[b], :3]] for b in SK.NAMES} for m in MORPHS},
        'tails': {b: [float(x) for x in j[SK.INDEX[b], 3:]] for b in SK.NAMES},
        'contactPoints': {s: {k: [float(x) for x in v] for k, v in d.items()} for s, d in (clips or {}).get('contact_points', {}).items()},
        'clips': clip_meta,
        'stature': cfg['VILLAGER_ASSET']['stature'],
        'toolHold': tool_hold(body),
    }
    if garments:
        meta['garments'] = garments.get('meta', {})
    if mask is not None:
        meta['garmentMask'] = {'garments': list(mask['garments'])}
    if shells:
        order = sorted(shells, key=lambda n: shells[n]['bit'])
        meta['shells'] = {
            'step': float(cfg['VILLAGER_ASSET']['garmentShellStep']),
            'bits': order,
            'garments': {n: {'bit': int(shells[n]['bit']), 'rank': int(shells[n]['rank']), 'base': float(shells[n]['base']),
                             'rows': [[int(v) for v in loop] for loop in shells[n]['rows']]} for n in order},
        }
    w.j['scenes'][0]['nodes'] = roots
    w.j['scenes'][0]['extras'] = {'villager': meta}
    w.write(path)
    print(f'export: {path} — {len(w.bin) / 1024:.0f} KiB binary, {len(w.j["meshes"])} meshes, {len(w.j["animations"])} clips')
    if shells:
        check_shells(w.j, len(body['pos']), list(shells))


def check_shells(j, nbody, names):
    """The written file holds every shell as extras, the body's _REGION of the
    body's vertex count, and no shell mesh (round-8 B1)."""
    meta = j['scenes'][0]['extras']['villager']['shells']
    assert sorted(meta['garments']) == sorted(names), meta['garments'].keys()
    assert meta['bits'] == sorted(names, key=lambda n: meta['garments'][n]['bit'])
    meshes = {m['name']: m for m in j['meshes']}
    assert not set(names) & set(meshes), set(names) & set(meshes)
    acc = j['accessors'][meshes['body']['primitives'][0]['attributes']['_REGION']]
    assert acc['count'] == nbody, (acc['count'], nbody)
    print(f'export: {len(names)} shells as extras, _REGION on {nbody} body vertices')


def tool_hold(body):
    """Per hand: the tool's axes in the hand bone's frame (as a quaternion)
    and where the shaft passes through the closed fist."""
    import toolclips as T
    out = {}
    for s in ('L', 'R'):
        q = T._mat_quat(T.grip_rotation(body, s, True))
        out[s] = {'rotation': [float(x) for x in q], 'offset': [float(x) for x in T.grip_offset(body, s)]}
    return out


EXPORT_CLIPS = ('idle', 'walk', 'jog', 'sprint', 'kneelDown', 'kneel', 'kneelUp', 'dig', 'carry', 'carryIdle')
