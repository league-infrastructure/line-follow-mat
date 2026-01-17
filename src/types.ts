export const BOARD_INCHES = 48
export const GRID_SPACING_INCHES = 2
export const GRID_POINTS = BOARD_INCHES / GRID_SPACING_INCHES + 1 // 25 points across and down

export interface GridPoint {
  x: number
  y: number
}

export interface Path {
  id: string
  points: GridPoint[]
}

export type SelectionState =
  | { kind: 'none' }
  | { kind: 'floating-point'; point: GridPoint }
  | { kind: 'path'; pathId: string; endpoint: 'start' | 'end' }
  | { kind: 'segment'; pathId: string; segmentIndex: number }
  | { kind: 'point'; pathId: string; pointIndex: number }

export interface AppState {
  pointEditMode: boolean
  straightLineMode: boolean
  draggedPoint: { pathId: string; pointIndex: number } | null
}
