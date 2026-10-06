"""The villager asset pipeline, run headless in the pinned Blender
(node scripts/villager/build.mjs → scripts/blender.mjs run). Steps:

  body        MakeHuman base → decimated body, morphs, joints, weights (cached)
  clips       Quaternius clips retargeted onto the villager skeleton (cached)
  garments    each dress form built round the body, weights transferred (cached)
  export      public/models/villager.glb
  sheets      frame sheets under verification/villager-body/
  penetration the per-frame garment penetration report
  all         every step in order
"""
import argparse
import os
import pickle
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import json  # noqa: E402


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--step', default='all')
    p.add_argument('--src', required=True)
    p.add_argument('--config', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--work', required=True)
    p.add_argument('--verification', required=True)
    p.add_argument('--only', default='')
    return p.parse_args(argv)


def cached(work, name, make, force=False):
    path = os.path.join(work, name + '.pkl')
    if os.path.exists(path) and not force:
        return pickle.load(open(path, 'rb'))
    t = time.time()
    v = make()
    pickle.dump(v, open(path, 'wb'))
    print(f'[{name}] built in {time.time() - t:.1f}s')
    return v


def main():
    a = args()
    cfg = json.load(open(a.config))
    os.makedirs(a.out, exist_ok=True)
    os.makedirs(a.verification, exist_ok=True)
    steps = ['body', 'clips', 'garments', 'export', 'sheets', 'penetration'] if a.step == 'all' else a.step.split(',')
    from mhbody import MakeHuman
    mh = MakeHuman(a.src)
    import body as B
    body = cached(a.work, 'body', lambda: B.build_body(mh, cfg), force='body' in steps)
    have = lambda n: n in steps or os.path.exists(os.path.join(a.work, n + '.pkl'))  # noqa: E731
    clips = None
    if have('clips') and any(s in steps for s in ('clips', 'export', 'sheets', 'penetration', 'garments')):
        import clips as CL
        clips = cached(a.work, 'clips', lambda: CL.build_clips(a.src, body, cfg), force='clips' in steps)
    garments = None
    if have('garments') and any(s in steps for s in ('garments', 'export', 'sheets', 'penetration')):
        import garments as G
        garments = cached(a.work, 'garments', lambda: G.build_garments(mh, body, clips, cfg), force='garments' in steps)
    if 'export' in steps:
        import export as E
        E.export(os.path.join(a.out, 'villager.glb'), mh, body, clips, garments, cfg)
    if 'sheets' in steps:
        import sheets as S
        S.sheets(a.verification, mh, body, clips, garments, cfg, only=a.only)
    if 'penetration' in steps:
        import penetration as P
        P.report(a.verification, body, clips, garments, cfg)


if __name__ == '__main__':
    main()
