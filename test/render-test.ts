import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { parse as parseYaml } from 'yaml'
import { decodeDesignFromUrl, extractDesignFromUrl, generateNetlist, renderPathsCurvedToCanvas, canvasToBuffer } from '../src/paths.js'
import { createCanvas, Image } from 'canvas'
import { PNG } from 'pngjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface TestConfig {
  name: string
  url: string
  description?: string
}

interface TestResult {
  test: TestConfig
  straightImagePath: string
  curvedImagePath: string
  netlistPath: string
}

interface ComparisonResult {
  testName: string
  file: string
  type: 'txt' | 'png'
  passed: boolean
  error?: string
  diffPixels?: number
  totalPixels?: number
}

/**
 * Parse test URLs from YAML file
 */
function parseTestUrls(yamlPath: string): TestConfig[] {
  const content = readFileSync(yamlPath, 'utf-8')
  const data = parseYaml(content) as any

  const tests: TestConfig[] = []

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

/**
 * Process a test URL and generate netlist in YAML format
 */
function processTest(test: TestConfig): TestResult | null {
  console.log(`\n${test.name}:`)
  if (test.description) {
    console.log(`  description: ${test.description.trim().split('\n').join('\n    ')}`)
  }
  console.log(`  url: ${test.url}`)
  
  const encoded = extractDesignFromUrl(test.url)
  if (!encoded) {
    console.log('  error: Could not extract design from URL')
    return null
  }

  const paths = decodeDesignFromUrl(encoded)
  if (paths.length === 0) {
    console.log('  error: No paths decoded')
    return null
  }

  const netlist = generateNetlist(paths)
  console.log('  netlist: |')
  
  // Output each line with proper YAML indentation
  const lines = netlist.split('\n')
  for (const line of lines) {
    console.log(`    ${line}`)
  }

  // Write netlist to output file
  const outputDir = join(__dirname, 'output')
  mkdirSync(outputDir, { recursive: true })
  
  const netlistPath = join(outputDir, `${test.name}.txt`)
  writeFileSync(netlistPath, netlist)

  // Color options for test images
  const testColors = {
    backgroundColor: '#ffffff',
    gridLineColor: '#e0e0e0',
    gridPointColor: '#999999',
    pathColor: '#000000'
  }

  // Render straight line image with arrows and labels
  const canvasStraight = renderPathsCurvedToCanvas(paths, 800, 800, true, testColors)
  const imageBufferStraight = canvasToBuffer(canvasStraight)
  const imagePathStraight = join(outputDir, `${test.name}-str.png`)
  writeFileSync(imagePathStraight, imageBufferStraight)
  console.log(`  straight image written to: ${imagePathStraight}`)

  // Render curved image (H, V as lines, A+/A- as arcs)
  const canvasCurved = renderPathsCurvedToCanvas(paths, 800, 800, false, testColors)
  const imageBufferCurved = canvasToBuffer(canvasCurved)
  const imagePathCurved = join(outputDir, `${test.name}-curve.png`)
  writeFileSync(imagePathCurved, imageBufferCurved)
  console.log(`  curved image written to: ${imagePathCurved}`)

  return {
    test,
    straightImagePath: imagePathStraight,
    curvedImagePath: imagePathCurved
  }
}

// Main test runner
const testUrlsPath = join(__dirname, 'test_urls.yaml')
const testUrls = parseTestUrls(testUrlsPath)

console.log(`# Render Test Results`)
console.log(`# Generated: ${new Date().toISOString()}`)
console.log(`# Total tests: ${testUrls.length}`)

const results: TestResult[] = []
for (const test of testUrls) {
  const result = processTest(test)
  if (result) {
    results.push(result)
  }
}

console.log('\n# All tests complete!')

// Create composite image
if (results.length > 0) {
  console.log('\n# Creating composite image...')
  
  const imageWidth = 400  // Width for each test image
  const imageHeight = 400  // Height for each test image
  const padding = 20
  const textHeight = 40
  const rowHeight = textHeight + imageHeight + padding
  const totalWidth = imageWidth * 2 + padding * 3  // Two images side by side
  const totalHeight = rowHeight * results.length + padding
  
  const composite = createCanvas(totalWidth, totalHeight)
  const ctx = composite.getContext('2d')
  
  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, totalWidth, totalHeight)
  
  // Process each test result
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const yOffset = i * rowHeight + padding
    
    // Draw test name
    ctx.fillStyle = '#000000'
    ctx.font = 'bold 24px sans-serif'
    ctx.fillText(result.test.name, padding, yOffset + 28)
    
    // Load and draw straight image
    const straightImg = new Image()
    straightImg.src = readFileSync(result.straightImagePath)
    ctx.drawImage(straightImg, padding, yOffset + textHeight, imageWidth, imageHeight)
    
    // Load and draw curved image
    const curvedImg = new Image()
    curvedImg.src = readFileSync(result.curvedImagePath)
    ctx.drawImage(curvedImg, padding * 2 + imageWidth, yOffset + textHeight, imageWidth, imageHeight)
    
    // Draw labels under images
    ctx.font = '16px sans-serif'
    ctx.fillStyle = '#666666'
    ctx.fillText('Straight', padding + imageWidth/2 - 30, yOffset + textHeight + imageHeight + 20)
    ctx.fillText('Curved', padding * 2 + imageWidth + imageWidth/2 - 25, yOffset + textHeight + imageHeight + 20)
  }
  
  // Save composite image
  const outputDir = join(__dirname, 'output')
  const compositeBuffer = composite.toBuffer('image/png')
  const compositePath = join(outputDir, 'test-composite.png')
  writeFileSync(compositePath, compositeBuffer)
  console.log(`  composite image written to: ${compositePath}`)
}

