"""Minimal glTF 2.0 reading and writing for the villager pipeline (numpy only).

Reading: accessors as numpy arrays, node TRS, skins and animations sampled at any
time. Writing: a .glb with ONE skeleton of nodes whose rest rotation is the
identity (the convention the game's bones use — figureRig.ts poses bones from an
identity rest), skinned meshes with morph targets (sparse where a target moves
few vertices), and rotation/translation animation channels.
"""
import json
import struct

import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


class Gltf:
    def __init__(self, path):
        if path.endswith('.glb'):
            data = open(path, 'rb').read()
            n = struct.unpack('<I', data[12:16])[0]
            self.j = json.loads(data[20:20 + n])
            off = 20 + n
            bn = struct.unpack('<I', data[off:off + 4])[0]
            self.buffers = [data[off + 8:off + 8 + bn]]
        else:
            import os
            self.j = json.load(open(path))
            base = os.path.dirname(path)
            self.buffers = [open(os.path.join(base, b['uri']), 'rb').read() for b in self.j['buffers']]
        self.names = [n.get('name', f'node{i}') for i, n in enumerate(self.j['nodes'])]
        self.parent = [-1] * len(self.j['nodes'])
        for i, n in enumerate(self.j['nodes']):
            for c in n.get('children', []):
                self.parent[c] = i

    def accessor(self, k):
        a = self.j['accessors'][k]
        n = NC[a['type']]
        dt = CT[a['componentType']]
        count = a['count']
        out = np.zeros((count, n), dtype=dt)
        if 'bufferView' in a:
            bv = self.j['bufferViews'][a['bufferView']]
            buf = self.buffers[bv.get('buffer', 0)]
            start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
            stride = bv.get('byteStride', 0)
            isz = np.dtype(dt).itemsize * n
            if stride and stride != isz:
                raw = np.frombuffer(buf, dtype=np.uint8, count=stride * (count - 1) + isz, offset=start)
                out = np.stack([np.frombuffer(raw[i * stride:i * stride + isz].tobytes(), dtype=dt) for i in range(count)])
            else:
                out = np.frombuffer(buf, dtype=dt, count=count * n, offset=start).reshape(count, n).copy()
        if a.get('normalized'):
            out = out.astype(np.float64) / float(np.iinfo(dt).max)
        return out.astype(np.float64) if dt == np.float32 else out

    def trs(self, i):
        n = self.j['nodes'][i]
        t = np.array(n.get('translation', [0, 0, 0]), float)
        r = np.array(n.get('rotation', [0, 0, 0, 1]), float)
        s = np.array(n.get('scale', [1, 1, 1]), float)
        return t, r, s

    def node_index(self, name):
        return self.names.index(name)

    def animation(self, name):
        for a in self.j['animations']:
            if a['name'] == name:
                return a
        raise KeyError(name)

    def sample(self, anim, t):
        """{node: {'translation'|'rotation'|'scale': value}} at time t (linear / slerp)."""
        out = {}
        for ch in anim['channels']:
            s = anim['samplers'][ch['sampler']]
            times = self._cache(s['input'])[:, 0]
            vals = self._cache(s['output'])
            path = ch['target']['path']
            if path == 'weights':
                continue
            if t <= times[0]:
                v = vals[0]
            elif t >= times[-1]:
                v = vals[len(times) - 1]
            else:
                k = int(np.searchsorted(times, t) - 1)
                f = (t - times[k]) / max(1e-9, times[k + 1] - times[k])
                if s.get('interpolation', 'LINEAR') == 'STEP':
                    v = vals[k]
                elif path == 'rotation':
                    v = qslerp(vals[k], vals[k + 1], f)
                else:
                    v = vals[k] * (1 - f) + vals[k + 1] * f
            out.setdefault(ch['target']['node'], {})[path] = np.array(v, float)
        return out

    def duration(self, anim):
        return max(float(self._cache(anim['samplers'][c['sampler']]['input'])[-1, 0]) for c in anim['channels'])

    _acc = None

    def _cache(self, k):
        if self._acc is None:
            self._acc = {}
        if k not in self._acc:
            self._acc[k] = self.accessor(k)
        return self._acc[k]


# ---- quaternion helpers (x, y, z, w) -------------------------------------------


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return np.array([
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ])


def qinv(q):
    return np.array([-q[0], -q[1], -q[2], q[3]]) / np.dot(q, q)


def qnorm(q):
    return q / np.linalg.norm(q)


def qrot(q, v):
    p = np.array([v[0], v[1], v[2], 0.0])
    return qmul(qmul(q, p), qinv(q))[:3]


