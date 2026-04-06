/**
 * Statistical generation engine.
 * Computes distributions from composition data at load time,
 * then samples new compositions from those distributions.
 */

// --- Random utilities ---

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

/** Sample from a normal distribution using Box-Muller transform. */
function randNormal(mean, std) {
  const u1 = Math.random();
  const u2 = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Pick a random element from an array. */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Weighted random selection. Returns index. */
function weightedChoice(weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// --- Distribution computation ---

function computeStats(values) {
  const n = values.length;
  if (n === 0) return { mean: 0, std: 0, min: 0, max: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return {
    mean,
    std: Math.sqrt(variance),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

/**
 * Build distributions from an array of compositions.
 */
export function buildDistributions(compositions) {
  // Store raw counts for direct sampling instead of normal approximation
  const vLineCounts = compositions.map(c => c.lines.vertical.length);
  const hLineCounts = compositions.map(c => c.lines.horizontal.length);

  // Collect all line positions (kept for reference, but generation uses uniform)
  const vPositions = compositions.flatMap(c => c.lines.vertical.map(l => l.pos));
  const hPositions = compositions.flatMap(c => c.lines.horizontal.map(l => l.pos));

  // Color statistics
  const colorCounts = { "#FFFFFF": 0, "#DD0100": 0, "#FAC901": 0, "#0000D6": 0, "#000000": 0 };
  const colorAreas = { "#FFFFFF": 0, "#DD0100": 0, "#FAC901": 0, "#0000D6": 0, "#000000": 0 };
  let totalArea = 0;
  let totalColoredRects = 0;
  const coloredRectsPerPainting = [];

  // Position tendency of colored rects
  const coloredPositions = []; // {cx, cy} normalized center positions

  for (const comp of compositions) {
    let coloredCount = 0;
    for (const rect of comp.rectangles) {
      const area = rect.w * rect.h;
      const color = rect.color in colorAreas ? rect.color : "#FFFFFF";
      colorAreas[color] += area;
      totalArea += area;
      if (color !== "#FFFFFF") {
        colorCounts[color]++;
        totalColoredRects++;
        coloredCount++;
        coloredPositions.push({ cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 });
      }
    }
    coloredRectsPerPainting.push(coloredCount);
  }

  // Line widths
  const lineWidths = compositions.map(c => c.lineWidth);

  // Aspect ratios
  const aspectRatios = compositions.map(c => c.aspectRatio);

  // What fraction of lines are full-span vs partial
  let fullSpanCount = 0;
  let totalLines = 0;
  for (const comp of compositions) {
    for (const l of comp.lines.vertical) {
      totalLines++;
      if (l.from <= 0.01 && l.to >= 0.99) fullSpanCount++;
    }
    for (const l of comp.lines.horizontal) {
      totalLines++;
      if (l.from <= 0.01 && l.to >= 0.99) fullSpanCount++;
    }
  }

  return {
    vLineCount: computeStats(vLineCounts),
    hLineCount: computeStats(hLineCounts),
    vLineCounts,  // raw values for direct sampling
    hLineCounts,  // raw values for direct sampling
    vPositions: computeStats(vPositions),
    hPositions: computeStats(hPositions),
    colorAreas: Object.fromEntries(
      Object.entries(colorAreas).map(([k, v]) => [k, v / totalArea])
    ),
    coloredRectsPerPainting: computeStats(coloredRectsPerPainting),
    coloredRectsCounts: coloredRectsPerPainting,  // raw values for direct sampling
    coloredPositions,
    lineWidth: computeStats(lineWidths),
    aspectRatio: computeStats(aspectRatios),
    fullSpanRatio: totalLines > 0 ? fullSpanCount / totalLines : 0.7,
    sampleSize: compositions.length,
  };
}

// --- Generation ---

const COLORS = ["#DD0100", "#FAC901", "#0000D6", "#000000", "#AAAAAA"];

/**
 * Generate a new composition by sampling from the given distributions.
 */
export function generateComposition(dist, id = null) {
  // Sample line counts directly from observed data
  const nv = pick(dist.vLineCounts);
  const nh = pick(dist.hLineCounts);

  // Sample line positions from uniform distribution (real data is approximately uniform)
  // with minimum spacing constraint to avoid unrealistically close lines
  const MIN_SPACING = 0.06;
  const samplePositions = (n) => {
    const positions = [];
    for (let attempt = 0; attempt < n * 20; attempt++) {
      if (positions.length >= n) break;
      const pos = randFloat(0.05, 0.95);
      const tooClose = positions.some(p => Math.abs(p - pos) < MIN_SPACING);
      if (!tooClose) positions.push(pos);
    }
    return positions.sort((a, b) => a - b);
  };

  const vPositions = samplePositions(nv);
  const hPositions = samplePositions(nh);

  // Decide if each line is full-span or partial
  // Partial lines in real Mondrian almost always anchor to an edge (from=0 or to=1)
  const makeLines = (positions, crossPositions) => {
    return positions.map(pos => {
      const isFullSpan = Math.random() < dist.fullSpanRatio;
      if (isFullSpan) {
        return { pos, from: 0, to: 1 };
      }
      const allCross = [0, ...crossPositions, 1].sort((a, b) => a - b);
      // Edge-anchored partial lines: start from 0 or end at 1
      const anchorToStart = Math.random() < 0.5;
      if (anchorToStart) {
        const toIdx = randInt(1, allCross.length - 2);
        return { pos, from: 0, to: allCross[toIdx] };
      } else {
        const fromIdx = randInt(1, allCross.length - 2);
        return { pos, from: allCross[fromIdx], to: 1 };
      }
    });
  };

  const linesV = makeLines(vPositions, hPositions);
  const linesH = makeLines(hPositions, vPositions);

  // Build grid cells (rectangles)
  const allX = [0, ...vPositions, 1];
  const allY = [0, ...hPositions, 1];
  const rectangles = [];

  for (let xi = 0; xi < allX.length - 1; xi++) {
    for (let yi = 0; yi < allY.length - 1; yi++) {
      rectangles.push({
        x: allX[xi],
        y: allY[yi],
        w: allX[xi + 1] - allX[xi],
        h: allY[yi + 1] - allY[yi],
        color: "#FFFFFF",
        _cx: (allX[xi] + allX[xi + 1]) / 2,
        _cy: (allY[yi] + allY[yi + 1]) / 2,
      });
    }
  }

  // Assign colors — sample count from observed data
  const nColored = pick(dist.coloredRectsCounts);

  // Prefer edge/corner rectangles (Mondrian tendency)
  const edgeWeight = (rect) => {
    const cx = rect._cx;
    const cy = rect._cy;
    // Distance from center — higher = more likely colored
    const fromCenter = Math.sqrt((cx - 0.5) ** 2 + (cy - 0.5) ** 2);
    // Bonus for being near edges
    const edgeDist = Math.min(cx, 1 - cx, cy, 1 - cy);
    return fromCenter * 2 + (edgeDist < 0.15 ? 1.5 : 0) + 0.1;
  };

  // Check if two rectangles share an edge
  const isAdjacent = (a, b) => {
    const touchX = Math.abs(a.x + a.w - b.x) < 0.001 || Math.abs(b.x + b.w - a.x) < 0.001;
    const touchY = Math.abs(a.y + a.h - b.y) < 0.001 || Math.abs(b.y + b.h - a.y) < 0.001;
    const overlapX = a.x < b.x + b.w - 0.001 && b.x < a.x + a.w - 0.001;
    const overlapY = a.y < b.y + b.h - 0.001 && b.y < a.y + a.h - 0.001;
    return (touchX && overlapY) || (touchY && overlapX);
  };

  const weights = rectangles.map(edgeWeight);
  const colored = new Set();
  for (let c = 0; c < Math.min(nColored, rectangles.length); c++) {
    const available = weights.map((w, i) => colored.has(i) ? 0 : w);
    const idx = weightedChoice(available);
    colored.add(idx);

    // Pick color avoiding same color on adjacent rectangles
    const neighborColors = new Set();
    for (const ci of colored) {
      if (ci !== idx && rectangles[ci].color !== "#FFFFFF") {
        if (isAdjacent(rectangles[idx], rectangles[ci])) {
          neighborColors.add(rectangles[ci].color);
        }
      }
    }
    const availableColors = COLORS.filter(c => !neighborColors.has(c));
    const palette = availableColors.length > 0 ? availableColors : COLORS;
    // Gray (#AAAAAA) is not in dataset — assign weight similar to black (~1.6% area)
    const colorWeights = palette.map(c => dist.colorAreas[c] || 0.015);
    const colorIdx = weightedChoice(colorWeights);
    rectangles[idx].color = palette[colorIdx];
  }

  // Clean up temp fields
  for (const r of rectangles) {
    delete r._cx;
    delete r._cy;
  }

  const lineWidth = Math.max(0.005, randNormal(dist.lineWidth.mean, dist.lineWidth.std));

  return {
    id: id || `gen_${Date.now()}`,
    title: `Generated Composition`,
    year: null,
    aspectRatio: Math.max(0.7, Math.min(1.3, randNormal(dist.aspectRatio.mean, dist.aspectRatio.std))),
    lineWidth: Math.round(lineWidth * 100000) / 100000,
    lines: { vertical: linesV, horizontal: linesH },
    rectangles,
  };
}
