(() => {
  "use strict";

  const STORAGE_KEY = "world.phoneticsMode";
  const MODES = new Set(["da", "ipa"]);
  const finalizedDaDisplay = toDaDisplay;

  const DA_TO_IPA = new Map([
    ["A", "æ"], ["Λ", "ə"], ["ƛ", "ʌ"], ["À", "aːr"], ["Æ", "eər"],
    ["B", "b"], ["D", "d"], ["Ð", "ð"], ["E", "ɛ"], ["Ξ", "iː"], ["C", "ɜːr"],
    ["F", "f"], ["G", "g"], ["H", "h"], ["I", "ɪ"], ["Φ", "aɪ"], ["Ȯ", "ɔɪ"],
    ["J", "dʒ"], ["Ҹ", "tʃ"], ["X", "ʃ"], ["Ʒ", "ʒ"], ["K", "k"], ["L", "l"],
    ["M", "m"], ["N", "n"], ["Ŋ", "ŋ"], ["O", "ɒ"], ["Ω", "əʊ"], ["Ō", "ɔː"],
    ["P", "p"], ["R", "r"], ["S", "s"], ["T", "t"], ["U", "uː"], ["ʊ", "ʊ"],
    ["V", "v"], ["W", "w"], ["Ꝏ", "aʊ"], ["Y", "j"], ["Z", "z"], ["Þ", "θ"],
    ["ā", "aː"], ["ī", "iː"], ["ū", "uː"], ["ē", "eː"], ["ō", "oː"],
    ["ṝ", "ṛː"], ["ḹ", "ḷː"],
  ]);

  function initialMode() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (MODES.has(saved)) return saved;
    } catch {}
    return "da";
  }

  let phoneticsMode = initialMode();

  function daToIpa(input = "") {
    let output = "";
    for (const char of Array.from(String(input || ""))) {
      output += DA_TO_IPA.get(char) ?? char;
    }
    return output;
  }

  async function toIpaDisplay(input = "", language = "") {
    const text = String(input || "");
    if (!text) return "";
    const parts = typeof splitSourceSuffix === "function"
      ? splitSourceSuffix(text)
      : { body: text, suffix: "" };
    const body = parts.body || text;
    const da = await finalizedDaDisplay(body, language);
    return `${daToIpa(da)}${parts.suffix || ""}`.trim();
  }

  window.toIpaDisplay = toIpaDisplay;
  window.toDaDisplayRaw = finalizedDaDisplay;

  function getMode() {
    return phoneticsMode;
  }

  function setMode(nextMode, { rerender = true } = {}) {
    const next = MODES.has(nextMode) ? nextMode : "da";
    if (phoneticsMode === next) {
      syncModeUi();
      return;
    }
    phoneticsMode = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    syncModeUi();
    if (rerender && typeof applyCountryFilter === "function") {
      applyCountryFilter().catch((error) => console.warn("Phonetics mode refresh failed:", error));
    }
  }

  window.setWorldPhoneticsMode = (mode) => setMode(mode);
  window.getWorldPhoneticsMode = getMode;

  const baseHydrateNewsItem = hydrateNewsItem;
  hydrateNewsItem = async function modeAwareHydrateNewsItem(row, originalText, language = "") {
    const phoneticsEl = row.querySelector(".news-da");
    const englishEl = row.querySelector(".news-en");
    if (!phoneticsEl || !englishEl) return baseHydrateNewsItem(row, originalText, language);

    const modeAtStart = phoneticsMode;
    const phoneticsPromise = modeAtStart === "ipa"
      ? toIpaDisplay(originalText, language)
      : finalizedDaDisplay(originalText, language);
    const [phoneticsText, englishText] = await Promise.all([
      phoneticsPromise,
      toEnglishDisplay(originalText, language),
    ]);

    // Ignore stale async work if the user changed mode while translation was resolving.
    if (modeAtStart !== phoneticsMode) return;

    setColorCodedSegments(phoneticsEl, phoneticsText || originalText, "translation", "syllable");
    setColorCodedSegments(englishEl, englishText || originalText, "translation", "word");
    phoneticsEl.dataset.phoneticsMode = modeAtStart;
    phoneticsEl.setAttribute("aria-label", `${modeAtStart.toUpperCase()} phonetics: ${phoneticsText || originalText}`);
    syncModeUi();
  };

  function syncModeUi() {
    const daButton = document.getElementById("phonetics-mode-da");
    const ipaButton = document.getElementById("phonetics-mode-ipa");
    if (daButton) daButton.setAttribute("aria-pressed", phoneticsMode === "da" ? "true" : "false");
    if (ipaButton) ipaButton.setAttribute("aria-pressed", phoneticsMode === "ipa" ? "true" : "false");

    const note = document.getElementById("phonetics-mode-note");
    if (note) note.textContent = phoneticsMode === "da"
      ? "DA alphabet · color-coded syllables"
      : "IPA symbols · same phonetic approximation";

    for (const header of document.querySelectorAll(".news-list-header")) {
      const label = header.children?.[1];
      if (label) label.textContent = `phonetics · ${phoneticsMode.toUpperCase()}`;
    }
  }

  function bindControls() {
    const daButton = document.getElementById("phonetics-mode-da");
    const ipaButton = document.getElementById("phonetics-mode-ipa");
    if (daButton && !daButton.dataset.bound) {
      daButton.dataset.bound = "1";
      daButton.addEventListener("click", () => setMode("da"));
    }
    if (ipaButton && !ipaButton.dataset.bound) {
      ipaButton.dataset.bound = "1";
      ipaButton.addEventListener("click", () => setMode("ipa"));
    }
  }

  const countryList = document.getElementById("country-list");
  if (countryList && typeof MutationObserver === "function") {
    const observer = new MutationObserver(() => syncModeUi());
    observer.observe(countryList, { childList: true, subtree: true });
  }

  bindControls();
  syncModeUi();

  // app.js starts country loading before this runtime arrives; rerender once so all
  // rows are guaranteed to use the selected mode and the patched hydrator.
  setTimeout(() => {
    if (typeof applyCountryFilter === "function") {
      applyCountryFilter().catch((error) => console.warn("Initial phonetics mode refresh failed:", error));
    }
  }, 0);

  window.__worldPhoneticsModeDiagnostics = () => ({
    patched: true,
    mode: phoneticsMode,
    hasIpaDisplay: typeof window.toIpaDisplay === "function",
    daButtonPressed: document.getElementById("phonetics-mode-da")?.getAttribute("aria-pressed") || null,
    ipaButtonPressed: document.getElementById("phonetics-mode-ipa")?.getAttribute("aria-pressed") || null,
    renderedMode: document.querySelector(".news-da")?.dataset.phoneticsMode || null,
  });
})();