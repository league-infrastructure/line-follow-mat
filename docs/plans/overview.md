---
status: draft
---

# Project Overview

## Project Name

Line Follow Mat ("League Line Mat-O-Matic")

## Problem Statement

The League runs line-following robot activities that need **printable mats** with
consistent, robot-friendly line paths on a fixed grid. Designing these tracks in
general-purpose drawing tools is slow, error-prone, and hard to iterate on.

This project provides a **browser-based board editor** where a user clicks grid
points to build paths, previews the result with smooth curves, and exports
print-ready files (PDF/PNG/SVG). Designs can be shared and restored via a
URL-encoded representation.

## Target Users

- League curriculum/instruction staff and club leaders creating activities
- Teachers / mentors generating mats for classroom use
- Students experimenting with track layouts

## Key Constraints

- **Physical correctness:** outputs must preserve real-world dimensions (inches)
	for printing across supported board sizes.
- **Client-only:** runs as a static web app (no backend required).
- **Share link stability:** URLs fully encode board state and should remain
	backwards compatible as features evolve.
- **Deterministic rendering:** automated render tests compare output to known-good
	examples to prevent regressions.

## High-Level Requirements

- **Board sizing**
	- Preset sizes and custom sizes (rectangular supported)
	- Grid spacing in inches (typically 2")
- **Interactive editor**
	- Click grid points to start/extend paths
	- Select segment/path/point; delete selection
	- Drag highlighted points to adjust geometry
	- Add a point to a segment (insert midpoint)
	- Toggle straight-line preview mode
	- Optional icons on path points
- **Legend + branding**
	- Board title
	- Legend box with logo / QR / website / slogan
	- Legend is draggable and snaps to grid
- **Sharing + export**
	- Encode design into URL query (paths, board size, title, legend position,
		optional branding overrides)
	- Download PDF, PNG, and SVG suitable for printing
- **Testing**
	- Render-test harness that exercises URLs from `test/test_urls.yaml` and
		compares against `test/known-good/*`

## Technology Stack

- TypeScript + Vite
- HTML Canvas (interactive editor)
- `jsPDF` (PDF generation)
- `marked` (render help markdown)
- Test tooling: `tsx`, `canvas` (node-canvas), `pngjs`, `pixelmatch`, `yaml`

## Sprint Roadmap

- Sprint 001: Spreadsheet Sprint (scaffold only; requirements TBD)

## Out of Scope

- User accounts/login and cloud persistence
- Collaboration / multi-user editing
- Server-side API or server-rendered pipeline
- Freeform drawing not anchored to the grid
