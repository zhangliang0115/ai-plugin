import { doctor } from './doctor.js'
import { install } from './install.js'
import { lintPath } from './lint.js'
import { list } from './list.js'
import { listMcp, syncMcp } from './mcp.js'
import { newRepo } from './scaffold.js'
import { remove } from './remove.js'
import { search } from './search.js'
import { sync } from './sync.js'
import { upgrade } from './upgrade.js'
import { c, fail, info, ok, warn } from './util.js'

export const VERSION = '0.1.0'

const HELP = `
${c.bold('aipx')} — install any AI agent skill/plugin into every agent, once.
        Claude Code · DeepSeek Harness (dsh) · Codex CLI · Gemini CLI · Copilot · Cursor

${c.bold('Usage')}
  aipx install <source> [flags]   Install a skill/plugin from GitHub or a local directory
  aipx sync [flags]               Mirror skills from ~/.agents/skills into every other agent
  aipx upgrade [name] [flags]     Re-install recorded skills from their source (all, or one)
  aipx new <name> [flags]         Scaffold a dual-target skill repo (skills + Claude marketplace + dsh bundle)
  aipx list [--json]              Show installed skills per agent
  aipx search <query> [--github]  Search the curated registry (+ GitHub topics)
  aipx lint [path] [--json]       Validate SKILL.md quality (default: current directory)
  aipx remove <name>              Uninstall a skill from every agent
  aipx mcp list [--json]          Show MCP servers configured in each agent's config
  aipx mcp sync <name> [flags]    Copy an MCP server definition into other agents' configs
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
  --from <agent>     mcp sync: read the definition from this agent's config
  --project [path]   Install into project-scoped roots inside [path] (default: current
                     directory) — .claude/skills, .agents/skills, .github/skills, …
                     so a repo carries its own skills for the whole team
  --all              Include community-tier agents during auto-detection
  --force            Overwrite skills that already exist
  --copy             sync: duplicate files instead of symlinking
  --prune            sync: remove dangling links whose primary skill is gone
  --dry-run          Show what would happen without writing
  --github           search: also query GitHub topics live
  --dir <path>       new: parent directory for the scaffold (default: current directory)
  --owner <name>     new: GitHub username to bake into install lines
  --json             machine-readable output (list, lint)
  --no-color         Disable colored output

${c.bold('Examples')}
  aipx install zhangliang0115/ai-plugin#path:/skills/skill-author
  aipx install owner/repo --project          # project skills, committed with the repo
  aipx sync                       # one copy of every skill, visible in every agent
  aipx upgrade                    # re-install everything from its recorded source
  aipx new my-skill               # scaffold a publish-ready dual-target repo
  aipx list
  aipx doctor

Docs: https://github.com/zhangliang0115/ai-plugin#readme
`

function parseFlags(argv) {
  const flags = { _: [] }
  const valued = new Set(['--agents', '--dir', '--owner', '--from'])
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
    } else if (a === '--project') {
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('-')) {
        flags.project = next
        i += 1
      } else {
        flags.project = true // no value given → current directory
      }
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
      case 'upgrade': {
        await upgrade(flags._[1], flags)
        return
      }
      case 'new': {
        if (flags._[1] === undefined) throw new Error('usage: aipx new <name> — e.g. aipx new my-skill')
        await newRepo(flags._[1], flags)
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
      case 'lint': {
        const target = flags._[1] ?? '.'
        const { results, orphans } = await lintPath(target)
        if (flags.json) {
          console.log(JSON.stringify({ target, orphans, results }, null, 2))
        } else {
          let errors = 0
          let warnings = 0
          for (const r of results) {
            console.log(`\n${c.bold(r.name)} ${r.dir}`)
            for (const e of r.errors) {
              errors += 1
              console.log(`  ${c.red('✗ ' + e)}`)
            }
            for (const w of r.warnings) {
              warnings += 1
              console.log(`  ${c.yellow('! ' + w)}`)
            }
            if (r.errors.length === 0 && r.warnings.length === 0) {
              console.log(`  ${c.green('clean')}`)
            }
          }
          for (const o of orphans) {
            errors += 1
            console.log(`\n${c.red('✗ ' + o + ' — missing SKILL.md')}`)
          }
          console.log()
          if (errors > 0) {
            fail(`${errors} error(s), ${warnings} warning(s) in ${results.length} skill(s)`)
            process.exitCode = 1
          } else if (results.length > 0) {
            ok(`${results.length} skill(s) linted — ${warnings} warning(s)`)
          }
        }
        return
      }
      case 'mcp': {
        const sub = flags._[1]
        if (sub === 'list') {
          const out = await listMcp(flags)
          if (flags.json) {
            console.log(JSON.stringify(out, null, 2))
          } else {
            const ids = Object.keys(out)
            if (ids.length === 0) {
              info('no MCP configs found in any known agent config file')
            } else {
              for (const id of ids) {
                const entry = out[id]
                console.log(`\n${entry.label} (${entry.file})`)
                if (entry.error) {
                  console.log(`  ${c.red('✗ ' + entry.error)}`)
                  continue
                }
                if (entry.servers.length === 0) console.log(`    ${c.dim('(no servers configured)')}`)
                for (const s of entry.servers) {
                  const def = s.def
                  const summary = def.command
                    ? `${def.command}${Array.isArray(def.args) ? ' ' + def.args.join(' ') : ''}`
                    : def.url ?? ''
                  console.log(`    ${c.bold(s.name)} ${c.dim(summary)}`)
                }
              }
              console.log()
            }
          }
          return
        }
        if (sub === 'sync') {
          await syncMcp(flags._[2], flags)
          return
        }
        throw new Error('usage: aipx mcp list — or — aipx mcp sync <server-name> [--from <agent>] [--agents <id,id>]')
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
