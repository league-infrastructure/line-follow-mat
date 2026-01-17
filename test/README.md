# Line Follower Path Tests

This directory contains automated tests for rendering line follower paths from encoded URLs.

## Files

- **test_urls.md** - List of test URLs with descriptions
- **render-test.ts** - Node.js script that renders URLs to PNG images
- **output/** - Generated PNG images (gitignored)

## Running Tests

```bash
npm test
```

This will:
1. Parse all URLs from `test_urls.md`
2. Decode each URL's path data
3. Render the path to an 800x800 PNG
4. Save to `output/testN.png`

## Adding Tests

Add new test URLs to `test_urls.md` in this format:

```markdown
* http://localhost:5173/?g=<encoded-path>
  * Description line 1
  * Description line 2
```

Each URL should be on its own line starting with `*`, followed by optional description lines.

## Test Output

Generated images show:
- Dark blue background (#0f172a)
- Grid lines (#1e293b)
- Grid points (#334155)
- Path curves in cyan (#22d3ee)

Images are 800x800 pixels with 40px padding around the board.
