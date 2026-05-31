
// lib/imports/parseLabelText.ts

type ParsedDataNormalized = {
  artist_name: string | null;
  title: string | null;
  year: number | null;
  medium: string | null;
  height_cm: number | null;
  width_cm: number | null;
  depth_cm: number | null;
  dimensions: string | null;

  asking_price: number | null;
  currency: string | null;

  estimate_low: number | null;
  estimate_high: number | null;
  auction_currency: string | null;

  notes: string | null;
};

type ParsedDataRaw = {
  artist_raw: string | null;
  title_raw: string | null;
  year_raw: string | null;
  medium_raw: string | null;
  dimensions_raw: string | null;

  asking_price_raw: string | null;
  estimate_raw: string | null;

  notes_raw: string | null;
  normalized: ParsedDataNormalized;
};

type ParsedConfidence = {
  artist_name: number;
  title: number;
  year: number;
  medium: number;
  dimensions: number;

  asking_price: number;
  currency: number;

  estimate_low: number;
  estimate_high: number;
  auction_currency: number;

  notes: number;
};

export type ParsedLabelResult = {
  parsedData: ParsedDataRaw;
  confidence: ParsedConfidence;
};

type CandidateLine = {
  index: number;
  raw: string;
  clean: string;
};

type ParsedPriceResult = {
  asking_price: number | null;
  currency: string | null;
  asking_price_raw: string | null;

  estimate_low: number | null;
  estimate_high: number | null;
  auction_currency: string | null;
  estimate_raw: string | null;

  confidence: {
    asking_price: number;
    currency: number;
    estimate_low: number;
    estimate_high: number;
    auction_currency: number;
  };

  usedIndexes: number[];
};

function normalizeLine(input: string): string {
  return input
    .replace(/\u00A0/g, " ")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[×✕]/g, " x ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0);
}

function cleanArtistName(line: string): string {
  let s = line.trim();

  // supprime contenu entre parenthèses : nationalité, dates de vie, etc.
  s = s.replace(/\((?:[^()]|\([^()]*\))*\)/g, " ").trim();

  // supprime années de vie restantes si OCR bizarre
  s = s.replace(/\b(17|18|19|20)\d{2}\s*-\s*(17|18|19|20)\d{2}\b/g, " ").trim();

  // supprime ponctuation résiduelle en fin
  s = s.replace(/[;,.\-–—:]+$/g, "").trim();

  // met en casse "humaine" si ligne 100% uppercase
  if (looksMostlyUppercase(s)) {
    s = toTitleCasePreserveApostrophe(s);
  }

  return s || line.trim();
}

