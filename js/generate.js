/**
 * Statistical generation engine with aesthetic scoring.
 *
 * Generates multiple candidate compositions and selects the most
 * balanced one, guided by research on visual balance (Locher, Hübner)
 * and perceptual color weight (Locher 2005).
 *
 * Aesthetic choices are intentionally opinionated.
 */

// --- Random utilities ---

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function randNormal(mean, std) {
  const u1 = Math.random();
  const u2 = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedChoice(weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total === 0) return 0;
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// --- Union-Find ---

class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }
  find(x) {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(a, b) {
    a = this.find(a);
    b = this.find(b);
    if (a === b) return;
    if (this.rank[a] < this.rank[b]) [a, b] = [b, a];
    this.parent[b] = a;
    if (this.rank[a] === this.rank[b]) this.rank[a]++;
  }
}

// --- Palette ---

const COLORS = ["#D63B2F", "#EDB92D", "#1B4A8A", "#1A1A1A", "#B8B0A8"];
const BG_COLOR = "#F2EDE3";

const PALETTE_MAP = {
  "#CC2A1E": "#D63B2F",
  "#F5C621": "#EDB92D",
  "#1B3D8C": "#1B4A8A",
  "#8C8C8C": "#B8B0A8",
};

function canonicalColor(hex) {
  return PALETTE_MAP[hex] || hex;
}

// Aesthetic color selection weights
const COLOR_WEIGHTS = {
  "#D63B2F": 0.30,
  "#EDB92D": 0.25,
  "#1B4A8A": 0.25,
  "#1A1A1A": 0.10,
  "#B8B0A8": 0.10,
};

// Perceptual heaviness — Locher, Overbeeke & Stappers (2005)
const PERCEPTUAL_WEIGHT = {
  "#D63B2F": 1.0,
  "#EDB92D": 0.4,
  "#1B4A8A": 0.7,
  "#1A1A1A": 0.9,
  "#B8B0A8": 0.3,
  "#F2EDE3": 0.1,
};

// --- Distribution computation ---

function computeStats(values) {
  const n = values.length;
  if (n === 0) return { mean: 0, std: 0, min: 0, max: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return { mean, std: Math.sqrt(variance), min: Math.min(...values), max: Math.max(...values) };
}

function defaultDistributions() {
  return {
    vLineCounts: [3, 4, 4, 5, 5, 6],
    hLineCounts: [3, 3, 4, 4, 5, 6],
    coloredRegionCounts: [0, 0, 1, 1, 2, 2, 2, 3, 3, 4],
    lineWidth: { mean: 0.008, std: 0.002 },
    aspectRatio: { mean: 1.0, std: 0.15 },
    fullSpanRatio: 0.50,
    sampleSize: 0,
  };
}

export function buildDistributions(compositions) {
  if (compositions.length === 0) return defaultDistributions();

  const vLineCounts = compositions.map(c => c.lines.vertical.length);
  const hLineCounts = compositions.map(c => c.lines.horizontal.length);

  // Intentional distribution for colored region count.
  // The traced data counts cells (0–47), not regions — unusable directly.
  // 20% chance of 0 (line-only), most common is 2–3, rarely 4+.
  const coloredRegionCounts = [0, 0, 1, 1, 2, 2, 2, 3, 3, 4];

  const lineWidths = compositions.map(c => c.lineWidth);
  const aspectRatios = compositions.map(c => c.aspectRatio);

  let fullSpanCount = 0;
  let totalLines = 0;
  for (const comp of compositions) {
    for (const l of [...comp.lines.vertical, ...comp.lines.horizontal]) {
      totalLines++;
      if (l.from <= 0.01 && l.to >= 0.99) fullSpanCount++;
    }
  }

  return {
    vLineCounts,
    hLineCounts,
    coloredRegionCounts,
    lineWidth: computeStats(lineWidths),
    aspectRatio: computeStats(aspectRatios),
    fullSpanRatio: totalLines > 0 ? fullSpanCount / totalLines : 0.50,
    sampleSize: compositions.length,
  };
}

// --- Aesthetic scoring ---

/**
 * Score a composition's aesthetic quality.
 * Higher = better. Based on:
 *   - DCM: deviation of perceptual center-of-mass from geometric center (Hübner & Fillinger 2016)
 *   - Spatial homogeneity: how evenly colored regions are distributed
 *   - Proportion quality: penalize extreme rectangle aspect ratios
 */
function scoreComposition(comp) {
  const colored = comp.rectangles.filter(r => r.color !== BG_COLOR);
  if (colored.length === 0) return 0;

  // --- DCM (Deviation of Center of Mass) ---
  // Weighted by area * perceptual color weight
  let totalWeight = 0;
  let wmx = 0;
  let wmy = 0;
  for (const r of colored) {
    const w = r.w * r.h * (PERCEPTUAL_WEIGHT[r.color] || 0.5);
    wmx += (r.x + r.w / 2) * w;
    wmy += (r.y + r.h / 2) * w;
    totalWeight += w;
  }
  const cmx = wmx / totalWeight;
  const cmy = wmy / totalWeight;
  const dcm = Math.sqrt((cmx - 0.5) ** 2 + (cmy - 0.5) ** 2);

  // --- Spatial homogeneity ---
  // Variance of colored region positions (lower = more evenly spread)
  const positions = colored.map(r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 }));
  const meanX = positions.reduce((s, p) => s + p.x, 0) / positions.length;
  const meanY = positions.reduce((s, p) => s + p.y, 0) / positions.length;
  const variance = positions.reduce((s, p) => s + (p.x - meanX) ** 2 + (p.y - meanY) ** 2, 0) / positions.length;
  // Higher variance = more spread = better (up to a point)
  const homogeneity = Math.min(variance, 0.15) / 0.15;

  // --- Proportion quality ---
  // Penalize very elongated colored rectangles (>1:3)
  let propScore = 0;
  for (const r of colored) {
    const ratio = Math.max(r.w, r.h) / Math.min(r.w, r.h);
    propScore += ratio <= 3 ? 1 : 1 / ratio;
  }
  propScore /= colored.length;

  // Combine: balance is most important, then spread, then proportions
  return -dcm * 4 + homogeneity * 1.5 + propScore * 0.5;
}

