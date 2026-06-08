import { globeDrag, setGlobeRotY, setGlobeRotX, globeRotY, globeRotX, setGlobeZoom, globeZoom } from "./state.js";

export function setupGlobeInteraction(canvas, opts = {}) {
  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";

  const onStart = (clientX, clientY) => {
    globeDrag.active = true;
    globeDrag.startX = clientX;
    globeDrag.startY = clientY;
    globeDrag.startRotY = globeRotY;
    globeDrag.startRotX = globeRotX;
    canvas.style.cursor = "grabbing";
  };
  const onMove = (clientX, clientY) => {
    if (!globeDrag.active) return;
    const rect = canvas.getBoundingClientRect();
    const dragScale = Math.max(1, Math.min(rect.width, rect.height));
    const dx = clientX - globeDrag.startX;
    setGlobeRotY(globeDrag.startRotY - (dx / dragScale) * Math.PI * 1.4);
    setGlobeRotX(0);
  };
  const onEnd = () => {
    globeDrag.active = false;
    canvas.style.cursor = "grab";
  };
  const onMouseDown = (e) => onStart(e.clientX, e.clientY);
  const onMouseMove = (e) => onMove(e.clientX, e.clientY);
  const onWheel = (e) => {
    e.preventDefault();
    const z = globeZoom * Math.exp(-e.deltaY * 0.001);
    setGlobeZoom(Math.max(0.3, Math.min(4, z)));
  };
  const onTouchStart = (e) => {
    if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY);
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDist = Math.sqrt(dx * dx + dy * dy);
    }
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 1) {
      e.preventDefault();
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (pinchDist > 0) {
        const z = globeZoom * (dist / pinchDist);
        setGlobeZoom(Math.max(0.3, Math.min(4, z)));
      }
      pinchDist = dist;
    }
  };
  const onTouchEnd = (e) => {
    if (e.touches.length < 2) pinchDist = 0;
    if (e.touches.length === 0) onEnd();
  };

  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onEnd);

  canvas.addEventListener("wheel", onWheel, { passive: false });

  let pinchDist = 0;
  canvas.addEventListener("touchstart", onTouchStart, { passive: true });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: true });
  canvas.addEventListener("touchcancel", onTouchEnd, { passive: true });

  return () => {
    canvas.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onEnd);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("touchstart", onTouchStart);
    canvas.removeEventListener("touchmove", onTouchMove);
    canvas.removeEventListener("touchend", onTouchEnd);
    canvas.removeEventListener("touchcancel", onTouchEnd);
  };
}
