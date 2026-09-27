import { globeDrag, setGlobeRotY, setGlobeRotX, globeRotY, globeRotX } from "./state.js";

export function setupGlobeInteraction(canvas, opts = {}) {
  globeDrag.active = false;
  setGlobeRotY(0);
  setGlobeRotX(0);
  canvas.style.touchAction = "pan-y";
  canvas.style.cursor = "grab";

  const clampPitch = (value) => Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, value));

  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    globeDrag.active = true;
    globeDrag.pointerId = event.pointerId;
    globeDrag.startX = event.clientX;
    globeDrag.startY = event.clientY;
    globeDrag.startRotY = globeRotY;
    globeDrag.startRotX = globeRotX;
    canvas.style.cursor = "grabbing";
    canvas.focus({ preventScroll: true });
    try { canvas.setPointerCapture(event.pointerId); } catch {}
  };

  const onPointerMove = (event) => {
    if (!globeDrag.active || (globeDrag.pointerId != null && event.pointerId !== globeDrag.pointerId)) return;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.max(1, Math.min(rect.width, rect.height));
    setGlobeRotY(globeDrag.startRotY + ((event.clientX - globeDrag.startX) / scale) * Math.PI * 2);
    setGlobeRotX(clampPitch(globeDrag.startRotX - ((event.clientY - globeDrag.startY) / scale) * Math.PI));
  };

  const onPointerUp = (event) => {
    if (globeDrag.pointerId != null && event.pointerId !== globeDrag.pointerId) return;
    globeDrag.active = false;
    globeDrag.pointerId = null;
    canvas.style.cursor = "grab";
    try { canvas.releasePointerCapture(event.pointerId); } catch {}
  };

  const onKeyDown = (event) => {
    const step = Math.PI / 18;
    let handled = true;
    if (event.key === "ArrowLeft") setGlobeRotY(globeRotY - step);
    else if (event.key === "ArrowRight") setGlobeRotY(globeRotY + step);
    else if (event.key === "ArrowUp") setGlobeRotX(clampPitch(globeRotX + step));
    else if (event.key === "ArrowDown") setGlobeRotX(clampPitch(globeRotX - step));
    else if (event.key === "Home") { setGlobeRotY(0); setGlobeRotX(0); }
    else handled = false;
    if (handled) event.preventDefault();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("keydown", onKeyDown);

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("keydown", onKeyDown);
  };
}
