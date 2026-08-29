import { exists, expandTilde } from './util.js'

/**
 * Parse an install source into a descriptor.
 *
 * Accepted forms:
 *   owner/repo                          → GitHub repo, default branch, repo root
 *   owner/repo#path:/sub/dir            → GitHub repo, subdirectory (pnpm/dsh syntax)
 *   https://github.com/owner/repo       → GitHub repo
 *   https://github.com/owner/repo/tree/<ref>/<sub/path> → pinned ref + subdir
 *   git@github.com:owner/repo(.git)     → GitHub repo (ssh form)
 *   ./local/dir | ~/local/dir | /abs    → local directory (already on disk)
 */
export async function parseSource(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error('missing install source — try: aipx install owner/repo')
  }
  const raw = input.trim()

  const local = await tryLocal(raw)
  if (local) return local

  const gh = tryGithub(raw)
  if (gh) return gh

  throw new Error(
    `cannot parse source "${raw}" — use owner/repo, a github.com URL, or a local directory`
  )
}

async function tryLocal(raw) {
  const looksLocal =
    raw.startsWith('./') || raw.startsWith('../') || raw.startsWith('/') || raw.startsWith('~/')
  if (!looksLocal) return null
  const p = expandTilde(raw)
  if (!(await exists(p))) throw new Error(`local path not found: ${p}`)
  return { kind: 'local', path: p, label: raw }
}

function tryGithub(raw) {
  let owner = null
  let repo = null
  let ref = null
  let sub = null

  const url =
    /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#]+?)(?:\.git)?(?:\/|$)(.*)$/.exec(raw)
  const ssh = /^git@github\.com:([^/\s]+)\/([^/\s#]+?)(?:\.git)?$/.exec(raw)

  if (url) {
    owner = url[1]
    repo = url[2]
    const rest = url[3].replace(/\/+$/, '')
    const tree = /^tree\/([^/]+)(?:\/(.*))?$/.exec(rest)
    if (tree) {
      ref = tree[1]
      sub = tree[2] ?? null
    } else if (rest !== '') {
      throw new Error(`unsupported GitHub URL path "/${rest}" — use .../tree/<ref>/<subpath>`)
    }
  } else if (ssh) {
    owner = ssh[1]
    repo = ssh[2]
  } else {
    const short = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:#path:\/?(.+))?$/.exec(raw)
    if (short === null) return null
    owner = short[1]
    repo = short[2]
    sub = short[3] ?? null
  }

  if (owner === null || repo === null) return null

  return {
    kind: 'github',
    owner,
    repo,
    ref,
    sub: sub ? sub.replace(/\/+$/, '') : null,
    label: sub ? `${owner}/${repo}#path:/${sub}` : `${owner}/${repo}`,
  }
}
