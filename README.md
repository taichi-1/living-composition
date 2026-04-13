# Living Composition

Interactive viewer for Piet Mondrian's neoplastic compositions. Generates new works from statistical patterns learned from a curated library of traced paintings, with smooth morphing transitions between compositions.

## Modes

- **Generate** -- Procedurally creates new Mondrian-style compositions by sampling line counts, positions, colors, and proportions from distributions built from real works.
- **Library** -- Cycles through 27 traced Mondrian paintings (1920--1943) with animated morph transitions and a chronological timeline.

## Getting Started

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173` for the viewer, or `http://localhost:5173/editor/` for the composition editor.

## Editor

A full-featured composition editor at `/editor/` for tracing Mondrian paintings:

- Draw vertical/horizontal lines, paint cells with palette colors
- Move lines, drag endpoints to adjust partial extents
- Per-line color and width control
- Reference image overlay with opacity slider
- Undo/redo, keyboard shortcuts (Q/W/E/R/D)
- Import/export compositions as JSON

## Extraction Script

`scripts/extract_composition.py` uses OpenCV to automatically extract composition data from painting images:

```sh
python scripts/extract_composition.py image.jpg --title "Composition" --year 1930 -o output.json
```

Requires `opencv-python`, `numpy`, `requests`.

## License

MIT
