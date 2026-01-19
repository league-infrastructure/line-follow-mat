/**
 * Configuration constants for the line follower board
 */

// Board size presets
export interface BoardSize {
  label: string
  width: number  // inches
  height: number // inches
  gridSpacing: number // inches
}

export const BOARD_SIZES: BoardSize[] = [
  { label: '24" × 18" · 2" grid', width: 24, height: 18, gridSpacing: 2 },
  { label: '36" × 24" · 2" grid', width: 36, height: 24, gridSpacing: 2 },
  { label: '48" × 36" · 2" grid', width: 48, height: 36, gridSpacing: 2 },
  { label: '48" × 48" · 2" grid', width: 48, height: 48, gridSpacing: 2 },
]

// Default board size index
export const DEFAULT_BOARD_SIZE_INDEX = 2 // 48" × 36"

// Current board dimensions (can be changed dynamically)
export let BOARD_WIDTH_INCHES = BOARD_SIZES[DEFAULT_BOARD_SIZE_INDEX].width
export let BOARD_HEIGHT_INCHES = BOARD_SIZES[DEFAULT_BOARD_SIZE_INDEX].height
export let GRID_SPACING_INCHES = BOARD_SIZES[DEFAULT_BOARD_SIZE_INDEX].gridSpacing

// Computed grid points
export let GRID_POINTS_X = BOARD_WIDTH_INCHES / GRID_SPACING_INCHES + 1
export let GRID_POINTS_Y = BOARD_HEIGHT_INCHES / GRID_SPACING_INCHES + 1

// Legacy compatibility - use larger dimension
export let BOARD_INCHES = Math.max(BOARD_WIDTH_INCHES, BOARD_HEIGHT_INCHES)
export let GRID_POINTS = Math.max(GRID_POINTS_X, GRID_POINTS_Y)

// Function to update board dimensions from preset
export function setBoardSize(sizeIndex: number) {
  const size = BOARD_SIZES[sizeIndex]
  if (!size) return
  BOARD_WIDTH_INCHES = size.width
  BOARD_HEIGHT_INCHES = size.height
  GRID_SPACING_INCHES = size.gridSpacing
  GRID_POINTS_X = BOARD_WIDTH_INCHES / GRID_SPACING_INCHES + 1
  GRID_POINTS_Y = BOARD_HEIGHT_INCHES / GRID_SPACING_INCHES + 1
  BOARD_INCHES = Math.max(BOARD_WIDTH_INCHES, BOARD_HEIGHT_INCHES)
  GRID_POINTS = Math.max(GRID_POINTS_X, GRID_POINTS_Y)
}

// Function to set custom board dimensions
export function setCustomBoardSize(width: number, height: number, gridSpacing: number) {
  BOARD_WIDTH_INCHES = width
  BOARD_HEIGHT_INCHES = height
  GRID_SPACING_INCHES = gridSpacing
  GRID_POINTS_X = BOARD_WIDTH_INCHES / GRID_SPACING_INCHES + 1
  GRID_POINTS_Y = BOARD_HEIGHT_INCHES / GRID_SPACING_INCHES + 1
  BOARD_INCHES = Math.max(BOARD_WIDTH_INCHES, BOARD_HEIGHT_INCHES)
  GRID_POINTS = Math.max(GRID_POINTS_X, GRID_POINTS_Y)
}

// Line drawing
export const LINE_WIDTH_INCHES = .75

// Branding
export const LOGO_URL = 'https://images.jointheleague.org/logos/figures_text_boy.png'
export const LEAGUE_LOGO_URL = 'https://images.jointheleague.org/logos/logo_girl_flag.png'
export const WEBSITE_URL = 'https://jointheleague.org'
export const SLOGAN = 'Igniting Young Minds Through Coding'

// Title box size (in grid units)
export const TITLE_BOX_WIDTH = 5  // 5 grid units = 10"
export const TITLE_BOX_HEIGHT = 3 // 3 grid units = 6"

// Analytics
export const TRACKING_PIXEL_URL = 'https://analytics.jtlapp.net/p/rUrCcWcRy'
export const ANALYTICS_SCRIPT_URL = 'https://analytics.jtlapp.net/script.js'
export const ANALYTICS_WEBSITE_ID = '9fa41ba0-8933-4e47-8228-0f90644372e3'

// Version (injected by Vite from package.json, fallback for tests)
declare const __APP_VERSION__: string | undefined
export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'


