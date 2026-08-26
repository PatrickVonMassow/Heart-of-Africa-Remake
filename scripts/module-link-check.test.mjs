// The scanner behind the launcher's link witness. Its own failure mode is the
// one the cross-vendor review named: recognising one import spelling, skipping
// the others, and reporting a clean file. So every static form gets a case, and
// a form it cannot read must COUNT as unparsed rather than vanish.
import { describe, it, expect } from 'vitest'
import { scanStaticImports, stripComments, missingNamedImports } from './module-link-check.mjs'

const specs = (src) => scanStaticImports(src).imports.map((i) => `${i.specifier}:${i.names.join('|')}`)

describe('scanStaticImports reads every static form', () => {
  it('plain named imports, single and double quoted', () => {
    expect(specs("import { a } from './x.mjs'\nimport { b } from \"./y.mjs\"")).toEqual([
      './x.mjs:a',
      './y.mjs:b',
    ])
  })

  it('a default binding in front of the named ones — the form that slipped through first', () => {
    expect(specs("import def, { a, b } from './x.mjs'")).toEqual(['./x.mjs:a|b'])
  })

  it('aliases count as the EXPORTED name, not the local one', () => {
    expect(specs("import { a as renamed, b } from './x.mjs'")).toEqual(['./x.mjs:a|b'])
  })

  it('a clause spread over several lines', () => {
    expect(specs("import {\n  a,\n  b as c,\n} from './x.mjs'")).toEqual(['./x.mjs:a|b'])
  })

  it('default-only and namespace imports carry no named binding to check', () => {
    expect(specs("import def from './x.mjs'\nimport * as ns from './y.mjs'")).toEqual([
      './x.mjs:',
      './y.mjs:',
    ])
  })

  it('tells a DEFAULT binding from a namespace one — only the first can be missing', () => {
    const flags = (src) => scanStaticImports(src).imports.map((i) => i.hasDefault)
    expect(flags("import def from './x.mjs'")).toEqual([true])
    expect(flags("import def, { a } from './x.mjs'")).toEqual([true])
    expect(flags("import * as ns from './x.mjs'")).toEqual([false])
    expect(flags("import { a } from './x.mjs'")).toEqual([false])
    expect(flags("import './x.mjs'")).toEqual([false])
  })

  it('a side-effect import is a statement, and never swallows the one after it', () => {
    expect(specs("import './a.mjs'\nimport { x } from './b.mjs'")).toEqual(['./b.mjs:x', './a.mjs:'])
  })

  it('leaves nothing unparsed on any of those', () => {
    const src = [
      "import { a } from './x.mjs'",
      'import def, { b } from "./y.mjs"',
      "import * as ns from './z.mjs'",
      "import './side.mjs'",
      "import {\n  c,\n} from './multi.mjs'",
    ].join('\n')
    expect(scanStaticImports(src).unparsed).toBe(0)
  })

  it('ignores dynamic import() and import.meta — neither declares a binding', () => {
    const src = "const m = await import('./x.mjs')\nconst u = import.meta.url"
    expect(scanStaticImports(src)).toEqual({ imports: [], unparsed: 0 })
  })

  it('COUNTS a form it cannot read instead of passing over it', () => {
    // A statement start with no recognisable clause: claimed by nothing, so it
    // must surface as blindness rather than as a clean file.
    expect(scanStaticImports('import\n').unparsed).toBe(1)
  })
})

describe('comments are not code', () => {
  it('a commented-out import is neither counted nor followed', () => {
    expect(scanStaticImports("// import { gone } from './x.mjs'\n")).toEqual({ imports: [], unparsed: 0 })
  })

  it('a block comment cannot hide or invent one', () => {
    expect(stripComments("/* import { gone } from './x.mjs' */\nimport { a } from './y.mjs'")).not.toMatch(/gone/)
    expect(specs("/* import { gone } from './x.mjs' */\nimport { a } from './y.mjs'")).toEqual(['./y.mjs:a'])
  })
})

describe('missingNamedImports against the real repository', () => {
  it('finds nothing missing in a file that node loads today', async () => {
    const { missing, unparsed } = await missingNamedImports('scripts/batch-claim-core.mjs')
    expect({ missing, unparsed }).toEqual({ missing: [], unparsed: 0 })
  })

  it('NEGATIVE CONTROL: names the export a module does not have', async () => {
    const { missing } = await missingNamedImports('scripts/module-link-check.fixture.mjs')
    expect(missing).toEqual(["./batch-ownership-core.mjs -> pidCorroboration"])
  })
})

describe('a package or builtin target is checked too, not skipped', () => {
  it('NEGATIVE CONTROL: a misspelt name from a node: builtin is a missing import', async () => {
    const { missing } = await missingNamedImports('scripts/module-link-check.builtin-fixture.mjs')
    expect(missing).toEqual(['node:fs -> readFileSyc'])
  })

  it('reports a target that cannot be loaded at all rather than passing over it', async () => {
    const { missing } = await missingNamedImports('scripts/module-link-check.unresolvable-fixture.mjs')
    expect(missing).toHaveLength(1)
    expect(missing[0]).toMatch(/^\.\/there-is-no-such-module\.mjs -> unloadable \(/)
  })
})

describe('a default binding is a link failure like any other', () => {
  it('NEGATIVE CONTROL: names a default export the target does not have', async () => {
    const { missing } = await missingNamedImports('scripts/module-link-check.default-fixture.mjs')
    expect(missing).toEqual(['./module-link-check.mjs -> default'])
  })
})
