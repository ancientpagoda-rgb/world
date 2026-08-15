(() => {
  "use strict";

  const baseToIpaDisplay = window.toIpaDisplay;
  if (typeof baseToIpaDisplay !== "function") return;

  const counters = { mixed: 0, chinese: 0, residual: 0, failures: 0 };
  const TONE_CONTOURS = { "1": "˥", "2": "˧˥", "3": "˨˩˦", "4": "˥˩", "5": "" };
  const SUPERSCRIPT_DIGITS = { "¹": "1", "²": "2", "³": "3", "⁴": "4" };
  const PINYIN_INITIALS = {
    zh:"ʈʂ", ch:"ʈʂʰ", sh:"ʂ", b:"p", p:"pʰ", m:"m", f:"f", d:"t", t:"tʰ", n:"n", l:"l",
    g:"k", k:"kʰ", h:"x", j:"tɕ", q:"tɕʰ", x:"ɕ", r:"ɻ", z:"ts", c:"tsʰ", s:"s",
  };
  const PINYIN_FINALS = {
    a:"a", o:"wo", e:"ɤ", ai:"aɪ", ei:"eɪ", ao:"ɑʊ", ou:"oʊ", an:"an", en:"ən", ang:"ɑŋ", eng:"əŋ", ong:"ʊŋ", er:"aɻ",
    i:"i", ia:"ja", ie:"jɛ", iao:"jɑʊ", iou:"joʊ", iu:"joʊ", ian:"jɛn", in:"in", iang:"jɑŋ", ing:"iŋ", iong:"jʊŋ",
    u:"u", ua:"wa", uo:"wo", uai:"waɪ", uei:"weɪ", ui:"weɪ", uan:"wan", uen:"wən", un:"wən", uang:"wɑŋ", ueng:"wəŋ",
    "ü":"y", "üe":"ɥe", "üan":"ɥɛn", "ün":"yn",
  };

  function primaryLanguage(language = "") {
    const raw = String(language || "").trim().toLowerCase().replace(/_/g, "-");
    const aliases = { srp:"sr", "zh-cn":"zh", "zh-tw":"zh", "zh-hans":"zh", "zh-hant":"zh" };
    return aliases[raw] || raw.split("-")[0] || "auto";
  }

  function scriptOfChar(ch) {
    if (/\p{Script=Devanagari}/u.test(ch)) return "devanagari";
    if (/\p{Script=Hangul}/u.test(ch)) return "hangul";
    if (/\p{Script=Cyrillic}/u.test(ch)) return "cyrillic";
    if (/\p{Script=Greek}/u.test(ch)) return "greek";
    if (/\p{Script=Arabic}/u.test(ch)) return "arabic";
    if (/\p{Script=Han}/u.test(ch)) return "han";
    if (/\p{Script=Hiragana}/u.test(ch)) return "hiragana";
    if (/\p{Script=Katakana}/u.test(ch)) return "katakana";
    if (/\p{Script=Latin}/u.test(ch)) return "latin";
    return "common";
  }

  function scriptRuns(text = "") {
    const runs = [];
    for (const ch of Array.from(String(text || ""))) {
      const script = scriptOfChar(ch);
      const previous = runs[runs.length - 1];
      if (previous && previous.script === script) previous.text += ch;
      else runs.push({ script, text: ch });
    }
    return runs;
  }

  function pinyinSyllableIpa(raw) {
    let syllable = String(raw || "").toLowerCase().replace(/v/g, "ü");
    const toneMatch = syllable.match(/([1-5])$/);
    const tone = toneMatch ? TONE_CONTOURS[toneMatch[1]] : "";
    syllable = syllable.replace(/[1-5]$/, "");
    const yRules = { yi:"i", ya:"ia", ye:"ie", yao:"iao", you:"iou", yan:"ian", yin:"in", yang:"iang", ying:"ing", yong:"iong", yu:"ü", yue:"üe", yuan:"üan", yun:"ün" };
    const wRules = { wu:"u", wa:"ua", wo:"uo", wai:"uai", wei:"uei", wan:"uan", wen:"uen", wang:"uang", weng:"ueng" };
    if (yRules[syllable]) syllable = yRules[syllable];
    else if (wRules[syllable]) syllable = wRules[syllable];

    let initial = "";
    for (const candidate of ["zh","ch","sh","b","p","m","f","d","t","n","l","g","k","h","j","q","x","r","z","c","s"]) {
      if (syllable.startsWith(candidate)) { initial = candidate; break; }
    }
    let final = initial ? syllable.slice(initial.length) : syllable;
    if (["j","q","x"].includes(initial) && final.startsWith("u")) final = `ü${final.slice(1)}`;
    if (final === "i" && ["zh","ch","sh","r"].includes(initial)) return `${PINYIN_INITIALS[initial]}ɻ̩${tone}`;
    if (final === "i" && ["z","c","s"].includes(initial)) return `${PINYIN_INITIALS[initial]}ɹ̩${tone}`;
    return `${PINYIN_INITIALS[initial] || ""}${PINYIN_FINALS[final] || final}${tone}`;
  }

  async function forceChineseIpa(text) {
    if (typeof loadPinyinPro !== "function") throw new Error("pinyin runtime unavailable");
    const mod = await loadPinyinPro();
    const pinyin = mod.pinyin || mod.default?.pinyin || mod.default;
    if (typeof pinyin !== "function") throw new Error("pinyin function unavailable");
    const result = pinyin(String(text || ""), { toneType: "num", type: "array", nonZh: "consecutive", v: true });
    const syllables = Array.isArray(result) ? result : String(result || "").trim().split(/\s+/);
    const ipa = syllables.filter(Boolean).map(pinyinSyllableIpa).join("");
    if (/\p{Script=Han}/u.test(ipa)) throw new Error("pinyin left Han characters in IPA output");
    counters.chinese += 1;
    return ipa;
  }

  function defaultLanguageForScript(script, language) {
    const lang = primaryLanguage(language);
    if (script === "devanagari") return ["hi","ne"].includes(lang) ? lang : "hi";
    if (script === "hangul") return "ko";
    if (script === "cyrillic") return ["ru","uk","bg","sr","mk"].includes(lang) ? lang : "ru";
    if (script === "greek") return "el";
    if (script === "arabic") return ["ar","fa","ur"].includes(lang) ? lang : "ar";
    if (script === "han") return lang;
    return lang;
  }

  async function transcribeRun(run, language, hasNonLatin) {
    if (run.script === "common") return run.text;
    const lang = primaryLanguage(language);
    if (run.script === "han" && lang === "zh") {
      try {
        return await forceChineseIpa(run.text);
      } catch (error) {
        counters.failures += 1;
        console.warn("IPA quality Chinese fallback:", error);
        return baseToIpaDisplay(run.text, "zh");
      }
    }
    if (run.script === "latin" && hasNonLatin) return baseToIpaDisplay(run.text, "en");
    return baseToIpaDisplay(run.text, defaultLanguageForScript(run.script, language));
  }

  function restoreOrdinaryDigits(text) {
    return String(text || "").replace(/[¹²³⁴]/g, (digit) => SUPERSCRIPT_DIGITS[digit] || digit);
  }

  async function qualityIpaDisplay(input = "", language = "") {
    const text = String(input || "");
    if (!text) return "";
    const runs = scriptRuns(text);
    const scripts = new Set(runs.filter((run) => run.script !== "common").map((run) => run.script));
    const hasNonLatin = [...scripts].some((script) => script !== "latin");
    const needsRunWise = scripts.size > 1 || (primaryLanguage(language) === "zh" && scripts.has("han"));
    if (!needsRunWise) return restoreOrdinaryDigits(await baseToIpaDisplay(text, language));

    counters.mixed += scripts.size > 1 ? 1 : 0;
    const rendered = [];
    for (const run of runs) rendered.push(await transcribeRun(run, language, hasNonLatin));
    const output = restoreOrdinaryDigits(rendered.join(""));
    if (/\p{Script=Han}|\p{Script=Devanagari}|\p{Script=Hangul}|\p{Script=Cyrillic}|\p{Script=Greek}|\p{Script=Arabic}/u.test(output)) counters.residual += 1;
    return output.trim();
  }

  window.toIpaDisplay = qualityIpaDisplay;

  setTimeout(() => {
    if (typeof applyCountryFilter === "function") {
      applyCountryFilter().catch((error) => console.warn("IPA quality refresh failed:", error));
    }
  }, 0);

  window.__worldIpaQualityDiagnostics = () => ({
    patched: true,
    ...counters,
    mode: document.querySelector(".news-da")?.dataset.phoneticsMode || null,
    residualNativeScriptRows: Array.from(document.querySelectorAll(".news-da")).filter((el) => /\p{Script=Han}|\p{Script=Devanagari}/u.test(el.textContent || "")).length,
  });
})();
