/**
 * Canvas rendering for Mondrian compositions.
 * Pure functions — no state, no animation.
 */

/**
 * Draw a complete composition onto a canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} comp - Composition object
 * @param {number} w - Canvas pixel width
 * @param {number} h - Canvas pixel height
 */
export function drawComposition(ctx, comp, w, h) {
  ctx.clearRect(0, 0, w, h);

  if (comp.diamond) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h / 2);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(0, h / 2);
    ctx.closePath();
    ctx.clip();
  }

  // Background (cream white)
  ctx.fillStyle = "#F2EDE3";
  ctx.fillRect(0, 0, w, h);

  // Draw colored rectangles (expand by 0.5px to avoid sub-pixel gaps)
  const pad = 0.5;
  for (const rect of comp.rectangles) {
    ctx.fillStyle = rect.color;
    ctx.fillRect(
      rect.x * w - pad,
      rect.y * h - pad,
      rect.w * w + pad * 2,
      rect.h * h + pad * 2
    );
  }

  // Draw lines on top
  const defaultLw = Math.max(2, comp.lineWidth * Math.max(w, h));
  ctx.lineCap = "butt";

  // Vertical lines
  for (const line of comp.lines.vertical) {
    ctx.strokeStyle = line.color || "#000000";
    ctx.lineWidth = line.lineWidth ? Math.max(2, line.lineWidth * Math.max(w, h)) : defaultLw;
    const x = line.pos * w;
    ctx.beginPath();
    ctx.moveTo(x, line.from * h);
    ctx.lineTo(x, line.to * h);
    ctx.stroke();
  }

  // Horizontal lines
  for (const line of comp.lines.horizontal) {
    ctx.strokeStyle = line.color || "#000000";
    ctx.lineWidth = line.lineWidth ? Math.max(2, line.lineWidth * Math.max(w, h)) : defaultLw;
    const y = line.pos * h;
    ctx.beginPath();
    ctx.moveTo(line.from * w, y);
    ctx.lineTo(line.to * w, y);
    ctx.stroke();
  }

  if (comp.diamond) {
    ctx.restore();
    // Diamond border
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h / 2);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(0, h / 2);
    ctx.closePath();
    ctx.stroke();
  }
}

/**
 * Compute the 4 vertices of a rectangle rotated by `deg` degrees around the
 * canvas center, scaled so it stays inscribed within the canvas bounds.
 * At 0° → full canvas rectangle. At 45° → diamond (same as existing clip).
 */
function rotatedFrameVertices(w, h, deg) {
  const rad = deg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Scale so the rotated rectangle fits within (w, h)
  const scale = 1 / (Math.abs(cos) + Math.abs(sin));
  const rw = w * scale / 2;
  const rh = h * scale / 2;
  const cx = w / 2;
  const cy = h / 2;
  return [[-rw, -rh], [rw, -rh], [rw, rh], [-rw, rh]].map(([x, y]) => [
    cx + x * cos - y * sin,
    cy + x * sin + y * cos,
  ]);
}

/**
 * Draw an interpolated (morphing) state between two compositions.
 * The frame (clip + border) rotates smoothly from 0° (rectangle) to 45° (diamond).
 * Content inside stays upright — only the outer frame tilts.
 */
export function drawMorphState(ctx, state, w, h) {
  ctx.clearRect(0, 0, w, h);

  const dt = state.diamondT ?? (state.diamond ? 1 : 0);
  const deg = dt * 45;

  // Clip to rotated frame (at 0° this is the full canvas, so skip)
  if (deg > 0.1) {
    const verts = rotatedFrameVertices(w, h, deg);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(verts[0][0], verts[0][1]);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i][0], verts[i][1]);
    ctx.closePath();
    ctx.clip();
  }

  ctx.fillStyle = "#F2EDE3";
  ctx.fillRect(0, 0, w, h);

  // Rectangles with interpolated color and opacity
  const pad = 0.5;
  for (const rect of state.rectangles) {
    ctx.globalAlpha = rect.opacity ?? 1;
    ctx.fillStyle = rect.color;
    ctx.fillRect(
      rect.x * w - pad,
      rect.y * h - pad,
      rect.w * w + pad * 2,
      rect.h * h + pad * 2
    );
  }
  ctx.globalAlpha = 1;

  // Lines
  const defaultLw = Math.max(2, state.lineWidth * Math.max(w, h));
  ctx.lineCap = "butt";

  for (const line of state.lines.vertical) {
    ctx.globalAlpha = line.opacity ?? 1;
    ctx.strokeStyle = line.color || "#000000";
    ctx.lineWidth = line.lineWidth ? Math.max(2, line.lineWidth * Math.max(w, h)) : defaultLw;
    const x = line.pos * w;
    ctx.beginPath();
    ctx.moveTo(x, line.from * h);
    ctx.lineTo(x, line.to * h);
    ctx.stroke();
  }

  for (const line of state.lines.horizontal) {
    ctx.globalAlpha = line.opacity ?? 1;
    ctx.strokeStyle = line.color || "#000000";
    ctx.lineWidth = line.lineWidth ? Math.max(2, line.lineWidth * Math.max(w, h)) : defaultLw;
    const y = line.pos * h;
    ctx.beginPath();
    ctx.moveTo(line.from * w, y);
    ctx.lineTo(line.to * w, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Draw rotated frame border
  if (deg > 0.1) {
    ctx.restore();
    const verts = rotatedFrameVertices(w, h, deg);
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(verts[0][0], verts[0][1]);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i][0], verts[i][1]);
    ctx.closePath();
    ctx.stroke();
  }
}
