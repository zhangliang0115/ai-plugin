# bad-name

TODO: one sentence — what it does AND when to use it (this is the trigger agents match against).

One repo, every agent: the same `skills/` sources a Claude Code marketplace, a
DeepSeek Harness (`dsh`) bundle, and plain skills for everything else.

## Install

```sh
# 1. Plain skills, every agent (recommended — fans out to what the user has):
npx github:zhangliang0115/ai-plugin install your-github-username/bad-name

# 2. Claude Code marketplace:
#    /plugin marketplace add your-github-username/bad-name
#    /plugin install __NAME-plugin@bad-name
#
# 3. DeepSeek Harness bundle:
dsh plugin --profile web add "github:your-github-username/bad-name#path:/dsh-plugin"
```

## Development

- Edit skills under `skills/` (single source of truth)
- `node scripts/sync-dsh-skills.mjs` after editing any SKILL.md (CI enforces lockstep)
- `npx -y github:zhangliang0115/ai-plugin lint skills` before committing

## Publish checklist

- [ ] description states *when to use*, not just what it is
- [ ] works from a clean install (try the plain-skills line above)
- [ ] GitHub topics: `agent-skills`, `claude-code`, `dsh-plugin`
- [ ] PR your repo into the [aipx curated registry](https://github.com/zhangliang0115/ai-plugin/blob/main/registry/index.json)
