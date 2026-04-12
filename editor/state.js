/**
 * Editor state management with undo/redo and localStorage persistence.
 */

const STORAGE_KEY = 'lc_compositions';
const STORAGE_IDX_KEY = 'lc_activeIdx';
const MAX_UNDO = 50;

export function createStore(onChange) {
  const store = {
    compositions: [],
    activeIdx: -1,
    tool: 'vline',
    paintColor: '#D63B2F',
    _past: [],
    _future: [],
    _onChange: onChange,
  };

  // Load from localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      store.compositions = JSON.parse(stored);
      store.activeIdx = parseInt(localStorage.getItem(STORAGE_IDX_KEY) || '0');
      if (store.activeIdx >= store.compositions.length) {
        store.activeIdx = store.compositions.length > 0 ? 0 : -1;
      }
    }
  } catch (e) {
    console.warn('Failed to load from localStorage:', e);
  }

  return store;
}

export function activeComp(store) {
  const { compositions, activeIdx } = store;
  return activeIdx >= 0 && activeIdx < compositions.length ? compositions[activeIdx] : null;
}

/** Push current state to undo stack, clear redo. */
function pushUndo(store) {
  store._past.push(JSON.stringify(store.compositions));
  if (store._past.length > MAX_UNDO) store._past.shift();
  store._future = [];
}

/** Persist to localStorage. */
function persist(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store.compositions));
  localStorage.setItem(STORAGE_IDX_KEY, String(store.activeIdx));
}

/** Save state: push undo + persist + notify. */
export function save(store) {
  pushUndo(store);
  persist(store);
  store._onChange();
}

/** Undo last action. */
export function undo(store) {
  if (store._past.length === 0) return;
  store._future.push(JSON.stringify(store.compositions));
  store.compositions = JSON.parse(store._past.pop());
  if (store.activeIdx >= store.compositions.length) {
    store.activeIdx = store.compositions.length - 1;
  }
  persist(store);
  store._onChange();
}

/** Redo last undone action. */
export function redo(store) {
  if (store._future.length === 0) return;
  store._past.push(JSON.stringify(store.compositions));
  store.compositions = JSON.parse(store._future.pop());
  if (store.activeIdx >= store.compositions.length) {
    store.activeIdx = store.compositions.length - 1;
  }
  persist(store);
  store._onChange();
}

export function canUndo(store) { return store._past.length > 0; }
export function canRedo(store) { return store._future.length > 0; }

export function setTool(store, tool) {
  store.tool = tool;
  store._onChange();
}

export function setPaintColor(store, color) {
  store.paintColor = color;
}

export function selectComp(store, idx) {
  store.activeIdx = idx;
  persist(store);
  store._onChange();
}

export function newComposition(store, { width = 50, height = 50 } = {}) {
  const comp = {
    id: 'comp_' + Date.now(),
    title: '',
    year: null,
    width,
    height,
    aspectRatio: Math.round((width / height) * 10000) / 10000,
    lineWidth: 0.008,
    lines: { vertical: [], horizontal: [] },
    rectangles: [{ x: 0, y: 0, w: 1, h: 1, color: '#F2EDE3' }],
  };
  store.compositions.push(comp);
  store.activeIdx = store.compositions.length - 1;
  save(store);
}

export function deleteComposition(store, idx) {
  pushUndo(store);
  store.compositions.splice(idx, 1);
  if (store.activeIdx >= store.compositions.length) {
    store.activeIdx = store.compositions.length - 1;
  }
  persist(store);
  store._onChange();
}

export function importCompositions(store, data) {
  if (!Array.isArray(data)) return;
  pushUndo(store);
  store.compositions = data;
  store.activeIdx = data.length > 0 ? 0 : -1;
  persist(store);
  store._onChange();
}

export function exportCompositions(store) {
  const sorted = [...store.compositions].sort((a, b) => (a.year || 0) - (b.year || 0));
  sorted.forEach(c => {
    if (!c.id || c.id.startsWith('comp_')) {
      c.id = (c.title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '');
      if (c.year) c.id += '_' + c.year;
    }
  });
  return JSON.stringify(sorted, null, 2);
}
