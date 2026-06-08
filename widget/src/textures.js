import { EARTH_TEXTURE_URL, setEarthTexture } from "./state.js";

export function loadEarthTexture() {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = EARTH_TEXTURE_URL;
  img.onload = () => setEarthTexture(img);
  img.onerror = () => setEarthTexture(null);
}
