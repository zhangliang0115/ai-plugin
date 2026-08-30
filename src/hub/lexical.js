import { tokenize } from './index.js'

/**
 * The shipped default index: deterministic lexical scoring, zero
 * dependencies. Implements the same build/search contract as SidecarIndex,
 * so the two are interchangeable inside createHub.
 */
export class LexicalIndex {
  constructor() {
    this.entries = []
  }

  async build(entries) {
    this.entries = entries
  }

  async search(query, limit = 8) {
    const qTokens = tokenize(query)
    if (qTokens.length === 0) return []
    const scored = []
    for (const e of this.entries) {
      const textLower = e.text.toLowerCase()
      let score = 0
      for (const token of qTokens) {
        if (textLower.includes(token)) score += 2
        else score -= 1
      }
      if (score > 0) scored.push({ id: e.id, score })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  }
}

/**
 * Wrap a primary index with the lexical fallback policy from
 * docs/mcp-hub-vector-search.md: if the primary is missing, errors, or times
 * out, fall back to lexical — permanently for this hub instance (an optional
 * enhancer must never turn into a hard failure).
 */
export function withLexicalFallback(primaryFactory, makeLexical, log = () => {}) {
  let primary = null
  let lexical = null
  let degraded = false

  const lexicalIndex = () => {
    if (!lexical) lexical = makeLexical()
    return lexical
  }

  return {
    async build(entries) {
      if (degraded) return lexicalIndex().build(entries)
      try {
        primary = primary ? primary : primaryFactory()
        await primary.build(entries)
      } catch (e) {
        degraded = true
        try {
          primary.stop?.()
        } catch {}
        primary = null
        log(`vector search disabled for this session (${e.message}) — using lexical scoring`)
        await lexicalIndex().build(entries)
      }
    },
    async search(query, limit) {
      if (degraded || !primary) return lexicalIndex().search(query, limit)
      try {
        return await primary.search(query, limit)
      } catch (e) {
        degraded = true
        log(`vector search failed (${e.message}) — falling back to lexical scoring`)
        return lexicalIndex().search(query, limit)
      }
    },
  }
}
