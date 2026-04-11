/**
 * Editor entry point: wires up state, canvas, sidebar, keyboard shortcuts.
 */

import './style.css';
import { createStore, activeComp, save, undo, redo, setTool, setPaintColor, newComposition } from './state.js';
import { initCanvas } from './canvas.js';
import { initSidebar } from './sidebar.js';

// ---- Create store with onChange callback (set after canvas/sidebar init) ----

const store = createStore(() => {
  sidebar.renderList();
  canvas.redraw();
});

// Convenience methods used by canvas/sidebar modules
store._activeComp = () => activeComp(store);
store._save = () => save(store);

// ---- Initialize modules ----

const canvas = initCanvas(store);
const sidebar = initSidebar(store, canvas);

// ---- Tool switching ----

document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    setTool(store, btn.dataset.tool);
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b === btn));
    canvas.resetHover();
    updateHint();
    canvas.redraw();
  });
});

// ---- Color palette ----

document.getElementById('palette').addEventListener('click', (e) => {
  const btn = e.target.closest('.palette-btn');
  if (!btn) return;
  setPaintColor(store, btn.dataset.color);
  document.querySelectorAll('.palette-btn').forEach(b => b.classList.toggle('active', b === btn));
});

// ---- New composition ----

document.getElementById('btn-new').addEventListener('click', () => {
  const ar = parseFloat(document.getElementById('meta-aspect').value) || 1;
  newComposition(store, ar);
  sidebar.loadCompToUI();
});

// ---- Keyboard shortcuts ----

const HINTS = {
  vline: 'Click to add vertical line | V',
  hline: 'Click to add horizontal line | H',
  paint: 'Click a cell to paint | P',
  move: 'Drag a line to move it | M',
  delete: 'Click a line to delete it | D',
};

function updateHint() {
  document.getElementById('hint').textContent = HINTS[store.tool] || '';
}

function activateTool(t) {
  setTool(store, t);
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  canvas.resetHover();
  updateHint();
  canvas.redraw();
}

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;

  switch (e.key) {
    case 'v': activateTool('vline'); break;
    case 'h': activateTool('hline'); break;
    case 'p': activateTool('paint'); break;
    case 'm': activateTool('move'); break;
    case 'd': activateTool('delete'); break;
    case 'z':
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        if (e.shiftKey) {
          redo(store);
        } else {
          undo(store);
        }
        sidebar.loadCompToUI();
      }
      break;
  }
});

// ---- Initial render ----

sidebar.renderList();
sidebar.loadCompToUI();
canvas.redraw();
updateHint();
