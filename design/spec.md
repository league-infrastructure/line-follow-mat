# Line Follower Tile Sheet

This application will generate line follower boards that are 48" x 48" for
educational line follower robots. The board has a grid of points, spaced 2"
apart. The user can click on points to draw line segments between the points

http://robotsquare.com/wp-content/uploads/2012/11/1basic.png

To draw a path on the grid, the user will select two  points on the grid.
Clicking on the first point will select the point and change its color to the
selection color. Clicking on the second point will draw the line through the
point and select the second point. 

Lines drawn to the edges will be lines the robot can follow through the tile,
but the user can also draw a line from an edge to the center, which will result
in a dead end. 

THe user can draw any number of lines  on a tile. 

The user can select a line and press delete or "D" to delete the line. 

The application has buttons on the top of the screen for: 

* clear: slear all of the lines. 
* share: encode the design into a string in the query of the URL (tbd)
* PDF: download a PDF
* PNG: download a PNG

## Drawing lines

The user draws lines by clicking on points to form paths. When no points are selected,
clicking on a point selects it and turns the point blue. Clicking on another
point will draw a line from the selected point to the new point, then select the
new point. 

If a point is selected, hitting the escape key will unselect it. When building a
path, this will allow the user to start a new path. 

When the user is building a path, the path is selected and will be colored red
to indicate it is selected. 

Clicking on a path segment will toggle between selecting the path and selecting
the single segment. So, clicking on an unselected segment will select the
segment. Clicking on a selected segment will select the path. Clicking on a
selected path will unselect the path. Hitting escape key will clear a sleection. 

Selecting a path  will also select the endpoint of the path. The space bar will
flip the selected point on the path. So, if the user selects a path, the end
point of the path is selected. If the user hits space, the end will be
unselected and the start of the path will be selected. This allows the user to
continue drawing the path from either the start or the end of the path.
Selecting a segment will not select the endpoint.

Lines are drawn with Bezier, and there are constraints on the splines. 

* The line segments on a path going into an out of a selected point must be C1
  continuous. That is, there is a defined slope going through the point, with
  the angle of the incomming line equalling the angle of the outgoing line. (
  mathematically, the outgoing line is probabl 180 degrees from the incomming
  line, just make them continuous through the point. ) 

* The curve for each segment must always be the shortest possible between those
  points. 

* If two points are on the same horizontal or vertical line, the
  segment between those points must be straight beteweeen them. Normal rules
  about continuity still apply at the end points. 

* If two points are adjacent but on on a horizontal or vertical line, ( they is
  thet are on a 45 degree line ) then the segment must be a quarter circle. The
  center of the circle is the third point that is horizontal from one point and
  vertical from the other. There are two possible circular paths to choose from;
  pick the one that makes the slope with other points the closest to horizonal
  or vertical. 


## Editing and Selection

User can select segments, paths and path points. ( "points" below refers to path
points, not grid points, which will be explicit. )

* Clicking on an unselected path segment selects the segment. A selected segment
  shows the segment in red, and highlights the two end points in red unfilled circles. 
* Clicking on a selected segment selects the whole path and highlights the 
  points of the path in red unfilled circles. 
* Clicking on selected path selects the segment under the path
* User can drag highlighted points. 
* Clicking on a highlighted point selects the point, which fills in the point.
  Interior points will be shown selected in solid red, but end points will be
  shown selected in solid blue. 
* Only one object can be selected at a time. Selecting a new object will clear other selections. 
* If an endpoint is selected, then clicking near a grid point will add a new segment from the selected grid point. 

`Esc` key will cancel any selections 

Backspace, Deleted key or `d` will delete the selected objects. Paths are
deleted entirely. Segments are deleted but interior points remain, while path
end points are deleted. Deleting an interior segment will result in splitting
the path into two paths. Deleting a point will ( effectively ) delete both
segments that the point connects to, then create a new segment between the
deleted segment's end points

If a segment is selected, `A` will add a point to the middle of the segment. 

If a end point is selected Space will select the other end point. 

# Point icons

The user can right click  on a selected point to get a pop up menu of icons that can be displayed for the point. These icons are: 