def qslerp(a, b, t):
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    d = np.dot(a, b)
    if d < 0:
        b = -b
        d = -d
    if d > 0.9995:
        return qnorm(a + (b - a) * t)
    th = np.arccos(min(1.0, d))
    s = np.sin(th)
    return (np.sin((1 - t) * th) * a + np.sin(t * th) * b) / s


def qfrom_to(u, v):
    """The shortest rotation taking direction u onto direction v."""
    u = u / np.linalg.norm(u)
    v = v / np.linalg.norm(v)
    d = float(np.dot(u, v))
    if d < -0.999999:
        ax = np.cross([1, 0, 0], u)
        if np.linalg.norm(ax) < 1e-6:
            ax = np.cross([0, 1, 0], u)
        ax /= np.linalg.norm(ax)
        return np.array([ax[0], ax[1], ax[2], 0.0])
    c = np.cross(u, v)
    return qnorm(np.array([c[0], c[1], c[2], 1 + d]))


def qaxis(axis, angle):
    axis = np.asarray(axis, float) / np.linalg.norm(axis)
    s = np.sin(angle / 2)
    return np.array([axis[0] * s, axis[1] * s, axis[2] * s, np.cos(angle / 2)])


def qmat(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def world_pose(parents, local_t, local_r):
    """World rotations and positions from local TRS (parents before children)."""
    n = len(parents)
    wr = [None] * n
    wt = [None] * n
    for i in range(n):
        p = parents[i]
        if p < 0:
            wr[i] = local_r[i]
            wt[i] = np.asarray(local_t[i], float)
        else:
            wr[i] = qnorm(qmul(wr[p], local_r[i]))
            wt[i] = wt[p] + qrot(wr[p], local_t[i])
    return wt, wr


# ---- writing ------------------------------------------------------------------


class GlbWriter:
    def __init__(self):
        self.j = {'asset': {'version': '2.0', 'generator': 'hoa scripts/villager'}, 'scene': 0, 'scenes': [{'nodes': []}],
                  'nodes': [], 'meshes': [], 'skins': [], 'accessors': [], 'bufferViews': [], 'buffers': [], 'animations': [],
                  'materials': []}
        self.bin = bytearray()

    def _view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin.extend(data)
        bv = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target:
            bv['target'] = target
        self.j['bufferViews'].append(bv)
        return len(self.j['bufferViews']) - 1

    def accessor(self, arr, ctype, atype, target=None, minmax=False, normalized=False):
        arr = np.ascontiguousarray(arr)
        dt = CT[ctype]
        data = arr.astype(dt).tobytes()
        acc = {'bufferView': self._view(data, target), 'componentType': ctype, 'count': int(arr.shape[0]), 'type': atype}
        if normalized:
            acc['normalized'] = True
        if minmax:
            a2 = arr.reshape(arr.shape[0], -1)
            acc['min'] = [float(x) for x in a2.min(0)]
            acc['max'] = [float(x) for x in a2.max(0)]
        self.j['accessors'].append(acc)
        return len(self.j['accessors']) - 1

    def sparse_accessor(self, delta, atype='VEC3'):
        """A morph delta as a sparse accessor over zeros: only moved vertices."""
        moved = np.nonzero(np.abs(delta).max(1) > 1e-6)[0]
        count = int(delta.shape[0])
        acc = {'componentType': 5126, 'count': count, 'type': atype}
        if len(moved) == 0:
            moved = np.array([0])
        idx = self._view(moved.astype(np.uint32 if count > 65535 else np.uint16).tobytes())
        val = self._view(np.ascontiguousarray(delta[moved]).astype(np.float32).tobytes())
        acc['sparse'] = {'count': int(len(moved)), 'indices': {'bufferView': idx, 'componentType': 5125 if count > 65535 else 5123},
                         'values': {'bufferView': val}}
        acc['min'] = [float(x) for x in delta.min(0)]
        acc['max'] = [float(x) for x in delta.max(0)]
        self.j['accessors'].append(acc)
        return len(self.j['accessors']) - 1

    def node(self, d):
        self.j['nodes'].append(d)
        return len(self.j['nodes']) - 1

    def write(self, path):
        while len(self.bin) % 4:
            self.bin.append(0)
        self.j['buffers'] = [{'byteLength': len(self.bin)}]
        for k in ['skins', 'animations', 'materials', 'meshes']:
            if not self.j[k]:
                del self.j[k]
        js = json.dumps(self.j, separators=(',', ':')).encode()
        while len(js) % 4:
            js += b' '
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, total))
            f.write(struct.pack('<II', len(js), 0x4E4F534A))
            f.write(js)
            f.write(struct.pack('<II', len(self.bin), 0x004E4942))
            f.write(bytes(self.bin))
