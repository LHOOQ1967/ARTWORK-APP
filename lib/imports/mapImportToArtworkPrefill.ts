
export type ArtworkImportRow = {
  id: string;
  artist_match_id: string | null;
  parsed_data?: Record<string, any> | null;
  confidence?: Record<string, any> | null;
};

export type ArtworkPrefill = {
  import_id?: string;

  artist_id: string;
  title: string;
  year: string;
  medium: string;
  dimensions: string;
  notes: string;

  // dimensions détaillées si tu veux les exploiter séparément
  height_cm: string;
  width_cm: string;
  depth_cm: string;

  // utile si tu as un champ de référence / inventaire
  inventory_number: string;

  // statut MVP
  status: string;
};

function toSafeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numberToString(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  return String(value).trim();
}

/**
 * Transforme une ligne artwork_imports en objet de préremplissage
 * compatible avec le formulaire de création d’œuvre.
 */
export function mapImportToArtworkPrefill(importRow: ArtworkImportRow | null | undefined): ArtworkPrefill {
  const normalized = importRow?.parsed_data?.normalized ?? {};

  return {
    import_id: importRow?.id ?? "",

    // artiste matché automatiquement
    artist_id: toSafeString(importRow?.artist_match_id),

    // champs principaux
    title: toSafeString(normalized.title),
    year: numberToString(normalized.year),
    medium: toSafeString(normalized.medium),
    dimensions: toSafeString(normalized.dimensions),
    notes: toSafeString(normalized.notes),

    // dimensions détaillées
    height_cm: numberToString(normalized.height_cm),
    width_cm: numberToString(normalized.width_cm),
    depth_cm: numberToString(normalized.depth_cm),

    // référence / inventory number
    inventory_number: toSafeString(normalized.inventory_number),

    // MVP : nouveau draft à valider
    status: "draft",
  };
}

export default mapImportToArtworkPrefill;
