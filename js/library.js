/**
 * Library mode — cycle through real Mondrian compositions with morphing transitions.
 * Display cycle: hold → fade out title → morph → fade in title → hold → ...
 * Timeline shows all compositions chronologically; clicking jumps to that work.
 */

import { MorphEngine } from "./morph.js";
import { drawComposition, drawMorphState } from "./render.js";

const HOLD_DURATION = 5000;    // ms to display a composition
const MORPH_DURATION = 3000;   // ms for morphing transition
const FADE_DURATION = 800;     // ms for title fade in/out

export class LibraryMode {
  constructor(canvas, overlay, timelineEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.overlay = overlay;
    this.titleEl = overlay.querySelector("#title");
    this.subtitleEl = overlay.querySelector("#subtitle");
    this.linkEl = overlay.querySelector("#title-link");
    this.timelineEl = timelineEl;
    this.compositions = [];
    this.currentIndex = 0;
    this.morph = new MorphEngine();
    this.state = "hold"; // hold | fadeout | morphing | fadein
    this.stateStart = 0;
    this.running = false;
    this.dots = [];
  }

  load(compositions) {
    this.compositions = compositions;
    this.currentIndex = 0;
    this._buildTimeline();
  }

  start() {
    this.running = true;
    this.state = "hold";
    this.stateStart = performance.now();
    this._showTitle(this.compositions[this.currentIndex]);
    this._draw(this.compositions[this.currentIndex]);
    this._updateActiveDot();
    this.timelineEl.classList.remove("hidden");
  }

  stop() {
    this.running = false;
    this.overlay.style.opacity = "0";
    this.timelineEl.classList.add("hidden");
  }

  /** Jump to a specific composition by index, morphing from current. */
  jumpTo(index) {
    if (index === this.currentIndex || !this.running) return;

    const fromComp = this.compositions[this.currentIndex];
    const target = this.compositions[index];

    // Snap current drawing to fromComp before starting morph
    this._draw(fromComp);
    this.overlay.style.opacity = "0";
    this.state = "morphing";
    this.stateStart = performance.now();
    this._targetIndex = index;
    this.morph.start(fromComp, target, MORPH_DURATION);
  }

  tick(timestamp) {
    if (!this.running || this.compositions.length === 0) return;

    const elapsed = timestamp - this.stateStart;
    const current = this.compositions[this.currentIndex];

    switch (this.state) {
      case "hold":
        if (elapsed >= HOLD_DURATION) {
          this.state = "fadeout";
          this.stateStart = timestamp;
        }
        break;

      case "fadeout":
        this.overlay.style.opacity = String(1 - elapsed / FADE_DURATION);
        if (elapsed >= FADE_DURATION) {
          this.overlay.style.opacity = "0";
          this.state = "morphing";
          this.stateStart = timestamp;
          const nextIndex = (this.currentIndex + 1) % this.compositions.length;
          this._targetIndex = nextIndex;
          this.morph.start(current, this.compositions[nextIndex], MORPH_DURATION);
        }
        break;

      case "morphing": {
        const morphState = this.morph.tick(timestamp);
        if (morphState) {
          this._drawMorph(morphState);
        }
        if (!this.morph.active) {
          this.currentIndex = this._targetIndex;
          this.state = "fadein";
          this.stateStart = timestamp;
          this._draw(this.compositions[this.currentIndex]);
          this._showTitle(this.compositions[this.currentIndex]);
          this._updateActiveDot();
        }
        break;
      }

      case "fadein":
        this.overlay.style.opacity = String(Math.min(1, elapsed / FADE_DURATION));
        if (elapsed >= FADE_DURATION) {
          this.overlay.style.opacity = "1";
          this.state = "hold";
          this.stateStart = timestamp;
        }
        break;
    }
  }

  _buildTimeline() {
    const track = this.timelineEl.querySelector("#timeline-track");
    // Clear existing dots (keep the line)
    const line = track.querySelector("#timeline-line");
    track.innerHTML = "";
    track.appendChild(line);
    this.dots = [];

    if (this.compositions.length === 0) return;

    const years = this.compositions.map(c => c.year || 1920);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const span = maxYear - minYear || 1;

    // Add year labels at regular intervals
    const labelStep = span <= 10 ? 2 : 5;
    const firstLabel = Math.ceil(minYear / labelStep) * labelStep;
    for (let y = firstLabel; y <= maxYear; y += labelStep) {
      const pct = ((y - minYear) / span) * 100;
      const label = document.createElement("span");
      label.className = "timeline-year";
      label.textContent = y;
      label.style.left = pct + "%";
      track.appendChild(label);
    }

    // Add dots for each composition
    for (let i = 0; i < this.compositions.length; i++) {
      const comp = this.compositions[i];
      const year = comp.year || minYear;
      const pct = ((year - minYear) / span) * 100;

      const dot = document.createElement("button");
      dot.className = "timeline-dot";
      dot.style.left = pct + "%";

      const tooltip = document.createElement("span");
      tooltip.className = "timeline-tooltip";
      tooltip.textContent = comp.title + (comp.year ? ` (${comp.year})` : "");
      dot.appendChild(tooltip);

      dot.addEventListener("click", () => this.jumpTo(i));
      track.appendChild(dot);
      this.dots.push(dot);
    }
  }

  _updateActiveDot() {
    for (let i = 0; i < this.dots.length; i++) {
      this.dots[i].classList.toggle("active", i === this.currentIndex);
    }
  }

  _showTitle(comp) {
    this.titleEl.textContent = comp.title || "";
    this.subtitleEl.textContent = comp.year ? String(comp.year) : "";
    const query = `Mondrian "${comp.title}" ${comp.year || ""}`.trim();
    this.linkEl.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    this.linkEl.style.pointerEvents = "auto";
  }

  _draw(comp) {
    const { width, height, cssWidth, cssHeight } = this._canvasSize(comp.aspectRatio);
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = cssWidth + "px";
    this.canvas.style.height = cssHeight + "px";
    this.canvas.style.transform = "";
    this.canvas.style.border = comp.diamond ? "none" : "1px solid #D6D0C6";
    drawComposition(this.ctx, comp, width, height);
  }

  _drawMorph(state) {
    const { width, height, cssWidth, cssHeight } = this._canvasSize(state.aspectRatio);
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = cssWidth + "px";
    this.canvas.style.height = cssHeight + "px";
    this.canvas.style.transform = "";
    const dt = state.diamondT ?? (state.diamond ? 1 : 0);
    this.canvas.style.border = dt > 0.01 ? "none" : "1px solid #D6D0C6";
    drawMorphState(this.ctx, state, width, height);
  }

  _canvasSize(aspectRatio) {
    const maxW = window.innerWidth * 0.85;
    const maxH = window.innerHeight * 0.7;
    let width, height;
    if (aspectRatio >= 1) {
      width = Math.min(maxW, maxH * aspectRatio);
      height = width / aspectRatio;
    } else {
      height = Math.min(maxH, maxW / aspectRatio);
      width = height * aspectRatio;
    }
    const dpr = window.devicePixelRatio || 1;
    return {
      width: Math.round(width * dpr),
      height: Math.round(height * dpr),
      cssWidth: Math.round(width),
      cssHeight: Math.round(height),
    };
  }
}
