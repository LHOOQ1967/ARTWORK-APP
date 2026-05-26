
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
  inventory_number: string | null;
  notes: string | null;
};

type ParsedDataRaw = {
  artist_raw: string | null;
  title_raw: string | null;
  year_raw: string | null;
  medium_raw: string | null;
  dimensions_raw: string | null;
  inventory_number_raw: string | null;
  notes_raw: string | null;
  normalized: ParsedDataNormalized;
};

type ParsedConfidence = {
  artist_name: number;
  title: number;
  year: number;
  medium: number;
  dimensions: number;
  inventory_number: number;
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
  return /\$\s?\d|£\s?\d|€\s?\d|CHF\s?\d|estimate|estimate[s]?/i.test(line);
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

function isHardNoise(line: string): boolean {
  return isAuctionNoise(line) || isPriceLine(line);
}

function isMediumLine(line: string): boolean {
  return /\b(oil|canvas|paper|ink|acrylic|charcoal|bronze|wood|gouache|watercolor|watercolour|etching|lithograph|screenprint|silkscreen|collage|photograph|gelatin silver|c-print|pigment print|mixed media|ceramic|marble|plaster|pencil|pastel|tempera|enamel)\b/i.test(
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
    /^b\.\s*(17|18|19|20)\d{2}\.?$/i.test(s) ||              // b. 1956
    /^born\s+(in\s+)?(17|18|19|20)\d{2}\.?$/i.test(s) ||    // born 1956 / born in 1956
    /^né\s+en\s+(17|18|19|20)\d{2}\.?$/i.test(s) ||         // né en 1956
    /^\(b\.\s*(17|18|19|20)\d{2}\)$/i.test(s) ||            // (b. 1956)
    /^\(?born\s+(in\s+)?(17|18|19|20)\d{2}\)?\.?$/i.test(s)
  );
}


function isPotentialArtistLine(line: string): boolean {
  if (!line) return false;
  if (isShortNumericLot(line)) return false;
  if (isArtistBioLine(line)) return false;
  if (isHardNoise(line)) return false;
  if (isMediumLine(line)) return false;
  if (isSignatureLine(line)) return false;
  if (isDimensionsLine(line)) return false;
  if (isDateOnlyLine(line)) return false;
  if (isExecutedLine(line)) return false;
  if (isArtistBioLine(line)) return false;
  if (isArtistBioLine(line)) return false;

  const stripped = cleanArtistName(line);
  if (!stripped) return false;

  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 6) return false;

  // Exclut les lignes contenant surtout des mots d'oeuvre / vente
  if (
    /\b(study|portrait|autoportrait|untitled|composition|sale|auction|collection)\b/i.test(
      stripped
    ) &&
    !looksMostlyUppercase(line)
  ) {
    return false;
  }

  // Très bon cas si parenthèses dates/nationalité dans la ligne d'origine
  if (/\(.*\)/.test(line)) return true;

  // Bon cas si ligne en capitales ou bien titre-case avec 2-4 mots
  if (looksMostlyUppercase(line)) return true;

  const allWordsLookLikeNames = words.every((w) => /^[A-Za-zÀ-ÖØ-öø-ÿ'’.-]+$/.test(w));
  return allWordsLookLikeNames;
}

function isPotentialTitleLine(line: string): boolean {
  if (!line) return false;
  if (isArtistBioLine(line)) return false;
  if (isShortNumericLot(line)) return false;
  if (isHardNoise(line)) return false;
  if (isMediumLine(line)) return false;
  if (isSignatureLine(line)) return false;
  if (isDimensionsLine(line)) return false;
  if (isDateOnlyLine(line)) return false;
  if (isExecutedLine(line)) return false;

  const stripped = stripTrailingPunctuation(line);
  if (!stripped) return false;

  // une ligne de titre peut être en uppercase
  if (stripped.length >= 2 && stripped.length <= 180) return true;

  return false;
}

function extractYearFromTitleLine(line: string): number | null {
  const m = line.match(/,\s*((17|18|19|20)\d{2})\s*$/);
  if (!m) return null;
  return Number(m[1]);
}

function removeYearFromTitleLine(line: string): string {
  return stripTrailingPunctuation(line.replace(/,\s*(17|18|19|20)\d{2}\s*$/i, "").trim());
}

function extractContextualYear(lines: string[]): { year: number | null; raw: string | null } {
  // 1. priorité aux lignes explicites type "Executed in 1965" / "dated 1942"
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

  // 2. ligne année seule
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(17|18|19|20)\d{2}$/.test(trimmed)) {
      const year = Number(trimmed);
      if (year >= 1500 && year <= new Date().getFullYear() + 1) {
        return { year, raw: trimmed };
      }
    }
  }

  // 3. ligne courte contenant juste une année + petit commentaire
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

  // priorité aux valeurs en cm
  const cmPartMatches = raw.match(/([\d.,/ ]+(?:\s*(?:x|by)\s*[\d.,/ ]+){1,2})\s*cm\b/i);

  let values: number[] = [];

  if (cmPartMatches && cmPartMatches[1]) {
    values = splitDimensionValues(cmPartMatches[1]).map(normalizeDimensionNumber);
  } else {
    const inPartMatches = raw.match(/([\d.,/ ]+(?:\s*(?:x|by)\s*[\d.,/ ]+){1,2})\s*in\b/i);
    if (inPartMatches && inPartMatches[1]) {
      values = splitDimensionValues(inPartMatches[1]).map(normalizeDimensionNumber).map((v) => round2(v * 2.54));
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
  const depth_cm = values[2] ?? 0;

  let dimensions: string | null = null;
  if (height_cm !== null && width_cm !== null) {
    dimensions = `${trimZeros(height_cm)} x ${trimZeros(width_cm)} x ${trimZeros(depth_cm)} cm`;
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

  // fraction simple "30 1/8" ou "1/8"
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

function findInventoryNumber(lines: string[]): { raw: string | null; confidence: number } {
  for (const line of lines) {
    if (isShortNumericLot(line)) {
      return { raw: line.trim(), confidence: 0.93 };
    }

    const lotMatch = line.match(/\blot\s+([A-Za-z0-9-]+)\b/i);
    if (lotMatch) {
      return { raw: lotMatch[1], confidence: 0.9 };
    }

    const invMatch = line.match(/\b(?:inv(?:entory)?|ref(?:erence)?|no\.?|#)\s*[:\-]?\s*([A-Za-z0-9\-\/]+)\b/i);
    if (invMatch) {
      return { raw: invMatch[1], confidence: 0.88 };
    }
  }

  return { raw: null, confidence: 0 };
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

export function parseLabelText(inputText: string): ParsedLabelResult {
  const originalLines = splitLines(inputText);
  const lines = dedupePreserveOrder(originalLines);
  const candidates = buildCandidates(lines);

  const usedIndexes = new Set<number>();

  // 1) inventory / lot éventuel
  const inventory = findInventoryNumber(lines);
  if (inventory.raw) {
    const idx = lines.findIndex((l) => l === inventory.raw);
    if (idx >= 0) usedIndexes.add(idx);
  }

  // 2) artiste = première ligne valide après bruit
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

  // 3) titre = première ligne valide après l’artiste
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

    // évite de prendre une date / vente
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

    // évite qu’un lot numeric ou une date seule devienne titre
    if (!title || isShortNumericLot(title) || /^(17|18|19|20)\d{2}$/.test(title)) {
      titleRaw = null;
      title = null;
      titleConfidence = 0;
      continue;
    }

    usedIndexes.add(c.index);
    break;
  }

  // 4) medium = première ligne medium
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

  // 5) dimensions
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

  // 6) année si pas déjà trouvée dans le titre
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

  // 7) notes = reste utile
  const noteLines = lines.filter((line, idx) => {
    if (usedIndexes.has(idx)) return false;
    if (isHardNoise(line)) return false;
    if (isDateOnlyLine(line)) return false;
    if (isArtistBioLine(line)) return false;

    // on garde les lignes de signature/édition dans les notes
    return true;
  });

  const notesRaw = noteLines.length ? noteLines.join(" | ") : null;
  const notes = notesRaw;
  const notesConfidence = notes ? 0.7 : 0;

  // 8) si titre/artiste manquants, fallback intelligent

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



if (!title) {
  const fallbackTitle = lines.find(
    (line, idx) =>
      idx !== (artistRaw ? lines.findIndex((l) => l === artistRaw) : -1) &&
      !isHardNoise(line) &&
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


  // 9) évite quelques faux positifs bien connus
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
    inventory_number_raw: inventory.raw,
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
      inventory_number: inventory.raw,
      notes,
    },
  };

  const confidence: ParsedConfidence = {
    artist_name: artistConfidence,
    title: titleConfidence,
    year: yearConfidence,
    medium: mediumConfidence,
    dimensions: dimensionsConfidence,
    inventory_number: inventory.confidence,
    notes: notesConfidence,
  };

  console.log("[parseLabelText] usedIndexes final =", Array.from(usedIndexes));
  console.log("[parseLabelText] noteLines =", noteLines);

  return {
    parsedData,
    confidence,
  };
}
