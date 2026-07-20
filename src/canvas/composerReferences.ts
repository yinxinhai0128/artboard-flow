import { CONFIG_REFERENCE_PATTERN, type CanvasResourceReference } from './resourceReferences'

export type ComposerReferenceToken =
  | { type: 'text'; value: string }
  | { type: 'reference'; nodeId: string; token: string }

export function referenceToken(nodeId: string) {
  return `@[node:${nodeId}]`
}

export function parseReferenceTokens(value: string) {
  const tokens: ComposerReferenceToken[] = []
  let lastIndex = 0

  for (const match of value.matchAll(CONFIG_REFERENCE_PATTERN)) {
    if (match.index === undefined) continue
    if (match.index > lastIndex) tokens.push({ type: 'text', value: value.slice(lastIndex, match.index) })
    tokens.push({ type: 'reference', nodeId: match[1], token: match[0] })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < value.length) tokens.push({ type: 'text', value: value.slice(lastIndex) })
  return tokens
}

export function appendReferenceToken(value: string | undefined, nodeId: string) {
  const token = referenceToken(nodeId)
  const current = value ?? ''
  if (current.includes(token)) return current
  return current.trim() ? `${current.trimEnd()} ${token}` : token
}

export function hasReferenceToken(value: string | undefined, nodeId: string) {
  return Boolean(value?.includes(referenceToken(nodeId)))
}

export function removeReferenceToken(value: string | undefined, nodeId: string) {
  return (value ?? '')
    .split(referenceToken(nodeId))
    .join('')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function mentionQueryBeforeCaret(value: string, caret: number) {
  const beforeCaret = value.slice(0, Math.max(0, caret))
  const match = /@([^\s@]*)$/.exec(beforeCaret)
  return match ? match[1] : null
}

export function filterReferenceCandidates(references: CanvasResourceReference[], query: string | null) {
  const normalized = (query ?? '').trim().toLowerCase()
  if (!normalized) return references
  return references.filter((reference) =>
    [
      reference.label,
      reference.title,
      reference.kind,
      reference.text,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalized),
  )
}

export function insertReferenceAtMention(value: string, caret: number, nodeId: string) {
  const safeCaret = Math.max(0, Math.min(caret, value.length))
  const beforeCaret = value.slice(0, safeCaret)
  const afterCaret = value.slice(safeCaret)
  const match = /@([^\s@]*)$/.exec(beforeCaret)
  const insertAt = match?.index ?? safeCaret
  const inserted = `${referenceToken(nodeId)} `
  return {
    value: `${value.slice(0, insertAt)}${inserted}${afterCaret}`.replace(/[ \t]{2,}/g, ' '),
    caret: insertAt + inserted.length,
  }
}
