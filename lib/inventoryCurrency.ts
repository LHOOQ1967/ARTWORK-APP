export type HistoricalUsdRate = {
  date: string;
  rate: number;
};

export function usesUsdInventory(clientLabel?: string | null, buyerLabel?: string | null) {
  const normalize = (label?: string | null) => label?.trim().toLowerCase().replace(/\s+/g, "");
  return normalize(clientLabel) === "yal"
    || normalize(buyerLabel) === "yal"
    || normalize(buyerLabel) === "indianart";
}

export function usdRateKey(currency: string | null, date: string | null) {
  return `${currency ?? ""}:${date?.slice(0, 10) ?? ""}`;
}

export function getUsdInventoryTotal(
  cost: number | null,
  commission: number | null,
  rate: number | null
) {
  if (cost === null || rate === null) return null;
  return (cost + (commission ?? 0)) * rate;
}
