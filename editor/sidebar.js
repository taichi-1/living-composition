/**
 * Sidebar UI: composition list, metadata inputs, export/import.
 */

import { exportCompositions, importCompositions, deleteComposition, selectComp } from './state.js';

export function initSidebar(store, canvas) {
  const listEl = document.getElementById('comp-list');
  const titleInput = document.getElementById('meta-title');
  const yearInput = document.getElementById('meta-year');
  const widthInput = document.getElementById('meta-width');
  const heightInput = document.getElementById('meta-height');
  const urlInput = document.getElementById('meta-url');
  const diamondInput = document.getElementById('meta-diamond');
  const lwInput = document.getElementById('meta-linewidth');
  const lwVal = document.getElementById('linewidth-val');

  function renderList() {
    listEl.innerHTML = '';
    store.compositions.forEach((comp, i) => {
      const li = document.createElement('li');
      li.className = 'comp-item' + (i === store.activeIdx ? ' active' : '');

      const titleSpan = document.createElement('span');
      titleSpan.textContent = comp.title || 'Untitled';

      const right = document.createElement('span');
      right.style.cssText = 'display:flex;align-items:center;gap:8px';
      const yearSpan = document.createElement('span');
      yearSpan.className = 'year';
      yearSpan.textContent = comp.year || '';
      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.title = 'Delete';
      delBtn.textContent = '\u2715';
      delBtn.addEventListener('click', () => {
        deleteComposition(store, i);
        loadCompToUI();
      });
      right.append(yearSpan, delBtn);

      li.append(titleSpan, right);
      li.addEventListener('click', (e) => {
        if (e.target.closest('.delete-btn')) return;
        selectComp(store, i);
        loadCompToUI();
      });
      listEl.appendChild(li);
    });
  }

  function loadCompToUI() {
    const comp = store._activeComp();
    titleInput.value = comp ? comp.title : '';
    yearInput.value = comp ? (comp.year || '') : '';
    widthInput.value = comp ? (comp.width || '') : '';
    heightInput.value = comp ? (comp.height || '') : '';
    urlInput.value = comp ? (comp.url || '') : '';
    diamondInput.checked = comp ? !!comp.diamond : false;
    lwInput.value = comp ? comp.lineWidth : 0.008;
    lwVal.textContent = lwInput.value;
  }

  // Metadata events
  titleInput.addEventListener('input', (e) => {
    const comp = store._activeComp();
    if (comp) { comp.title = e.target.value; renderList(); store._save(); }
  });

  yearInput.addEventListener('input', (e) => {
    const comp = store._activeComp();
    if (comp) { comp.year = parseInt(e.target.value) || null; renderList(); store._save(); }
  });

  urlInput.addEventListener('change', (e) => {
    const comp = store._activeComp();
    if (comp) { comp.url = e.target.value || null; store._save(); }
  });

  diamondInput.addEventListener('change', () => {
    const comp = store._activeComp();
    if (comp) {
      comp.diamond = diamondInput.checked;
      canvas.redraw();
      store._save();
    }
  });

  function updateDimensions() {
    const comp = store._activeComp();
    if (!comp) return;
    const w = parseFloat(widthInput.value);
    const h = parseFloat(heightInput.value);
    if (w > 0 && h > 0) {
      comp.width = w;
      comp.height = h;
      comp.aspectRatio = Math.round((w / h) * 10000) / 10000;
      canvas.redraw();
      store._save();
    }
  }
  widthInput.addEventListener('change', updateDimensions);
  heightInput.addEventListener('change', updateDimensions);

  lwInput.addEventListener('input', () => {
    lwVal.textContent = lwInput.value;
    const comp = store._activeComp();
    if (comp) {
      comp.lineWidth = parseFloat(lwInput.value);
      canvas.redraw();
      store._save();
    }
  });

  // Export
  document.getElementById('btn-export').addEventListener('click', () => {
    const json = exportCompositions(store);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'compositions.json';
    a.click();
  });

  // Import
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('file-import').click();
  });

  document.getElementById('file-import').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importCompositions(store, JSON.parse(reader.result));
        loadCompToUI();
      } catch (err) {
        alert('Invalid JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  return { renderList, loadCompToUI };
}
