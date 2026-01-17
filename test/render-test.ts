import { createCanvas } from 'canvas'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { parse as parseYaml } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))

const BOARD_INCHES = 48
const GRID_SPACING_INCHES = 2
const GRID_POINTS = BOARD_INCHES / GRID_SPACING_INCHES + 1

interface GridPoint {
  x: number
  y: number
}

interface Path {
  id: string
  points: GridPoint[]
}

interface Point {
  x: number
  y: number
}

interface DrawableSegment {
  pathId: string
  segmentIndex: number
  p0: Point
  p1: Point
  cp1: Point
  cp2: Point
  isCircularArc?: boolean
  arcTurnsCounterclockwise?: boolean
}

interface NetlistSegment {
  segmentNumber: number
  type: string
  rawAngle: number
  entryAngle: number
  exitAngle: number
  start: GridPoint
  end: GridPoint
}

function decodeDesign(encoded: string): Path[] {
  const base62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  const pathStrings = encoded.split('_')
  const paths: Path[] = []

  for (const s of pathStrings) {
    if (s.length % 2 !== 0) {
      console.warn('Invalid encoded string length')
      continue
    }

    const points: GridPoint[] = []
    for (let i = 0; i < s.length; i += 2) {
      const c1 = s[i]
      const c2 = s[i + 1]
      const idx1 = base62.indexOf(c1)
      const idx2 = base62.indexOf(c2)
      if (idx1 === -1 || idx2 === -1) {
        console.warn('Invalid base62 character')
        continue
      }
      points.push({ x: idx1, y: idx2 })
    }

    paths.push({ id: crypto.randomUUID(), points })
  }

  return paths
}

function buildSegments(path: Path, gridSpacingPx: number, origin: Point): DrawableSegment[] {
  const toCanvasPoint = (p: GridPoint): Point => ({
    x: origin.x + p.x * gridSpacingPx,
    y: origin.y + p.y * gridSpacingPx
  })

  const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

  const pts = path.points.map((p) => toCanvasPoint(p))
  const segments: DrawableSegment[] = []
  if (pts.length < 2) return segments

  const angleBetween = (v1: Point, v2: Point): number => {
    const dot = v1.x * v2.x + v1.y * v2.y
    const det = v1.x * v2.y - v1.y * v2.x
    return Math.atan2(det, dot)
  }

  const normalize = (v: Point): Point => {
    const len = Math.hypot(v.x, v.y) || 1
    return { x: v.x / len, y: v.y / len }
  }

  const isSharpCorner = (p0: Point, p1: Point, p2: Point): boolean => {
    const v1 = normalize({ x: p1.x - p0.x, y: p1.y - p0.y })
    const v2 = normalize({ x: p2.x - p1.x, y: p2.y - p1.y })
    const angle = Math.abs(angleBetween(v1, v2)) * (180 / Math.PI)
    return angle >= 68 && angle <= 112
  }

  const isClosedPath = pts.length > 2 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y

  let currentDirection: Point | null = null

  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p0 = i > 0 ? pts[i - 1] : null
    const p3 = i < pts.length - 2 ? pts[i + 2] : isClosedPath ? pts[0] : null

    if (p0 && p3 && isSharpCorner(p0, p1, p2)) {
      const v1 = normalize({ x: p1.x - p0.x, y: p1.y - p0.y })
      const v2 = normalize({ x: p3.x - p2.x, y: p2.y - p3.y })
      const dist = distance(p1, p2) * 0.4
      const cp1 = { x: p1.x + v1.x * dist, y: p1.y + v1.y * dist }
      const cp2 = { x: p2.x - v2.x * dist, y: p2.y - v2.y * dist }

      segments.push({
        pathId: path.id,
        segmentIndex: i,
        p0: p1,
        p1: p2,
        cp1,
        cp2
      })

      currentDirection = normalize({ x: p2.x - p1.x, y: p2.y - p1.y })
      continue
    }

    if (currentDirection === null) {
      currentDirection = normalize({ x: p2.x - p1.x, y: p2.y - p1.y })
    }

    const targetDirection = normalize({ x: p2.x - p1.x, y: p2.y - p1.y })

    const dxAbs = Math.abs(p2.x - p1.x)
    const dyAbs = Math.abs(p2.y - p1.y)
    const isHorizontal = dyAbs < 1
    const isVertical = dxAbs < 1
    const isDiagonal = Math.abs(dxAbs - dyAbs) < 2

    let cp1: Point
    let cp2: Point
    let isCircularArc = false
    let arcTurnsCounterclockwise = false

    if (isHorizontal || isVertical) {
      const segLen = distance(p1, p2)
      const offset = segLen * 0.33
      const lineDir = normalize({ x: p2.x - p1.x, y: p2.y - p1.y })
      cp1 = { x: p1.x + lineDir.x * offset, y: p1.y + lineDir.y * offset }
      cp2 = { x: p2.x - lineDir.x * offset, y: p2.y - lineDir.y * offset }
    } else if (isDiagonal) {
      isCircularArc = true
      cp1 = p1
      cp2 = p2
      if (p0 && p3) {
        const v1 = { x: p1.x - p0.x, y: p1.y - p0.y }
        const v2 = { x: p2.x - p1.x, y: p2.y - p1.y }
        const cross = v1.x * v2.y - v1.y * v2.x
        arcTurnsCounterclockwise = cross < 0
      }
    } else {
      const dist = distance(p1, p2) * 0.4
      cp1 = { x: p1.x + currentDirection.x * dist, y: p1.y + currentDirection.y * dist }
      if (p3) {
        const nextDir = normalize({ x: p3.x - p2.x, y: p3.y - p2.y })
        const exitDir = normalize({ x: targetDirection.x + nextDir.x, y: targetDirection.y + nextDir.y })
        cp2 = { x: p2.x - exitDir.x * dist, y: p2.y - exitDir.y * dist }
      } else {
        cp2 = { x: p2.x - targetDirection.x * dist, y: p2.y - targetDirection.y * dist }
      }
    }

    segments.push({
      pathId: path.id,
      segmentIndex: i,
      p0: p1,
      p1: p2,
      cp1,
      cp2,
      isCircularArc,
      arcTurnsCounterclockwise
    })

    currentDirection = targetDirection
  }

  return segments
}

