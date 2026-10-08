"""The villager asset pipeline, run headless in the pinned Blender
(node scripts/villager/build.mjs → scripts/blender.mjs run). Steps:

  body        MakeHuman base → decimated body, morphs, joints, weights (cached)
  clips       Quaternius clips retargeted onto the villager skeleton (cached)
  garments    each dress form built round the body in the build pose as the
              game draws it, weights transferred, then fitted to every pose
              the report measures at every body corner (fit.py) (cached)
  (mask)      each garment's cover mask over the body and the garments of
              other slots (mask.py), computed whenever the garments are read
  export      public/models/villager.glb (body with its cover mask, clips;
              garments not yet shipped)
  sheets      frame sheets under verification/villager-body/
  penetration the per-frame garment penetration report on the masked body and
              garments; the run FAILS (exit 1) when any value exceeds the
              tolerance in any frame (--stride N: every Nth pose, a quick look;
              --baseline <json>: main's report json, for the comparison)
  selftest    the fit loop's own check (also run before every garments step)
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
    p.add_argument('--stride', type=int, default=1)
    p.add_argument('--baseline', default='')
    return p.parse_args(argv)


def inputs(work, names, cfg):
    """A digest of the cached steps `names` (their .pkl bytes) and the config."""
    import hashlib
    h = hashlib.sha256(json.dumps(cfg, sort_keys=True).encode())
    for n in names:
        h.update(open(os.path.join(work, n + '.pkl'), 'rb').read())
    return h.hexdigest()


def cached(work, name, make, force=False, key=None):
    """A step's result from `work`, built when absent, forced, or — with a
    `key` (inputs) — built from other inputs than the cached one."""
    path = os.path.join(work, name + '.pkl')
    if os.path.exists(path) and not force:
        v = pickle.load(open(path, 'rb'))
        if key is None or v.get('_inputs') == key:
            return v
        print(f'[{name}] cached from other inputs: rebuilding')
    t = time.time()
    v = make()
    if key is not None:
        v['_inputs'] = key
    pickle.dump(v, open(path, 'wb'))
    print(f'[{name}] built in {time.time() - t:.1f}s')
    return v


def main():
    a = args()
    cfg = json.load(open(a.config))
    os.makedirs(a.out, exist_ok=True)
    os.makedirs(a.verification, exist_ok=True)
    steps = ['body', 'clips', 'garments', 'export', 'sheets', 'penetration'] if a.step == 'all' else a.step.split(',')
    import mask as MK
    MK.selftest()
    if 'garments' in steps or 'selftest' in steps:
        import fit as F
        F.selftest()
        MK.selftest_volume()
    if 'penetration' in steps or 'selftest' in steps:
        import penetration as P
        P.selftest()
    if steps == ['selftest']:
        return
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
        import fit as F
        garments = cached(a.work, 'garments', lambda: F.fit(body, clips, G.build_garments(mh, body, clips, cfg), cfg), force='garments' in steps)
    if garments is not None:
        garments['mask'] = MK.masks(body, garments, cfg)
    if 'export' in steps:
        import export as E
        # The game still draws the code-built dress on the glTF body (render/
        # villagerFigureBody.ts): the garments built and fitted here are
        # measured (penetration report, dress-* frame sheets) but not shipped
        # (work-order point 1315); the body carries their cover mask.
        E.export(os.path.join(a.out, 'villager.glb'), mh, body, clips, None, cfg, mask=garments and garments['mask'])
        if garments:
            import sheets as S
            MK.check(a.verification, garments['mask'], body, [o for _s, _a, o in S.OUTFITS])
    if 'sheets' in steps:
        import sheets as S
        S.sheets(a.verification, mh, body, clips, garments, cfg, only=a.only)
    if 'penetration' in steps:
        import penetration as P
        bad = P.report(a.verification, body, clips, garments, cfg, a.stride, baseline=a.baseline or None)
        if bad:
            # an exception, so Blender's --python-exit-code turns it into exit 1
            raise RuntimeError(f'penetration: {bad} garment(s) over tolerance (see penetration-report.md)')


if __name__ == '__main__':
    main()
    # Blender crashes on exit once a forked pool has run (penetration.py); the
    # work is done and written, so leave without its shutdown.
    sys.stdout.flush()
    os._exit(0)
