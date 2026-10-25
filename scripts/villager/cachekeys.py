"""The pipeline caches' keys (pipeline.py `cached`), on their INPUTS as the
mask cache is keyed (pipeline.py): the pinned sources (sources.json), the
config from src/config/balance.ts, the code the step runs and the keys of the
cached steps it reads — never the cache files themselves, so a key computed
before a step is built (cold) equals the one computed after (warm).

A step's code is its OWN modules (STEPS) whole, plus every top-level
definition of another local module they reach — through `from m import f`,
`import m as M` and `M.f`, followed transitively through what those
definitions reference and through re-exports. A helper edit that a step's result can depend on moves
its key; an edit of a sheet or report function no step reaches does not turn
into an hour's garment rebuild.

Plain Python (no numpy): the Vitest tooling test runs it outside Blender
(cachekeys.test.mjs)."""
import ast
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


class _Module:
    """One local module's top-level definitions and the local names it imports."""

    def __init__(self, path, local):
        text = open(path, encoding='utf8').read()
        self.tree = ast.parse(text)
        self.defs = {}
        for node in self.tree.body:
            names = []
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                names = [node.name]
            elif isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                names = [n.id for t in targets for n in ast.walk(t) if isinstance(n, ast.Name)]
            for n in names:
                self.defs.setdefault(n, []).append((ast.get_source_segment(text, node) or '', node))
        # every local import anywhere in the module (a function's lazy import included)
        self.aliases = {}  # alias → module (import m as M)
        self.froms = {}    # name → (module, name) (from m import f)
        for node in ast.walk(self.tree):
            if isinstance(node, ast.Import):
                for a in node.names:
                    if a.name in local:
                        self.aliases[a.asname or a.name] = a.name
            elif isinstance(node, ast.ImportFrom) and node.module in local:
                for a in node.names:
                    self.froms[a.asname or a.name] = (node.module, a.name)

    def refs(self, node):
        """(module, name) pairs `node` references: local imports and own top-level names."""
        out = set()
        for n in ast.walk(node):
            if isinstance(n, ast.ImportFrom) and n.module in self.local_names:
                out |= {(n.module, a.name) for a in n.names}
            elif isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) and n.value.id in self.aliases:
                out.add((self.aliases[n.value.id], n.attr))
            elif isinstance(n, ast.Name):
                if n.id in self.froms:
                    out.add(self.froms[n.id])
                elif n.id in self.defs:
                    out.add((self.name, n.id))
        return out


def _modules(here):
    local = {f[:-3] for f in os.listdir(here) if f.endswith('.py')}
    mods = {}
    for m in local:
        mods[m] = _Module(os.path.join(here, m + '.py'), local)
        mods[m].name, mods[m].local_names = m, local
    return mods


def code_digest(names, here=HERE, mods=None):
    """The step's own modules whole, and every top-level definition of another
    local module they reach, transitively."""
    mods = mods or _modules(here)
    own = sorted(set(names))
    h = hashlib.sha256()
    todo = set()
    for m in own:
        h.update(m.encode() + b'\0')
        h.update(open(os.path.join(here, m + '.py'), 'rb').read())
        todo |= mods[m].refs(mods[m].tree)
    seen, visited, binds = set(), set(), set()
    while todo:
        m, n = todo.pop()
        if m in own or (m, n) in visited:
            continue
        visited.add((m, n))  # every name once: re-export cycles end
        if n not in mods[m].defs:
            # a re-export (`from impl import f as g` in m): its binding is
            # hashed, and followed to its definition
            if n in mods[m].froms:
                binds.add((m, n) + mods[m].froms[n])
                todo.add(mods[m].froms[n])
            continue
        seen.add((m, n))
        for _seg, node in mods[m].defs[n]:
            todo |= mods[m].refs(node)
    for b in sorted(binds):
        h.update(('re-export ' + ' '.join(b)).encode() + b'\0')
    for m, n in sorted(seen):
        h.update(f'{m}.{n}'.encode() + b'\0')
        for seg, _node in mods[m].defs[n]:
            h.update(seg.encode() + b'\0')
    return h.hexdigest()


def step_keys(cfg, here=HERE):
    """{step: key} for every cached step."""
    src = hashlib.sha256(open(os.path.join(here, 'sources.json'), 'rb').read()).hexdigest()
    conf = json.dumps(cfg, sort_keys=True)
    keys = {}
    mods = _modules(here)
    for step, (own, reads) in STEPS.items():
        h = hashlib.sha256()
        for part in (step, conf, src, code_digest(own, here, mods), *(keys[r] for r in reads)):
            h.update(part.encode() + b'\0')
        keys[step] = h.hexdigest()
    return keys


if __name__ == '__main__':
    import sys
    print(json.dumps(step_keys(json.load(open(sys.argv[1])), sys.argv[2] if len(sys.argv) > 2 else HERE)))
