export function canPersistConnection(from, to) {
  if (!from || !to || from.type === 'group' || to.type === 'group') return false
  if (from.type === 'config' && !isGenerationTaskNode(to)) return false
  return true
}

function isGenerationTaskNode(node) {
  return Boolean(node?.metadata?.generationPayload)
}
