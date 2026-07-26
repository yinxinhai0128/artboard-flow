import { describe, expect, it } from 'vitest'
import {
  addGridSplitLine,
  createDefaultGridSplitState,
  getGridSplitCounts,
  moveGridSplitLine,
  removeGridSplitLine,
  resetGridSplitLines,
  setGridSplitCount,
} from './imageGridSplitControls'

describe('image grid split controls', () => {
  it('keeps rows and columns derived from adjustable split lines', () => {
    const threeRows = setGridSplitCount(createDefaultGridSplitState(), 'rows', 3)
    expect(threeRows.horizontalLines).toEqual([1 / 3, 2 / 3])
    expect(getGridSplitCounts(threeRows)).toEqual({ rows: 3, columns: 2, total: 6 })

    const moved = moveGridSplitLine(threeRows, 'horizontal', 0, 0.2)
    expect(moved.horizontalLines).toEqual([0.2, 2 / 3])
    expect(getGridSplitCounts(moved)).toEqual({ rows: 3, columns: 2, total: 6 })

    const added = addGridSplitLine(moved, 'horizontal')
    expect(added.horizontalLines).toEqual([0.2, 0.43333333333333335, 2 / 3])
    expect(getGridSplitCounts(added)).toEqual({ rows: 4, columns: 2, total: 8 })

    const clamped = moveGridSplitLine(added, 'horizontal', 1, 0.99)
    expect(clamped.horizontalLines).toEqual([0.2, 0.6566666666666666, 2 / 3])

    const removed = removeGridSplitLine(clamped, 'horizontal', 1)
    expect(removed.horizontalLines).toEqual([0.2, 2 / 3])
    expect(getGridSplitCounts(removed)).toEqual({ rows: 3, columns: 2, total: 6 })

    expect(resetGridSplitLines(removed).horizontalLines).toEqual([1 / 3, 2 / 3])
  })
})
