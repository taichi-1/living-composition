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

  // Background (cream white)
  ctx.fillStyle = "#F2EDE3";
  ctx.fillRect(0, 0, w, h);

  // Draw colored rectangles
  for (const rect of comp.rectangles) {
    ctx.fillStyle = rect.color;
    ctx.fillRect(
      rect.x * w,
      rect.y * h,
      rect.w * w,
      rect.h * h
    );
  }

  // Draw lines on top
  const lw = Math.max(2, comp.lineWidth * Math.max(w, h));
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = lw;
  ctx.lineCap = "butt";

  // Vertical lines
  for (const line of comp.lines.vertical) {
    const x = line.pos * w;
    ctx.beginPath();
    ctx.moveTo(x, line.from * h);
    ctx.lineTo(x, line.to * h);
    ctx.stroke();
  }

  // Horizontal lines
  for (const line of comp.lines.horizontal) {
    const y = line.pos * h;
    ctx.beginPath();
    ctx.moveTo(line.from * w, y);
    ctx.lineTo(line.to * w, y);
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

  ctx.fillStyle = "#F2EDE3";
  ctx.fillRect(0, 0, w, h);

  // Rectangles with interpolated color and opacity
  for (const rect of state.rectangles) {
    ctx.globalAlpha = rect.opacity ?? 1;
    ctx.fillStyle = rect.color;
    ctx.fillRect(
      rect.x * w,
      rect.y * h,
      rect.w * w,
      rect.h * h
    );
  }
  ctx.globalAlpha = 1;

  // Lines
  const lw = Math.max(2, state.lineWidth * Math.max(w, h));
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = lw;
  ctx.lineCap = "butt";

  for (const line of state.lines.vertical) {
    ctx.globalAlpha = line.opacity ?? 1;
    const x = line.pos * w;
    ctx.beginPath();
    ctx.moveTo(x, line.from * h);
    ctx.lineTo(x, line.to * h);
    ctx.stroke();
  }

  for (const line of state.lines.horizontal) {
    ctx.globalAlpha = line.opacity ?? 1;
    const y = line.pos * h;
    ctx.beginPath();
    ctx.moveTo(line.from * w, y);
    ctx.lineTo(line.to * w, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
