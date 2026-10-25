"""The villager asset pipeline, run headless in the pinned Blender
(node scripts/villager/build.mjs → scripts/blender.mjs run). Steps:

  body        MakeHuman base → decimated body, morphs, joints, weights (cached)
  clips       Quaternius clips retargeted onto the villager skeleton (cached)
  garments    each dress form built round the body, weights transferred,
              fitted to every frame of the clips with only their trunk's
              style at every body corner, then settled
              clear of the body and the inner layers in the build pose at
              every body corner (fit.py) (cached)
  (mask)      each garment's cover mask over the body and the garments of
              outer layers (mask.py), the body's checked over every pose
              (cached on its inputs), computed whenever the garments are read
  export      public/models/villager.glb (body, clips and the garments, each
              with its cover mask)
  sheets      frame sheets under verification/villager-body/
  penetration the per-frame garment penetration report on the masked body and
              garments; the run FAILS (exit 1) when any value exceeds the
              tolerance in any frame (--stride N: every Nth pose, a quick look;
              --baseline <json>: main's report json, for the comparison)
  runtime     the round trip of the runtime-pose export (--runtime <json>,
              written by src/render/villagerRuntimePose.test.tsx): world joints
              and morph weights rebuilt here must match the game's within
              1e-4 (gamepath.runtime_check); the sheets and penetration steps
              run it before they use the export
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
    p.add_argument('--runtime', default='')
    return p.parse_args(argv)


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
    import gaitplots as GPL
    GPL.selftest()
    import clips as CL
    CL.selftest()
    import sheets as SH
    SH.selftest_hand_layout()
    if 'garments' in steps or 'selftest' in steps:
        import fit as F
        F.selftest()
        MK.selftest_volume()
    if 'export' in steps or 'selftest' in steps:
        import gltfio as GI
        GI.selftest()
    if 'penetration' in steps or 'selftest' in steps:
        import penetration as P
        P.selftest()
    if steps == ['selftest']:
        return
    from mhbody import MakeHuman
    mh = MakeHuman(a.src)
    import body as B
    import cachekeys as CK
    # each cache keyed on its inputs (sources, config, its own code, the keys
    # of the steps it reads): a cache built from other inputs is rebuilt
    keys = CK.step_keys(cfg)
    body = cached(a.work, 'body', lambda: B.build_body(mh, cfg), force='body' in steps, key=keys['body'])
    have = lambda n: n in steps or os.path.exists(os.path.join(a.work, n + '.pkl'))  # noqa: E731
    clips = None
    if have('clips') and any(s in steps for s in ('clips', 'export', 'sheets', 'penetration', 'garments')):
        import clips as CL
        clips = cached(a.work, 'clips', lambda: CL.build_clips(a.src, body, cfg), force='clips' in steps, key=keys['clips'])
    garments = None
    if have('garments') and any(s in steps for s in ('garments', 'export', 'sheets', 'penetration')):
        import fit as F
        garments = cached(a.work, 'garments', lambda: F.tailor(a.src, mh, body, clips, cfg), force='garments' in steps, key=keys['garments'])
    if garments is not None and clips is not None:
        # the mask over every pose costs minutes: cached on its inputs, its own
        # code and what its motion evaluation reads (MK.motion_key)
        import hashlib
        key = keys['garments'] + hashlib.sha256(open(MK.__file__, 'rb').read()).hexdigest() + MK.motion_key(body)
        garments['mask'] = cached(a.work, 'mask', lambda: MK.inner_corners(body, garments, cfg, MK.masks(body, garments, cfg, clips)), key=key)
    elif garments is not None:
        garments['mask'] = MK.masks(body, garments, cfg)
    if 'export' in steps:
        import export as E
        if garments is None:
            # the game draws no code-built dress any more: a body-only asset
            # would undress every villager
            raise RuntimeError('export: no garments (build them with --step garments first)')
        # The game dresses the glTF body with exactly these garments (render/
        # villagerFigureBody.ts gltfGarment), the ones the penetration report
        # and the dress-* frame sheets measure; body and garments carry their
        # cover mask. The hair cap and the eyes stay pipeline-only (the game
        # paints the scalp).
        dress = garments and {'meshes': {n: g for n, g in garments['meshes'].items() if n.startswith('g-')}, 'meta': garments['meta']}
        E.export(os.path.join(a.out, 'villager.glb'), mh, body, clips, dress, cfg, mask=garments and garments['mask'])
        if garments:
            import sheets as S
            MK.check(a.verification, garments['mask'], body, [o for _s, _a, o in S.outfits(garments)])
    rt = None
    if a.runtime and any(s in steps for s in ('runtime', 'sheets', 'penetration')):
        import gamepath as GP
        rt = GP.load_runtime(a.runtime)
        # the export is evidence only once the round trip matches (raises otherwise)
        GP.runtime_check(body, rt, cfg)
    if 'sheets' in steps:
        import sheets as S
        S.sheets(a.verification, mh, body, clips, garments, cfg, only=a.only)
        if rt is not None and (not a.only or 'runtime' in a.only.split(',')):
            S.runtime_sheets(a.verification, body, clips, garments, cfg, rt)
    if 'penetration' in steps:
        import penetration as P
        bad, unchecked = P.report(a.verification, body, clips, garments, cfg, a.stride, baseline=a.baseline or None)
        if rt is not None:
            P.runtime_report(a.verification, body, garments, cfg, rt)
        if bad or unchecked:
            # an exception, so Blender's --python-exit-code turns it into exit 1
            raise RuntimeError(f'penetration: {bad} garment(s) over tolerance'
                               + (f', {len(unchecked)} without a baseline row (unchecked: {", ".join(unchecked)})' if unchecked else '')
                               + ' (see penetration-report.md)')


if __name__ == '__main__':
    main()
    # Blender crashes on exit once a forked pool has run (penetration.py); the
    # work is done and written, so leave without its shutdown.
    sys.stdout.flush()
    os._exit(0)
