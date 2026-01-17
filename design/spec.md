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

* 


## Editing lines. 

The `P` key will toggle ppint editing mode. In point editing mode, all points
that a path goes through on the screen will be come visible. The user can select
a point and drag it to a new location ( snapping to the grid ) the path will
redraw with each snap. 

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
