export const GRID_SPLIT_MIN = 1
export const GRID_SPLIT_MAX = 12

export type GridSplitAxis = 'horizontal' | 'vertical'
export type GridSplitCountKey = 'rows' | 'columns'
export type GridSplitState = {
  horizontalLines: number[]
  verticalLines: number[]
}

const LINE_PADDING = 0.01

export function createDefaultGridSplitState(): GridSplitState {
  return {
    horizontalLines: buildGridLines(2),
    verticalLines: buildGridLines(2),
  }
}

export function getGridSplitCounts(state: GridSplitState) {
  const rows = state.horizontalLines.length + 1
  const columns = state.verticalLines.length + 1
  return { rows, columns, total: rows * columns }
}

export function setGridSplitCount(state: GridSplitState, key: GridSplitCountKey, value: number): GridSplitState {
  const lines = buildGridLines(clampGridSplitCount(value))
  return key === 'rows' ? { ...state, horizontalLines: lines } : { ...state, verticalLines: lines }
}

export function addGridSplitLine(state: GridSplitState, axis: GridSplitAxis): GridSplitState {
  const key = axis === 'horizontal' ? 'horizontalLines' : 'verticalLines'
  const currentLines = state[key]
  if (currentLines.length >= GRID_SPLIT_MAX - 1) return state
  const lines = [...currentLines, findLineSpot(currentLines)].sort((a, b) => a - b)
  return { ...state, [key]: lines }
}

export function removeGridSplitLine(state: GridSplitState, axis: GridSplitAxis, index: number): GridSplitState {
  const key = axis === 'horizontal' ? 'horizontalLines' : 'verticalLines'
  const lines = state[key].filter((_, lineIndex) => lineIndex !== index)
  return { ...state, [key]: lines }
}

export function moveGridSplitLine(state: GridSplitState, axis: GridSplitAxis, index: number, value: number): GridSplitState {
  const key = axis === 'horizontal' ? 'horizontalLines' : 'verticalLines'
  const lines = [...state[key]]
  if (!Number.isFinite(lines[index])) return state
  lines[index] = clampLine(value, lines[index - 1] ?? 0, lines[index + 1] ?? 1)
  return { ...state, [key]: lines }
}

export function resetGridSplitLines(state: GridSplitState): GridSplitState {
  const { rows, columns } = getGridSplitCounts(state)
  return {
    horizontalLines: buildGridLines(rows),
    verticalLines: buildGridLines(columns),
  }
}

export function clampGridSplitCount(value: number) {
  return Math.min(GRID_SPLIT_MAX, Math.max(GRID_SPLIT_MIN, Math.round(Number.isFinite(value) ? value : 2)))
}

function buildGridLines(count: number) {
  return Array.from({ length: clampGridSplitCount(count) - 1 }, (_, index) => (index + 1) / clampGridSplitCount(count))
}

function findLineSpot(lines: number[]) {
  const cuts = [0, ...lines, 1].sort((a, b) => a - b)
  let spot = 0.5
  let widestGap = 0
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const gap = cuts[index + 1] - cuts[index]
    if (gap > widestGap) {
      widestGap = gap
      spot = cuts[index] + gap / 2
    }
  }
  return spot
}

function clampLine(value: number, min: number, max: number) {
  return Math.min(max - LINE_PADDING, Math.max(min + LINE_PADDING, value))
}
