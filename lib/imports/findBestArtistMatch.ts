
type SupabaseLikeClient = any;

export type ArtistMatchResult = {
  id: string;
  name: string;
  score: number;
} | null;

type ArtistRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

function buildFullName(a: ArtistRow) {
  return `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  let match = 0;
  const aParts = a.split(" ");
  const bParts = b.split(" ");

  for (const part of aParts) {
    if (bParts.includes(part)) match++;
  }

  return match / Math.max(aParts.length, bParts.length);
}

export async function findBestArtistMatch(
  supabase: SupabaseLikeClient,
  artistName: string
): Promise<ArtistMatchResult> {
  if (!artistName?.trim()) return null;

  const q = normalize(artistName);
  const terms = q.split(" ").filter(Boolean);

  const filters = terms.flatMap((term) => [
    `first_name.ilike.%${term}%`,
    `last_name.ilike.%${term}%`,
  ]);

  const { data, error } = await supabase
    .from("artists")
    .select("id, first_name, last_name")
    .or(filters.join(","))
    .limit(60);

  if (error) {
    console.error("ARTIST MATCH ERROR:", error);
    return null;
  }

  if (!data || data.length === 0) return null;

  let best: ArtistMatchResult = null;

  for (const artist of data as ArtistRow[]) {
    const full = normalize(buildFullName(artist));
    const score = similarity(q, full);

    if (!best || score > best.score) {
      best = {
        id: artist.id,
        name: buildFullName(artist),
        score,
      };
    }
  }

  if (!best || best.score < 0.3) return null;

  return best;
}

export default findBestArtistMatch;