function toTitleCasePreserveApostrophe(input: string): string {
  return input
    .toLowerCase()
    .split(" ")
    .map((part) => {
      if (!part) return part;
      if (part.includes("'")) {
        return part
          .split("'")
          .map((sub) => (sub ? sub.charAt(0).toUpperCase() + sub.slice(1) : sub))
          .join("'");
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function stripTrailingPunctuation(input: string): string {
  return input.replace(/[;,.\s]+$/g, "").trim();
}

function looksMostlyUppercase(input: string): boolean {
  const letters = input.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  if (!letters) return false;
  const upper = letters.replace(/[^A-ZÀ-ÖØ-Þ]/g, "");
  return upper.length / letters.length > 0.72;
}

function isShortNumericLot(line: string): boolean {
  return /^\d{1,5}[A-Za-z]?$/.test(line.trim());
}

function isPriceLine(line: string): boolean {
  return (
    /\b(?:USD|EUR|CHF|GBP|HKD)\b/i.test(line) ||
    /[$€£]/.test(line) ||
    /\best(?:imate)?s?\b/i.test(line) ||
    /\basking\b/i.test(line) ||
    /\bprice\b/i.test(line)
  );
}

function isAuctionNoise(line: string): boolean {
  return (
    /\bscan code\b/i.test(line) ||
    /\bto view this lot\b/i.test(line) ||
    /\bon your mobile\b/i.test(line) ||
    /\bmodern day auction\b/i.test(line) ||
    /\bchristie'?s\b/i.test(line) ||
    /\bsotheby'?s\b/i.test(line) ||
    /\bphillips\b/i.test(line) ||
    /\bpost-war\b/i.test(line) ||
    /\bcontemporary art\b/i.test(line) ||
    /\bday sale\b/i.test(line) ||
    /\bevening sale\b/i.test(line) ||
    /\bnew york\b/i.test(line) ||
    /\blondon\b/i.test(line) ||
    /\bparis\b/i.test(line) ||
    /\bhong kong\b/i.test(line) ||
    /\bgeneva\b/i.test(line) ||
    /\bmay \d{1,2} \d{4}\b/i.test(line) ||
    /\bjune \d{1,2} \d{4}\b/i.test(line) ||
    /\bjuly \d{1,2} \d{4}\b/i.test(line) ||
    /\bapril \d{1,2} \d{4}\b/i.test(line) ||
    /\bmarch \d{1,2} \d{4}\b/i.test(line) ||
    /\bfebruary \d{1,2} \d{4}\b/i.test(line) ||
    /\baugust \d{1,2} \d{4}\b/i.test(line) ||
    /\bseptember \d{1,2} \d{4}\b/i.test(line) ||
    /\boctober \d{1,2} \d{4}\b/i.test(line) ||
    /\bnovember \d{1,2} \d{4}\b/i.test(line) ||
    /\bdecember \d{1,2} \d{4}\b/i.test(line)
  );
}

// ⚠️ IMPORTANT : on ne classe PLUS les lignes de prix comme "hard noise",
// sinon on ne pourra jamais les parser.
function isHardNoise(line: string): boolean {
  return isAuctionNoise(line);
}

function isMediumLine(line: string): boolean {
  return /\b(oil|canvas|paper|ink|acrylic|charcoal|bronze|wood|gouache|watercolor|watercolour|etching|lithograph|screenprint|silkscreen|collage|photograph|gelatin silver|c-print|pigment print|mixed media|ceramic|marble|plaster|pencil|pastel|tempera|enamel|postage|tape)\b/i.test(
    line
  );
}

function isSignatureLine(line: string): boolean {
  return /\b(signed|dated|inscribed|stamped|numbered|initialed|initialled|annotated)\b/i.test(
    line
  );
}

function isEditionLine(line: string): boolean {
  return /\b(edition|ed\.?|artist'?s proof|a\/p|e\.a\.|hc|hors commerce|numbered)\b/i.test(
    line
  );
}

function isExecutedLine(line: string): boolean {
  return /\b(executed|painted|created|conceived|made|produced|dated)\b/i.test(line);
}

function isDateOnlyLine(line: string): boolean {
  return /^(?:\d{1,2}\s+)?(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\s+\d{1,2}\s+\d{4}$/i.test(
    line.trim()
  );
}

function isDimensionsLine(line: string): boolean {
  const s = line.replace(/[×✕]/g, "x");
  if (/\bcm\b/i.test(s) && /\d/.test(s) && /(x|by)/i.test(s)) return true;
  if (/\bin\b/i.test(s) && /\d/.test(s) && /(x|by)/i.test(s)) return true;
  return false;
}

function isArtistBioLine(line: string): boolean {
  const s = line.trim();

  return (
    /^b\.\s*(17|18|19|20)\d{2}\.?$/i.test(s) ||
    /^born\s+(in\s+)?(17|18|19|20)\d{2}\.?$/i.test(s) ||
    /^né\s+en\s+(17|18|19|20)\d{2}\.?$/i.test(s) ||
    /^\(b\.\s*(17|18|19|20)\d{2}\)$/i.test(s) ||
    /^\(?born\s+(in\s+)?(17|18|19|20)\d{2}\)?\.?$/i.test(s)
  );
}

function isPotentialArtistLine(line: string): boolean {
  if (!line) return false;
  if (isShortNumericLot(line)) return false;
  if (isArtistBioLine(line)) return false;
  if (isHardNoise(line)) return false;
  if (isPriceLine(line)) return false;
  if (isMediumLine(line)) return false;
  if (isSignatureLine(line)) return false;
  if (isDimensionsLine(line)) return false;
  if (isDateOnlyLine(line)) return false;
  if (isExecutedLine(line)) return false;

  const stripped = cleanArtistName(line);
  if (!stripped) return false;

  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 6) return false;

  if (
    /\b(study|portrait|autoportrait|untitled|composition|sale|auction|collection)\b/i.test(
      stripped
    ) &&
    !looksMostlyUppercase(line)
  ) {
    return false;
  }

  if (/\(.*\)/.test(line)) return true;
  if (looksMostlyUppercase(line)) return true;

  const allWordsLookLikeNames = words.every((w) => /^[A-Za-zÀ-ÖØ-öø-ÿ'’.-]+$/.test(w));
  return allWordsLookLikeNames;
}

function isPotentialTitleLine(line: string): boolean {
  if (!line) return false;
  if (isArtistBioLine(line)) return false;
  if (isShortNumericLot(line)) return false;
  if (isHardNoise(line)) return false;
  if (isPriceLine(line)) return false;
  if (isMediumLine(line)) return false;
  if (isSignatureLine(line)) return false;
  if (isDimensionsLine(line)) return false;
  if (isDateOnlyLine(line)) return false;
  if (isExecutedLine(line)) return false;

  const stripped = stripTrailingPunctuation(line);
  if (!stripped) return false;

  if (stripped.length >= 2 && stripped.length <= 180) return true;
  return false;
}

function extractYearFromTitleLine(line: string): number | null {
  const m = line.match(/,\s*((17|18|19|20)\d{2})\s*$/);
  if (!m) return null;
  return Number(m[1]);
}

function removeYearFromTitleLine(line: string): string {
  return stripTrailingPunctuation(
    line.replace(/,\s*(17|18|19|20)\d{2}\s*$/i, "").trim()
  );
}

function extractContextualYear(lines: string[]): { year: number | null; raw: string | null } {
  for (const line of lines) {
    if (isExecutedLine(line) || isSignatureLine(line)) {
      const match = line.match(/\b(17|18|19|20)\d{2}\b/g);
      if (match && match.length) {
        const year = Number(match[match.length - 1]);
        if (year >= 1500 && year <= new Date().getFullYear() + 1) {
          return { year, raw: line };
        }
      }
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(17|18|19|20)\d{2}$/.test(trimmed)) {
      const year = Number(trimmed);
      if (year >= 1500 && year <= new Date().getFullYear() + 1) {
        return { year, raw: trimmed };
      }
    }
  }

  for (const line of lines) {
    if (/\b(on the reverse|reverse|verso)\b/i.test(line) || /^\d{4}['’"]?\s*\(/.test(line)) {
      const m = line.match(/\b(17|18|19|20)\d{2}\b/);
      if (m) {
        const year = Number(m[0]);
        if (year >= 1500 && year <= new Date().getFullYear() + 1) {
          return { year, raw: line };
        }
      }
    }
  }

  return { year: null, raw: null };
}

function parseDimensions(line: string): {
  raw: string | null;
  height_cm: number | null;
  width_cm: number | null;
  depth_cm: number | null;
  dimensions: string | null;
} {
  if (!line) {
    return {
      raw: null,
      height_cm: null,
      width_cm: null,
      depth_cm: null,
      dimensions: null,
    };
  }

  const raw = line.trim();

  const cmPartMatches = raw.match(
    /([\d.,/ ]+(?:\s*(?:x|by)\s*[\d.,/ ]+){1,2})\s*cm\b/i
  );

  let values: number[] = [];

  if (cmPartMatches && cmPartMatches[1]) {
    values = splitDimensionValues(cmPartMatches[1]).map(normalizeDimensionNumber);
  } else {
    const inPartMatches = raw.match(
      /([\d.,/ ]+(?:\s*(?:x|by)\s*[\d.,/ ]+){1,2})\s*in\b/i
    );
    if (inPartMatches && inPartMatches[1]) {
      values = splitDimensionValues(inPartMatches[1])
        .map(normalizeDimensionNumber)
        .map((v) => round2(v * 2.54));
    }
  }

  values = values.filter((v) => Number.isFinite(v) && v > 0);

  if (!values.length) {
    return {
      raw,
      height_cm: null,
      width_cm: null,
      depth_cm: null,
      dimensions: null,
    };
  }

  const height_cm = values[0] ?? null;
  const width_cm = values[1] ?? null;
  const depth_cm = values.length >= 3 ? values[2] : null;

  let dimensions: string | null = null;
  if (height_cm !== null && width_cm !== null) {
    const parts = [height_cm, width_cm, depth_cm].filter(
      (v) => v !== null && v !== 0
    ) as number[];
    dimensions = `${parts.map(trimZeros).join(" x ")} cm`;
  }

  return {
    raw,
    height_cm,
    width_cm,
    depth_cm,
    dimensions,
  };
}

function splitDimensionValues(part: string): string[] {
  return part
    .replace(/[×✕]/g, "x")
    .split(/\s*(?:x|by)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeDimensionNumber(input: string): number {
  const s = input.trim().replace(",", ".");

  if (/^\d+\s+\d+\/\d+$/.test(s)) {
    const [whole, frac] = s.split(/\s+/);
    const [a, b] = frac.split("/").map(Number);
    return Number(whole) + a / b;
  }

  if (/^\d+\/\d+$/.test(s)) {
    const [a, b] = s.split("/").map(Number);
    return a / b;
  }

  const num = Number(s);
  return Number.isFinite(num) ? num : NaN;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function trimZeros(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.?0+$/, "");
}

function buildCandidates(lines: string[]): CandidateLine[] {
  return lines.map((line, index) => ({
    index,
    raw: line,
    clean: normalizeLine(line),
  }));
}

function dedupePreserveOrder(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function normalizeCurrency(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim().toUpperCase();

  if (s.includes("HKD") || s.includes("HK$")) return "HKD";
  if (s.includes("CHF")) return "CHF";
  if (s.includes("USD") || s.includes("$")) return "USD";
  if (s.includes("EUR") || s.includes("€")) return "EUR";
  if (s.includes("GBP") || s.includes("£")) return "GBP";

  return null;
}

function parseLooseNumber(input: string): number | null {
  const cleaned = input
    .trim()
    .replace(/\s/g, "")
    .replace(/[’']/g, "")
    .replace(/,(?=\d{3}\b)/g, "")
    .replace(/,(?=\d{1,2}\b)/g, ".")
    .replace(/[^\d.]/g, "");

  if (!cleaned) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractRangeNumbers(line: string): number[] {
  const matches = line.match(/\d[\d\s'’.,]*/g) ?? [];
  return matches
    .map((m) => parseLooseNumber(m))
    .filter((n): n is number => n !== null);
}

function parsePrices(lines: string[]): ParsedPriceResult {
  let asking_price: number | null = null;
  let currency: string | null = null;
  let asking_price_raw: string | null = null;

  let estimate_low: number | null = null;
  let estimate_high: number | null = null;
  let auction_currency: string | null = null;
  let estimate_raw: string | null = null;

  let asking_price_conf = 0;
  let currency_conf = 0;
  let estimate_low_conf = 0;
  let estimate_high_conf = 0;
  let auction_currency_conf = 0;

  const usedIndexes: number[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const clean = normalizeLine(line);

    if (!isPriceLine(clean)) continue;

    const curr = normalizeCurrency(clean);
    const nums = extractRangeNumbers(clean);

    // 1) Cas fourchette / estimate
    if (
      /\best(?:imate)?s?\b/i.test(clean) ||
      nums.length >= 2 ||
      /(?:\d[\d\s'’.,]*)\s*-\s*(\d[\d\s'’.,]*)/.test(clean)
    ) {
      const low = nums[0] ?? null;
      const high = nums[1] ?? null;

      if (low !== null && high !== null && estimate_low === null && estimate_high === null) {
        estimate_low = low;
        estimate_high = high;
        auction_currency = curr;
        estimate_raw = line;
        estimate_low_conf = /\best(?:imate)?s?\b/i.test(clean) ? 0.95 : 0.82;
        estimate_high_conf = /\best(?:imate)?s?\b/i.test(clean) ? 0.95 : 0.82;
        auction_currency_conf = curr ? 0.93 : 0;
        usedIndexes.push(i);
        continue;
      }
    }

    // 2) Cas prix simple : ex "USD 80'000"
    if (nums.length === 1 && asking_price === null) {
      asking_price = nums[0];
      currency = curr;
      asking_price_raw = line;
      asking_price_conf =
        /\basking\b/i.test(clean) || /\bprice\b/i.test(clean) ? 0.92 : 0.78;
      currency_conf = curr ? 0.92 : 0;
      usedIndexes.push(i);
    }
  }

  return {
    asking_price,
    currency,
    asking_price_raw,

    estimate_low,
    estimate_high,
    auction_currency,
    estimate_raw,

    confidence: {
      asking_price: asking_price_conf,
      currency: currency_conf,
      estimate_low: estimate_low_conf,
      estimate_high: estimate_high_conf,
      auction_currency: auction_currency_conf,
    },

    usedIndexes,
  };
}

export function parseLabelText(inputText: string): ParsedLabelResult {
  const originalLines = splitLines(inputText);
  const lines = dedupePreserveOrder(originalLines);
  const candidates = buildCandidates(lines);

  const usedIndexes = new Set<number>();

  // 1) artiste = première ligne valide après bruit
  let artistRaw: string | null = null;
  let artistName: string | null = null;
  let artistConfidence = 0;

  for (const c of candidates) {
    if (usedIndexes.has(c.index)) continue;
    if (!isPotentialArtistLine(c.clean)) continue;

    artistRaw = c.raw;
    artistName = cleanArtistName(c.clean);
    artistConfidence = /\(.*\)/.test(c.raw) ? 0.96 : looksMostlyUppercase(c.raw) ? 0.9 : 0.84;
    usedIndexes.add(c.index);
    break;
  }

  // 2) titre = première ligne valide après l’artiste
  let titleRaw: string | null = null;
  let title: string | null = null;
  let titleConfidence = 0;
  let yearRaw: string | null = null;
  let year: number | null = null;
  let yearConfidence = 0;

  const artistIndex = artistRaw ? lines.findIndex((l) => l === artistRaw) : -1;

  for (const c of candidates) {
    if (usedIndexes.has(c.index)) continue;
    if (artistIndex >= 0 && c.index <= artistIndex) continue;
    if (!isPotentialTitleLine(c.clean)) continue;
    if (isDateOnlyLine(c.clean)) continue;
    if (isHardNoise(c.clean)) continue;

    titleRaw = c.raw;
    const yearFromTitle = extractYearFromTitleLine(c.clean);

    if (yearFromTitle) {
      year = yearFromTitle;
      yearRaw = c.raw;
      yearConfidence = 0.94;
      title = removeYearFromTitleLine(c.clean);
      titleConfidence = 0.92;
    } else {
      title = stripTrailingPunctuation(c.clean);
      titleConfidence = looksMostlyUppercase(c.clean) ? 0.9 : 0.86;
    }

    if (!title || isShortNumericLot(title) || /^(17|18|19|20)\d{2}$/.test(title)) {
      titleRaw = null;
      title = null;
      titleConfidence = 0;
      continue;
    }

    usedIndexes.add(c.index);
    break;
  }

  // 3) medium = première ligne medium
  let mediumRaw: string | null = null;
  let medium: string | null = null;
  let mediumConfidence = 0;

  for (const c of candidates) {
    if (usedIndexes.has(c.index)) continue;
    if (!isMediumLine(c.clean)) continue;

    mediumRaw = c.raw;
    medium = stripTrailingPunctuation(c.clean);
    mediumConfidence = 0.88;
    usedIndexes.add(c.index);
    break;
  }

  // 4) dimensions
  let dimensionsRaw: string | null = null;
  let height_cm: number | null = null;
  let width_cm: number | null = null;
  let depth_cm: number | null = null;
  let dimensions: string | null = null;
  let dimensionsConfidence = 0;

  for (const c of candidates) {
    if (usedIndexes.has(c.index)) continue;
    if (!isDimensionsLine(c.clean)) continue;

    const parsedDims = parseDimensions(c.clean);
    dimensionsRaw = parsedDims.raw;
    height_cm = parsedDims.height_cm;
    width_cm = parsedDims.width_cm;
    depth_cm = parsedDims.depth_cm;
    dimensions = parsedDims.dimensions;
    dimensionsConfidence = dimensions ? 0.94 : 0.55;
    usedIndexes.add(c.index);
    break;
  }

  // 5) année si pas déjà trouvée dans le titre
  if (year === null) {
    const remainingForYear = lines.filter((_, idx) => !usedIndexes.has(idx));
    const contextualYear = extractContextualYear(remainingForYear);
    if (contextualYear.year !== null) {
      year = contextualYear.year;
      yearRaw = contextualYear.raw;
      yearConfidence = 0.91;

      if (yearRaw) {
        const idx = lines.findIndex((l) => l === yearRaw);
        if (idx >= 0) usedIndexes.add(idx);
      }
    }
  }

  // 6) prix / estimate
  const priceResult = parsePrices(lines);
  for (const idx of priceResult.usedIndexes) {
    usedIndexes.add(idx);
  }

  // 7) notes = reste utile
  const noteLines = lines.filter((line, idx) => {
    if (usedIndexes.has(idx)) return false;
    if (isDateOnlyLine(line)) return false;
    if (isArtistBioLine(line)) return false;

    // On garde volontairement les lignes de prix non retenues, signatures, édition, etc.
    return true;
  });

  const notesRaw = noteLines.length ? noteLines.join(" | ") : null;
  const notes = notesRaw;
  const notesConfidence = notes ? 0.7 : 0;

  // 8) fallback artiste
  if (!artistName) {
    const fallbackArtist = lines.find(
      (line) => isPotentialArtistLine(line) && !isArtistBioLine(line)
    );

    if (fallbackArtist) {
      artistRaw = fallbackArtist;
      artistName = cleanArtistName(fallbackArtist);
      artistConfidence = 0.72;
    }
  }

  // 9) fallback titre
  if (!title) {
    const fallbackTitle = lines.find(
      (line, idx) =>
        idx !== (artistRaw ? lines.findIndex((l) => l === artistRaw) : -1) &&
        !isHardNoise(line) &&
        !isPriceLine(line) &&
        !isShortNumericLot(line) &&
        !isMediumLine(line) &&
        !isDimensionsLine(line) &&
        !isDateOnlyLine(line) &&
        !isExecutedLine(line) &&
        !isSignatureLine(line) &&
        !isArtistBioLine(line) &&
        !isPotentialArtistLine(line)
    );

    if (fallbackTitle) {
      titleRaw = fallbackTitle;
      title = removeYearFromTitleLine(fallbackTitle);
      titleConfidence = 0.62;

      if (year === null) {
        const y = extractYearFromTitleLine(fallbackTitle);
        if (y) {
          year = y;
          yearRaw = fallbackTitle;
          yearConfidence = 0.8;
        }
      }
    }
  }

  // 10) faux positifs
  if (artistName && isDateOnlyLine(artistName)) {
    artistName = null;
    artistRaw = null;
    artistConfidence = 0;
  }

  if (artistName && /\b(scan code|auction|christie'?s|sotheby'?s|phillips)\b/i.test(artistName)) {
    artistName = null;
    artistRaw = null;
    artistConfidence = 0;
  }

  if (title && isShortNumericLot(title)) {
    title = null;
    titleRaw = null;
    titleConfidence = 0;
  }

  const parsedData: ParsedDataRaw = {
    artist_raw: artistRaw,
    title_raw: titleRaw,
    year_raw: yearRaw,
    medium_raw: mediumRaw,
    dimensions_raw: dimensionsRaw,

    asking_price_raw: priceResult.asking_price_raw,
    estimate_raw: priceResult.estimate_raw,

    notes_raw: notesRaw,
    normalized: {
      artist_name: artistName,
      title,
      year,
      medium,
      height_cm,
      width_cm,
      depth_cm,
      dimensions,

      asking_price: priceResult.asking_price,
      currency: priceResult.currency,

      estimate_low: priceResult.estimate_low,
      estimate_high: priceResult.estimate_high,
      auction_currency: priceResult.auction_currency,

      notes,
    },
  };

  const confidence: ParsedConfidence = {
    artist_name: artistConfidence,
    title: titleConfidence,
    year: yearConfidence,
    medium: mediumConfidence,
    dimensions: dimensionsConfidence,

    asking_price: priceResult.confidence.asking_price,
    currency: priceResult.confidence.currency,

    estimate_low: priceResult.confidence.estimate_low,
    estimate_high: priceResult.confidence.estimate_high,
    auction_currency: priceResult.confidence.auction_currency,

    notes: notesConfidence,
  };

  console.log("[parseLabelText] usedIndexes final =", Array.from(usedIndexes));
  console.log("[parseLabelText] notesRaw =", notesRaw);
  console.log("[parseLabelText] parsed normalized =", parsedData.normalized);

  return {
    parsedData,
    confidence,
  };
}
