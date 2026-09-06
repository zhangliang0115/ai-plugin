import { LexicalIndex, withLexicalFallback } from './lexical.js'
import { SidecarIndex } from './sidecar.js'

/**
 * Build the hub's search index from an optional sidecar spec (the
 * mcp-hub.json `search.sidecar` string, as `aipx mcp serve --sidecar` sets).
 *
 * Mirrors src/cli.js's sidecar wiring: an explicit command wraps a
 * SidecarIndex in withLexicalFallback, so a broken/tardy enhancer degrades to
 * lexical scoring instead of failing the hub.
 *
 * The `zvec` alias is NOT resolved here — the dsh bundle does not ship
 * sidecars/zvec_sidecar.py, so that shorthand logs a notice and falls back to
 * lexical rather than silently ignoring the request.
 *
 * @param {string} [sidecarSpec] - "<command> [args…]" as one string, or undefined.
 * @param {(msg: string) => void} log
 * @returns {object|undefined} a createHub searchIndex, or undefined for pure lexical.
 */
export function buildSearchIndex(sidecarSpec, log = () => {}) {
  if (typeof sidecarSpec !== 'string' || sidecarSpec.trim() === '') return undefined
  const spec = sidecarSpec.trim()
  if (spec === 'zvec') {
    log('dsh bundle does not ship the zvec sidecar — search stays lexical')
    return undefined
  }
  const [cmd, ...args] = spec.split(/\s+/)
  if (cmd === undefined || cmd === '') return undefined
  return withLexicalFallback(
    () => new SidecarIndex({ command: cmd, args, log }),
    () => new LexicalIndex(),
    log
  )
}
