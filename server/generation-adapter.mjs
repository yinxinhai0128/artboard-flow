export const GENERATION_JOB_STATUSES = new Set(['queued', 'running', 'succeeded', 'failed'])

export function normalizeGenerationJobPayload(input = {}) {
  const payload = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const mode = payload.mode === 'video' || payload.mode === 'text' ? payload.mode : 'image'
  const prompt = typeof payload.prompt === 'string' ? payload.prompt : ''
  const inputs = Array.isArray(payload.inputs) ? payload.inputs.flatMap(normalizePayloadInput) : []
  return {
    mode,
    model: typeof payload.model === 'string' && payload.model.trim() ? payload.model.trim() : 'default',
    size: typeof payload.size === 'string' && payload.size.trim() ? payload.size.trim() : '1024x1024',
    count: Math.max(1, Math.min(15, Math.floor(Math.abs(Number(payload.count)) || 1))),
    prompt,
    summary: normalizeSummary(payload.summary, inputs),
    inputs,
    createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : new Date().toISOString(),
  }
}

export function normalizeGenerationJobResult(input = {}) {
  const result = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  return {
    content: typeof result.content === 'string' ? result.content : typeof result.url === 'string' ? result.url : '',
    mimeType: typeof result.mimeType === 'string' ? result.mimeType : undefined,
    bytes: Number.isFinite(result.bytes) ? result.bytes : undefined,
    naturalWidth: Number.isFinite(result.naturalWidth) ? result.naturalWidth : Number.isFinite(result.width) ? result.width : undefined,
    naturalHeight: Number.isFinite(result.naturalHeight) ? result.naturalHeight : Number.isFinite(result.height) ? result.height : undefined,
  }
}

export function normalizeGenerationJobStatus(value) {
  return GENERATION_JOB_STATUSES.has(value) ? value : 'queued'
}

export function parseGenerationJob(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    nodeId: row.node_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payload: JSON.parse(row.payload_json),
    result: row.result_json ? JSON.parse(row.result_json) : null,
    error: row.error || undefined,
  }
}

function normalizePayloadInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return []
  if (input.type !== 'text' && input.type !== 'image' && input.type !== 'video') return []
  return [{
    nodeId: typeof input.nodeId === 'string' ? input.nodeId : '',
    type: input.type,
    title: typeof input.title === 'string' ? input.title : 'Untitled input',
    text: typeof input.text === 'string' ? input.text : undefined,
    media: normalizeMedia(input.media),
  }]
}

function normalizeMedia(media) {
  if (!media || typeof media !== 'object' || Array.isArray(media)) return undefined
  const url = typeof media.url === 'string' ? media.url : ''
  if (!url) return undefined
  return {
    url,
    mimeType: typeof media.mimeType === 'string' ? media.mimeType : undefined,
    bytes: Number.isFinite(media.bytes) ? media.bytes : undefined,
    width: Number.isFinite(media.width) ? media.width : undefined,
    height: Number.isFinite(media.height) ? media.height : undefined,
  }
}

function normalizeSummary(summary, inputs) {
  if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
    return {
      text: countNumber(summary.text),
      image: countNumber(summary.image),
      video: countNumber(summary.video),
    }
  }
  return inputs.reduce(
    (counts, input) => {
      counts[input.type] += 1
      return counts
    },
    { text: 0, image: 0, video: 0 },
  )
}

function countNumber(value) {
  return Math.max(0, Math.floor(Math.abs(Number(value)) || 0))
}
