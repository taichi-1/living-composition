/**
 * Entry point — mode switching, data loading, animation loop.
 */

import { drawComposition, drawMorphState } from "./render.js";
import { MorphEngine } from "./morph.js";
import { buildDistributions, generateComposition } from "./generate.js";
import { LibraryMode } from "./library.js";

// --- DOM ---
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const titleEl = document.getElementById("title");
const subtitleEl = document.getElementById("subtitle");
const titleLink = document.getElementById("title-link");
const timeline = document.getElementById("timeline");
const controls = document.getElementById("controls");

// --- State ---
let compositions = [];
let distributions = null;
let mode = "generate"; // "generate" | "library"
let library = null;

// Generate mode state
const genMorph = new MorphEngine();
let genCurrent = null;
let genState = "hold"; // hold | morphing
let genStateStart = 0;
const GEN_HOLD = 5000;
const GEN_MORPH = 3000;
let genCounter = 0;

// --- Data loading ---

async function loadData() {
  const resp = await fetch("data/compositions.json");
  compositions = await resp.json();
  distributions = buildDistributions(compositions);
}

// --- Canvas sizing ---

function updateCanvasSize(aspectRatio) {
  const maxW = window.innerWidth * 0.85;
  const maxH = window.innerHeight * 0.75;
  let w, h;
  if (aspectRatio >= 1) {
    w = Math.min(maxW, maxH * aspectRatio);
    h = w / aspectRatio;
  } else {
    h = Math.min(maxH, maxW / aspectRatio);
    w = h * aspectRatio;
  }
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = Math.round(w) + "px";
  canvas.style.height = Math.round(h) + "px";
}

// --- Generate mode ---

function genStart() {
  genCurrent = generateComposition(distributions, `gen_${++genCounter}`);
  updateCanvasSize(genCurrent.aspectRatio);
  drawComposition(ctx, genCurrent, canvas.width, canvas.height);
  genState = "hold";
  genStateStart = performance.now();
  titleEl.textContent = `Generated Composition #${genCounter}`;
  subtitleEl.textContent = "";
  titleLink.removeAttribute("href");
  titleLink.style.pointerEvents = "none";
  overlay.style.opacity = "1";
}

function genTick(timestamp) {
  const elapsed = timestamp - genStateStart;

  switch (genState) {
    case "hold":
      if (elapsed >= GEN_HOLD) {
        // Start morphing to next
        const next = generateComposition(distributions, `gen_${++genCounter}`);
        genMorph.start(genCurrent, next, GEN_MORPH);
        genState = "morphing";
        genStateStart = timestamp;
        overlay.style.opacity = "0";
      }
      break;

    case "morphing": {
      const state = genMorph.tick(timestamp);
      if (state) {
        updateCanvasSize(state.aspectRatio);
        drawMorphState(ctx, state, canvas.width, canvas.height);
      }
      if (!genMorph.active) {
        genCurrent = generateComposition(distributions);
        // The morph just finished — show the target
        genCurrent = genMorph.compB;
        updateCanvasSize(genCurrent.aspectRatio);
        drawComposition(ctx, genCurrent, canvas.width, canvas.height);
        genState = "hold";
        genStateStart = timestamp;
        titleEl.textContent = `Generated Composition #${genCounter}`;
        subtitleEl.textContent = "";
        titleLink.removeAttribute("href");
        titleLink.style.pointerEvents = "none";
        overlay.style.opacity = "1";
      }
      break;
    }
  }
}

// --- Library mode ---

function libStart() {
  if (!library) {
    library = new LibraryMode(canvas, overlay, timeline);
    library.load(compositions);
  }
  library.start();
}

function libTick(timestamp) {
  library.tick(timestamp);
}

// --- Mode switching ---

function setMode(newMode) {
  if (mode === newMode) return;
  if (mode === "library" && library) library.stop();
  mode = newMode;

  // Update button state
  for (const btn of controls.querySelectorAll("button")) {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  }

  if (mode === "generate") {
    timeline.classList.add("hidden");
    genStart();
  } else {
    libStart();
  }
}

// --- Animation loop ---

function tick(timestamp) {
  if (mode === "generate") {
    genTick(timestamp);
  } else {
    libTick(timestamp);
  }
  requestAnimationFrame(tick);
}

// --- Init ---

async function init() {
  await loadData();

  // Mode button listeners
  for (const btn of controls.querySelectorAll("button")) {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  }

  // Start in generate mode
  genStart();
  requestAnimationFrame(tick);
}

init();
