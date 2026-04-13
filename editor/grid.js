/**
 * Pure functions for grid computation and spatial queries.
 */

export function round6(v) {
  return Math.round(v * 1000000) / 1000000;
}

/**
 * Rebuild rectangle cells from line positions, preserving existing colors.
 */
export function rebuildRectangles(comp) {
  const vPositions = [0, ...comp.lines.vertical.map(l => l.pos).sort((a, b) => a - b), 1];
  const hPositions = [0, ...comp.lines.horizontal.map(l => l.pos).sort((a, b) => a - b), 1];

  const oldRects = comp.rectangles || [];
  const newRects = [];

  for (let xi = 0; xi < vPositions.length - 1; xi++) {
    for (let yi = 0; yi < hPositions.length - 1; yi++) {
      const x = vPositions[xi];
      const y = hPositions[yi];
      const w = vPositions[xi + 1] - x;
      const h = hPositions[yi + 1] - y;
      const cx = x + w / 2;
      const cy = y + h / 2;

      let color = '#F2EDE3';
      for (const old of oldRects) {
        if (cx >= old.x && cx <= old.x + old.w && cy >= old.y && cy <= old.y + old.h) {
          color = old.color;
          break;
        }
      }
      newRects.push({ x: round6(x), y: round6(y), w: round6(w), h: round6(h), color });
    }
  }
  comp.rectangles = newRects;
}

/**
 * Find the nearest line to a normalized position within a threshold.
 */
export function findNearestLine(comp, nx, ny, threshold) {
  let best = null;
  let bestDist = threshold;

  for (const line of comp.lines.vertical) {
    if (ny >= line.from && ny <= line.to) {
      const d = Math.abs(line.pos - nx);
      if (d < bestDist) {
        bestDist = d;
        best = { dir: 'v', line, idx: comp.lines.vertical.indexOf(line) };
      }
    }
  }
  for (const line of comp.lines.horizontal) {
    if (nx >= line.from && nx <= line.to) {
      const d = Math.abs(line.pos - ny);
      if (d < bestDist) {
        bestDist = d;
        best = { dir: 'h', line, idx: comp.lines.horizontal.indexOf(line) };
      }
    }
  }
  return best;
}

/**
 * Find the rectangle index at a normalized position.
 */
export function findRectAt(comp, nx, ny) {
  for (let i = comp.rectangles.length - 1; i >= 0; i--) {
    const r = comp.rectangles[i];
    if (nx >= r.x && nx <= r.x + r.w && ny >= r.y && ny <= r.y + r.h) {
      return i;
    }
  }
  return -1;
}