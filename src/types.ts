export interface GridPoint {
  x: number
  y: number
}

// Alias for GridPoint for use in canvas coordinate contexts
export type Point = GridPoint

// Icon types that can be placed on path points
export type PointIconType = 'play' | 'fastforward' | 'stop' | 'caution' | 'circle' | 'square' | null

// Icon placement on a specific point (keyed by pointIndex)
export type PointIcons = Map<number, PointIconType>

// Corner positions for the title box
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface Path {
  id: string
  points: GridPoint[]
  icons?: PointIcons  // Map from point index to icon type
}

export type SelectionState =
  | { kind: 'none' }
  | { kind: 'floating-point'; point: GridPoint }
  | { kind: 'path'; pathId: string; endpoint: 'start' | 'end' }
  | { kind: 'segment'; pathId: string; segmentIndex: number }
  | { kind: 'point'; pathId: string; pointIndex: number }

export interface AppState {
  straightLineMode: boolean
  draggedPoint: { pathId: string; pointIndex: number } | null
}
