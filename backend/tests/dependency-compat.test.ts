import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { loadConfigFromFile } from '@prisma/config'
import { deepmerge } from 'deepmerge-ts'

test('Prisma 6 config loading remains compatible with the deepmerge security override', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'whereto-prisma-config-'))
  try {
    await writeFile(join(directory, 'prisma.config.ts'), 'export default { schema: "./prisma/schema.prisma", migrations: { path: "./prisma/migrations" } }')
    const result = await loadConfigFromFile({ configRoot: directory })
    assert.equal(result.error, undefined)
    assert.equal(result.config?.schema, resolve(directory, 'prisma/schema.prisma'))
    assert.equal(result.config?.migrations?.path, resolve(directory, 'prisma/migrations'))
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.match(basename(directory), /^whereto-prisma-config-/)
    await rm(directory, { recursive: true, force: true })
  }
})

test('the patched merger handles cyclic objects without stack exhaustion', () => {
  const first: { name: string; self?: unknown } = { name: 'first' }
  const second: { name: string; self?: unknown } = { name: 'second' }
  first.self = first
  second.self = second
  const merged = deepmerge(first, second)
  assert.equal(merged.name, 'second')
  assert.equal(merged.self, merged)
})
