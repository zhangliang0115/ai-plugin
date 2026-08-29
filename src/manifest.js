import path from 'node:path'
import { configDir, exists, readJson, writeJson } from './util.js'

function manifestPath() {
  return path.join(configDir(), 'installed.json')
}

export async function loadManifest() {
  const p = manifestPath()
  if (!(await exists(p))) return { version: 1, installed: {} }
  try {
    const m = await readJson(p)
    if (m && typeof m === 'object' && m.installed) return m
  } catch {
    // corrupt manifest — start over rather than blocking every command
  }
  return { version: 1, installed: {} }
}

export async function saveManifest(manifest) {
  await writeJson(manifestPath(), manifest)
}

export async function recordInstall({ name, description, source, kind, roots }) {
  const manifest = await loadManifest()
  manifest.installed[name] = {
    source,
    kind,
    description,
    installedAt: new Date().toISOString(),
    roots,
  }
  await saveManifest(manifest)
}

export async function recordRemove(name) {
  const manifest = await loadManifest()
  delete manifest.installed[name]
  await saveManifest(manifest)
}
