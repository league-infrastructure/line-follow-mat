import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { parse as parseYaml } from 'yaml'
import { decodeDesignFromUrl, extractDesignFromUrl, generateNetlist, renderPathsCurvedToCanvas, canvasToBuffer } from '../src/paths.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface TestConfig {
  name: string
  url: string
  description?: string
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
function processTest(test: TestConfig): void {
  console.log(`\n${test.name}:`)
  if (test.description) {
    console.log(`  description: ${test.description.trim().split('\n').join('\n    ')}`)
  }
  console.log(`  url: ${test.url}`)
  
  const encoded = extractDesignFromUrl(test.url)
  if (!encoded) {
    console.log('  error: Could not extract design from URL')
    return
  }

  const paths = decodeDesignFromUrl(encoded)
  if (paths.length === 0) {
    console.log('  error: No paths decoded')
    return
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
  console.log(`  netlist written to: ${netlistPath}`)

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
}

// Main test runner
const testUrlsPath = join(__dirname, 'test_urls.yaml')
const testUrls = parseTestUrls(testUrlsPath)

console.log(`# Render Test Results`)
console.log(`# Generated: ${new Date().toISOString()}`)
console.log(`# Total tests: ${testUrls.length}`)

for (const test of testUrls) {
  processTest(test)
}

console.log('\n# All tests complete!')
