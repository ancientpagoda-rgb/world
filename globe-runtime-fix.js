(() => {
  if (window.__worldGlobePatchInstalled) return;
  window.__worldGlobePatchInstalled = true;

  const clampPitch = (value) => Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, value));
  const clampZoom = (value) => Math.max(0.5, Math.min(2.5, value));

  setupGlobeInteraction = function setupGlobeInteractionPatched(canvas) {
    globeDrag.active = false;
    globeRotY = Number.isFinite(globeRotY) ? globeRotY : 0;
    globeRotX = Number.isFinite(globeRotX) ? globeRotX : 0;
    globeZoom = Number.isFinite(globeZoom) ? globeZoom : 1;

    canvas.tabIndex = canvas.tabIndex >= 0 ? canvas.tabIndex : 0;
    canvas.setAttribute("role", "application");
    canvas.setAttribute(
      "aria-label",
      "Interactive Earth globe. Drag to rotate, use the mouse wheel or plus and minus keys to zoom, and arrow keys to rotate.",
    );

    const onPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      globeDrag.active = true;
      globeDrag.pointerId = event.pointerId;
      globeDrag.startX = event.clientX;
      globeDrag.startY = event.clientY;
      globeDrag.startRotY = globeRotY;
      globeDrag.startRotX = globeRotX;
      canvas.classList.add("is-dragging");
      canvas.focus({ preventScroll: true });
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is optional.
      }
    };

    const onPointerMove = (event) => {
      if (!globeDrag.active) return;
      if (globeDrag.pointerId != null && event.pointerId !== globeDrag.pointerId) return;
      const rect = canvas.getBoundingClientRect();
      const scale = Math.max(1, Math.min(rect.width, rect.height));
      const dx = event.clientX - globeDrag.startX;
      const dy = event.clientY - globeDrag.startY;
      globeRotY = globeDrag.startRotY + (dx / scale) * Math.PI * 2;
      globeRotX = clampPitch(globeDrag.startRotX - (dy / scale) * Math.PI);
    };

    const onPointerUp = (event) => {
      if (globeDrag.pointerId != null && event.pointerId !== globeDrag.pointerId) return;
      globeDrag.active = false;
      globeDrag.pointerId = null;
      canvas.classList.remove("is-dragging");
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already have been released.
      }
    };

    const onWheel = (event) => {
      event.preventDefault();
      globeZoom = clampZoom(globeZoom * Math.exp(-event.deltaY * 0.0012));
    };

    const onKeyDown = (event) => {
      const rotationStep = Math.PI / 18;
      let handled = true;
      if (event.key === "ArrowLeft") globeRotY -= rotationStep;
      else if (event.key === "ArrowRight") globeRotY += rotationStep;
      else if (event.key === "ArrowUp") globeRotX = clampPitch(globeRotX + rotationStep);
      else if (event.key === "ArrowDown") globeRotX = clampPitch(globeRotX - rotationStep);
      else if (event.key === "+" || event.key === "=") globeZoom = clampZoom(globeZoom * 1.12);
      else if (event.key === "-" || event.key === "_") globeZoom = clampZoom(globeZoom / 1.12);
      else if (event.key === "Home") {
        globeRotY = 0;
        globeRotX = 0;
        globeZoom = 1;
      } else handled = false;

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
  };

  function drawGraticule(ctx, rotY, rotX, radius, centerX, centerY) {
    ctx.save();
    ctx.strokeStyle = "rgba(139, 190, 224, 0.12)";
    ctx.lineWidth = Math.max(0.55, radius / 900);

    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath();
      let started = false;
      for (let lon = -180; lon <= 180; lon += 4) {
        const point = latLonProjection(lat, lon, rotY, rotX);
        if (point.z <= 0) {
          started = false;
          continue;
        }
        const x = centerX + point.x * radius;
        const y = centerY - point.y * radius;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    for (let lon = -150; lon <= 180; lon += 30) {
      ctx.beginPath();
      let started = false;
      for (let lat = -88; lat <= 88; lat += 3) {
        const point = latLonProjection(lat, lon, rotY, rotX);
        if (point.z <= 0) {
          started = false;
          continue;
        }
        const x = centerX + point.x * radius;
        const y = centerY - point.y * radius;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCachedWeather(ctx, canvas, rotY, rotX, radius, centerX, centerY, timeMs) {
    if (!weatherOrbState.weatherGrid?.size && !_tempRasterData && !_precipRasterData) return;

    const overlay = getWeatherOverlayOffscreen(canvas.width, canvas.height);
    const qRotY = quantizeRotation(rotY);
    const qRotX = quantizeRotation(rotX);
    const minInterval = 1000 / WEATHER_OVERLAY_FPS;
    const needsRefresh =
      weatherOverlayCache.w !== canvas.width ||
      weatherOverlayCache.h !== canvas.height ||
      weatherOverlayCache.qRotY !== qRotY ||
      weatherOverlayCache.qRotX !== qRotX ||
      Math.abs(weatherOverlayCache.radius - radius) > 0.5 ||
      timeMs - weatherOverlayCache.lastDrawMs >= minInterval;

    if (needsRefresh) {
      const overlayCtx = overlay.getContext("2d");
      if (overlayCtx) {
        overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
        overlayCtx.save();
        overlayCtx.beginPath();
        overlayCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        overlayCtx.clip();
        drawWeatherLayers(overlayCtx, qRotY, qRotX, radius, centerX, centerY, timeMs);
        drawWindParticles(overlayCtx, qRotY, qRotX, radius, centerX, centerY, timeMs);
        overlayCtx.restore();
      }

      weatherOverlayCache.w = canvas.width;
      weatherOverlayCache.h = canvas.height;
      weatherOverlayCache.qRotY = qRotY;
      weatherOverlayCache.qRotX = qRotX;
      weatherOverlayCache.radius = radius;
      weatherOverlayCache.lastDrawMs = timeMs;
    }

    ctx.drawImage(overlay, 0, 0);
  }

  drawWeatherOrbFrame = function drawWeatherOrbFramePatched(ctx, canvas, timeMs) {
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.43 * globeZoom;
    const rotY = globeRotY;
    const rotX = globeRotX;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();

    renderEarthTexture(ctx, centerX, centerY, radius, rotY, rotX);
    drawGraticule(ctx, rotY, rotX, radius, centerX, centerY);
    drawCachedWeather(ctx, canvas, rotY, rotX, radius, centerX, centerY, timeMs);
    drawWorldGeometry(ctx, rotY, rotX, radius, centerX, centerY);

    const shade = ctx.createRadialGradient(
      centerX - radius * 0.36,
      centerY - radius * 0.42,
      radius * 0.08,
      centerX,
      centerY,
      radius,
    );
    shade.addColorStop(0, "rgba(255,255,255,0.05)");
    shade.addColorStop(0.66, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.26)");
    ctx.fillStyle = shade;
    ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(145, 205, 255, 0.28)";
    ctx.lineWidth = Math.max(1, radius / 430);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    debugState.earthRenderMode = weatherOrbState.features?.length
      ? "interactive-geometry"
      : "interactive-fallback";

    if (drawWeatherOrbFramePatched._debug == null) {
      try {
        drawWeatherOrbFramePatched._debug = new URLSearchParams(location.search).get("debug") === "1";
      } catch {
        drawWeatherOrbFramePatched._debug = false;
      }
    }
    if (drawWeatherOrbFramePatched._debug) drawDebugHud(ctx, canvas);
  };

  const baseInitializeWeatherOrb = initializeWeatherOrb;
  initializeWeatherOrb = function initializeWeatherOrbPatched() {
    void loadNoaaWeatherGrid().catch((error) => {
      console.warn("NOAA weather grid unavailable; globe will continue without the live overlay.", error);
    });
    try {
      loadWeatherRasters();
    } catch (error) {
      console.warn("Weather rasters unavailable; point weather can still render.", error);
    }
    return baseInitializeWeatherOrb();
  };

  window.__worldGlobeDiagnostics = () => ({
    patched: true,
    rotationY: globeRotY,
    rotationX: globeRotX,
    zoom: globeZoom,
    countryGeometryCount: weatherOrbState.features?.length || 0,
    weatherPointCount: weatherOrbState.weatherGrid?.size || 0,
    renderMode: debugState.earthRenderMode,
  });
})();
