# Composition Data Schema

## Type Definition

```typescript
interface Composition {
  /** Unique ID, e.g. "comp_1930_red_blue_yellow" */
  id: string;

  /** Full title in English */
  title: string;

  /** Year of completion (or last reworked year) */
  year: number;

  /** Physical width in centimeters */
  width: number;

  /** Physical height in centimeters */
  height: number;

  /** width / height, rounded to 4 decimal places */
  aspectRatio: number;

  /** Line thickness as fraction of canvas size (typically 0.003-0.02) */
  lineWidth: number;

  /** True if canvas is rotated 45 degrees (lozenge/diamond format) */
  diamond: boolean;

  /** URL to museum collection page */
  url: string | null;

  /** Museum or collection name */
  museum: string;

  /** Vertical and horizontal lines defining the grid */
  lines: {
    vertical: Line[];
    horizontal: Line[];
  };

  /** Colored rectangular regions formed by the grid */
  rectangles: Rectangle[];
}

interface Line {
  /** Position along perpendicular axis (0-1 normalized) */
  pos: number;

  /** Start extent along parallel axis (0-1, 0 = edge) */
  from: number;

  /** End extent along parallel axis (0-1, 1 = opposite edge) */
  to: number;
}

interface Rectangle {
  /** Left edge (0-1 normalized) */
  x: number;

  /** Top edge (0-1 normalized) */
  y: number;

  /** Width (0-1 normalized) */
  w: number;

  /** Height (0-1 normalized) */
  h: number;

  /** Fill color as hex string, e.g. "#CC2A1E" */
  color: string;
}
```

## Color Palette

| Color     | Hex       | Usage              |
|-----------|-----------|--------------------|
| Cream     | `#F2EDE3` | Background/default |
| Red       | `#CC2A1E` | Primary color      |
| Yellow    | `#F5C621` | Primary color      |
| Blue      | `#1B3D8C` | Primary color      |
| Black     | `#1A1A1A` | Lines and fills    |
| Gray      | `#8C8C8C` | Occasional fill    |

## Notes

- All spatial values are normalized to 0-1 range
- For diamond compositions, the coordinate system is the bounding square; the diamond shape is applied as a clipping mask during rendering
- Lines have `from`/`to` to support partial lines (not edge-to-edge)
- `width` and `height` are physical dimensions in centimeters; `aspectRatio` is derived as `width / height`
- `rectangles` are auto-computed from line positions by the editor; colors are preserved across rebuilds
