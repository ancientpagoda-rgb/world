import { globeDrag, setGlobeRotY, setGlobeRotX, globeRotY, globeRotX, setGlobeZoom, globeZoom } from "./state.js";

export function setupGlobeInteraction(canvas, opts = {}) {
  globeDrag.active = false;
  setGlobeRotY(0);
  setGlobeRotX(0);
  setGlobeZoom(1);
  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";

  const clampPitch = (value) => Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, value));
  const clampZoom = (value) => Math.max(0.5, Math.min(2.5, value));

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

  const onWheel = (event) => {
    event.preventDefault();
    setGlobeZoom(clampZoom(globeZoom * Math.exp(-event.deltaY * 0.0012)));
  };

  const onKeyDown = (event) => {
    const step = Math.PI / 18;
    let handled = true;
    if (event.key === "ArrowLeft") setGlobeRotY(globeRotY - step);
    else if (event.key === "ArrowRight") setGlobeRotY(globeRotY + step);
    else if (event.key === "ArrowUp") setGlobeRotX(clampPitch(globeRotX + step));
    else if (event.key === "ArrowDown") setGlobeRotX(clampPitch(globeRotX - step));
    else if (event.key === "+" || event.key === "=") setGlobeZoom(clampZoom(globeZoom * 1.12));
    else if (event.key === "-" || event.key === "_") setGlobeZoom(clampZoom(globeZoom / 1.12));
    else if (event.key === "Home") { setGlobeRotY(0); setGlobeRotX(0); setGlobeZoom(1); }
    else handled = false;
    if (handled) event.preventDefault();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("keydown", onKeyDown);

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("keydown", onKeyDown);
  };
}
