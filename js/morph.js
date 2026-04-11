/**
 * Morphing engine for smooth transitions between Mondrian compositions.
 * Handles rectangle matching, color interpolation, and line interpolation.
 */

// --- Easing ---

function easeInOutQuart(t) {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}

// --- Color utilities ---

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
}

function lerpColor(hex1, hex2, t) {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return rgbToHex(
    Math.round(r1 + (r2 - r1) * t),
    Math.round(g1 + (g2 - g1) * t),
    Math.round(b1 + (b2 - b1) * t)
  );
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// --- Rectangle matching ---

/**
 * Match rectangles between two compositions by spatial overlap (IoU) and color similarity.
 * Returns pairs of indices and unmatched remainders.
 */
function matchRectangles(rectsA, rectsB) {
  const usedA = new Set();
  const usedB = new Set();
  const pairs = [];

  // Score matrix: spatial overlap + color bonus
  const scores = [];
  for (let i = 0; i < rectsA.length; i++) {
    for (let j = 0; j < rectsB.length; j++) {
      const a = rectsA[i];
      const b = rectsB[j];

      // IoU-like spatial score
      const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      const intersection = ox * oy;
      const union = a.w * a.h + b.w * b.h - intersection;
      const iou = union > 0 ? intersection / union : 0;

      // Color match bonus
      const colorBonus = a.color === b.color ? 0.3 : 0;

      // Size similarity bonus
      const sizeRatio = Math.min(a.w * a.h, b.w * b.h) / Math.max(a.w * a.h, b.w * b.h) || 0;
      const sizeBonus = sizeRatio * 0.2;

      scores.push({ i, j, score: iou + colorBonus + sizeBonus });
    }
  }

  // Greedy matching by descending score
  scores.sort((a, b) => b.score - a.score);
  for (const { i, j, score } of scores) {
    if (usedA.has(i) || usedB.has(j)) continue;
    if (score < 0.01) continue; // too dissimilar
    pairs.push([i, j]);
    usedA.add(i);
    usedB.add(j);
  }

  const unmatchedA = [];
  for (let i = 0; i < rectsA.length; i++) {
    if (!usedA.has(i)) unmatchedA.push(i);
  }
  const unmatchedB = [];
  for (let j = 0; j < rectsB.length; j++) {
    if (!usedB.has(j)) unmatchedB.push(j);
  }

  return { pairs, unmatchedA, unmatchedB };
}

// --- Line matching ---

function matchLines(linesA, linesB) {
  const usedA = new Set();
  const usedB = new Set();
  const pairs = [];

  const scores = [];
  for (let i = 0; i < linesA.length; i++) {
    for (let j = 0; j < linesB.length; j++) {
      const dist = Math.abs(linesA[i].pos - linesB[j].pos);
      scores.push({ i, j, score: 1 - dist });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  for (const { i, j, score } of scores) {
    if (usedA.has(i) || usedB.has(j)) continue;
    if (score < 0.3) continue;
    pairs.push([i, j]);
    usedA.add(i);
    usedB.add(j);
  }

  const unmatchedA = [];
  for (let i = 0; i < linesA.length; i++) {
    if (!usedA.has(i)) unmatchedA.push(i);
  }
  const unmatchedB = [];
  for (let j = 0; j < linesB.length; j++) {
    if (!usedB.has(j)) unmatchedB.push(j);
  }

  return { pairs, unmatchedA, unmatchedB };
}

// --- Morph Engine ---

export class MorphEngine {
  constructor() {
    this.compA = null;
    this.compB = null;
    this.duration = 3000; // ms
    this.startTime = null;
    this.rectMatch = null;
    this.vLineMatch = null;
    this.hLineMatch = null;
    this.active = false;
  }

  /**
   * Begin morphing from compA to compB.
   */
  start(compA, compB, duration = 3000) {
    this.compA = compA;
    this.compB = compB;
    this.duration = duration;
    this.startTime = null;
    this.active = true;

    // Pre-compute matchings
    this.rectMatch = matchRectangles(compA.rectangles, compB.rectangles);
    this.vLineMatch = matchLines(compA.lines.vertical, compB.lines.vertical);
    this.hLineMatch = matchLines(compA.lines.horizontal, compB.lines.horizontal);
  }

  /**
   * Get the interpolated state at a given timestamp.
   * Returns null if morphing is complete.
   */
  tick(timestamp) {
    if (!this.active) return null;

    if (this.startTime === null) this.startTime = timestamp;
    const elapsed = timestamp - this.startTime;
    const rawT = Math.min(elapsed / this.duration, 1);
    const t = easeInOutQuart(rawT);

    const state = this._interpolate(t);

    if (rawT >= 1) {
      this.active = false;
    }

    return state;
  }

  _interpolate(t) {
    const a = this.compA;
    const b = this.compB;

    // Interpolate rectangles
    const rectangles = [];

    // Matched pairs: lerp position, size, color
    for (const [ai, bi] of this.rectMatch.pairs) {
      const ra = a.rectangles[ai];
      const rb = b.rectangles[bi];
      rectangles.push({
        x: lerp(ra.x, rb.x, t),
        y: lerp(ra.y, rb.y, t),
        w: lerp(ra.w, rb.w, t),
        h: lerp(ra.h, rb.h, t),
        color: lerpColor(ra.color, rb.color, t),
        opacity: 1,
      });
    }

    // Unmatched A: fade out
    for (const ai of this.rectMatch.unmatchedA) {
      const ra = a.rectangles[ai];
      rectangles.push({ ...ra, opacity: 1 - t });
    }

    // Unmatched B: fade in
    for (const bi of this.rectMatch.unmatchedB) {
      const rb = b.rectangles[bi];
      rectangles.push({ ...rb, opacity: t });
    }

    // Interpolate lines
    const vertical = this._interpolateLines(
      a.lines.vertical, b.lines.vertical, this.vLineMatch, t
    );
    const horizontal = this._interpolateLines(
      a.lines.horizontal, b.lines.horizontal, this.hLineMatch, t
    );

    return {
      rectangles,
      lines: { vertical, horizontal },
      lineWidth: lerp(a.lineWidth, b.lineWidth, t),
      aspectRatio: lerp(a.aspectRatio, b.aspectRatio, t),
      diamond: t < 0.5 ? a.diamond : b.diamond,
    };
  }

  _interpolateLines(linesA, linesB, match, t) {
    const result = [];

    for (const [ai, bi] of match.pairs) {
      const la = linesA[ai];
      const lb = linesB[bi];
      result.push({
        pos: lerp(la.pos, lb.pos, t),
        from: lerp(la.from, lb.from, t),
        to: lerp(la.to, lb.to, t),
        opacity: 1,
      });
    }

    for (const ai of match.unmatchedA) {
      const la = linesA[ai];
      result.push({ ...la, opacity: 1 - t });
    }

    for (const bi of match.unmatchedB) {
      const lb = linesB[bi];
      result.push({ ...lb, opacity: t });
    }

    return result;
  }
}
