import { doctor } from './doctor.js'
import { install } from './install.js'
import { list } from './list.js'
import { remove } from './remove.js'
import { search } from './search.js'
import { sync } from './sync.js'
import { c, fail } from './util.js'

export const VERSION = '0.1.0'

const HELP = `
${c.bold('aipx')} — install any AI agent skill/plugin into every agent, once.
        Claude Code · DeepSeek Harness (dsh) · Codex CLI · Gemini CLI · Copilot · Cursor

${c.bold('Usage')}
  aipx install <source> [flags]   Install a skill/plugin from GitHub or a local directory
  aipx sync [flags]               Mirror skills from ~/.agents/skills into every other agent
  aipx list [--json]              Show installed skills per agent
  aipx search <query> [--github]  Search the curated registry (+ GitHub topics)
  aipx remove <name>              Uninstall a skill from every agent
  aipx doctor                     Check your environment and detect agents
  aipx --help | --version

${c.bold('Install sources')}
  owner/repo                        GitHub repo (default branch, repo root)
  owner/repo#path:/sub/dir          GitHub repo subdirectory (same syntax dsh uses)
  https://github.com/owner/repo/tree/v1.2/sub   pinned ref + subdirectory
  ./path/to/skill                   local directory

${c.bold('Flags')}
  --agents <id,id>   Install only into these agents (claude-code, dsh, codex, gemini,
                     copilot, cursor, opencode, openclaw)
  --all              Include community-tier agents during auto-detection
  --force            Overwrite skills that already exist
  --copy             sync: duplicate files instead of symlinking
  --dry-run          Show what would happen without writing
  --github           search: also query GitHub topics live
  --json             machine-readable output (list)
  --no-color         Disable colored output

${c.bold('Examples')}
  aipx install zhangliang0115/ai-plugin#path:/skills/skill-author
  aipx sync                       # one copy of every skill, visible in every agent
  aipx list
  aipx doctor

Docs: https://github.com/zhangliang0115/ai-plugin#readme
`

function parseFlags(argv) {
  const flags = { _: [] }
  const valued = new Set(['--agents'])
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--no-color') {
      flags.noColor = true
    } else if (a === '--help' || a === '-h') {
      flags.help = true
    } else if (a === '--version' || a === '-V') {
      flags.version = true
    } else if (a === '--json') {
      flags.json = true
    } else if (a === '--force') {
      flags.force = true
    } else if (a === '--copy') {
      flags.copy = true
    } else if (a === '--dry-run') {
      flags.dryRun = true
    } else if (a === '--all') {
      flags.all = true
    } else if (a === '--github') {
      flags.github = true
    } else if (valued.has(a)) {
      flags[a.slice(2)] = argv[++i]
    } else if (a.startsWith('--')) {
      throw new Error(`unknown flag "${a}" — see aipx --help`)
    } else {
      flags._.push(a)
    }
  }
  return flags
}

export async function main(argv) {
  let flags
  try {
    flags = parseFlags(argv)
  } catch (e) {
    fail(e.message)
    process.exitCode = 1
    return
  }
  if (flags.noColor) process.env.NO_COLOR = '1'

  if (flags.help) {
    console.log(HELP)
    return
  }
  if (flags.version) {
    console.log(`aipx ${VERSION}`)
    return
  }

  const [command, ...rest] = flags._
  try {
    switch (command) {
      case 'install': {
        if (rest.length === 0) throw new Error('usage: aipx install <source> — e.g. aipx install owner/repo')
        await install(rest[0], flags)
        return
      }
      case 'sync': {
        await sync(flags)
        return
      }
      case 'list': {
        const out = await list(flags)
        if (flags.json) console.log(JSON.stringify(out, null, 2))
        return
      }
      case 'search': {
        if (rest.length === 0) throw new Error('usage: aipx search <query>')
        await search(rest.join(' '), flags)
        return
      }
      case 'remove': {
        if (rest.length === 0) throw new Error('usage: aipx remove <skill-name>')
        await remove(rest[0])
        return
      }
      case 'doctor': {
        await doctor()
        return
      }
      default:
        console.log(HELP)
        if (command !== undefined) {
          fail(`unknown command "${command}"`)
          process.exitCode = 1
        }
    }
  } catch (e) {
    fail(e.message)
    process.exitCode = 1
  }
}
