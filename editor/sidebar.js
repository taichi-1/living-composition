/**
 * Sidebar UI: composition list, metadata inputs, export/import.
 */

import { exportCompositions, importCompositions, deleteComposition, selectComp } from './state.js';

export function initSidebar(store, canvas) {
  const listEl = document.getElementById('comp-list');
  const titleInput = document.getElementById('meta-title');
  const yearInput = document.getElementById('meta-year');
  const aspectInput = document.getElementById('meta-aspect');
  const lwInput = document.getElementById('meta-linewidth');
  const lwVal = document.getElementById('linewidth-val');

  function renderList() {
    listEl.innerHTML = '';
    store.compositions.forEach((comp, i) => {
      const li = document.createElement('li');
      li.className = 'comp-item' + (i === store.activeIdx ? ' active' : '');
      li.innerHTML = `
        <span>${comp.title || 'Untitled'}</span>
        <span style="display:flex;align-items:center;gap:8px">
          <span class="year">${comp.year || ''}</span>
          <button class="delete-btn" data-idx="${i}" title="Delete">\u2715</button>
        </span>
      `;
      li.addEventListener('click', (e) => {
        if (e.target.closest('.delete-btn')) return;
        selectComp(store, i);
        loadCompToUI();
      });
      listEl.appendChild(li);
    });

    listEl.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteComposition(store, parseInt(btn.dataset.idx));
        loadCompToUI();
      });
    });
  }

  function loadCompToUI() {
    const comp = store._activeComp();
    titleInput.value = comp ? comp.title : '';
    yearInput.value = comp ? (comp.year || '') : '';
    aspectInput.value = comp ? comp.aspectRatio : '1.0';
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

  aspectInput.addEventListener('change', (e) => {
    const comp = store._activeComp();
    const val = parseFloat(e.target.value);
    if (comp && val > 0.3 && val < 3) {
      comp.aspectRatio = Math.round(val * 10000) / 10000;
      canvas.redraw();
      store._save();
    }
  });

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
