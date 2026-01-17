# Drawing a path

Paths run through a series of points, but they  are only displayed as stright
lines in `S` mode. For other modes, the paths must be smoothed, with curved
trasitions between segments. 

These are the types of segments: 

* H a horizontal line
* V A vertical line
* B A beizer line.
* S A 1 unit S curve offset
* A+ A clockwise curving arc
* A- A counter clockwise curving arc


Rules for segments: 

* TBD


For the last segment, if the end point of the last segment is the same as the first point in the path, use the first point to make decisions about what types is the last segment. 