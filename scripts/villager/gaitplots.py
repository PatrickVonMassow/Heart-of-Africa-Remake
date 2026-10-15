"""Per gait clip, the support plot (natural-villager-motion step 5): the heel,
ball and toe-tip contact intervals the clip ships (clips.py
`contact_intervals`) with each foot's contact fraction, and the knee flexion of
both legs over the cycle (phase 0 = the left foot's landing). Plain SVG, no
plotting dependency; written beside the clip sheets as gait-<clip>.svg."""
import os

import numpy as np

import rig
import skeleton as SK

# light surface, ink and two categorical slots (left blue, right orange)
SURFACE, INK, INK2, GRID = '#fcfcfb', '#0b0b0b', '#52514e', '#e4e3df'
SIDE = {'L': '#2a78d6', 'R': '#eb6834'}
W, PAD_L, PAD_R = 720, 120, 24
PLOT_W = W - PAD_L - PAD_R


def knee_flexion(joints, clip):
    """Per frame and leg the knee's bend (deg): thigh against shin."""
    out = {'L': [], 'R': []}
    for f in range(len(clip['times'])):
        _wr, wp = rig.fk(joints, clip['q'][f], clip['hips'][f])
        for s in ('L', 'R'):
            a, b, c = wp[SK.INDEX['thigh.' + s]], wp[SK.INDEX['shin.' + s]], wp[SK.INDEX['foot.' + s]]
            u, v = b - a, c - b
            cos = np.dot(u, v) / np.linalg.norm(u) / np.linalg.norm(v)
            out[s].append(float(np.degrees(np.arccos(np.clip(cos, -1, 1)))))
    return out


def contact_fraction(spans, cells=400):
    """The share of the cycle a foot carries on any of its contacts: the grid
    cells whose centre lies in some interval (the intervals may run past 1)."""
    centre = (np.arange(cells) + 0.5) / cells
    grid = np.zeros(cells, bool)
    for k in ('heel', 'ball', 'tip'):
        for a, b in spans[k]:
            grid |= ((centre - a) % 1.0) < (b - a)
    return float(grid.mean())


def selftest():
    """contact_fraction on known unions (no Blender needed)."""
    one = lambda *iv: {'heel': list(iv), 'ball': [], 'tip': []}  # noqa: E731
    near = lambda x, want: abs(x - want) <= 1 / 400  # noqa: E731
    # a short span counts every cell it covers once (the rounded sampling
    # mapped consecutive samples onto one cell and lost the next)
    assert near(contact_fraction(one([15 / 32, 16 / 32])), 1 / 32)
    assert near(contact_fraction(one([0.2, 0.2 + 0.6])), 0.6)
    # overlapping spans count their union; a span past 1 wraps
    assert near(contact_fraction(one([0, 0.3], [0.2, 0.5])), 0.5)
    assert near(contact_fraction(one([0.9, 1.1])), 0.2)
    assert near(contact_fraction({'heel': [[0, 0.25]], 'ball': [[0.5, 0.75]], 'tip': [[0.1, 0.2]]}), 0.5)
    print('gaitplots selftest: ok')


def _x(p):
    return PAD_L + p * PLOT_W


