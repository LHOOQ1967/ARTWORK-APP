
// lib/imports/ocr.ts

export type OcrWord = {
  text: string;
  confidence?: number;
  boundingPolygon?: Array<{ x: number; y: number }>;
};

export type OcrLine = {
  text: string;
  words: OcrWord[];
  boundingPolygon?: Array<{ x: number; y: number }>;
};

export type OcrBlock = {
  lines: OcrLine[];
};

export type RunLabelOcrResult = {
  provider: "azure-vision-image-analysis-4.0";
  languages: string[];
  modelVersion?: string;
  text: string;
  lines: OcrLine[];
  blocks: OcrBlock[];
  raw?: unknown;
};

type AzureReadWord = {
  text?: string;
  confidence?: number;
  boundingPolygon?: Array<{ x: number; y: number }>;
};

type AzureReadLine = {
  text?: string;
  words?: AzureReadWord[];
  boundingPolygon?: Array<{ x: number; y: number }>;
};

type AzureReadBlock = {
  lines?: AzureReadLine[];
};

type AzureImageAnalysisResponse = {
  modelVersion?: string;
  readResult?: {
    blocks?: AzureReadBlock[];
  };
  [key: string]: unknown;
};

function getAzureVisionConfig() {
  const endpoint = process.env.AZURE_VISION_ENDPOINT?.trim();
  const key = process.env.AZURE_VISION_KEY?.trim();

  if (!endpoint) {
    throw new Error(
      "AZURE_VISION_ENDPOINT manquant. Ajoute-le dans .env.local et/ou .env.production"
    );
  }

  if (!key) {
    throw new Error(
      "AZURE_VISION_KEY manquant. Ajoute-le dans .env.local et/ou .env.production"
    );
  }

  return {
    endpoint: endpoint.endsWith("/") ? endpoint : `${endpoint}/`,
    key,
  };
}

function buildAnalyzeUrl(endpoint: string) {
  const url = new URL("computervision/imageanalysis:analyze", endpoint);

  // Azure recommande l’API Image Analysis 4.0 avec OCR synchrone
  // pour les images de type étiquette / photo / screenshot / poster.
  url.searchParams.set("features", "read");
  url.searchParams.set("api-version", "2024-02-01");

  return url.toString();
}

function normalizeAzureReadResult(data: AzureImageAnalysisResponse): RunLabelOcrResult {
  const blocks: OcrBlock[] = (data.readResult?.blocks ?? []).map((block) => ({
    lines: (block.lines ?? []).map((line) => ({
      text: line.text ?? "",
      boundingPolygon: line.boundingPolygon,
      words: (line.words ?? []).map((word) => ({
        text: word.text ?? "",
        confidence: word.confidence,
        boundingPolygon: word.boundingPolygon,
      })),
    })),
  }));

  const lines = blocks.flatMap((block) => block.lines);

  const text = lines
    .map((line) => line.text)
    .filter(Boolean)
    .join("\n")
    .trim();

  return {
    provider: "azure-vision-image-analysis-4.0",
    languages: [],
    modelVersion: data.modelVersion,
    text,
    lines,
    blocks,
    raw: data,
  };
}

async function parseAzureError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    const message =
      (data as any)?.error?.message ||
      (data as any)?.message ||
      JSON.stringify(data);

    return `Azure Vision OCR a répondu ${response.status} ${response.statusText} : ${message}`;
  } catch {
    const text = await response.text().catch(() => "");
    return `Azure Vision OCR a répondu ${response.status} ${response.statusText}${text ? ` : ${text}` : ""}`;
  }
}

/**
 * OCR d'une image accessible publiquement par URL.
 */
export async function runLabelOcr(imageUrl: string): Promise<RunLabelOcrResult> {
  if (!imageUrl?.trim()) {
    throw new Error("runLabelOcr: imageUrl manquante");
  }

  const { endpoint, key } = getAzureVisionConfig();
  const url = buildAnalyzeUrl(endpoint);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: imageUrl,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseAzureError(response));
  }

  const data = (await response.json()) as AzureImageAnalysisResponse;
  return normalizeAzureReadResult(data);
}

/**
 * Variante buffer si un jour tu veux OCR une image privée
 * téléchargée côté serveur depuis Supabase Storage.
 */
export async function runLabelOcrFromBuffer(
  buffer: Buffer,
  contentType = "application/octet-stream"
): Promise<RunLabelOcrResult> {
  if (!buffer || buffer.length === 0) {
    throw new Error("runLabelOcrFromBuffer: buffer vide ou manquant");
  }

  const { endpoint, key } = getAzureVisionConfig();
  const url = buildAnalyzeUrl(endpoint);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": contentType,
    },
    body: new Uint8Array(buffer),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseAzureError(response));
  }

  const data = (await response.json()) as AzureImageAnalysisResponse;
  return normalizeAzureReadResult(data);
}