// --- Line boundary checking ---

const EPS = 0.001;

function lineBlocksBoundary(lines, pos, rangeStart, rangeEnd) {
  return lines.some(
    l =>
      Math.abs(l.pos - pos) < EPS &&
      l.from <= rangeStart + EPS &&
      l.to >= rangeEnd - EPS,
  );
}

// --- Single candidate generation ---

function generateCandidate(dist) {
  const nv = pick(dist.vLineCounts);
  const nh = pick(dist.hLineCounts);

  // Line positions — uniform with minimum spacing
  const MIN_SPACING = 0.06;
  const samplePositions = (n) => {
    const positions = [];
    for (let attempt = 0; attempt < n * 20; attempt++) {
      if (positions.length >= n) break;
      const pos = randFloat(0.05, 0.95);
      if (positions.every(p => Math.abs(p - pos) >= MIN_SPACING)) {
        positions.push(pos);
      }
    }
    return positions.sort((a, b) => a - b);
  };

  const vPositions = samplePositions(nv);
  const hPositions = samplePositions(nh);

  // Lines with partial extents
  const makeLines = (positions, crossPositions) => {
    return positions.map(pos => {
      const roll = Math.random();

      if (roll < dist.fullSpanRatio) {
        return { pos, from: 0, to: 1 };
      }

      const allCross = [0, ...crossPositions, 1].sort((a, b) => a - b);
      const floatingThreshold = dist.fullSpanRatio + 0.15;

      if (roll < floatingThreshold && allCross.length >= 4) {
        const fromIdx = randInt(1, allCross.length - 3);
        const toIdx = randInt(fromIdx + 1, allCross.length - 2);
        return { pos, from: allCross[fromIdx], to: allCross[toIdx] };
      }

      if (Math.random() < 0.5) {
        const toIdx = randInt(1, Math.max(1, allCross.length - 2));
        return { pos, from: 0, to: allCross[toIdx] };
      } else {
        const fromIdx = randInt(1, Math.max(1, allCross.length - 2));
        return { pos, from: allCross[fromIdx], to: 1 };
      }
    });
  };

  const linesV = makeLines(vPositions, hPositions);
  const linesH = makeLines(hPositions, vPositions);

  // Grid cells
  const allX = [0, ...vPositions, 1];
  const allY = [0, ...hPositions, 1];
  const cols = allX.length - 1;
  const rows = allY.length - 1;
  const cellCount = cols * rows;
  const cellIdx = (xi, yi) => xi * rows + yi;

  const cells = [];
  for (let xi = 0; xi < cols; xi++) {
    for (let yi = 0; yi < rows; yi++) {
      cells.push({
        x: allX[xi],
        y: allY[yi],
        w: allX[xi + 1] - allX[xi],
        h: allY[yi + 1] - allY[yi],
      });
    }
  }

  // Union-Find: merge cells not separated by a line
  const uf = new UnionFind(cellCount);

  for (let xi = 0; xi < cols - 1; xi++) {
    for (let yi = 0; yi < rows; yi++) {
      if (!lineBlocksBoundary(linesV, allX[xi + 1], allY[yi], allY[yi + 1])) {
        uf.union(cellIdx(xi, yi), cellIdx(xi + 1, yi));
      }
    }
  }
  for (let xi = 0; xi < cols; xi++) {
    for (let yi = 0; yi < rows - 1; yi++) {
      if (!lineBlocksBoundary(linesH, allY[yi + 1], allX[xi], allX[xi + 1])) {
        uf.union(cellIdx(xi, yi), cellIdx(xi, yi + 1));
      }
    }
  }

  // Build regions
  const regionMap = new Map();
  for (let i = 0; i < cellCount; i++) {
    const root = uf.find(i);
    if (!regionMap.has(root)) regionMap.set(root, []);
    regionMap.get(root).push(i);
  }

  const regions = [];
  for (const [, cellIndices] of regionMap) {
    let area = 0, wcx = 0, wcy = 0;
    for (const ci of cellIndices) {
      const c = cells[ci];
      const a = c.w * c.h;
      area += a;
      wcx += (c.x + c.w / 2) * a;
      wcy += (c.y + c.h / 2) * a;
    }
    regions.push({ cellIndices, area, cx: wcx / area, cy: wcy / area });
  }

  // Color assignment
  let nColored = pick(dist.coloredRegionCounts);
  nColored = Math.min(nColored, regions.length);

  const regionWeight = (r) => {
    const edgeDist = Math.min(r.cx, 1 - r.cx, r.cy, 1 - r.cy);
    const edgeBonus = Math.max(0, 1 - edgeDist / 0.25);
    const sizeFactor = Math.sqrt(r.area) * 4;
    const tinyPenalty = r.area < 0.005 ? 0.02 : 1;
    return (edgeBonus * 2 + sizeFactor + 0.1) * tinyPenalty;
  };

  const regionWeights = regions.map(regionWeight);
  const coloredRegions = new Set();
  const regionColors = new Map();

  const regionsAdjacent = (ra, rb) => {
    for (const ci of ra.cellIndices) {
      const c = cells[ci];
      for (const cj of rb.cellIndices) {
        const d = cells[cj];
        const touchX = Math.abs(c.x + c.w - d.x) < EPS || Math.abs(d.x + d.w - c.x) < EPS;
        const touchY = Math.abs(c.y + c.h - d.y) < EPS || Math.abs(d.y + d.h - c.y) < EPS;
        const overlapX = c.x < d.x + d.w - EPS && d.x < c.x + c.w - EPS;
        const overlapY = c.y < d.y + d.h - EPS && d.y < c.y + c.h - EPS;
        if ((touchX && overlapY) || (touchY && overlapX)) return true;
      }
    }
    return false;
  };

  for (let c = 0; c < nColored; c++) {
    const available = regionWeights.map((w, i) => (coloredRegions.has(i) ? 0 : w));
    if (available.every(w => w === 0)) break;
    const idx = weightedChoice(available);
    coloredRegions.add(idx);

    const neighborColors = new Set();
    for (const ci of coloredRegions) {
      if (ci === idx) continue;
      const color = regionColors.get(ci);
      if (color && regionsAdjacent(regions[idx], regions[ci])) {
        neighborColors.add(color);
      }
    }

    const palette = COLORS.filter(c => !neighborColors.has(c));
    const usePalette = palette.length > 0 ? palette : COLORS;
    const cWeights = usePalette.map(c => COLOR_WEIGHTS[c] || 0.01);
    regionColors.set(idx, usePalette[weightedChoice(cWeights)]);
  }

  // Build rectangle array — cells in the same region share color
  const cellToRegion = new Int32Array(cellCount);
  for (let ri = 0; ri < regions.length; ri++) {
    for (const ci of regions[ri].cellIndices) {
      cellToRegion[ci] = ri;
    }
  }

  const rectangles = [];
  for (let i = 0; i < cellCount; i++) {
    const c = cells[i];
    rectangles.push({
      x: c.x, y: c.y, w: c.w, h: c.h,
      color: regionColors.get(cellToRegion[i]) || BG_COLOR,
    });
  }

  const lineWidth = Math.max(0.005, Math.min(0.012, randNormal(dist.lineWidth.mean, dist.lineWidth.std)));
  const aspectRatio = Math.max(0.7, Math.min(1.3, randNormal(dist.aspectRatio.mean, dist.aspectRatio.std)));

  return {
    title: "Generated Composition",
    year: null,
    aspectRatio,
    lineWidth: Math.round(lineWidth * 100000) / 100000,
    lines: { vertical: linesV, horizontal: linesH },
    rectangles,
  };
}

// --- Public API ---

const N_CANDIDATES = 6;

/**
 * Generate a composition by producing multiple candidates and
 * selecting the most aesthetically balanced one.
 */
export function generateComposition(dist, id = null) {
  let best = null;
  let bestScore = -Infinity;

  for (let i = 0; i < N_CANDIDATES; i++) {
    const candidate = generateCandidate(dist);
    const score = scoreComposition(candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  best.id = id || `gen_${Date.now()}`;
  return best;
}
