"""The MakeHuman base mesh and its macro targets, as numpy (CC0 assets, MPFB2).

`MakeHuman.shape(gender, age, weight, race)` reproduces MakeHuman's macro
modifier: the base mesh plus the universal gender/age/muscle/weight targets and
the ethnic race/gender/age targets, each weighted by the product of its
variables' part weights (macro.json). Muscle stays at the average (0.5), height
and proportions neutral, so only those targets are needed.
"""
import gzip
import os

import numpy as np

AGE_PARTS = [(0.0, 0.1875, 'baby', 'child'), (0.1875, 0.5, 'child', 'young'), (0.5, 1.0, 'young', 'old')]


def age_weights(a):
    for lo, hi, low, high in AGE_PARTS:
        if a <= hi + 1e-9:
            f = (a - lo) / (hi - lo)
            return {low: 1 - f, high: f}
    return {'old': 1.0}


def weight_weights(w):
    if w < 0.5:
        f = (0.5 - w) / 0.5
        return {'minweight': f, 'averageweight': 1 - f}
    f = (w - 0.5) / 0.5
    return {'maxweight': f, 'averageweight': 1 - f}


class MakeHuman:
    def __init__(self, src):
        d = os.path.join(src, 'makehuman')
        self.dir = d
        self.v = []
        self.vt = []
        self.faces = {}  # group -> list of (vidx[], uvidx[])
        self.groups = {}
        cur = None
        for line in open(os.path.join(d, 'base.obj')):
            if line.startswith('v '):
                self.v.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('vt '):
                self.vt.append([float(x) for x in line.split()[1:3]])
            elif line.startswith('g '):
                cur = line.split()[1]
                self.faces.setdefault(cur, [])
            elif line.startswith('f '):
                vs, ts = [], []
                for t in line.split()[1:]:
                    p = t.split('/')
                    vs.append(int(p[0]) - 1)
                    ts.append(int(p[1]) - 1 if len(p) > 1 and p[1] else -1)
                self.faces[cur].append((vs, ts))
        self.v = np.array(self.v, float)
        self.vt = np.array(self.vt, float)
        for g, fs in self.faces.items():
            self.groups[g] = np.array(sorted({i for f, _ in fs for i in f}))
        self._targets = {}

    def target(self, name):
        if name not in self._targets:
            delta = np.zeros_like(self.v)
            p = os.path.join(self.dir, 'targets', name + '.target.gz')
            for line in gzip.open(p, 'rt'):
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                parts = line.split()
                delta[int(parts[0])] = [float(x) for x in parts[1:4]]
            self._targets[name] = delta
        return self._targets[name]

    def shape(self, gender, age, weight, race, cup=0.0):
        """Vertex positions (all 19158, MakeHuman units) for macro settings;
        gender 0 female … 1 male, age 0 … 1 (MakeHuman's slider), weight 0 … 1;
        `cup` 0 … 1 the breast modifier's share toward its max cup (MakeHuman's
        BreastSize slider above its average: the macro targets alone leave the
        female chest flat). Only the targets of the average weight are pinned."""
        out = self.v.copy()
        gw = {'female': 1 - gender, 'male': gender}
        aw = age_weights(age)
        ww = weight_weights(weight)
        for g, a_g in gw.items():
            if a_g <= 0:
                continue
            for a, a_a in aw.items():
                if a_a <= 0:
                    continue
                for w, a_w in ww.items():
                    if a_w > 0:
                        out += a_g * a_a * a_w * self.target(f'universal-{g}-{a}-averagemuscle-{w}')
                for r, a_r in race.items():
                    if a_r > 0:
                        out += a_g * a_a * a_r * self.target(f'{r}-{g}-{a}')
                if g == 'female' and cup > 0 and a != 'baby':
                    for w, a_w in ww.items():
                        if a_w > 0:
                            out += a_g * a_a * a_w * cup * self.target(f'breast/female-{a}-averagemuscle-{w}-maxcup-averagefirmness')
        return out

    def centroid(self, verts, group):
        return verts[self.groups[group]].mean(0)

    def body_quads(self):
        return self.faces['body']
