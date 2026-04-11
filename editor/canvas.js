/**
 * Canvas rendering, mouse interactions, and reference image management.
 */

import { drawComposition } from '../js/render.js';
import { rebuildRectangles, findNearestLine, findRectAt, round6 } from './grid.js';

const CANVAS_SIZE = 500;

let hoveredLine = null;
let movingLine = null;

export function initCanvas(store) {
  const canvas = document.getElementById('editor-canvas');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('canvas-wrap');
  const refImg = document.getElementById('ref-image');
  const gridCheckbox = document.getElementById('show-grid');

  function resizeCanvas() {
    const comp = store._activeComp();
    const ar = comp ? comp.aspectRatio : parseFloat(document.getElementById('meta-aspect').value) || 1;
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

    // Highlight hovered line
    if (hoveredLine && (store.tool === 'move' || store.tool === 'delete')) {
      ctx.strokeStyle = store.tool === 'delete' ? 'rgba(196,30,58,0.6)' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 4;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      if (hoveredLine.dir === 'v') {
        const x = hoveredLine.line.pos * w;
        ctx.moveTo(x, hoveredLine.line.from * h);
        ctx.lineTo(x, hoveredLine.line.to * h);
      } else {
        const y = hoveredLine.line.pos * h;
        ctx.moveTo(hoveredLine.line.from * w, y);
        ctx.lineTo(hoveredLine.line.to * w, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
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
        movingLine = hit;
        canvas.style.cursor = hit.dir === 'v' ? 'ew-resize' : 'ns-resize';
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
      if (movingLine.dir === 'v') {
        movingLine.line.pos = round6(Math.max(0.01, Math.min(0.99, nx)));
        comp.lines.vertical.sort((a, b) => a.pos - b.pos);
      } else {
        movingLine.line.pos = round6(Math.max(0.01, Math.min(0.99, ny)));
        comp.lines.horizontal.sort((a, b) => a.pos - b.pos);
      }
      rebuildRectangles(comp);
      redraw();
      return;
    }

    if (store.tool === 'move' || store.tool === 'delete') {
      const hit = findNearestLine(comp, nx, ny, 0.03);
      if (hit !== hoveredLine) {
        hoveredLine = hit;
        canvas.style.cursor = hit
          ? (store.tool === 'move' ? (hit.dir === 'v' ? 'ew-resize' : 'ns-resize') : 'pointer')
          : 'crosshair';
        redraw();
      }
    }
  });

  canvas.addEventListener('mouseup', () => {
    if (movingLine) {
      movingLine = null;
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

  return {
    redraw,
    resetHover() {
      hoveredLine = null;
      canvas.style.cursor = 'crosshair';
    },
  };
}
