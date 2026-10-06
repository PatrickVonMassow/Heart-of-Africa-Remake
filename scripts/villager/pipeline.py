"""The villager asset pipeline, run headless in the pinned Blender
(node scripts/villager/build.mjs → scripts/blender.mjs run). Steps:

  body        MakeHuman base → decimated body, morphs, joints, weights (cached)
  clips       Quaternius clips retargeted onto the villager skeleton (cached)
  garments    each dress form built round the body, weights transferred, then
              fitted to every clip frame at every body corner (fit.py) (cached)
  correct     the garments' pose-driven corrective shapes (correct.py) (cached)
  export      public/models/villager.glb (body and clips; garments not yet shipped)
  sheets      frame sheets under verification/villager-body/
  penetration the per-frame garment penetration report; the run FAILS (exit 1)
              when any garment lies deeper than the tolerance in any frame
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
    steps = ['body', 'clips', 'garments', 'correct', 'export', 'sheets', 'penetration'] if a.step == 'all' else a.step.split(',')
    if 'garments' in steps or 'selftest' in steps:
        import fit as F
        F.selftest()
    if steps == ['selftest']:
        return
    from mhbody import MakeHuman
    mh = MakeHuman(a.src)
    import body as B
    body = cached(a.work, 'body', lambda: B.build_body(mh, cfg), force='body' in steps)
    have = lambda n: n in steps or os.path.exists(os.path.join(a.work, n + '.pkl'))  # noqa: E731
    clips = None
    if have('clips') and any(s in steps for s in ('clips', 'export', 'sheets', 'penetration', 'garments', 'correct')):
        import clips as CL
        clips = cached(a.work, 'clips', lambda: CL.build_clips(a.src, body, cfg), force='clips' in steps)
    garments = None
    if have('garments') and any(s in steps for s in ('garments', 'correct', 'export', 'sheets', 'penetration')):
        import garments as G
        import fit as F
        garments = cached(a.work, 'garments', lambda: F.fit(body, clips, G.build_garments(mh, body, clips, cfg), cfg), force='garments' in steps)
    if garments is not None:
        import correct as CR
        base = garments
        garments = cached(a.work, 'corrected', lambda: CR.correct(body, clips, base, cfg), force=any(s in steps for s in ('correct', 'garments')))
        CR.driver_check(a.verification, body, clips, cfg, garments)
    if 'export' in steps:
        import export as E
        # The game still draws the code-built dress on the glTF body (render/
        # villagerFigureBody.ts): the garments built and fitted here are
        # measured (penetration report, dress-* frame sheets) but not shipped
        # while they clip — shipping is ready in commit af2c25d42.
        # OPEN: ship them once the report is zero beyond tolerance.
        E.export(os.path.join(a.out, 'villager.glb'), mh, body, clips, None, cfg)
    if 'sheets' in steps:
        import sheets as S
        S.sheets(a.verification, mh, body, clips, garments, cfg, only=a.only)
    if 'penetration' in steps:
        import penetration as P
        bad = P.report(a.verification, body, clips, garments, cfg)
        if bad:
            # an exception, so Blender's --python-exit-code turns it into exit 1
            raise RuntimeError(f'penetration: {bad} garment(s) over tolerance (see penetration-report.md)')


if __name__ == '__main__':
    main()
    # Blender crashes on exit once a forked pool has run (correct.py); the
    # work is done and written, so leave without its shutdown.
    sys.stdout.flush()
    os._exit(0)
