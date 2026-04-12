/**
 * Editor entry point: wires up state, canvas, sidebar, keyboard shortcuts.
 */

import './style.css';
import { createStore, activeComp, save, undo, redo, canUndo, canRedo, setTool, setPaintColor, newComposition } from './state.js';
import { initCanvas } from './canvas.js';
import { initSidebar } from './sidebar.js';

// ---- Create store with onChange callback (set after canvas/sidebar init) ----

const undoBtn = document.getElementById('btn-undo');
const redoBtn = document.getElementById('btn-redo');

function updateUndoRedo() {
  undoBtn.disabled = !canUndo(store);
  redoBtn.disabled = !canRedo(store);
}

const store = createStore(() => {
  sidebar.renderList();
  canvas.redraw();
  updateUndoRedo();
});

// Convenience methods used by canvas/sidebar modules
store._activeComp = () => activeComp(store);
store._save = () => save(store);
store._onLineSelect = (hit) => updateLineProps(hit);

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

// ---- Line properties panel ----

const linePropsEl = document.getElementById('line-props');
const linePropsEmptyEl = document.getElementById('line-props-empty');
const lineWidthInput = document.getElementById('line-width');
const lineWidthVal = document.getElementById('line-width-val');
let currentLineHit = null;

function updateLineProps(hit) {
  currentLineHit = hit;
  if (hit) {
    linePropsEl.style.display = '';
    linePropsEmptyEl.style.display = 'none';
    const line = hit.line;
    lineWidthInput.value = line.lineWidth || activeComp(store)?.lineWidth || 0.008;
    lineWidthVal.textContent = lineWidthInput.value;
    // Update active state in line palette
    const lineColor = line.color || '#1A1A1A';
    document.querySelectorAll('#line-palette .palette-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.color === lineColor);
    });
  } else {
    linePropsEl.style.display = 'none';
    linePropsEmptyEl.style.display = '';
    currentLineHit = null;
  }
}

document.getElementById('line-palette').addEventListener('click', (e) => {
  const btn = e.target.closest('.palette-btn');
  if (!btn || !currentLineHit) return;
  currentLineHit.line.color = btn.dataset.color;
  document.querySelectorAll('#line-palette .palette-btn').forEach(b => b.classList.toggle('active', b === btn));
  canvas.redraw();
  store._save();
});

lineWidthInput.addEventListener('input', () => {
  lineWidthVal.textContent = lineWidthInput.value;
  if (!currentLineHit) return;
  currentLineHit.line.lineWidth = parseFloat(lineWidthInput.value);
  canvas.redraw();
  store._save();
});

// ---- Color palette ----

document.getElementById('palette').addEventListener('click', (e) => {
  const btn = e.target.closest('.palette-btn');
  if (!btn) return;
  setPaintColor(store, btn.dataset.color);
  document.querySelectorAll('.palette-btn').forEach(b => b.classList.toggle('active', b === btn));
});

// ---- Undo / Redo buttons ----

undoBtn.addEventListener('click', () => {
  undo(store);
  sidebar.loadCompToUI();
});

redoBtn.addEventListener('click', () => {
  redo(store);
  sidebar.loadCompToUI();
});

// ---- New composition ----

document.getElementById('btn-new').addEventListener('click', () => {
  const width = parseFloat(document.getElementById('meta-width').value) || 50;
  const height = parseFloat(document.getElementById('meta-height').value) || 50;
  newComposition(store, { width, height });
  sidebar.loadCompToUI();
});

// ---- Keyboard shortcuts ----

const HINTS = {
  vline: 'Click to add vertical line | Q',
  hline: 'Click to add horizontal line | W',
  paint: 'Click a cell to paint | E',
  move: 'Drag line to move, drag endpoints to trim | R',
  delete: 'Click a line to delete it | D',
};

function updateHint() {
  document.getElementById('hint').textContent = HINTS[store.tool] || '';
}

function activateTool(t) {
  setTool(store, t);
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  canvas.resetHover();
  canvas.deselectLine();
  updateHint();
  canvas.redraw();
}

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;

  switch (e.key) {
    case 'q': activateTool('vline'); break;
    case 'w': activateTool('hline'); break;
    case 'e': activateTool('paint'); break;
    case 'r': activateTool('move'); break;
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
updateLineProps(null);