* "Play" triangle
* "Fast Forward double triangle
* Stop sign
* "Caution" triangle
* Circle
* Square


The icons are displayed with a white shadow so they are easy to see against the
line. The are sized to fill one grid tile. 


## URL Link Storage

When the user clicks the "Share" button, the program will update the URL for
the page (update in place if you can, otherwise reload to the new URL) to
include a query string that describes the paths on the board.

BNF for the query string format:

```
<query>        ::= "?g=" <path-list>
<path-list>    ::= <path> | <path> "," <path-list>
<path>         ::= <point-pair> | <point-pair> <path>
<point-pair>   ::= <digit62> <digit62>
<digit62>      ::= "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
                 | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J"
                 | "K" | "L" | "M" | "N" | "O" | "P" | "Q" | "R" | "S" | "T"
                 | "U" | "V" | "W" | "X" | "Y" | "Z"
                 | "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j"
                 | "k" | "l" | "m" | "n" | "o" | "p" | "q" | "r" | "s" | "t"
                 | "u" | "v" | "w" | "x" | "y" | "z"
```

Notes:
- `<path>` is an even-length sequence of `<digit62>` grouped as `<point-pair>`s (two characters per grid point, base-62 index, left-to-right, top-to-bottom).
- `<path-list>` is one or more `<path>` entries separated by commas.

When the application is loaded with the `g=` query, the application will draw
the paths described in the query. 

## Netlist format

The netlist format is used for debugging and testing path geometry. Each line 
describes one segment with fixed-width columns:

```
<seg#> <angle> <type> <entry> (<x0>,<y0>) (<x1>,<y1>) <exit>
```

### Columns

| Column | Width | Description |
|--------|-------|-------------|
| seg#   | 2     | Segment number (1-based) |
| angle  | 4     | Straight-line angle from start to end point (degrees, -180 to 180) |
| type   | 4     | Segment type: H, V, A+, A-, or B |
| entry  | 4     | Entry angle - direction entering the segment at start point |
| coords | 14    | Start and end coordinates: (x0,y0) (x1,y1) |
| exit   | 4     | Exit angle - direction leaving the segment at end point |

### Segment Types

- **H** (Horizontal): Both endpoints have the same Y coordinate. Entry and exit 
  angles are both 0° (right) or 180° (left).
  
- **V** (Vertical): Both endpoints have the same X coordinate. Entry and exit 
  angles are both 90° (down) or -90° (up).
  
- **A+** (Clockwise Arc): A 90° arc turning clockwise. Entry and exit angles 
  differ by 90°, with exit = entry + 90° (mod 360).
  
- **A-** (Counter-clockwise Arc): A 90° arc turning counter-clockwise. Entry and 
  exit angles differ by 90°, with exit = entry - 90° (mod 360).
  
- **B** (Bezier/Spline): A smooth curve for non-standard geometries. Entry angle 
  matches the exit angle of the previous segment; exit angle matches the entry 
  angle of the next segment. This ensures C1 continuity.

### Angle Rules

Entry and exit angles ensure C1 continuity through each vertex:

1. **H and V segments**: Entry and exit angles are identical to the straight-line 
   angle (the curve passes straight through).

2. **Arc segments (A+, A-)**: Entry and exit angles differ by exactly 90°. The 
   tangent at each point is perpendicular to the radius from the arc center.

3. **Bezier segments**: 
   - When connected to H, V, or A: inherit the fixed angle from that segment
   - When connected to another B: use blended angle for smooth continuity

### Example

```
 1    0 H       0 ( 5, 5) ( 9, 5)    0
 2  -27 B     -27 ( 9, 5) (11, 4)  -45
 3   45 A+    -45 (11, 4) (13, 6)   45
 4   90 V      90 (13, 6) (13, 8)   90
```

In this example:
- Segment 1 is horizontal, angles are all 0°
- Segment 2 is a bezier that starts at -27° and ends at -45° to match the arc
- Segment 3 is a clockwise arc, entry -45° + 90° = 45° exit
- Segment 4 is vertical at 90°
