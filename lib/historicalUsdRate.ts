import type { HistoricalUsdRate } from "@/lib/inventoryCurrency";

export function isHistoricalRateRequest(currency: string, date: string) {
  if (!/^[A-Z]{3}$/.test(currency) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === date
    && date <= new Date().toISOString().slice(0, 10);
}

export async function fetchHistoricalUsdRate(currency: string, date: string): Promise<HistoricalUsdRate> {
  if (!isHistoricalRateRequest(currency, date)) throw new Error("Invalid currency or purchase date");
  if (currency === "USD") return { date, rate: 1 };

  const response = await fetch(
    `https://api.frankfurter.dev/v2/rate/${currency.toLowerCase()}/usd?date=${date}&providers=ecb`,
    { next: { revalidate: 86400 }, signal: AbortSignal.timeout(15000) }
  );
  if (!response.ok) throw new Error(`Historical ECB exchange rate unavailable (${response.status})`);
  const data: unknown = await response.json();
  if (
    typeof data !== "object" || data === null
    || !("date" in data) || typeof data.date !== "string"
    || !isHistoricalRateRequest(currency, data.date) || data.date > date
    || !("base" in data) || data.base !== currency
    || !("quote" in data) || data.quote !== "USD"
    || !("rate" in data) || typeof data.rate !== "number"
    || !Number.isFinite(data.rate) || data.rate <= 0
  ) throw new Error("Invalid historical ECB exchange rate response");
  return { date: data.date, rate: data.rate };
}
