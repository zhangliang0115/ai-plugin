import { execFile } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { access, mkdir, mkdtemp, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { detectAgents, SYNC_PRIMARY } from './agents.js'
import { c, expandTilde, ok, warn } from './util.js'

const execFileAsync = promisify(execFile)

const CHECKS = []

function check(name, fn) {
  CHECKS.push({ name, fn })
}

check('node >= 20', async () => {
  const major = Number(process.versions.node.split('.')[0])
  return {
    pass: major >= 20,
    detail: `node ${process.versions.node}`,
    fix: 'upgrade Node.js — https://nodejs.org',
  }
})

check('tar available (used to unpack GitHub tarballs)', async () => {
  try {
    await execFileAsync('tar', ['--version'])
    return { pass: true }
  } catch {
    return { pass: false, fix: 'install tar (built into macOS, Linux and Windows 10+)' }
  }
})

check('network reach to api.github.com', async () => {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch('https://api.github.com/rate_limit', {
      signal: controller.signal,
      headers: { 'User-Agent': 'aipx-doctor' },
    })
    clearTimeout(timer)
    if (res.status === 403 || res.status === 429) {
      return {
        pass: true,
        detail: 'reachable, but rate-limited',
        fix: 'export GITHUB_TOKEN to raise the rate limit',
      }
    }
    return { pass: res.ok, detail: `HTTP ${res.status}` }
  } catch {
    return { pass: false, fix: 'check your network / proxy settings' }
  }
})

check('GITHUB_TOKEN set (optional, raises API limits)', async () => {
  const has = Boolean(process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN)
  return {
    pass: true,
    detail: has ? 'set' : 'not set — GitHub installs are limited to 60/hour',
    fix: 'export GITHUB_TOKEN=… (optional)',
  }
})

check('symlinks supported (used by `aipx sync`)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aipx-doc-'))
  try {
    const target = path.join(dir, 't')
    const link = path.join(dir, 'l')
    await mkdir(target)
    await symlink(target, link, 'dir')
    return { pass: true }
  } catch {
    return { pass: false, fix: 'symlinks unavailable — use `aipx sync --copy` instead' }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

export async function doctor() {
  const agents = await detectAgents()

  console.log(`\nenvironment:`)
  for (const { name, fn } of CHECKS) {
    const r = await fn()
    const line = r.pass ? ok : warn
    line(`${name}${r.detail ? c.dim(` — ${r.detail}`) : ''}`)
    if (!r.pass && r.fix) console.log(`      fix: ${r.fix}`)
  }

  console.log(`\nagents detected:`)
  for (const a of agents) {
    const marker = a.installed ? c.green('✔') : c.dim('·')
    const tier = a.tier === 'community' ? c.yellow(' [community]') : ''
    console.log(`  ${marker} ${a.label}${tier} ${c.dim(a.installed ? `(via ${a.via})` : '(not found)')}`)
    if (a.installed) {
      const root = expandTilde(a.userRoot)
      let writable = true
      try {
        await access(path.dirname(root), fsConstants.W_OK)
      } catch {
        writable = false
      }
      console.log(`      skills root: ${root} ${writable ? '' : c.yellow('(parent not writable)')}`)
      if (a.userRoot === SYNC_PRIMARY) {
        console.log(`      ${c.dim('this is the aipx sync primary root')}`)
      }
      if (a.env) {
        for (const envVar of a.env) {
          if (!process.env[envVar]) {
            warn(`${a.label} needs ${envVar} — export it before launching the agent`)
          }
        }
      }
      if (a.note) console.log(`      ${c.dim(a.note)}`)
    }
  }
  console.log()
  const count = agents.filter((a) => a.installed).length
  ok(`${count} agent(s) detected — aipx installs into all of them at once`)
  return { agents: count }
}
