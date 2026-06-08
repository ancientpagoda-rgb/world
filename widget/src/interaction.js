import { globeDrag, setGlobeRotY, setGlobeRotX, globeRotY, globeRotX, setGlobeZoom, globeZoom } from "./state.js";

export function setupGlobeInteraction(canvas, opts = {}) {
  globeDrag.active = false;
  setGlobeRotY(0);
  setGlobeRotX(0);
  setGlobeZoom(1);
  canvas.style.touchAction = "none";
  canvas.style.cursor = "default";

  return () => {};
}
