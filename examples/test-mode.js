// Visual-test support shared by the example pages. `?test` freezes time and randomness (see each page),
// and only draws a frame when something changed, because CI has no GPU and software WebGL is slow.
export const testMode = new URLSearchParams(location.search).has("test");

// Rendering waits for this much quiet time after the last change so bursts of edits draw one frame.
const SETTLE_MS = 100;
let dirty = true;
let lastChange = 0;

/** Marks the scene as changed so the next quiet frame is rendered (test mode only). */
export function invalidate() {
  dirty = true;
  lastChange = performance.now();
}

if (testMode) {
  // Editors, tabs and pointer interaction all change what is on screen.
  for (const type of ["ph-change", "ph-head-editing", "change", "input", "click", "pointerdown", "pointermove", "pointerup", "wheel", "keydown"]) {
    document.addEventListener(type, invalidate, { capture: true });
  }
  // Tests wait on this before taking a screenshot.
  window.__phSettled = () => !dirty;
}

/** Call once per animation frame; false means skip updating and rendering this frame. */
export function frameDue() {
  if (!testMode) return true;
  if (!dirty || performance.now() - lastChange < SETTLE_MS) return false;
  dirty = false;
  return true;
}
