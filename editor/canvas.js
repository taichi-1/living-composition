/**
 * Canvas rendering, mouse interactions, and reference image management.
 */

import { drawComposition } from '../js/render.js';
import { rebuildRectangles, findNearestLine, findRectAt, round6 } from './grid.js';

const CANVAS_SIZE = 500;
const ENDPOINT_THRESHOLD = 0.04;

let hoveredLine = null;
let hoveredEndpoint = null; // 'from' | 'to' | null
let movingLine = null;
let movingEndpoint = null; // 'from' | 'to' | null (when dragging an endpoint)
let selectedLine = null; // { dir, line, idx } — currently selected line for property editing
let dragStartPos = null; // to distinguish click from drag

export function initCanvas(store) {
  const canvas = document.getElementById('editor-canvas');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('canvas-wrap');
  const refImg = document.getElementById('ref-image');
  const gridCheckbox = document.getElementById('show-grid');

  function resizeCanvas() {
    const comp = store._activeComp();
    const ar = comp ? comp.aspectRatio : 1;
    let w, h;
    if (ar >= 1) {
      w = CANVAS_SIZE;
      h = Math.round(CANVAS_SIZE / ar);
    } else {
      h = CANVAS_SIZE;
      w = Math.round(CANVAS_SIZE * ar);
    }
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    wrap.style.width = w + 'px';
    wrap.style.height = h + 'px';
    return { w: w * dpr, h: h * dpr };
  }

  function redraw() {
    const { w, h } = resizeCanvas();
    const comp = store._activeComp();

    if (!comp) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#F2EDE3';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#aaa';
      ctx.font = '14px DM Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Create or select a composition', w / 2, h / 2);
      return;
    }

    drawComposition(ctx, comp, w, h);

    // Grid overlay
    if (gridCheckbox.checked) {
      ctx.strokeStyle = 'rgba(255,0,0,0.15)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 10; i++) {
        ctx.beginPath();
        ctx.moveTo(w * i / 10, 0);
        ctx.lineTo(w * i / 10, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, h * i / 10);
        ctx.lineTo(w, h * i / 10);
        ctx.stroke();
      }
    }

    // Highlight selected line
    if (selectedLine && store.tool === 'move') {
      const sl = selectedLine.line;
      ctx.strokeStyle = 'rgba(0,180,255,0.7)';
      ctx.lineWidth = 6;
      ctx.setLineDash([]);
      ctx.beginPath();
      if (selectedLine.dir === 'v') {
        ctx.moveTo(sl.pos * w, sl.from * h);
        ctx.lineTo(sl.pos * w, sl.to * h);
      } else {
        ctx.moveTo(sl.from * w, sl.pos * h);
        ctx.lineTo(sl.to * w, sl.pos * h);
      }
      ctx.stroke();
    }

    // Highlight hovered line
    if (hoveredLine && (store.tool === 'move' || store.tool === 'delete')) {
      const line = hoveredLine.line;
      ctx.strokeStyle = store.tool === 'delete' ? 'rgba(196,30,58,0.6)' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 4;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      if (hoveredLine.dir === 'v') {
        const x = line.pos * w;
        ctx.moveTo(x, line.from * h);
        ctx.lineTo(x, line.to * h);
      } else {
        const y = line.pos * h;
        ctx.moveTo(line.from * w, y);
        ctx.lineTo(line.to * w, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw endpoint handles in move mode
      if (store.tool === 'move') {
        const r = 5;
        ctx.fillStyle = hoveredEndpoint === 'from' ? '#C41E3A' : 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        if (hoveredLine.dir === 'v') {
          ctx.arc(line.pos * w, line.from * h, r, 0, Math.PI * 2);
        } else {
          ctx.arc(line.from * w, line.pos * h, r, 0, Math.PI * 2);
        }
        ctx.fill();

        ctx.fillStyle = hoveredEndpoint === 'to' ? '#C41E3A' : 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        if (hoveredLine.dir === 'v') {
          ctx.arc(line.pos * w, line.to * h, r, 0, Math.PI * 2);
        } else {
          ctx.arc(line.to * w, line.pos * h, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
  }

  function canvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      nx: (e.clientX - rect.left) / rect.width,
      ny: (e.clientY - rect.top) / rect.height,
    };
  }

  // ---- Mouse handlers ----

  canvas.addEventListener('mousedown', (e) => {
    const comp = store._activeComp();
    if (!comp) return;
    const { nx, ny } = canvasPos(e);
    const { tool, paintColor } = store;

    if (tool === 'vline') {
      comp.lines.vertical.push({ pos: round6(nx), from: 0, to: 1 });
      comp.lines.vertical.sort((a, b) => a.pos - b.pos);
      rebuildRectangles(comp);
      redraw();
      store._save();
    } else if (tool === 'hline') {
      comp.lines.horizontal.push({ pos: round6(ny), from: 0, to: 1 });
      comp.lines.horizontal.sort((a, b) => a.pos - b.pos);
      rebuildRectangles(comp);
      redraw();
      store._save();
    } else if (tool === 'paint') {
      const ri = findRectAt(comp, nx, ny);
      if (ri >= 0) {
        comp.rectangles[ri].color = paintColor;
        redraw();
        store._save();
      }
    } else if (tool === 'move') {
      const hit = findNearestLine(comp, nx, ny, 0.03);
      if (hit) {
        // Check if grabbing an endpoint
        const ep = detectEndpoint(hit, nx, ny);
        movingLine = hit;
        movingEndpoint = ep;
        dragStartPos = { nx, ny };
        if (ep) {
          canvas.style.cursor = hit.dir === 'v' ? 'ns-resize' : 'ew-resize';
        } else {
          canvas.style.cursor = hit.dir === 'v' ? 'ew-resize' : 'ns-resize';
        }
      } else {
        // Clicked empty area — deselect
        if (selectedLine) {
          selectedLine = null;
          store._onLineSelect?.(null);
          redraw();
        }
      }
    } else if (tool === 'delete') {
      const hit = findNearestLine(comp, nx, ny, 0.03);
      if (hit) {
        if (hit.dir === 'v') {
          comp.lines.vertical.splice(hit.idx, 1);
        } else {
          comp.lines.horizontal.splice(hit.idx, 1);
        }
        hoveredLine = null;
        rebuildRectangles(comp);
        redraw();
        store._save();
      }
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const comp = store._activeComp();
    if (!comp) return;
    const { nx, ny } = canvasPos(e);

    if (movingLine) {
      if (movingEndpoint) {
        // Dragging a line endpoint (from or to)
        const val = movingLine.dir === 'v' ? ny : nx;
        movingLine.line[movingEndpoint] = round6(Math.max(0, Math.min(1, val)));
        // Ensure from < to
        if (movingLine.line.from > movingLine.line.to) {
          const tmp = movingLine.line.from;
          movingLine.line.from = movingLine.line.to;
          movingLine.line.to = tmp;
          movingEndpoint = movingEndpoint === 'from' ? 'to' : 'from';
        }
      } else {
        // Moving the whole line position
        if (movingLine.dir === 'v') {
          movingLine.line.pos = round6(Math.max(0.01, Math.min(0.99, nx)));
          comp.lines.vertical.sort((a, b) => a.pos - b.pos);
        } else {
          movingLine.line.pos = round6(Math.max(0.01, Math.min(0.99, ny)));
          comp.lines.horizontal.sort((a, b) => a.pos - b.pos);
        }
      }
      rebuildRectangles(comp);
      redraw();
      return;
    }

    if (store.tool === 'move' || store.tool === 'delete') {
      const hit = findNearestLine(comp, nx, ny, 0.03);
      const ep = hit && store.tool === 'move' ? detectEndpoint(hit, nx, ny) : null;
      if (hit !== hoveredLine || ep !== hoveredEndpoint) {
        hoveredLine = hit;
        hoveredEndpoint = ep;
        if (!hit) {
          canvas.style.cursor = 'crosshair';
        } else if (store.tool === 'delete') {
          canvas.style.cursor = 'pointer';
        } else if (ep) {
          canvas.style.cursor = hit.dir === 'v' ? 'ns-resize' : 'ew-resize';
        } else {
          canvas.style.cursor = hit.dir === 'v' ? 'ew-resize' : 'ns-resize';
        }
        redraw();
      }
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    if (movingLine) {
      // Detect click (no drag) to select a line
      if (dragStartPos) {
        const { nx, ny } = canvasPos(e);
        const dist = Math.abs(nx - dragStartPos.nx) + Math.abs(ny - dragStartPos.ny);
        if (dist < 0.005) {
          // Click — select this line
          selectedLine = movingLine;
          store._onLineSelect?.(selectedLine);
          redraw();
        }
        dragStartPos = null;
      }
      movingLine = null;
      movingEndpoint = null;
      canvas.style.cursor = 'crosshair';
      store._save();
    }
  });

  canvas.addEventListener('mouseleave', () => {
    if (hoveredLine) {
      hoveredLine = null;
      redraw();
    }
  });

  // ---- Reference image ----

  document.getElementById('btn-ref').addEventListener('click', () => {
    document.getElementById('file-ref').click();
  });

  document.getElementById('file-ref').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    refImg.src = URL.createObjectURL(file);
    refImg.style.display = 'block';
  });

  document.getElementById('ref-opacity').addEventListener('input', (e) => {
    refImg.style.opacity = e.target.value;
  });

  gridCheckbox.addEventListener('change', () => redraw());

  /** Detect if cursor is near an endpoint of a line. Returns 'from', 'to', or null. */
  function detectEndpoint(hit, nx, ny) {
    if (!hit) return null;
    const line = hit.line;
    let fromDist, toDist;
    if (hit.dir === 'v') {
      fromDist = Math.abs(ny - line.from);
      toDist = Math.abs(ny - line.to);
    } else {
      fromDist = Math.abs(nx - line.from);
      toDist = Math.abs(nx - line.to);
    }
    if (fromDist < ENDPOINT_THRESHOLD && fromDist < toDist) return 'from';
    if (toDist < ENDPOINT_THRESHOLD) return 'to';
    return null;
  }

  return {
    redraw,
    resetHover() {
      hoveredLine = null;
      hoveredEndpoint = null;
      canvas.style.cursor = 'crosshair';
    },
    deselectLine() {
      selectedLine = null;
      store._onLineSelect?.(null);
      redraw();
    },
  };
}
