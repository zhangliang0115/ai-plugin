---
name: dsh-plugin-dev
description: >-
  Package and publish a DeepSeek Harness (dsh) plugin bundle that registers
  skills, tools or services. Use when building a dsh plugin, writing a
  cordis.patch.yml, or installing a GitHub plugin into a dsh profile.
---

# Building a DeepSeek Harness (dsh) plugin

DeepSeek Harness (`dsh`) is DeepSeek AI's open-source agent harness built on an
everything-is-a-plugin architecture (the Cordis framework). A **bundle** is an
npm package that contributes a configuration layer; a **profile** is a runnable
composition of bundles. Your plugin is a bundle.

## Minimum viable bundle

```
my-dsh-plugin/
├── package.json        # declares dsh.bundle
├── cordis.patch.yml    # the layer your bundle contributes
└── index.js            # plugin entry (plain JS — no build step needed)
```

`package.json`:

```json
{
  "name": "my-dsh-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml", "skills"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`cordis.patch.yml` — the row's `name` is your **package name** (Node resolves
it), and `id` is how users can override your row:

```yaml
- insert:
    - id: my-plugin
      name: my-dsh-plugin
```

`index.js` — registering a bundled skill at runtime:

```js
import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'my-plugin'
export const inject = ['skills']

const HERE = dirname(fileURLToPath(import.meta.url))

export function apply(ctx) {
  if (ctx.skills === undefined) return
  let dispose
  let disposed = false

  ctx.effect(() => {
    loadSkill()
      .then((skill) => {
        if (disposed || skill === undefined) return
        dispose = ctx.skills.register(skill)
      })
      .catch((e) => ctx.logger.warn('register failed: %o', e))

    return () => {
      disposed = true
      dispose?.()
    }
  })
}

async function loadSkill() {
  const dir = resolve(HERE, 'skills/my-skill')
  const path = join(dir, 'SKILL.md')
  const raw = await readFile(path, 'utf8')
  const { name, description, body } = parseFrontmatter(raw) // your minimal parser
  let resourceBase
  if ((await stat(dir)).isDirectory()) {
    resourceBase = { kind: 'directory', path: dir }  // serves references/ + scripts/
  }
  return { name, description, content: body, source: 'bundled', path, resourceBase }
}
```

Key contract points:

- `inject = ['skills']` makes Cordis wait for the skills service before `apply`.
- `ctx.skills.register(...)` returns a disposer; call it in your `ctx.effect`
  cleanup so unloads are clean.
- A bundle without `dsh.bundle` in package.json installs as a plain dependency
  and activates **no layer** — dsh warns.

## Installing your plugin from GitHub

Users install straight from a git host — no registry needed:

```sh
# if your plugin lives in a repo subdirectory:
dsh plugin --profile web add "github:you/my-repo#path:/my-dsh-plugin"
# quote it — the # is a shell comment otherwise
```

The git-install catch: pnpm runs no build script unless the user allowlists
it (`allowBuilds` in the profile's `pnpm-workspace.yaml`). **Ship plain JS and
no `prepare` script** so installs work with zero friction. If you must build,
document the `allowBuilds` step and pin a commit:
`github:you/my-repo#<sha>`.

## How dsh discovers skills

Same SKILL.md contract as Claude Code, with six discovery tiers (lower wins).
The two you use most:

| Tier | Root | Scope |
|---|---|---|
| 200 | `<project>/.agents/skills` | nearest ancestor with `.git` |
| 500 | `~/.agents/skills` | user-global (shared with Codex CLI) |

- Only **direct children** of a root are scanned — `skills/a/SKILL.md` yes,
  `skills/a/b/SKILL.md` no.
- dsh requires `DEEPSEEK_API_KEY` in the environment at startup.
- Verify install: `dsh --profile web --dump-config` shows a
  `# == your-bundle` layer; in the Web UI, skills appear under the `/`
  command palette → Skills group and in "Context injection · skill-catalog".

## Ecosystem tips

- Add the `dsh-plugin` GitHub topic so your repo shows up in the ecosystem
  index (12k+ repos already use it).
- Support dual-target packaging: the same repo can also be a Claude Code
  marketplace (`.claude-plugin/marketplace.json`) and plain skills — one
  source, every agent. See the `claude-plugin-dev` skill.
- Reference ecosystem: `deepseek-ai/deepseek-harness` (docs under
  `docs/user/develop/`), and `JimmyLv/bibigpt-skill` for a working
  skills-registering bundle.
