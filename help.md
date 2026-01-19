# Line Follower Board Editor Help

Create custom line follower boards for educational robots! This tool lets you design 48" × 48" boards with smooth paths on a 2" grid.

## Creating Paths

### Starting a New Path
1. **Click on any grid point** to select it (turns blue)
2. **Click on another grid point** to create a line segment between them
3. **Keep clicking** on more points to extend the path
4. Press **Escape** to finish and start a new path

### Path Drawing Tips
- Paths are drawn with smooth curves that automatically flow through each point
- Horizontal and vertical segments are drawn as straight lines
- Diagonal segments (45°) are drawn as smooth quarter-circle arcs
- Other angles use smooth Bézier curves for natural-looking paths

## Selecting Things

### Selecting Segments
- **Click on a line segment** to select it (turns red)
- **Click again on the selected segment** to select the entire path
- **Click again on the selected path** to deselect

### Selecting Points
- When a segment or path is selected, the points are highlighted
- **Click on a highlighted point** to select just that point
- Selected endpoints appear **blue**, interior points appear **red**
- **Press Space** to flip between selecting the start and end of a path

## Editing Paths

### Extending a Path
- Select an **endpoint** (start or end of a path)
- Click on a new grid point to extend the path from that endpoint

### Adding Points
- Select a **segment**
- Press **A** to add a new point in the middle of that segment

### Moving Points
- When points are highlighted, **drag them** to a new grid location

### Deleting
- Select a segment, path, or point
- Press **Delete**, **Backspace**, or **D** to remove it
- Deleting a segment in the middle splits the path into two paths
- Deleting an endpoint removes that point and its connected segment

## Point Icons

Add visual markers to your path points:

1. **Select a point** on your path
2. **Right-click** (or Ctrl+click) to open the icon menu
3. Choose from:
   - ▶ **Play** – Starting point
   - ⏩ **Fast Forward** – Speed up
   - 🛑 **Stop** – Stop sign
   - ⚠️ **Caution** – Warning triangle
   - ⬤ **Circle** – Circular marker
   - ■ **Square** – Square marker
4. Click an icon again to remove it

## Legend Box

The legend shows your board title, logo, QR code, and branding.

### Positioning
- **Drag the legend** to move it anywhere on the board
- The legend snaps to grid positions when you release

### Customizing
In the **Branding** panel on the left:
- **Logo URL** – Enter a URL to your own logo image
- **Website URL** – Changes the QR code and displayed URL
- **Slogan** – Custom tagline text

### Board Title
- Click the **title field** above the canvas to name your board
- The title appears at the top of the legend

## Saving & Sharing

### Share Link
- Click **Share** to encode your design into the URL
- Copy and share the URL – anyone with the link sees your exact design
- Bookmarking the URL saves your work

### Download for Printing
- **PDF** – 48" × 48" print-ready document
- **PNG** – 7200 × 7200 pixel image (150 DPI)
- **SVG** – Vector format for professional printing

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **S** | Toggle straight line mode (no curves) |
| **Escape** | Clear selection / cancel drawing |
| **Space** | Flip between path start/end |
| **A** | Add point to selected segment |
| **D** / **Delete** / **Backspace** | Delete selected item |
| **Right-click** | Icon menu (on selected point) |

## Tips

- Use **straight line mode (S)** to preview the raw path structure
- The legend auto-positions to avoid your paths, but you can drag it anywhere
- All changes are preserved in the URL after clicking Share
- For best print quality, use PDF or SVG download
