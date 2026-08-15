(() => {
  "use strict";

  const fallbackIpaDisplay = window.toIpaDisplay;
  const WORD_COLORS = [
    "255 107 107", "254 202 87", "72 219 251", "29 209 161",
    "84 160 255", "178 126 255", "200 214 229",
  ];
  const counters = { direct: 0, fallback: 0, failures: 0 };
  const LANGUAGE_ALIASES = { srp: "sr", "zh-cn": "zh", "zh-tw": "zh", "zh-hans": "zh", "zh-hant": "zh" };

  function primaryLanguage(language = "") {
    const raw = String(language || "").trim().toLowerCase().replace(/_/g, "-");
    return LANGUAGE_ALIASES[raw] || raw.split("-")[0] || "auto";
  }

  function scriptOf(text = "") {
    const input = String(text || "");
    if (/\p{Script=Devanagari}/u.test(input)) return "devanagari";
    if (/\p{Script=Hangul}/u.test(input)) return "hangul";
    if (/\p{Script=Cyrillic}/u.test(input)) return "cyrillic";
    if (/\p{Script=Greek}/u.test(input)) return "greek";
    if (/\p{Script=Arabic}/u.test(input)) return "arabic";
    if (/\p{Script=Han}/u.test(input)) return "han";
    if (/\p{Script=Latin}/u.test(input)) return "latin";
    return "other";
  }

  function rules(input, replacements) {
    let output = String(input || "").toLowerCase().normalize("NFC");
    for (const [pattern, replacement] of replacements) output = output.replace(pattern, replacement);
    return output;
  }

  function words(input, transform) {
    return String(input || "").replace(/[\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*/gu, (word) => transform(word));
  }

  function stripMarks(input) {
    return String(input || "").normalize("NFD").replace(/\p{M}+/gu, "").normalize("NFC");
  }

  function latinIpa(text, lang) {
    return words(text, (sourceWord) => {
      let w = sourceWord.toLowerCase().normalize("NFC");
      if (lang === "es") {
        return rules(w, [
          [/rr/g, "R"], [/ch/g, "tʃ"], [/ll/g, "ʝ"], [/ñ/g, "ɲ"], [/gü(?=[ei])/g, "gw"],
          [/gu(?=[ei])/g, "g"], [/qu(?=[ei])/g, "k"], [/g(?=[ei])/g, "x"], [/j/g, "x"],
          [/c(?=[ei])/g, "s"], [/z/g, "s"], [/y/g, "ʝ"], [/h/g, ""], [/v/g, "b"],
          [/r/g, "ɾ"], [/R/g, "r"], [/q/g, "k"], [/c/g, "k"],
        ]);
      }
      if (lang === "pt") {
        w = rules(w, [
          [/nh/g, "ɲ"], [/lh/g, "ʎ"], [/ch/g, "ʃ"], [/rr/g, "ʁ"], [/j/g, "ʒ"],
          [/g(?=[eiéê])/g, "ʒ"], [/ç/g, "s"], [/qu(?=[ei])/g, "k"], [/gu(?=[ei])/g, "g"],
          [/ão/g, "ɐ̃w̃"], [/õe/g, "õj̃"], [/ãe/g, "ɐ̃j̃"], [/x/g, "ʃ"], [/c(?=[ei])/g, "s"],
          [/c/g, "k"], [/h/g, ""], [/y/g, "i"],
        ]);
        return w;
      }
      if (lang === "fr") {
        return rules(w, [
          [/eaux?/g, "o"], [/aux?$/g, "o"], [/ou/g, "u"], [/oi/g, "wa"], [/oin/g, "wɛ̃"],
          [/ain|ein/g, "ɛ̃"], [/in$|im$/g, "ɛ̃"], [/on$|om$/g, "ɔ̃"], [/an$|en$/g, "ɑ̃"],
          [/un$/g, "œ̃"], [/gn/g, "ɲ"], [/ill/g, "j"], [/ch/g, "ʃ"], [/ph/g, "f"],
          [/j/g, "ʒ"], [/g(?=[eiéèêëy])/g, "ʒ"], [/c(?=[eiéèêëy])/g, "s"], [/ç/g, "s"],
          [/qu/g, "k"], [/th/g, "t"], [/r/g, "ʁ"], [/u/g, "y"], [/eu|œu/g, "ø"],
          [/é|er$|ez$/g, "e"], [/è|ê|ai|ais|ait/g, "ɛ"], [/[tdspxz]$/g, ""], [/e$/g, ""],
          [/h/g, ""], [/c/g, "k"],
        ]);
      }
      if (lang === "de") {
        return rules(w, [
          [/tsch/g, "tʃ"], [/sch/g, "ʃ"], [/ch/g, "x"], [/ng/g, "ŋ"], [/ei|ai/g, "aɪ"],
          [/ie/g, "iː"], [/(eu|äu)/g, "ɔɪ"], [/z/g, "ts"], [/w/g, "v"], [/v/g, "f"],
          [/j/g, "j"], [/ß/g, "s"], [/ä/g, "ɛ"], [/ö/g, "ø"], [/ü/g, "y"], [/c/g, "k"],
        ]);
      }
      if (lang === "it") {
        return rules(w, [
          [/gli(?=[aeiou])/g, "ʎ"], [/gn/g, "ɲ"], [/sc(?=[ei])/g, "ʃ"], [/ch(?=[ei])/g, "k"],
          [/gh(?=[ei])/g, "g"], [/c(?=[ei])/g, "tʃ"], [/g(?=[ei])/g, "dʒ"], [/zz/g, "tts"],
          [/z/g, "ts"], [/qu/g, "kw"], [/h/g, ""],
        ]);
      }
      if (lang === "tr") {
        return rules(w, [
          [/ç/g, "tʃ"], [/ş/g, "ʃ"], [/c/g, "dʒ"], [/j/g, "ʒ"], [/ğ/g, "ː"], [/y/g, "j"],
          [/ı/g, "ɯ"], [/ö/g, "ø"], [/ü/g, "y"],
        ]);
      }
      if (lang === "pl") {
        return rules(w, [
          [/szcz/g, "ʂtʂ"], [/dź|dzi/g, "dʑ"], [/dż/g, "dʐ"], [/sz/g, "ʂ"], [/cz/g, "tʂ"],
          [/rz|ż/g, "ʐ"], [/ś/g, "ɕ"], [/ć/g, "tɕ"], [/ź/g, "ʑ"], [/ń/g, "ɲ"], [/ł/g, "w"],
          [/w/g, "v"], [/j/g, "j"], [/c/g, "ts"], [/ą/g, "ɔ̃"], [/ę/g, "ɛ̃"], [/y/g, "ɨ"],
        ]);
      }
      if (["cs", "sk"].includes(lang)) {
        return rules(w, [
          [/ch/g, "x"], [/č/g, "tʃ"], [/š/g, "ʃ"], [/ž/g, "ʒ"], [/ň/g, "ɲ"], [/ť/g, "c"],
          [/ď/g, "ɟ"], [/ř/g, "r̝"], [/j/g, "j"], [/c/g, "ts"], [/y/g, "ɪ"],
        ]);
      }
      if (["sl", "hr", "bs", "sr"].includes(lang)) {
        return rules(w, [
          [/dž/g, "dʒ"], [/lj/g, "ʎ"], [/nj/g, "ɲ"], [/č/g, "tʃ"], [/ć/g, "tɕ"],
          [/đ/g, "dʑ"], [/š/g, "ʃ"], [/ž/g, "ʒ"], [/j/g, "j"], [/c/g, "ts"],
        ]);
      }
      if (["id", "ms"].includes(lang)) {
        return rules(w, [
          [/ng/g, "ŋ"], [/ny/g, "ɲ"], [/sy/g, "ʃ"], [/kh/g, "x"], [/c/g, "tʃ"],
          [/j/g, "dʒ"], [/y/g, "j"], [/q/g, "k"],
        ]);
      }
      if (lang === "nl") {
        return rules(w, [
          [/sch/g, "sx"], [/ch/g, "x"], [/g/g, "ɣ"], [/ij|ei/g, "ɛi"], [/ui/g, "œy"],
          [/oe/g, "u"], [/eu/g, "øː"], [/aa/g, "aː"], [/ee/g, "eː"], [/oo/g, "oː"],
          [/uu/g, "yː"], [/j/g, "j"], [/w/g, "ʋ"], [/c/g, "k"],
        ]);
      }
      return null;
    });
  }

  const CYRILLIC_BASE = {
    а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ё:"jo", ж:"ʐ", з:"z", и:"i", й:"j",
    к:"k", л:"l", м:"m", н:"n", о:"o", п:"p", р:"r", с:"s", т:"t", у:"u", ф:"f",
    х:"x", ц:"ts", ч:"tɕ", ш:"ʂ", щ:"ɕː", ъ:"", ы:"ɨ", ь:"ʲ", э:"e", ю:"ju", я:"ja",
  };
  const CYRILLIC_EXTRA = {
    uk: { г:"ɦ", ґ:"g", е:"e", є:"je", и:"ɪ", і:"i", ї:"ji", ж:"ʒ", ч:"tʃ", ш:"ʃ", щ:"ʃtʃ" },
    bg: { ж:"ʒ", ч:"tʃ", ш:"ʃ", щ:"ʃt", ъ:"ɤ", ь:"ʲ" },
    sr: { ј:"j", љ:"ʎ", њ:"ɲ", ћ:"tɕ", ђ:"dʑ", џ:"dʒ", ч:"tʃ", ш:"ʃ", ж:"ʒ", ъ:"", ь:"" },
    mk: { ј:"j", љ:"ʎ", њ:"ɲ", ќ:"c", ѓ:"ɟ", џ:"dʒ", ч:"tʃ", ш:"ʃ", ж:"ʒ", ъ:"", ь:"" },
  };

  function cyrillicIpa(text, lang) {
    const extra = CYRILLIC_EXTRA[lang] || {};
    let output = "";
    const chars = Array.from(String(text || "").toLowerCase());
    for (let i = 0; i < chars.length; i += 1) {
      const ch = chars[i];
      const prev = chars[i - 1] || "";
      if ((ch === "е" || ch === "ё" || ch === "ю" || ch === "я") && (!prev || /[\sъьь\p{P}]/u.test(prev))) {
        output += { е:"je", ё:"jo", ю:"ju", я:"ja" }[ch];
        continue;
      }
      output += extra[ch] ?? CYRILLIC_BASE[ch] ?? ch;
    }
    return output;
  }

  function greekIpa(text) {
    let input = stripMarks(String(text || "").toLowerCase());
    input = rules(input, [
      [/αι/g,"e"], [/ει|οι|υι/g,"i"], [/ου/g,"u"], [/μπ/g,"b"], [/ντ/g,"d"], [/γκ|γγ/g,"g"],
      [/τσ/g,"ts"], [/τζ/g,"dz"], [/αυ(?=[θκξπστφχψ])/g,"af"], [/αυ/g,"av"],
      [/ευ(?=[θκξπστφχψ])/g,"ef"], [/ευ/g,"ev"], [/γ(?=[εηιυ])/g,"ʝ"], [/χ(?=[εηιυ])/g,"ç"],
    ]);
    const map = { α:"a",β:"v",γ:"ɣ",δ:"ð",ε:"e",ζ:"z",η:"i",θ:"θ",ι:"i",κ:"k",λ:"l",μ:"m",ν:"n",ξ:"ks",ο:"o",π:"p",ρ:"r",σ:"s",ς:"s",τ:"t",υ:"i",φ:"f",χ:"x",ψ:"ps",ω:"o" };
    return Array.from(input).map((ch) => map[ch] ?? ch).join("");
  }

  const DEV_VOWELS = { अ:"ə", आ:"aː", इ:"ɪ", ई:"iː", उ:"ʊ", ऊ:"uː", ऋ:"rɪ", ए:"eː", ऐ:"ɛː", ओ:"oː", औ:"ɔː" };
  const DEV_CONSONANTS = {
    क:"k",ख:"kʰ",ग:"g",घ:"gʰ",ङ:"ŋ",च:"tʃ",छ:"tʃʰ",ज:"dʒ",झ:"dʒʰ",ञ:"ɲ",
    ट:"ʈ",ठ:"ʈʰ",ड:"ɖ",ढ:"ɖʰ",ण:"ɳ",त:"t̪",थ:"t̪ʰ",द:"d̪",ध:"d̪ʰ",न:"n",
    प:"p",फ:"pʰ",ब:"b",भ:"bʰ",म:"m",य:"j",र:"r",ल:"l",व:"ʋ",श:"ʃ",ष:"ʂ",स:"s",ह:"ɦ",ळ:"ɭ",
  };
  const DEV_NUKTA = { क:"q", ख:"x", ग:"ɣ", ज:"z", ड:"ɽ", ढ:"ɽʰ", फ:"f", य:"ʒ" };
  const DEV_MATRAS = { "ा":"aː", "ि":"ɪ", "ी":"iː", "ु":"ʊ", "ू":"uː", "ृ":"rɪ", "े":"eː", "ै":"ɛː", "ो":"oː", "ौ":"ɔː", "ॅ":"ɛ", "ॉ":"ɔ" };
  const DEV_SIGNS = { "ं":"̃", "ँ":"̃", "ः":"ɦ", "ऽ":"ʔ" };

  function devanagariIpa(text) {
    const chars = Array.from(String(text || ""));
    let out = "";
    for (let i = 0; i < chars.length; i += 1) {
      const ch = chars[i], next = chars[i + 1], next2 = chars[i + 2];
      if (DEV_VOWELS[ch]) { out += DEV_VOWELS[ch]; continue; }
      if (DEV_SIGNS[ch]) { out += DEV_SIGNS[ch]; continue; }
      if (ch === "्" || ch === "़") continue;
      if (DEV_CONSONANTS[ch]) {
        const nukta = next === "़";
        const mark = nukta ? next2 : next;
        const consonant = nukta && DEV_NUKTA[ch] ? DEV_NUKTA[ch] : DEV_CONSONANTS[ch];
        out += consonant;
        if (mark === "्") { if (nukta) i += 1; continue; }
        if (DEV_MATRAS[mark]) { out += DEV_MATRAS[mark]; if (nukta) i += 1; i += 1; continue; }
        out += "ə";
        if (nukta) i += 1;
        continue;
      }
      if (DEV_MATRAS[ch]) { out += DEV_MATRAS[ch]; continue; }
      out += ch;
    }
    return out.replace(/ə(?=\s|[.,!?;:।]|$)/g, "");
  }

  const ARABIC_BASE = {
    "ا":"aː","آ":"aː","أ":"ʔa","إ":"ʔi","ب":"b","پ":"p","ت":"t","ٹ":"ʈ","ث":"θ","ج":"dʒ","چ":"tʃ",
    "ح":"ħ","خ":"x","د":"d","ڈ":"ɖ","ذ":"ð","ر":"r","ڑ":"ɽ","ز":"z","ژ":"ʒ","س":"s","ش":"ʃ",
    "ص":"sˤ","ض":"dˤ","ط":"tˤ","ظ":"ðˤ","ع":"ʕ","غ":"ɣ","ف":"f","ق":"q","ك":"k","ک":"k","گ":"g",
    "ل":"l","م":"m","ن":"n","ں":"ñ","ه":"h","ہ":"ɦ","ة":"a","و":"w","ؤ":"ʔw","ي":"j","ی":"j","ے":"eː","ى":"aː","ئ":"ʔj","ء":"ʔ",
    "َ":"a","ِ":"i","ُ":"u","ً":"an","ٍ":"in","ٌ":"un","ْ":"","ّ":"ː","ٰ":"aː","ھ":"ʰ",
  };
  function arabicIpa(text, lang) {
    const map = { ...ARABIC_BASE };
    if (lang === "fa") Object.assign(map, { "ث":"s","ذ":"z","ص":"s","ض":"z","ط":"t","ظ":"z","ع":"ʔ","ق":"ɣ","و":"v","ج":"dʒ" });
    if (lang === "ur") Object.assign(map, { "ق":"q","و":"ʋ","ی":"j","ے":"eː","ہ":"ɦ" });
    return Array.from(String(text || "")).map((ch) => map[ch] ?? ch).join("");
  }

  const HANGUL_ONSET = ["g","k","n","d","t","r","m","b","p","s","sː","","dʑ","tɕ","tɕʰ","kʰ","tʰ","pʰ","h"];
  const HANGUL_VOWEL = ["a","ɛ","ja","jɛ","ʌ","e","jʌ","je","o","wa","wɛ","ø","jo","u","wʌ","we","wi","ju","ɯ","ɰi","i"];
  const HANGUL_CODA = ["","k̚","k̚","k̚","n","n","n","t̚","l","k̚","m","p̚","l","l","p̚","l","m","p̚","p̚","t̚","t̚","ŋ","t̚","t̚","k̚","t̚","p̚","h̚"];
  function hangulIpa(text) {
    let out = "";
    for (const ch of Array.from(String(text || ""))) {
      const cp = ch.codePointAt(0);
      if (cp < 0xAC00 || cp > 0xD7A3) { out += ch; continue; }
      const s = cp - 0xAC00;
      const onset = Math.floor(s / 588), vowel = Math.floor((s % 588) / 28), coda = s % 28;
      out += HANGUL_ONSET[onset] + HANGUL_VOWEL[vowel] + HANGUL_CODA[coda];
    }
    return out;
  }

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
  const PINYIN_TONES = { "1":"˥", "2":"˧˥", "3":"˨˩˦", "4":"˥˩", "5":"" };
  function pinyinSyllableIpa(raw) {
    let syllable = String(raw || "").toLowerCase().replace(/v/g, "ü");
    const toneMatch = syllable.match(/([1-5])$/);
    const tone = toneMatch ? PINYIN_TONES[toneMatch[1]] : "";
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

  async function chineseIpa(text) {
    if (typeof loadPinyinPro !== "function") throw new Error("pinyin runtime unavailable");
    const mod = await loadPinyinPro();
    const pinyin = mod.pinyin || mod.default?.pinyin || mod.default;
    if (typeof pinyin !== "function") throw new Error("pinyin function unavailable");
    const segmenter = typeof Intl?.Segmenter === "function" ? new Intl.Segmenter("zh", { granularity: "word" }) : null;
    const segments = segmenter ? Array.from(segmenter.segment(String(text || ""))) : [{ segment: String(text || ""), isWordLike: true }];
    const output = [];
    for (const part of segments) {
      if (!part.isWordLike || !/\p{Script=Han}/u.test(part.segment)) { output.push(part.segment); continue; }
      const py = String(pinyin(part.segment, { toneType: "num", nonZh: "consecutive" }));
      output.push(py.trim().split(/\s+/).filter(Boolean).map(pinyinSyllableIpa).join(""));
    }
    return output.join("");
  }

  async function directIpa(text, language) {
    const lang = primaryLanguage(language);
    const script = scriptOf(text);
    if (script === "latin" && ["es","pt","fr","de","it","tr","pl","cs","sk","sl","hr","bs","sr","id","ms","nl"].includes(lang)) return latinIpa(text, lang);
    if (script === "cyrillic" && ["ru","uk","bg","sr","mk"].includes(lang)) return cyrillicIpa(text, lang);
    if (script === "greek" && lang === "el") return greekIpa(text);
    if (script === "devanagari" && ["hi","ne"].includes(lang)) return devanagariIpa(text);
    if (script === "arabic" && ["ar","fa","ur"].includes(lang)) return arabicIpa(text, lang);
    if (script === "hangul" && lang === "ko") return hangulIpa(text);
    if (script === "han" && lang === "zh") return chineseIpa(text);
    return null;
  }

  async function languageAwareIpaDisplay(input = "", language = "") {
    const text = String(input || "");
    if (!text) return "";
    const { body, suffix } = typeof splitSourceSuffix === "function" ? splitSourceSuffix(text) : { body: text, suffix: "" };
    const sourceText = body || text;
    const lang = primaryLanguage(language);
    if (lang === "en" || (typeof isProbablyEnglishText === "function" && isProbablyEnglishText(sourceText))) {
      counters.fallback += 1;
      return fallbackIpaDisplay(input, language);
    }
    try {
      const direct = await directIpa(sourceText, language);
      if (direct != null && direct !== sourceText) {
        counters.direct += 1;
        return `${direct}${suffix || ""}`.trim();
      }
    } catch (error) {
      counters.failures += 1;
      console.warn("Language-aware IPA fallback:", error);
    }
    counters.fallback += 1;
    return fallbackIpaDisplay(input, language);
  }

  function wordSegments(text, locale) {
    const input = String(text || "");
    const segmenter = typeof Intl?.Segmenter === "function" ? new Intl.Segmenter(locale || undefined, { granularity: "word" }) : null;
    if (segmenter) return Array.from(segmenter.segment(input), (part) => ({ text: part.segment, wordLike: !!part.isWordLike }));
    return (input.match(/\s+|[^\s]+/g) || []).map((part) => ({ text: part, wordLike: /[\p{L}\p{N}]/u.test(part) }));
  }

  function paintWords(target, text, locale) {
    target.textContent = "";
    let wordIndex = 0;
    for (const part of wordSegments(text, locale)) {
      if (!part.text) continue;
      if (!part.wordLike) { target.appendChild(document.createTextNode(part.text)); continue; }
      const span = document.createElement("span");
      span.className = "word coordinated-word";
      span.dataset.wordIndex = String(wordIndex);
      span.style.setProperty("--seg-color", WORD_COLORS[wordIndex % WORD_COLORS.length]);
      span.textContent = part.text;
      target.appendChild(span);
      wordIndex += 1;
    }
    return wordIndex;
  }

  function setCoordinatedWordColors(originalEl, originalText, ipaEl, ipaText, language = "") {
    const locale = primaryLanguage(language) === "auto" ? undefined : primaryLanguage(language);
    const originalWords = paintWords(originalEl, originalText, locale);
    const ipaWords = paintWords(ipaEl, ipaText, locale);
    return { originalWords, ipaWords };
  }

  window.toIpaDisplay = languageAwareIpaDisplay;
  window.setCoordinatedWordColors = setCoordinatedWordColors;

  const previousHydrateNewsItem = hydrateNewsItem;
  hydrateNewsItem = async function coordinatedLanguageAwareHydrate(row, originalText, language = "") {
    const originalEl = row.querySelector(".news-original");
    const ipaEl = row.querySelector(".news-da");
    const englishEl = row.querySelector(".news-en");
    if (!originalEl || !ipaEl || !englishEl) return previousHydrateNewsItem(row, originalText, language);
    const [ipaText, englishText] = await Promise.all([
      languageAwareIpaDisplay(originalText, language),
      toEnglishDisplay(originalText, language),
    ]);
    setCoordinatedWordColors(originalEl, originalText, ipaEl, ipaText || originalText, language);
    englishEl.textContent = englishText || originalText;
    ipaEl.dataset.phoneticsMode = "ipa";
    ipaEl.setAttribute("aria-label", `IPA phonetics: ${ipaText || originalText}`);
  };

  setTimeout(() => {
    if (typeof applyCountryFilter === "function") {
      applyCountryFilter().catch((error) => console.warn("Language-aware IPA refresh failed:", error));
    }
  }, 0);

  window.__worldLanguageAwareIpaDiagnostics = () => ({
    patched: true,
    direct: counters.direct,
    fallback: counters.fallback,
    failures: counters.failures,
    firstOriginalWords: document.querySelectorAll(".news-original .coordinated-word").length,
    firstIpaWords: document.querySelectorAll(".news-da .coordinated-word").length,
    coloredEnglishSpans: document.querySelectorAll(".news-en .translation, .news-en .word, .news-en .syllable").length,
  });
})();
