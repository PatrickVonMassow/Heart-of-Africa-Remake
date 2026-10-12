"""The pipeline caches' keys (pipeline.py `cached`), on their INPUTS as the
mask cache is keyed (pipeline.py): the pinned sources (sources.json), the
config from src/config/balance.ts, the source of the step's own modules and
the keys of the cached steps it reads — never the cache files themselves, so
a key computed before a step is built (cold) equals the one computed after
(warm).

Like the mask's, a step's code is its OWN modules (STEPS), not every helper
they import: the shared helpers (gamepath, sheets, penetration, mask) are
imported by nearly every step, and keying on them would turn every edit of a
sheet or a report into an hour's garment rebuild. A change to a helper that
does change a step's result is rebuilt with `--step <name>`.

Plain Python (no numpy): the Vitest tooling test runs it outside Blender
(cachekeys.test.mjs)."""
import hashlib
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# Each cached step: its own modules and the cached steps it reads.
STEPS = {
    'body': (('body', 'mhbody', 'skeleton', 'gltfio'), ()),
    'clips': (('clips', 'toolclips', 'skeleton', 'rig', 'gltfio'), ('body',)),
    'garments': (('garments', 'fit', 'skeleton'), ('body', 'clips')),
}


def code_digest(names, here=HERE):
    h = hashlib.sha256()
    for m in sorted(set(names)):
        h.update(m.encode() + b'\0')
        h.update(open(os.path.join(here, m + '.py'), 'rb').read())
    return h.hexdigest()


def step_keys(cfg, here=HERE):
    """{step: key} for every cached step."""
    src = hashlib.sha256(open(os.path.join(here, 'sources.json'), 'rb').read()).hexdigest()
    conf = json.dumps(cfg, sort_keys=True)
    keys = {}
    for step, (own, reads) in STEPS.items():
        h = hashlib.sha256()
        for part in (step, conf, src, code_digest(own, here), *(keys[r] for r in reads)):
            h.update(part.encode() + b'\0')
        keys[step] = h.hexdigest()
    return keys


if __name__ == '__main__':
    import sys
    print(json.dumps(step_keys(json.load(open(sys.argv[1])), sys.argv[2] if len(sys.argv) > 2 else HERE)))
