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
 * Draw an interpolated (morphing) state between two compositions.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state - Interpolated composition state from morph engine
 * @param {number} w - Canvas pixel width
 * @param {number} h - Canvas pixel height
 */
export function drawMorphState(ctx, state, w, h) {
  ctx.clearRect(0, 0, w, h);

  if (state.diamond) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h / 2);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(0, h / 2);
    ctx.closePath();
    ctx.clip();
  }

  ctx.fillStyle = "#F2EDE3";
  ctx.fillRect(0, 0, w, h);

  // Rectangles with interpolated color and opacity (expand by 0.5px to avoid sub-pixel gaps)
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

  if (state.diamond) {
    ctx.restore();
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
