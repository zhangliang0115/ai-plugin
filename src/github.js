import { execFile } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const UA = 'aipx (https://github.com/zhangliang0115/ai-plugin)'

function authHeaders() {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function githubJson(pathname) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': UA, ...authHeaders() },
  })
  if (!res.ok) {
    throw new Error(`GitHub API ${pathname} failed: HTTP ${res.status}`)
  }
  return res.json()
}

/**
 * Download a repo tarball (default branch, or `ref` when given) and extract it
 * with the system `tar`. Returns the absolute path of the extracted top-level
 * directory inside a fresh temp dir (caller removes the temp dir).
 */
export async function downloadRepoTarball({ owner, repo, ref }) {
  const url = ref
    ? `https://api.github.com/repos/${owner}/${repo}/tarball/${encodeURIComponent(ref)}`
    : `https://api.github.com/repos/${owner}/${repo}/tarball`

  const res = await fetch(url, { headers: { 'User-Agent': UA, ...authHeaders() } })
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`repo not found (or private): ${owner}/${repo}`)
    }
    if (res.status === 403) {
      throw new Error('GitHub rate limit hit — set GITHUB_TOKEN to raise the limit')
    }
    throw new Error(`download failed for ${owner}/${repo}: HTTP ${res.status}`)
  }

  const temp = await mkdtemp(path.join(tmpdir(), 'aipx-'))
  const archive = path.join(temp, 'repo.tar.gz')
  await pipeline(Readable.fromWeb(res.body), createWriteStream(archive))

  await execFileAsync('tar', ['-xzf', archive, '-C', temp])
  await rm(archive, { force: true })

  const entries = await readdir(temp)
  const top = entries[0]
  if (entries.length !== 1 || top === undefined) {
    throw new Error(`unexpected tarball layout for ${owner}/${repo}`)
  }
  return { temp, root: path.join(temp, top) }
}

/** Write a scratch file (used for tests / diagnostics). */
export async function writeTemp(prefix, name, content) {
  const dir = await mkdtemp(path.join(tmpdir(), prefix))
  const file = path.join(dir, name)
  await writeFile(file, content, 'utf8')
  return { dir, file }
}

export async function cleanup(temp) {
  await rm(temp, { recursive: true, force: true })
}