// Compare output files against known-good files
console.log('\n# Comparing against known-good files...')

const knownGoodDir = join(__dirname, 'known-good')
const outputDir = join(__dirname, 'output')

interface ComparisonSummary {
  passed: number
  failed: number
  skipped: number
  failures: string[]
}

const summary: ComparisonSummary = {
  passed: 0,
  failed: 0,
  skipped: 0,
  failures: []
}

/**
 * Compare two text files
 */
function compareTextFiles(testName: string, outputPath: string, knownGoodPath: string): void {
  if (!existsSync(knownGoodPath)) {
    summary.skipped++
    return
  }
  
  const outputContent = readFileSync(outputPath, 'utf-8')
  const knownGoodContent = readFileSync(knownGoodPath, 'utf-8')
  
  if (outputContent === knownGoodContent) {
    summary.passed++
  } else {
    summary.failed++
    const outputLines = outputContent.split('\n')
    const knownGoodLines = knownGoodContent.split('\n')
    const diffs: string[] = []
    
    const maxLines = Math.max(outputLines.length, knownGoodLines.length)
    for (let i = 0; i < maxLines && diffs.length < 5; i++) {
      if (outputLines[i] !== knownGoodLines[i]) {
        diffs.push(`    Line ${i + 1}: expected "${knownGoodLines[i] ?? '(missing)'}" got "${outputLines[i] ?? '(missing)'}"`)
      }
    }
    summary.failures.push(`  ${testName}.txt:\n${diffs.join('\n')}`)
  }
}

/**
 * Compare two PNG files by converting to black/white and computing difference
 */
function comparePngFiles(testName: string, outputPath: string, knownGoodPath: string): void {
  if (!existsSync(knownGoodPath)) {
    summary.skipped++
    return
  }
  
  try {
    const outputPng = PNG.sync.read(readFileSync(outputPath))
    const knownGoodPng = PNG.sync.read(readFileSync(knownGoodPath))
    
    if (outputPng.width !== knownGoodPng.width || outputPng.height !== knownGoodPng.height) {
      summary.failed++
      summary.failures.push(`  ${testName}-curve.png: Size mismatch - output ${outputPng.width}x${outputPng.height} vs known-good ${knownGoodPng.width}x${knownGoodPng.height}`)
      return
    }
    
    const { width, height } = outputPng
    const totalPixels = width * height
    
    // Convert to B/W and compute difference
    // A pixel is "black" if it's not white (background)
    let diffSum = 0
    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4
      // Check if pixel is white (background) - R,G,B all > 250
      const outIsWhite = outputPng.data[idx] > 250 && outputPng.data[idx + 1] > 250 && outputPng.data[idx + 2] > 250
      const knownIsWhite = knownGoodPng.data[idx] > 250 && knownGoodPng.data[idx + 1] > 250 && knownGoodPng.data[idx + 2] > 250
      
      // If one is white and other isn't, that's a difference
      if (outIsWhite !== knownIsWhite) {
        diffSum++
      }
    }
    
    const diffPct = (diffSum / totalPixels) * 100
    
    // Allow up to 0.5% difference for anti-aliasing
    if (diffPct < 0.5) {
      summary.passed++
    } else {
      summary.failed++
      summary.failures.push(`  ${testName}-curve.png: ${diffSum} pixels differ (${diffPct.toFixed(2)}%)`)
    }
  } catch (err) {
    summary.failed++
    summary.failures.push(`  ${testName}-curve.png: Error comparing - ${err}`)
  }
}

// Compare each test result
for (const result of results) {
  const testName = result.test.name
  
  // Compare netlist (.txt)
  compareTextFiles(testName, join(outputDir, `${testName}.txt`), join(knownGoodDir, `${testName}.txt`))
  
  // Compare curved image (-curve.png)
  comparePngFiles(testName, join(outputDir, `${testName}-curve.png`), join(knownGoodDir, `${testName}-curve.png`))
}

// Report results
console.log(`\n# Comparison Summary`)
console.log(`  Passed: ${summary.passed}`)
console.log(`  Failed: ${summary.failed}`)
console.log(`  Skipped (no known-good): ${summary.skipped}`)

if (summary.failures.length > 0) {
  console.log(`\n# Failures:`)
  for (const failure of summary.failures) {
    console.log(failure)
  }
  process.exit(1)
} else {
  console.log(`\n# All comparisons passed!`)
}