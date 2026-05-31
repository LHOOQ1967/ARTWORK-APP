
"use client";

import React, { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ArtworkImportStatus =
  | "pending"
  | "uploaded"
  | "processing"
  | "parsed"
  | "validated"
  | "converted"
  | "failed"
  | "rejected";

type ArtworkImportRow = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  status: ArtworkImportStatus;
  source_type: "label_photo";
  image_path: string | null;
  image_url: string | null;
  ocr_provider: string | null;
  ocr_text: string | null;
  ocr_language: string[];
  parsed_data: Record<string, any>;
  confidence: Record<string, any>;
  artist_match_id: string | null;
  artwork_id: string | null;
  error_message: string | null;
};

type ArtistMatch = {
  id: string;
  name: string;
  score?: number | null;
} | null;


type EditableNormalized = {
  artist_name: string;
  title: string;
  year: string;
  medium: string;
  height_cm: string;
  width_cm: string;
  depth_cm: string;
  asking_price: string;
  currency: string;
  estimate_low: string;
  estimate_high: string;
  auction_currency: string;
  notes: string;
};

function formatConfidence(value: unknown): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(normalized)} %`;
}

function confidenceColor(value: unknown): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "#666";
  const normalized = value <= 1 ? value * 100 : value;
  if (normalized >= 85) return "#0a7a34";
  if (normalized >= 65) return "#9a6b00";
  return "#a12622";
}

function getNormalized(importRow: ArtworkImportRow | null): Record<string, any> {
  return importRow?.parsed_data?.normalized ?? {};
}

function safeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}


function normalizeForEdit(importRow: ArtworkImportRow | null): EditableNormalized {
  const normalized = getNormalized(importRow);

  return {
    artist_name: safeString(normalized.artist_name),
    title: safeString(normalized.title),
    year: safeString(normalized.year),
    medium: safeString(normalized.medium),
    height_cm: safeString(normalized.height_cm),
    width_cm: safeString(normalized.width_cm),
    depth_cm:
      normalized.depth_cm === null || normalized.depth_cm === undefined
        ? ""
        : safeString(normalized.depth_cm),

    asking_price: safeString(normalized.asking_price),
    currency: safeString(normalized.currency),
    estimate_low: safeString(normalized.estimate_low),
    estimate_high: safeString(normalized.estimate_high),
    auction_currency: safeString(normalized.auction_currency),

    notes: safeString(normalized.notes),
  };
}


function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "Merci de sélectionner ou coller une image.";
  }

  const maxBytes = 15 * 1024 * 1024;
  if (file.size > maxBytes) {
    return "L’image est trop lourde. Merci de choisir une image de moins de 15 MB.";
  }

  return null;
}


function buildDimensionsLabel(editable: EditableNormalized): string {
  const h = String(editable.height_cm ?? "").trim();
  const w = String(editable.width_cm ?? "").trim();
  const d = String(editable.depth_cm ?? "").trim();

  const parts = [h, w, d].filter((v) => v !== "" && v !== "0");

  if (!parts.length) return "";
  return `${parts.join(" x ")} cm`;
}



function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed
    .replace(/\s/g, "")
    .replace(/'/g, "")
    .replace(",", ".");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}



function buildPrefillPayload(importRow: ArtworkImportRow, edited: EditableNormalized) {
  const heightCm = toNullableNumber(edited.height_cm);
  const widthCm = toNullableNumber(edited.width_cm);
  const depthCm = toNullableNumber(edited.depth_cm);

  const dimensionsParts = [heightCm, widthCm, depthCm].filter(
    (v) => v !== null && v !== 0
  ) as number[];

  return {
    import_id: importRow.id,
    artist_name: edited.artist_name.trim() || null,
    title: edited.title.trim() || null,
    year: toNullableNumber(edited.year),
    medium: edited.medium.trim() || null,

    height_cm: heightCm,
    width_cm: widthCm,
    depth_cm: depthCm,

    dimensions:
      heightCm !== null && widthCm !== null
        ? `${dimensionsParts.join(" x ")} cm`
        : null,

    asking_price: toNullableNumber(edited.asking_price),
    currency: edited.currency.trim() || null,

    estimate_low: toNullableNumber(edited.estimate_low),
    estimate_high: toNullableNumber(edited.estimate_high),
    auction_currency: edited.auction_currency.trim() || null,

    notes: edited.notes.trim() || null,
    source: "import-label-manual-edit",
  };
}


export default function ImportLabelPage() {
  const router = useRouter();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [importRow, setImportRow] = useState<ArtworkImportRow | null>(null);
  const [artistMatch, setArtistMatch] = useState<ArtistMatch>(null);


const [edited, setEdited] = useState<EditableNormalized>({
  artist_name: "",
  title: "",
  year: "",
  medium: "",
  height_cm: "",
  width_cm: "",
  depth_cm: "",
  asking_price: "",
  currency: "",
  estimate_low: "",
  estimate_high: "",
  auction_currency: "",
  notes: "",
});


  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  const normalized = useMemo(() => getNormalized(importRow), [importRow]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  useEffect(() => {
    setEdited(normalizeForEdit(importRow));
  }, [importRow]);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (isUploading || isAnalyzing) return;

      const items = event.clipboardData?.items;
      if (!items?.length) return;

      for (const item of Array.from(items)) {
        if (!item.type.startsWith("image/")) continue;

        const blob = item.getAsFile();
        if (!blob) continue;

        event.preventDefault();

        const extension = blob.type.split("/")[1] || "png";
        const fileName = `clipboard-image-${Date.now()}.${extension}`;
        const file = new File([blob], fileName, {
          type: blob.type || "image/png",
          lastModified: Date.now(),
        });

        const validationError = validateImageFile(file);
        if (validationError) {
          setErrorMessage(validationError);
          setInfoMessage("");
          return;
        }

        setSelectedFile(file);
        setImportRow(null);
        setArtistMatch(null);
        setErrorMessage("");
        setInfoMessage("Image collée depuis le presse-papier. Vous pouvez maintenant l’envoyer.");
        return;
      }
    }

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [isUploading, isAnalyzing]);

  function resetMessages() {
    setErrorMessage("");
    setInfoMessage("");
  }

  function handleSetSelectedFile(file: File | null) {
    resetMessages();

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const validationError = validateImageFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setImportRow(null);
    setArtistMatch(null);
    setInfoMessage("Image prête. Vous pouvez maintenant l’envoyer.");
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    handleSetSelectedFile(file);
  }

  function handleEditChange(field: keyof EditableNormalized, value: string) {
    setEdited((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function handleResetDetectedValues() {
    setEdited(normalizeForEdit(importRow));
    setInfoMessage("Les valeurs détectées ont été réappliquées.");
    setErrorMessage("");
  }

  async function handleUpload() {
    resetMessages();

    if (!selectedFile) {
      setErrorMessage("Merci de choisir, prendre ou coller une image avant l’envoi.");
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/artwork-imports", {
        method: "POST",
        body: formData,
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || "Échec de l’envoi de l’image.");
      }

      setImportRow(json.import);
      setArtistMatch(null);
      setInfoMessage("Image envoyée avec succès. Vous pouvez lancer l’analyse.");
    } catch (error: any) {
      setErrorMessage(error?.message || "Erreur inattendue pendant l’envoi.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleAnalyze() {
    resetMessages();

    if (!importRow?.id) {
      setErrorMessage("Merci d’envoyer une image avant de lancer l’analyse.");
      return;
    }

    setIsAnalyzing(true);

    try {
      const response = await fetch(`/api/artwork-imports/${importRow.id}/analyze`, {
        method: "POST",
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || "Échec de l’analyse.");
      }

      setImportRow(json.import);
      setArtistMatch(json.artistMatch ?? null);
      setInfoMessage(
        "Analyse terminée. Vous pouvez corriger les champs détectés avant d’ouvrir le formulaire."
      );
    } catch (error: any) {
      setErrorMessage(error?.message || "Erreur inattendue pendant l’analyse.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleOpenCreateForm() {
    if (!importRow?.id) {
      setErrorMessage("Aucun import disponible.");
      return;
    }

    try {
      const payload = buildPrefillPayload(importRow, edited);
      sessionStorage.setItem(
        `artwork_import_prefill_${importRow.id}`,
        JSON.stringify(payload)
      );
    } catch (error) {
      console.error("[IMPORT_LABEL] sessionStorage error =", error);
    }

    router.push(`/artworks/new?import_id=${encodeURIComponent(importRow.id)}`);
  }


function handleResetAll() {
  resetMessages();
  setSelectedFile(null);
  setPreviewUrl("");
  setImportRow(null);
  setArtistMatch(null);
  setEdited({
    artist_name: "",
    title: "",
    year: "",
    medium: "",
    height_cm: "",
    width_cm: "",
    depth_cm: "",
    asking_price: "",
    currency: "",
    estimate_low: "",
    estimate_high: "",
    auction_currency: "",
    notes: "",
  });
}


  const canAnalyze = !!importRow?.id && !isUploading && !isAnalyzing;
  const canOpenCreateForm =
    !!importRow?.id &&
    (importRow.status === "parsed" ||
      importRow.status === "validated" ||
      !!importRow.parsed_data?.normalized);

  return (
    <main
      style={{
        paddingTop: 80,
        paddingLeft: 10,
        paddingRight: 10,
        paddingBottom: 10,
        minHeight: "100vh",
        background: "#006039",
      }}
    >
      <div style={styles.container}>
        <div style={styles.headerCard}>
          <h1 style={styles.title}>Importer une étiquette</h1>
          <p style={styles.subtitle}>
            Prenez une photo de l’étiquette avec l’iPhone, ou collez une image depuis le
            presse-papier, envoyez-la, lancez l’analyse, corrigez les champs si nécessaire,
            puis ouvrez le formulaire de création prérempli.
          </p>
        </div>

        {(errorMessage || infoMessage) && (
          <div
            style={{
              ...styles.messageBox,
              ...(errorMessage ? styles.errorBox : styles.infoBox),
            }}
          >
            {errorMessage || infoMessage}
          </div>
        )}

        
          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>1. Photo de l’étiquette</h2>

            <label style={styles.label}>Choisir, prendre ou coller une photo</label>

            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              style={styles.fileInput}
            />

            <div style={styles.pasteHintBox}>
              <strong>Astuce :</strong> vous pouvez aussi <strong>coller</strong> une image
              copiée dans le presse-papier avec <strong>Cmd+V</strong> (Mac) ou{" "}
              <strong>Ctrl+V</strong> (Windows).
            </div>

            <p style={styles.helpText}>
              Sur iPhone, ce champ ouvre en général directement la caméra arrière.
            </p>

            {selectedFile && (
              <div style={styles.fileMeta}>
                <div>
                  <strong>Fichier :</strong> {selectedFile.name}
                </div>
                <div>
                  <strong>Taille :</strong>{" "}
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </div>
                <div>
                  <strong>Type :</strong> {selectedFile.type || "image/*"}
                </div>
              </div>
            )}

            {(previewUrl || importRow?.image_url) && (
              <div style={styles.previewWrapper}>
                <img
                  src={previewUrl || importRow?.image_url || ""}
                  alt="Prévisualisation de l’étiquette"
                  style={styles.previewImage}
                />
              </div>
            )}

            <div style={styles.buttonRow}>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!selectedFile || isUploading || isAnalyzing}
                style={{
                  ...styles.primaryButton,
                  ...((!selectedFile || isUploading || isAnalyzing)
                    ? styles.buttonDisabled
                    : {}),
                }}
              >
                {isUploading ? "Envoi en cours..." : "Envoyer l’image"}
              </button>

              <button
                type="button"
                onClick={handleResetAll}
                disabled={isUploading || isAnalyzing}
                style={{
                  ...styles.secondaryButton,
                  ...((isUploading || isAnalyzing) ? styles.buttonDisabled : {}),
                }}
              >
                Réinitialiser
              </button>
            </div>
          </section>

          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>2. Analyse</h2>

            <div style={styles.statusBox}>
              <div>
                <strong>Import ID :</strong> {importRow?.id ?? "—"}
              </div>
              <div>
                <strong>Statut :</strong> {importRow?.status ?? "—"}
              </div>
              <div>
                <strong>Provider OCR :</strong> {importRow?.ocr_provider ?? "—"}
              </div>
            </div>

            <div style={styles.buttonRow}>
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                style={{
                  ...styles.primaryButton,
                  ...(!canAnalyze ? styles.buttonDisabled : {}),
                }}
              >
                {isAnalyzing ? "Analyse en cours..." : "Analyser l’étiquette"}
              </button>

              <button
                type="button"
                onClick={handleOpenCreateForm}
                disabled={!canOpenCreateForm || isUploading || isAnalyzing}
                style={{
                  ...styles.successButton,
                  ...((!canOpenCreateForm || isUploading || isAnalyzing)
                    ? styles.buttonDisabled
                    : {}),
                }}
              >
                Ouvrir dans le formulaire
              </button>
            </div>

            <p style={styles.helpText}>
              Avant de cliquer sur <strong>Ouvrir dans le formulaire</strong>, vous pouvez
              corriger les champs détectés dans la section 3. Les corrections seront
              transmises au formulaire de création.
            </p>
          </section>
        

        <section style={styles.card}>
          <div style={styles.sectionHeaderInline}>
            <h2 style={styles.sectionTitleNoMargin}>3. Résultats détectés et correction</h2>

            <button
              type="button"
              onClick={handleResetDetectedValues}
              disabled={!importRow || isUploading || isAnalyzing}
              style={{
                ...styles.secondaryButtonSmall,
                ...((!importRow || isUploading || isAnalyzing) ? styles.buttonDisabled : {}),
              }}
            >
              Réappliquer les valeurs détectées
            </button>
          </div>

          {!importRow && (
            <div style={styles.emptyState}>
              Envoyez d’abord une image pour créer un import.
            </div>
          )}

          {importRow && (
            <>
              <div style={styles.resultsGrid}>
                <div style={styles.resultsColumn}>
                  <h3 style={styles.subTitle}>Champs éditables</h3>

                  <EditableFieldRow
                    label="Artiste détecté"
                    value={edited.artist_name}
                    onChange={(value) => handleEditChange("artist_name", value)}
                    confidence={importRow.confidence?.artist_name}
                    placeholder="Nom de l’artiste"
                  />

                  <EditableFieldRow
                    label="Titre"
                    value={edited.title}
                    onChange={(value) => handleEditChange("title", value)}
                    confidence={importRow.confidence?.title}
                    placeholder="Titre de l’œuvre"
                  />

                  <EditableFieldRow
                    label="Année"
                    value={edited.year}
                    onChange={(value) => handleEditChange("year", value)}
                    confidence={importRow.confidence?.year}
                    placeholder="Année"
                  />

                  <EditableFieldRow
                    label="Medium / technique"
                    value={edited.medium}
                    onChange={(value) => handleEditChange("medium", value)}
                    confidence={importRow.confidence?.medium}
                    placeholder="Technique / medium"
                  />

                  <div style={styles.resultRow}>
                    <div style={styles.resultHeader}>
                      <span style={styles.resultLabel}>Dimensions (cm)</span>
                      <span
                        style={{
                          ...styles.confidenceBadge,
                          color: confidenceColor(importRow.confidence?.dimensions),
                          borderColor: confidenceColor(importRow.confidence?.dimensions),
                        }}
                      >
                        {formatConfidence(importRow.confidence?.dimensions)}
                      </span>
                    </div>

                    <div style={styles.dimensionsGrid}>
                      <div>
                        <label style={styles.miniLabel}>Hauteur</label>
                        <input
                          type="text"
                          value={edited.height_cm}
                          onChange={(e) => handleEditChange("height_cm", e.target.value)}
                          style={styles.textInput}
                          placeholder="hauteur"
                        />
                      </div>

                      <div>
                        <label style={styles.miniLabel}>Largeur</label>
                        <input
                          type="text"
                          value={edited.width_cm}
                          onChange={(e) => handleEditChange("width_cm", e.target.value)}
                          style={styles.textInput}
                          placeholder="largeur"
                        />
                      </div>

                      <div>
                        <label style={styles.miniLabel}>Profondeur</label>
                        <input
                          type="text"
                          value={edited.depth_cm}
                          onChange={(e) => handleEditChange("depth_cm", e.target.value)}
                          style={styles.textInput}
                          placeholder="profondeur"
                        />
                      </div>
                    </div>

                    <div style={styles.computedDimensions}>
                      <strong>Dimensions formatées :</strong>{" "}
                      {buildDimensionsLabel(edited) || "—"}
                    </div>
                  </div>


<EditableFieldRow
  label="Prix demandé"
  value={edited.asking_price}
  onChange={(value) => handleEditChange("asking_price", value)}
  confidence={importRow.confidence?.asking_price}
  placeholder="Montant"
/>

<EditableFieldRow
  label="Devise prix demandé"
  value={edited.currency}
  onChange={(value) => handleEditChange("currency", value)}
  confidence={importRow.confidence?.currency}
  placeholder="CHF / EUR / USD / GBP / HKD"
/>

<div style={styles.resultRow}>
  <div style={styles.resultHeader}>
    <span style={styles.resultLabel}>Estimation vente aux enchères</span>
    <span
      style={{
        ...styles.confidenceBadge,
        color: confidenceColor(importRow.confidence?.estimate_low),
        borderColor: confidenceColor(importRow.confidence?.estimate_low),
      }}
    >
      {formatConfidence(importRow.confidence?.estimate_low)}
    </span>
  </div>

  <div style={styles.dimensionsGrid}>
    <div>
      <label style={styles.miniLabel}>Bas</label>
      <input
        type="text"
        value={edited.estimate_low}
        onChange={(e) => handleEditChange("estimate_low", e.target.value)}
        style={styles.textInput}
        placeholder="Estimate low"
      />
    </div>

    <div>
      <label style={styles.miniLabel}>Haut</label>
      <input
        type="text"
        value={edited.estimate_high}
        onChange={(e) => handleEditChange("estimate_high", e.target.value)}
        style={styles.textInput}
        placeholder="Estimate high"
      />
    </div>

    <div>
      <label style={styles.miniLabel}>Devise</label>
      <input
        type="text"
        value={edited.auction_currency}
        onChange={(e) => handleEditChange("auction_currency", e.target.value)}
        style={styles.textInput}
        placeholder="CHF / EUR / USD / GBP / HKD"
      />
    </div>
  </div>
</div>


                  <EditableFieldRow
                    label="Notes"
                    value={edited.notes}
                    onChange={(value) => handleEditChange("notes", value)}
                    confidence={importRow.confidence?.notes}
                    placeholder="Notes"
                    multiline
                  />
                </div>

                <div style={styles.resultsColumn}>
                  <h3 style={styles.subTitle}>Informations complémentaires</h3>

                  <div style={styles.matchBox}>
                    <div style={styles.matchTitle}>Valeurs détectées à l’origine</div>
                    <div style={styles.matchLine}>
                      <strong>Artiste :</strong> {safeString(normalized.artist_name) || "—"}
                    </div>
                    <div style={styles.matchLine}>
                      <strong>Titre :</strong> {safeString(normalized.title) || "—"}
                    </div>
                    <div style={styles.matchLine}>
                      <strong>Année :</strong> {safeString(normalized.year) || "—"}
                    </div>
                    <div style={styles.matchLine}>
                      <strong>Medium :</strong> {safeString(normalized.medium) || "—"}
                    </div>
                    <div style={styles.matchLine}>
                      <strong>Dimensions :</strong> {safeString(normalized.dimensions) || "—"}
                    </div>
                    <div style={styles.matchLine}>
                      <strong>Prix demandé :</strong> {safeString(normalized.asking_price) || "—"}
                    </div>
                    <div style={styles.matchLine}>
                      <strong>Devise :</strong> {safeString(normalized.currency) || "—"}
                    </div>
                    <div style={styles.matchLine}>
                      <strong>Estimate low :</strong> {safeString(normalized.estimate_low) || "—"}
                    </div>
                    <div style={styles.matchLine}>
                      <strong>Estimate high :</strong> {safeString(normalized.estimate_high) || "—"}
                    </div>
                    <div style={styles.matchLine}>
                      <strong>Devise enchères :</strong> {safeString(normalized.auction_currency) || "—"}
                    </div>
                  </div>

                  <h3 style={{ ...styles.subTitle, marginTop: 18 }}>Matching artiste</h3>

                  {!artistMatch && !importRow.artist_match_id && (
                    <div style={styles.emptySmall}>
                      Aucun matching artiste disponible pour l’instant.
                    </div>
                  )}

                  {(artistMatch || importRow.artist_match_id) && (
                    <div style={styles.matchBox}>
                      <div className="matchLine">
                        <strong>Artist ID :</strong>{" "}
                        {artistMatch?.id || importRow.artist_match_id || "—"}
                      </div>
                      <div className="matchLine">
                        <strong>Nom proposé :</strong>{" "}
                        {artistMatch?.name || safeString(normalized.artist_name) || "—"}
                      </div>
                      <div className="matchLine">
                        <strong>Score :</strong>{" "}
                        {artistMatch?.score !== undefined && artistMatch?.score !== null
                          ? formatConfidence(artistMatch.score)
                          : "—"}
                      </div>
                    </div>
                  )}

                  <h3 style={{ ...styles.subTitle, marginTop: 18 }}>Langues OCR</h3>
                  <div style={styles.tagsWrap}>
                    {importRow.ocr_language?.length ? (
                      importRow.ocr_language.map((lang) => (
                        <span key={lang} style={styles.tag}>
                          {lang}
                        </span>
                      ))
                    ) : (
                      <span style={styles.emptySmall}>Aucune langue détectée.</span>
                    )}
                  </div>
                </div>
              </div>

              <div style={styles.textBlocksGrid}>
                <div style={styles.textBlock}>
                  <h3 style={styles.subTitle}>Texte OCR brut</h3>
                  <textarea
                    readOnly
                    value={importRow.ocr_text ?? ""}
                    style={styles.textarea}
                    placeholder="Le texte OCR apparaîtra ici après analyse."
                  />
                </div>

                <div style={styles.textBlock}>
                  <h3 style={styles.subTitle}>JSON parsed_data</h3>
                  <pre style={styles.pre}>
                    {JSON.stringify(importRow.parsed_data ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

type EditableFieldRowProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  confidence?: unknown;
  placeholder?: string;
  multiline?: boolean;
};

function EditableFieldRow({
  label,
  value,
  onChange,
  confidence,
  placeholder = "",
  multiline = false,
}: EditableFieldRowProps) {
  return (
    <div style={styles.resultRow}>
      <div style={styles.resultHeader}>
        <span style={styles.resultLabel}>{label}</span>
        <span
          style={{
            ...styles.confidenceBadge,
            color: confidenceColor(confidence),
            borderColor: confidenceColor(confidence),
          }}
        >
          {formatConfidence(confidence)}
        </span>
      </div>

      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={styles.textareaSmall}
          placeholder={placeholder}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={styles.textInput}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: "1200px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  headerCard: {
    background: "#ffffff",
    border: "1px solid #d9e1e7",
    borderRadius: "12px",
    padding: "22px 24px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },
  title: {
    margin: 0,
    fontSize: "28px",
    lineHeight: 1.2,
    color: "#183247",
  },
  subtitle: {
    margin: "10px 0 0 0",
    fontSize: "15px",
    lineHeight: 1.5,
    color: "#4b5b68",
  },
  messageBox: {
    borderRadius: "10px",
    padding: "14px 16px",
    fontSize: "14px",
    lineHeight: 1.45,
  },
  errorBox: {
    background: "#fdeceb",
    color: "#8b1e1a",
    border: "1px solid #f3c8c5",
  },
  infoBox: {
    background: "#edf6ff",
    color: "#114a7a",
    border: "1px solid #cfe5fb",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
  },
  card: {
    background: "#ffffff",
    border: "1px solid #d9e1e7",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },
  sectionHeaderInline: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "18px",
    flexWrap: "wrap",
  },
  sectionTitle: {
    margin: "0 0 18px 0",
    fontSize: "20px",
    color: "#183247",
  },
  sectionTitleNoMargin: {
    margin: 0,
    fontSize: "20px",
    color: "#183247",
  },
  subTitle: {
    margin: "0 0 12px 0",
    fontSize: "16px",
    color: "#183247",
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#314452",
  },
  fileInput: {
    display: "block",
    width: "100%",
    padding: "10px",
    border: "1px solid #c7d2db",
    borderRadius: "8px",
    background: "#fff",
    fontSize: "14px",
  },
  pasteHintBox: {
    marginTop: "12px",
    padding: "12px 14px",
    borderRadius: "8px",
    background: "#f5f9ff",
    border: "1px solid #d6e6fb",
    color: "#224a73",
    fontSize: "13px",
    lineHeight: 1.5,
  },
  helpText: {
    marginTop: "10px",
    marginBottom: 0,
    color: "#627482",
    fontSize: "13px",
    lineHeight: 1.45,
  },
  fileMeta: {
    marginTop: "14px",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #e0e6eb",
    background: "#f8fafc",
    fontSize: "13px",
    lineHeight: 1.6,
    color: "#314452",
  },
  previewWrapper: {
    marginTop: "16px",
    borderRadius: "10px",
    overflow: "hidden",
    border: "1px solid #d9e1e7",
    background: "#f8fafc",
  },
  previewImage: {
    display: "block",
    width: "100%",
    maxHeight: "460px",
    objectFit: "contain",
    background: "#f8fafc",
  },
  buttonRow: {
    marginTop: "18px",
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },
  primaryButton: {
    background: "#0d5ea8",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    padding: "11px 16px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryButton: {
    background: "#ffffff",
    color: "#314452",
    border: "1px solid #c7d2db",
    borderRadius: "8px",
    padding: "11px 16px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryButtonSmall: {
    background: "#ffffff",
    color: "#314452",
    border: "1px solid #c7d2db",
    borderRadius: "8px",
    padding: "9px 12px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  successButton: {
    background: "#0a7a34",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    padding: "11px 16px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  buttonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },
  statusBox: {
    padding: "14px",
    borderRadius: "8px",
    border: "1px solid #e0e6eb",
    background: "#f8fafc",
    fontSize: "14px",
    lineHeight: 1.7,
    color: "#314452",
  },
  emptyState: {
    padding: "18px",
    borderRadius: "8px",
    border: "1px dashed #c7d2db",
    background: "#fafcfd",
    color: "#627482",
    fontSize: "14px",
  },
  resultsGrid: {
    display: "grid",
    gridTemplateColumns: "1.15fr 0.85fr",
    gap: "20px",
  },
  resultsColumn: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  resultRow: {
    border: "1px solid #e0e6eb",
    borderRadius: "10px",
    padding: "12px 14px",
    background: "#fbfcfd",
  },
  resultHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "8px",
  },
  resultLabel: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#314452",
  },
  confidenceBadge: {
    display: "inline-block",
    minWidth: "54px",
    textAlign: "center",
    fontSize: "12px",
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: "999px",
    border: "1px solid currentColor",
    background: "#ffffff",
  },
  textInput: {
    width: "100%",
    border: "1px solid #c7d2db",
    borderRadius: "8px",
    padding: "10px 12px",
    fontSize: "14px",
    lineHeight: 1.4,
    color: "#183247",
    background: "#ffffff",
    outline: "none",
    boxSizing: "border-box",
  },
  textareaSmall: {
    width: "100%",
    minHeight: "90px",
    resize: "vertical",
    border: "1px solid #c7d2db",
    borderRadius: "8px",
    padding: "10px 12px",
    fontFamily: "inherit",
    fontSize: "14px",
    lineHeight: 1.5,
    color: "#183247",
    background: "#ffffff",
    boxSizing: "border-box",
  },
  dimensionsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "10px",
  },
  miniLabel: {
    display: "block",
    fontSize: "12px",
    color: "#627482",
    marginBottom: "6px",
  },
  computedDimensions: {
    marginTop: "10px",
    fontSize: "13px",
    color: "#314452",
  },
  matchBox: {
    border: "1px solid #d9e1e7",
    borderRadius: "10px",
    padding: "14px",
    background: "#f8fafc",
    fontSize: "14px",
    lineHeight: 1.7,
    color: "#314452",
  },
  matchTitle: {
    fontWeight: 700,
    marginBottom: "8px",
    color: "#183247",
  },
  matchLine: {
    marginBottom: "4px",
  },
  tagsWrap: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  tag: {
    display: "inline-block",
    borderRadius: "999px",
    padding: "6px 10px",
    background: "#eef4f8",
    border: "1px solid #d5e0e8",
    color: "#314452",
    fontSize: "12px",
    fontWeight: 600,
  },
  emptySmall: {
    color: "#7a8995",
    fontSize: "13px",
  },
  textBlocksGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    marginTop: "22px",
  },
  textBlock: {
    display: "flex",
    flexDirection: "column",
  },
  textarea: {
    width: "100%",
    minHeight: "280px",
    resize: "vertical",
    border: "1px solid #c7d2db",
    borderRadius: "10px",
    padding: "12px",
    fontFamily: "inherit",
    fontSize: "14px",
    lineHeight: 1.5,
    color: "#183247",
    background: "#fff",
    boxSizing: "border-box",
  },
  pre: {
    margin: 0,
    minHeight: "280px",
    maxHeight: "420px",
    overflow: "auto",
    border: "1px solid #c7d2db",
    borderRadius: "10px",
    padding: "12px",
    background: "#0f1720",
    color: "#d7e0e8",
    fontSize: "12px",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    boxSizing: "border-box",
  },
};
