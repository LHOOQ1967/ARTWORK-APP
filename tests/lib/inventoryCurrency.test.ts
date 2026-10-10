import { afterEach, describe, expect, it, vi } from "vitest";
import { usesUsdInventory, getUsdInventoryTotal } from "@/lib/inventoryCurrency";
import { fetchHistoricalUsdRate, isHistoricalRateRequest } from "@/lib/historicalUsdRate";

afterEach(() => vi.unstubAllGlobals());

describe("USD inventory rules", () => {
  it.each([
    ["YAL", null, true],
    [null, "YAL", true],
    [null, "Indianart", true],
    [null, " Indian Art ", true],
    ["Indianart", "Florac", false],
    ["Florac", "Florac", false],
  ])("detects client %s and buyer %s", (client, buyer, expected) => {
    expect(usesUsdInventory(client, buyer)).toBe(expected);
  });

  it("converts only cost plus commission, without fees", () => {
    expect(getUsdInventoryTotal(1000, 80, 1.2)).toBe(1296);
    expect(getUsdInventoryTotal(1000, null, 1)).toBe(1000);
  });

  it("does not replace missing costs or rates with zero", () => {
    expect(getUsdInventoryTotal(null, 80, 1)).toBeNull();
    expect(getUsdInventoryTotal(1000, 80, null)).toBeNull();
    expect(getUsdInventoryTotal(0, null, 1)).toBe(0);
  });
});

describe("historical ECB rates", () => {
  it("rejects invalid, impossible and future dates", () => {
    expect(isHistoricalRateRequest("EUR", "2024-02-30")).toBe(false);
    expect(isHistoricalRateRequest("EUR", "2999-01-01")).toBe(false);
    expect(isHistoricalRateRequest("EUR&base=GBP", "2024-01-01")).toBe(false);
  });

  it("uses a rate of one for USD without a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchHistoricalUsdRate("USD", "2024-05-05"))
      .toEqual({ rate: 1, date: "2024-05-05" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses ECB and retains the last published date before a weekend purchase", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      date: "2024-05-03", base: "EUR", quote: "USD", rate: 1.0765,
    }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchHistoricalUsdRate("EUR", "2024-05-05"))
      .toEqual({ date: "2024-05-03", rate: 1.0765 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.frankfurter.dev/v2/rate/eur/usd?date=2024-05-05&providers=ecb",
      expect.objectContaining({ next: { revalidate: 86400 } })
    );
  });

  it.each([
    { date: "2024-05-06", base: "EUR", quote: "USD", rate: 1.1 },
    { date: "2024-05-03", base: "GBP", quote: "USD", rate: 1.1 },
    { date: "2024-05-03", base: "EUR", quote: "USD", rate: 0 },
    { date: "2024-05-03", base: "EUR", quote: "USD", rate: "1.1" },
  ])("rejects invalid provider data %j", async data => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
    await expect(fetchHistoricalUsdRate("EUR", "2024-05-05"))
      .rejects.toThrow("Invalid historical ECB");
  });

  it("reports unavailable historical data instead of supplying a default", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(fetchHistoricalUsdRate("HKD", "1900-01-01"))
      .rejects.toThrow("unavailable (404)");
  });
});