function renderToCanvas(paths: Path[], width: number, height: number) {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  const boardPadding = 40
  const usableWidth = width - boardPadding * 2
  const usableHeight = height - boardPadding * 2
  const boardSize = Math.min(usableWidth, usableHeight)
  const gridSpacingPx = boardSize / (GRID_POINTS - 1)
  const origin = {
    x: (width - boardSize) / 2,
    y: (height - boardSize) / 2
  }

  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = '#1e293b'
  ctx.lineWidth = 1
  ctx.lineCap = 'round'

  for (let i = 0; i < GRID_POINTS; i++) {
    const offset = i * gridSpacingPx
    ctx.beginPath()
    ctx.moveTo(origin.x + offset, origin.y)
    ctx.lineTo(origin.x + offset, origin.y + boardSize)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(origin.x, origin.y + offset)
    ctx.lineTo(origin.x + boardSize, origin.y + offset)
    ctx.stroke()
  }

  ctx.fillStyle = '#334155'
  for (let y = 0; y < GRID_POINTS; y++) {
    for (let x = 0; x < GRID_POINTS; x++) {
      const px = origin.x + x * gridSpacingPx
      const py = origin.y + y * gridSpacingPx
      ctx.beginPath()
      ctx.arc(px, py, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Draw straight lines directly from the netlist (no smoothing or arcs)
  for (const path of paths) {
    const netSegs = buildNetlistSegments(path, gridSpacingPx, origin)

    ctx.strokeStyle = '#22d3ee'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const seg of netSegs) {
      const p0 = {
        x: origin.x + seg.start.x * gridSpacingPx,
        y: origin.y + seg.start.y * gridSpacingPx
      }
      const p1 = {
        x: origin.x + seg.end.x * gridSpacingPx,
        y: origin.y + seg.end.y * gridSpacingPx
      }

      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.stroke()
    }
  }

  return canvas
}

function buildNetlistSegments(path: Path, gridSpacingPx: number, origin: Point): NetlistSegment[] {
  const netSegs: NetlistSegment[] = []
  const points = path.points

  if (points.length < 2) return netSegs

  for (let i = 0; i < points.length - 1; i++) {
    const segmentNumber = i + 1
    const x0 = points[i].x
    const y0 = points[i].y
    const x1 = points[i + 1].x
    const y1 = points[i + 1].y

    if (x0 === x1 && y0 === y1) {
      continue
    }

    const dx = x1 - x0
    const dy = y1 - y0
    let type: string

    if (dy === 0 && dx !== 0) type = 'H   '
    else if (dx === 0 && dy !== 0) type = 'V   '
    else if (Math.abs(dx) === Math.abs(dy)) type = 'A+  '
    else type = 'B   '

    let rawAngle = Math.round(Math.atan2(dy, dx) * 180 / Math.PI)
    if (rawAngle > 180) rawAngle -= 360
    if (rawAngle <= -180) rawAngle += 360

    let entryAngle = rawAngle
    let exitAngle = rawAngle

    netSegs.push({
      segmentNumber,
      type,
      rawAngle,
      entryAngle,
      exitAngle,
      start: { x: x0, y: y0 },
      end: { x: x1, y: y1 }
    })
  }

  return netSegs
}

function generateNetlist(paths: Path[], gridSpacingPx: number, origin: Point): string {
  const lines: string[] = []

  for (const path of paths) {
    const netSegs = buildNetlistSegments(path, gridSpacingPx, origin)

    for (const seg of netSegs) {
      const x0Str = seg.start.x.toString().padStart(2, ' ')
      const y0Str = seg.start.y.toString().padStart(2, ' ')
      const x1Str = seg.end.x.toString().padStart(2, ' ')
      const y1Str = seg.end.y.toString().padStart(2, ' ')
      const rawStr = seg.rawAngle.toString().padStart(4, ' ')
      const entryStr = seg.entryAngle.toString().padStart(4, ' ')
      const exitStr = seg.exitAngle.toString().padStart(4, ' ')

      lines.push(`${seg.segmentNumber} ${rawStr} ${seg.type} ${entryStr} (${x0Str},${y0Str}) (${x1Str},${y1Str}) ${exitStr}`)
    }

    lines.push('')
  }

  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  return lines.join('\n')
}

function testUrl(urlOrQuery: string, outputPath: string) {
  let query = urlOrQuery
  if (urlOrQuery.includes('?g=')) {
    query = urlOrQuery.split('?g=')[1].split('&')[0]
  } else if (urlOrQuery.includes('g=')) {
    query = urlOrQuery.split('g=')[1].split('&')[0]
  }

  console.log(`Testing: ${query}`)

  const paths = decodeDesign(query)
  console.log(`  Decoded ${paths.length} path(s)`)

  const width = 800
  const height = 800
  const boardPadding = 40
  const usableWidth = width - boardPadding * 2
  const usableHeight = height - boardPadding * 2
  const boardSize = Math.min(usableWidth, usableHeight)
  const gridSpacingPx = boardSize / (GRID_POINTS - 1)
  const origin = { x: (width - boardSize) / 2, y: (height - boardSize) / 2 }

  const canvas = renderToCanvas(paths, width, height)
  const buffer = canvas.toBuffer('image/png')

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, buffer)

  const netlist = generateNetlist(paths, gridSpacingPx, origin)
  const netlistPath = outputPath.replace('.png', '.txt')
  writeFileSync(netlistPath, netlist)

  console.log(`  Saved to ${outputPath}`)
  console.log(`  Saved to ${netlistPath}`)
}

function parseTestUrls(yamlPath: string): Array<{ url: string; name: string; description: string }> {
  const content = readFileSync(yamlPath, 'utf-8')
  const data = parseYaml(content) as any

  const tests: Array<{ url: string; name: string; description: string }> = []

  if (data.tests && Array.isArray(data.tests)) {
    for (const test of data.tests) {
      if (test.url) {
        tests.push({
          url: test.url,
          name: test.name || `test${tests.length + 1}`,
          description: test.description || ''
        })
      }
    }
  }

  return tests
}

const testUrlsPath = join(__dirname, 'test_urls.yaml')
const testUrls = parseTestUrls(testUrlsPath)

console.log(`Found ${testUrls.length} test URL(s)\n`)

for (const test of testUrls) {
  console.log(`${test.name}: ${test.description}`)
  testUrl(test.url, join(__dirname, `output/${test.name}.png`))
  console.log()
}

console.log('All tests complete!')
