(() => {
  "use strict";

  const MAX_TRANSLATIONS_IN_FLIGHT = 4;
  const TRANSLATION_TIMEOUT_MS = 9000;
  const NON_LATIN_LANGUAGES = new Set([
    "am", "ar", "be", "bg", "bn", "el", "fa", "gu", "he", "hi", "hy", "ja", "ka", "kk",
    "km", "ko", "ky", "lo", "mk", "mn", "my", "ne", "pa", "ps", "ru", "si", "sr", "srp",
    "ta", "tg", "th", "ti", "uk", "ur", "uz", "zh",
  ]);
  const SOURCE_LANGUAGE_ALIASES = {
    srp: "sr",
    zho: "zh-CN",
    "zh-hans": "zh-CN",
    "zh-hant": "zh-TW",
  };

  const CYRILLIC_MAP = {
    а: "a", б: "b", в: "v", г: "g", ґ: "g", д: "d", е: "e", ё: "jo", є: "je", ж: "ʒ",
    з: "z", и: "i", і: "i", ї: "ji", й: "j", к: "k", қ: "q", л: "l", љ: "lʲ", м: "m",
    н: "n", њ: "nʲ", ң: "ŋ", о: "o", ө: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
    ү: "ü", ф: "f", х: "x", ҳ: "x", ц: "ts", ч: "tʃ", ҷ: "tʃ", ш: "ʃ", щ: "ʃtʃ",
    ъ: "", ы: "ɨ", ь: "", э: "e", ю: "ju", я: "ja", ј: "j", ћ: "tʃ", ђ: "dʒ",
    џ: "dʒ", ѕ: "dz", ғ: "g",
  };

  const GREEK_MAP = {
    α: "a", β: "v", γ: "g", δ: "ð", ε: "e", ζ: "z", η: "i", θ: "θ", ι: "i", κ: "k",
    λ: "l", μ: "m", ν: "n", ξ: "ks", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t",
    υ: "i", φ: "f", χ: "x", ψ: "ps", ω: "o",
  };

  const ARABIC_MAP = {
    "ا": "a", "آ": "aː", "أ": "a", "إ": "i", "ب": "b", "پ": "p", "ت": "t", "ٹ": "ṭ",
    "ث": "θ", "ج": "dʒ", "چ": "tʃ", "ح": "h", "خ": "x", "د": "d", "ڈ": "ḍ", "ذ": "ð",
    "ر": "r", "ڑ": "ṛ", "ز": "z", "ژ": "ʒ", "س": "s", "ش": "ʃ", "ص": "s", "ض": "d",
    "ط": "t", "ظ": "z", "ع": "ʔ", "غ": "g", "ف": "f", "ق": "q", "ك": "k", "ک": "k",
    "گ": "g", "ل": "l", "م": "m", "ن": "n", "ں": "~n", "ه": "h", "ہ": "h", "ة": "a",
    "و": "w", "ؤ": "w", "ي": "j", "ی": "j", "ى": "a", "ئ": "j", "ء": "ʔ",
    "َ": "a", "ِ": "i", "ُ": "u", "ً": "an", "ٍ": "in", "ٌ": "un", "ْ": "", "ّ": "",
  };

  const DA_FINAL_REPLACEMENTS = [
    [/eər/g, "Æ"], [/ɔːr/g, "Ō"], [/ɜːr/g, "C"], [/aːr/g, "À"],
    [/aɪ/g, "Φ"], [/aʊ/g, "Ꝏ"], [/ɔɪ/g, "Ȯ"], [/əʊ/g, "Ω"], [/eɪ/g, "A"],
    [/iː/g, "Ξ"], [/uː/g, "U"], [/ɔː/g, "Ō"],
    [/tʃ/g, "Ҹ"], [/dʒ/g, "J"], [/ʃ/g, "X"], [/ʒ/g, "Ʒ"], [/ŋ/g, "Ŋ"],
    [/ð/g, "Ð"], [/θ/g, "Þ"], [/æ/g, "A"], [/ə/g, "Λ"], [/ʌ/g, "ƛ"], [/ɒ/g, "O"], [/ʊ/g, "ʊ"],
    [/ɛ/g, "E"], [/ɪ/g, "I"],
    [/b/g, "B"], [/d/g, "D"], [/f/g, "F"], [/g/g, "G"], [/h/g, "H"], [/k/g, "K"],
    [/l/g, "L"], [/m/g, "M"], [/n/g, "N"], [/p/g, "P"], [/r/g, "R"], [/s/g, "S"],
    [/t/g, "T"], [/v/g, "V"], [/w/g, "W"], [/z/g, "Z"], [/j/g, "Y"],
    [/a/g, "A"], [/e/g, "E"], [/i/g, "I"], [/o/g, "O"], [/u/g, "U"],
  ];

  let translationsInFlight = 0;
  const translationQueue = [];
  let translationSuccesses = 0;
  let translationFailures = 0;
  let phoneticConversions = 0;

  function mapChars(input, table) {
    let output = "";
    for (const char of String(input || "").toLowerCase()) output += table[char] ?? char;
    return output;
  }

  function finalizeDaAlphabet(input = "") {
    let output = String(input || "");
    for (const [pattern, replacement] of DA_FINAL_REPLACEMENTS) output = output.replace(pattern, replacement);
    return toDaPresentation(output);
  }

  function normalizeLanguage(language = "") {
    const raw = String(language || "").trim().toLowerCase().replace(/_/g, "-");
    if (!raw) return "auto";
    return SOURCE_LANGUAGE_ALIASES[raw] || raw;
  }

  function primaryLanguage(language = "") {
    return normalizeLanguage(language).split("-")[0];
  }

  function scriptOf(text = "") {
    const input = String(text || "");
    if (/\p{Script=Devanagari}/u.test(input)) return "devanagari";
    if (/\p{Script=Han}/u.test(input)) return "han";
    if (/\p{Script=Cyrillic}/u.test(input)) return "cyrillic";
    if (/\p{Script=Greek}/u.test(input)) return "greek";
    if (/\p{Script=Arabic}/u.test(input)) return "arabic";
    if (/\p{Script=Hebrew}/u.test(input)) return "hebrew";
    if (/\p{Script=Hangul}/u.test(input)) return "hangul";
    if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(input)) return "kana";
    if (/\p{Script=Latin}/u.test(input)) return "latin";
    return "other";
  }

  function normalizeLatinPhonemes(text = "", language = "") {
    let s = String(text || "").toLowerCase().normalize("NFC").replace(/[’']/g, "");
    const lang = primaryLanguage(language);

    // Protect ordinary Latin x before language rules introduce IPA /x/.
    s = s.replace(/x/g, "ks");

    const replaceAll = (pairs) => {
      for (const [pattern, replacement] of pairs) s = s.replace(pattern, replacement);
    };

    if (lang === "es") {
      replaceAll([[/ch/g, "tʃ"], [/ll/g, "j"], [/ñ/g, "nʲ"], [/gue/g, "ge"], [/gui/g, "gi"], [/qu/g, "k"], [/j/g, "x"], [/g(?=[ei])/g, "x"], [/c(?=[ei])/g, "s"], [/z/g, "s"], [/y/g, "j"], [/h/g, ""]]);
    } else if (lang === "pt") {
      replaceAll([[/nh/g, "nʲ"], [/lh/g, "lʲ"], [/ch/g, "ʃ"], [/j/g, "ʒ"], [/g(?=[ei])/g, "ʒ"], [/ç/g, "s"], [/qu/g, "k"], [/ão/g, "a~u"]]);
    } else if (lang === "fr") {
      replaceAll([[/eaux?/g, "o"], [/au/g, "o"], [/ou/g, "u"], [/oi/g, "wa"], [/ch/g, "ʃ"], [/gn/g, "nʲ"], [/j/g, "ʒ"], [/g(?=[ei])/g, "ʒ"], [/c(?=[ei])/g, "s"], [/ç/g, "s"], [/qu/g, "k"]]);
    } else if (lang === "de") {
      replaceAll([[/tsch/g, "tʃ"], [/sch/g, "ʃ"], [/ch/g, "x"], [/ei/g, "aɪ"], [/ie/g, "iː"], [/(eu|äu)/g, "ɔɪ"], [/z/g, "ts"], [/w/g, "v"], [/v/g, "f"], [/j/g, "j"], [/ß/g, "s"]]);
    } else if (lang === "it") {
      replaceAll([[/gli/g, "lʲi"], [/gn/g, "nʲ"], [/ch(?=[ei])/g, "k"], [/gh(?=[ei])/g, "g"], [/c(?=[ei])/g, "tʃ"], [/g(?=[ei])/g, "dʒ"], [/sc(?=[ei])/g, "ʃ"], [/z/g, "ts"]]);
    } else if (lang === "tr") {
      replaceAll([[/ç/g, "tʃ"], [/ş/g, "ʃ"], [/c/g, "dʒ"], [/j/g, "ʒ"], [/ğ/g, ""], [/y/g, "j"], [/ı/g, "ɨ"], [/ö/g, "o"], [/ü/g, "ü"]]);
    } else if (lang === "pl") {
      replaceAll([[/sz/g, "ʃ"], [/cz/g, "tʃ"], [/(rz|ż)/g, "ʒ"], [/ś/g, "ʃ"], [/ć/g, "tʃ"], [/ń/g, "nʲ"], [/ł/g, "w"], [/j/g, "j"], [/w/g, "v"], [/c/g, "ts"]]);
    } else if (["cs", "sk", "sl", "hr", "bs"].includes(lang)) {
      replaceAll([[/č/g, "tʃ"], [/š/g, "ʃ"], [/ž/g, "ʒ"], [/j/g, "j"]]);
    } else if (["id", "ms"].includes(lang)) {
      replaceAll([[/ng/g, "ŋ"], [/ny/g, "nʲ"], [/sy/g, "ʃ"], [/c/g, "tʃ"], [/j/g, "dʒ"], [/y/g, "j"]]);
    }

    s = s.normalize("NFD").replace(/\p{M}+/gu, "").normalize("NFC");
    s = s.replace(/q/g, "k").replace(/c/g, "k");
    return s;
  }

  function romanizeByScript(text = "", language = "") {
    const script = scriptOf(text);
    const lang = primaryLanguage(language);

    if (script === "devanagari") return transliterateDevanagari(text);
    if (script === "han" && lang === "zh") return null; // Chinese uses the async pinyin path.
    if (script === "cyrillic") return mapChars(text, CYRILLIC_MAP);
    if (script === "greek") return mapChars(text, GREEK_MAP);
    if (script === "arabic") return mapChars(text, ARABIC_MAP);
    if (script === "latin") return normalizeLatinPhonemes(text, language);
    return String(text || "");
  }

  function effectiveSourceLanguage(text = "", language = "") {
    if (isProbablyEnglishText(text)) return "en";
    const normalized = normalizeLanguage(language);
    const primary = normalized.split("-")[0];
    if (normalized === "auto") return "auto";
    if (scriptOf(text) === "latin" && NON_LATIN_LANGUAGES.has(primary)) return "auto";
    return normalized;
  }

  function withTranslationSlot(task) {
    return new Promise((resolve, reject) => {
      translationQueue.push({ task, resolve, reject });
      pumpTranslationQueue();
    });
  }

  function pumpTranslationQueue() {
    while (translationsInFlight < MAX_TRANSLATIONS_IN_FLIGHT && translationQueue.length) {
      const item = translationQueue.shift();
      translationsInFlight += 1;
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          translationsInFlight -= 1;
          pumpTranslationQueue();
        });
    }
  }

  async function requestEnglishTranslation(sourceText, sourceLanguage) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRANSLATION_TIMEOUT_MS);
    try {
      const url = new URL("https://translate.googleapis.com/translate_a/single");
      url.searchParams.set("client", "gtx");
      url.searchParams.set("sl", sourceLanguage || "auto");
      url.searchParams.set("tl", "en");
      url.searchParams.set("dt", "t");
      url.searchParams.set("q", sourceText);
      const response = await fetch(url.toString(), { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`translate request failed: ${response.status}`);
      const data = await response.json();
      const translated = Array.isArray(data?.[0])
        ? data[0].map((part) => (Array.isArray(part) ? String(part[0] || "") : "")).join("").trim()
        : "";
      if (!translated) throw new Error("empty translation response");
      return translated;
    } finally {
      clearTimeout(timer);
    }
  }

  async function upgradedEnglishDisplay(input = "", language = "") {
    const text = String(input || "").trim();
    if (!text) return "";
    if (isLikelyAlreadyEnglish(text, language) || isProbablyEnglishText(text)) return text;

    const cacheKey = `${language || "auto"}::${text}`;
    const cached = englishTranslationCache.get(cacheKey);
    if (cached && cached !== ENGLISH_TRANSLATION_UNAVAILABLE) return cached;
    if (cached === ENGLISH_TRANSLATION_UNAVAILABLE) englishTranslationCache.delete(cacheKey);

    const { body, suffix } = splitSourceSuffix(text);
    const sourceText = body || text;
    if (isProbablyEnglishText(sourceText)) {
      const alreadyEnglish = `${sourceText}${suffix}`.trim();
      englishTranslationCache.set(cacheKey, alreadyEnglish);
      return alreadyEnglish;
    }

    const sourceLanguage = effectiveSourceLanguage(sourceText, language);
    try {
      let translated;
      try {
        translated = await withTranslationSlot(() => requestEnglishTranslation(sourceText, sourceLanguage));
      } catch (firstError) {
        if (sourceLanguage === "auto") throw firstError;
        translated = await withTranslationSlot(() => requestEnglishTranslation(sourceText, "auto"));
      }
      const merged = `${translated}${suffix}`.trim();
      englishTranslationCache.set(cacheKey, merged);
      translationSuccesses += 1;
      return merged;
    } catch (error) {
      translationFailures += 1;
      console.warn("English translation unavailable for this headline:", error);
      // Do not cache failures: transient CORS/rate-limit/network failures should recover on rerender/reload.
      return ENGLISH_TRANSLATION_UNAVAILABLE;
    }
  }

  async function upgradedDaDisplay(input = "", language = "") {
    const text = String(input || "");
    if (!text) return "";
    const { body, suffix } = splitSourceSuffix(text);
    const sourceText = body || text;
    const lang = primaryLanguage(language);
    let phonemes;

    if (isProbablyEnglishText(sourceText) || lang === "en") {
      phonemes = normalizeEnglishForDa(sourceText);
    } else if (DEVANAGARI_RE.test(sourceText)) {
      phonemes = transliterateDevanagari(sourceText);
    } else if (HAN_RE.test(sourceText) && lang === "zh") {
      phonemes = await transliterateChinese(sourceText);
    } else {
      phonemes = romanizeByScript(sourceText, language);
    }

    phoneticConversions += 1;
    return `${finalizeDaAlphabet(phonemes)}${suffix}`.trim();
  }

  toEnglishDisplay = upgradedEnglishDisplay;
  toDaDisplay = upgradedDaDisplay;

  function refreshTranslationsWhenReady(attempt = 0) {
    if (typeof allCountries !== "undefined" && allCountries.length && typeof applyCountryFilter === "function") {
      applyCountryFilter().catch((error) => console.warn("Translation refresh failed:", error));
      return;
    }
    if (attempt < 40) setTimeout(() => refreshTranslationsWhenReady(attempt + 1), 250);
  }

  window.__worldTranslationDiagnostics = () => ({
    version: "2.0.0",
    queueDepth: translationQueue.length,
    inFlight: translationsInFlight,
    successes: translationSuccesses,
    failures: translationFailures,
    phoneticConversions,
  });

  refreshTranslationsWhenReady();
})();
