# Contributing to ai-plugin

Thanks for helping make AI agent tooling less fragmented. Every kind of
contribution is welcome — code, docs, registry entries, root confirmations,
bug reports.

## Quick start

```sh
git clone https://github.com/zhangliang0115/ai-plugin
cd ai-plugin
npm test            # node --test test/
npm run lint        # syntax check (zero-dep project, no linter deps)
npm run check-drift # dsh-plugin/skills vs skills/ lockstep
```

Requirements: Node.js ≥ 20. The project has **zero runtime dependencies** on
purpose — please don't add any without discussing first.

## Submitting a plugin/skill to the registry

Open a PR editing [`registry/index.json`](registry/index.json) (or an issue
with the [plugin submission template](.github/ISSUE_TEMPLATE/plugin-submission.md)).
Rules:

1. The repo must exist and be public — CI verifies via the GitHub API.
2. `description` in your own words, `topics` honest (only tags your repo carries).
3. One entry per repo. Include an `install` line users can copy-paste.

## Adding or confirming an agent root

The compatibility matrix in `docs/compatibility-matrix.md` and
`src/agents.js` is the source of truth. To promote a `community` tier root to
`official`, include a link to official docs (from the tool vendor) in your PR.

## Code guidelines

- One concern per module under `src/`; the CLI layer (`cli.js`) only parses
  and dispatches.
- No framework, no dependencies; use `node:` builtins. YAML in SKILL.md
  frontmatter is parsed by the minimal reader in `util.js` — extend it, don't
  import a YAML library.
- Add `node:test` coverage for new behavior in `test/`.
- Keep output terminal-friendly: short lines, colors via `util.c` (auto-off
  when not a TTY or `--no-color`).

## Commit style

Conventional Commits prefixes (`feat:`, `fix:`, `docs:`, `chore:`, `test:`)
keep the changelog easy to generate.

## Reporting bugs

Use the bug template. Always include `aipx doctor` output — it answers 80% of
the follow-up questions.

## License

By contributing you agree your contributions are licensed under the MIT
License of this repository.
