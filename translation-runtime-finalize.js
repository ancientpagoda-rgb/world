(() => {
  "use strict";

  const upgradedBaseDaDisplay = toDaDisplay;
  const FINAL_DA = [
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

  function finalizeEnglishDa(input = "") {
    let output = toDaCore(input);
    for (const [pattern, replacement] of FINAL_DA) output = output.replace(pattern, replacement);
    return toDaPresentation(output);
  }

  toDaDisplay = async function finalizedDaDisplay(input = "", language = "") {
    const text = String(input || "");
    if (!text) return "";
    const { body, suffix } = splitSourceSuffix(text);
    const sourceText = body || text;
    const lang = String(language || "").toLowerCase().split(/[-_]/)[0];
    if (lang === "en" || isProbablyEnglishText(sourceText)) {
      return `${finalizeEnglishDa(normalizeEnglishForDa(sourceText))}${suffix}`.trim();
    }
    return upgradedBaseDaDisplay(input, language);
  };

  window.__worldTranslationFinalizer = "1.0.0";
})();
