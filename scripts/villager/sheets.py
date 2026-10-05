"""Frame sheets of the villager body, its clips and its dress (judged by eye)."""
import os

import numpy as np

import render as R
import rig
import skeleton as SK
from body import top4, MORPHS

SKIN = (0.36, 0.22, 0.14, 1)


def morphed(body, weights):
    pos = body['pos'].copy()
    j = body['joints'].copy()
    for k, w in weights.items():
        if w:
            pos += w * body['morph_pos'][k]
            j += w * body['joint_deltas'][k]
    return pos, j


def corner_weights(sex, age, build=0.0):
    w = {m: 0.0 for m in MORPHS}
    f = sex == 'female'
    if f:
        w['female'] = 1
    if age != 'adult':
        w[age] = 1
        if f:
            w[age + '_f'] = 1
    if build < 0:
        w['slight'] = -build
    if build > 0:
        w['stout'] = build
    return w


def rest_q():
    return np.tile([0, 0, 0, 1.0], (len(SK.NAMES), 1))


def body_sheet(out, body):
    R.clear()
    jidx, jw = top4(body['W'])
    x = 0.0
    for sex in ('male', 'female'):
        for age in ('child', 'youth', 'adult', 'elder'):
            pos, j = morphed(body, corner_weights(sex, age))
            wr, wp = rig.fk(j, rest_q())
            v = rig.skin(pos, jidx, jw, j, wr, wp)
            v[:, 0] += x
            R.add_mesh(f'{sex}-{age}', v, body['tris'], SKIN)
            x += 0.75
    R.ground(-0.5, x, -0.5, 0.5)
    R.render(os.path.join(out, 'body-morphs-front.png'), (x / 2 - 0.4, 0.7, 0), x + 0.3, 'front', (2000, 560))
    R.render(os.path.join(out, 'body-morphs-quarter.png'), (x / 2 - 0.4, 0.7, 0), x + 0.3, 30, (2000, 560))


def sheets(out, mh, body, clips, garments, cfg, only=''):
    want = set(only.split(',')) if only else None
    if not want or 'body' in want:
        body_sheet(out, body)