def plot(name, clip, joints):
    support = clip['contacts']['support']
    knee = knee_flexion(joints, clip)
    n = len(clip['times']) - 1  # the last frame repeats the first
    frac = {s: contact_fraction(support[s]) for s in ('L', 'R')}
    row_h, top = 18, 56
    rows = [(s, k) for s in ('L', 'R') for k in ('heel', 'ball', 'tip')]
    g0 = top + len(rows) * row_h + 40  # knee panel
    gh = 200
    H = g0 + gh + 56
    kmax = max(90.0, float(np.ceil(max(max(knee['L']), max(knee['R'])) / 30) * 30))
    y = lambda deg: g0 + gh - deg / kmax * gh  # noqa: E731
    e = []
    e.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">')
    e.append(f'<rect width="{W}" height="{H}" fill="{SURFACE}"/>')
    e.append(f'<text x="{PAD_L}" y="22" font-size="15" fill="{INK}">{name}: support and knee over the cycle '
             f'({clip["duration"]:.2f} s, {clip.get("speed", 0):.2f} units/s)</text>')
    e.append(f'<text x="{PAD_L}" y="40" fill="{INK2}">contact fraction left {frac["L"]:.0%}, right {frac["R"]:.0%}; '
             f'loop seam {clip["contacts"]["seam"]:.3f} rad</text>')
    for i, (s, k) in enumerate(rows):
        ry = top + i * row_h
        e.append(f'<text x="{PAD_L - 8}" y="{ry + 13}" text-anchor="end" fill="{INK2}">{"left" if s == "L" else "right"} {k}</text>')
        e.append(f'<rect x="{PAD_L}" y="{ry + 2}" width="{PLOT_W}" height="{row_h - 4}" fill="{GRID}" rx="2"/>')
        for a, b in support[s][k]:
            for lo, hi in ((a, min(b, 1.0)), (0.0, b - 1.0)) if b > 1 else ((a, b),):
                if hi > lo:
                    e.append(f'<rect x="{_x(lo):.1f}" y="{ry + 2}" width="{(hi - lo) * PLOT_W:.1f}" height="{row_h - 4}" fill="{SIDE[s]}" rx="2"/>')
    # knee panel: recessive grid, two 2px lines, direct labels and a legend
    for deg in np.arange(0, kmax + 1, 30):
        e.append(f'<line x1="{PAD_L}" x2="{W - PAD_R}" y1="{y(deg):.1f}" y2="{y(deg):.1f}" stroke="{GRID}"/>')
        e.append(f'<text x="{PAD_L - 8}" y="{y(deg) + 4:.1f}" text-anchor="end" fill="{INK2}">{deg:.0f}°</text>')
    e.append(f'<text x="{PAD_L - 8}" y="{g0 - 10}" text-anchor="end" fill="{INK}">knee bend</text>')
    for s in ('L', 'R'):
        pts = ' '.join(f'{_x(f / n):.1f},{y(knee[s][f]):.1f}' for f in range(n + 1))
        e.append(f'<polyline points="{pts}" fill="none" stroke="{SIDE[s]}" stroke-width="2" stroke-linejoin="round"/>')
        e.append(f'<text x="{W - PAD_R}" y="{y(knee[s][-1]) - 6:.1f}" text-anchor="end" fill="{INK}">{"left" if s == "L" else "right"}</text>')
    for p in (0, 0.25, 0.5, 0.75, 1.0):
        e.append(f'<text x="{_x(p):.1f}" y="{g0 + gh + 18}" text-anchor="middle" fill="{INK2}">{p:g}</text>')
    e.append(f'<text x="{_x(0.5):.1f}" y="{g0 + gh + 36}" text-anchor="middle" fill="{INK2}">phase (0 = left landing)</text>')
    lx = PAD_L
    for s, label in (('L', 'left leg'), ('R', 'right leg')):
        e.append(f'<rect x="{lx}" y="{H - 14}" width="12" height="4" fill="{SIDE[s]}" rx="2"/>')
        e.append(f'<text x="{lx + 18}" y="{H - 8}" fill="{INK}">{label}</text>')
        lx += 100
    e.append('</svg>')
    return '\n'.join(e) + '\n', frac, knee


def gait_plots(out, body, clips):
    for name, c in clips['clips'].items():
        if c.get('kind') != 'gait' or 'contacts' not in c:
            continue
        svg, frac, knee = plot(name, c, body['joints'])
        with open(os.path.join(out, f'gait-{name}.svg'), 'w', encoding='utf8') as fh:
            fh.write(svg)
        print(f'gait plot {name}: contact fraction L {frac["L"]:.2f} R {frac["R"]:.2f}, '
              f'knee {min(knee["L"] + knee["R"]):.0f}-{max(knee["L"] + knee["R"]):.0f} deg', flush=True)
