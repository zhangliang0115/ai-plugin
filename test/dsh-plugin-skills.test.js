import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * The dsh bundle registers skills through the explicit SKILL_DIRS list in
 * index.js. A skill folder dropped into dsh-plugin/skills/ without a matching
 * entry ships in the package but never reaches the agent — this guards the
 * pairing (regression: deepseek-migration and skill-portability-audit shipped
 * unregistered in 0.4.2).
 */
test('dsh bundle registers every skill folder it ships', async () => {
  const pluginRoot = new URL('../dsh-plugin/', import.meta.url)
  const entries = await readdir(new URL('skills/', pluginRoot), { withFileTypes: true })
  const skillDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  assert.ok(skillDirs.length >= 6, `expected the full bundled set, found: ${skillDirs.join(', ')}`)

  const source = await readFile(new URL('index.js', pluginRoot), 'utf8')
  const registered = [...source.matchAll(/'skills\/([\w-]+)'/g)].map((m) => m[1])
  for (const dir of skillDirs) {
    assert.ok(
      registered.includes(dir),
      `dsh-plugin/skills/${dir} exists but SKILL_DIRS never registers it`,
    )
  }
})
