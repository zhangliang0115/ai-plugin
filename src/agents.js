import { accessSync, constants as fsConstants } from 'node:fs'
import path from 'node:path'
import { expandTilde, isDir } from './util.js'

/**
 * Every agent harness aipx knows about, and where each one discovers skills.
 *
 * `tier: 'official'` roots are documented by the tool itself (see
 * docs/compatibility-matrix.md for sources). `tier: 'community'` roots are
 * reported by users but not yet confirmed in official docs — aipx only
 * installs into them with `--all` or an explicit `--agents <id>`.
 *
 * DeepSeek Harness (dsh) and Codex CLI both discover `~/.agents/skills`
 * (the emerging cross-agent root), which is why it is aipx's sync primary.
 */
export const AGENTS = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    bin: 'claude',
    userRoot: '~/.claude/skills',
    projectRoot: '.claude/skills',
    configDirs: ['~/.claude'],
    tier: 'official',
    note: 'skills load on the next session; run /doctor if in doubt',
  },
  {
    id: 'dsh',
    label: 'DeepSeek Harness (dsh)',
    bin: 'dsh',
    userRoot: '~/.agents/skills',
    projectRoot: '.agents/skills',
    configDirs: ['~/.dsh', '$DSH_HOME'],
    env: ['DEEPSEEK_API_KEY'],
    tier: 'official',
    note: 'discovery tier 500 picks ~/.agents/skills up automatically (requires DEEPSEEK_API_KEY)',
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    bin: 'codex',
    userRoot: '~/.agents/skills',
    projectRoot: '.agents/skills',
    configDirs: ['~/.codex'],
    tier: 'official',
    note: 'reads the shared ~/.agents/skills root',
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    bin: 'gemini',
    userRoot: '~/.gemini/skills',
    projectRoot: '.gemini/skills',
    configDirs: ['~/.gemini'],
    tier: 'official',
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot CLI',
    bin: 'copilot',
    userRoot: '~/.copilot/skills',
    projectRoot: '.github/skills',
    configDirs: ['~/.copilot'],
    tier: 'official',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    bin: null,
    userRoot: '~/.cursor/skills',
    projectRoot: '.cursor/skills',
    configDirs: ['~/.cursor'],
    tier: 'community',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    bin: 'opencode',
    userRoot: '~/.config/opencode/skills',
    projectRoot: '.opencode/skills',
    configDirs: ['~/.config/opencode'],
    tier: 'community',
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    bin: 'openclaw',
    userRoot: '~/.openclaw/skills',
    projectRoot: null,
    configDirs: ['~/.openclaw'],
    tier: 'community',
  },
]

export const SYNC_PRIMARY = '~/.agents/skills'

export function agentById(id) {
  return AGENTS.find((a) => a.id === id)
}

function binOnPath(bin) {
  if (!bin) return false
  const dirs = (process.env.PATH ?? '').split(':').filter(Boolean)
  return dirs.some((d) => {
    try {
      accessSync(`${d}/${bin}`, fsConstants.X_OK)
      return true
    } catch {
      return false
    }
  })
}

/**
 * Detect which agents are present on this machine: a binary on PATH or a
 * config directory is enough evidence. Returns a fresh array; callers may
 * mutate their copy.
 */
export async function detectAgents() {
  const out = []
  for (const agent of AGENTS) {
    const configHit = []
    for (const dir of agent.configDirs) {
      if (dir.startsWith('$')) {
        const envName = dir.slice(1)
        if (process.env[envName]) configHit.push(dir)
      } else if (await isDir(expandTilde(dir))) {
        configHit.push(dir)
      }
    }
    const hasBin = binOnPath(agent.bin)
    out.push({
      ...agent,
      installed: hasBin || configHit.length > 0,
      via: hasBin ? 'binary' : configHit.length > 0 ? 'config dir' : null,
    })
  }
  return out
}

/** User-level skill roots aipx should write into for the given agents. */
export async function userRootsFor(agents) {
  const roots = []
  for (const a of agents) {
    roots.push({ agent: a, root: expandTilde(a.userRoot) })
  }
  return roots
}

/**
 * Project-scoped skill roots for the given agents, inside projectDir.
 * Agents without a project root (e.g. OpenClaw) are skipped. dsh and Codex
 * share `.agents/skills`, so the list is deduped by root.
 */
export function projectRootsFor(agents, projectDir) {
  const out = []
  const seen = new Set()
  for (const a of agents) {
    if (!a.projectRoot) continue
    const root = path.join(projectDir, a.projectRoot)
    if (seen.has(root)) continue
    seen.add(root)
    out.push({ agent: a, root })
  }
  return out
}
