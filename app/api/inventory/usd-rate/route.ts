import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { fetchHistoricalUsdRate, isHistoricalRateRequest } from "@/lib/historicalUsdRate";

export async function GET(request: Request) {
  const authorization = await requireUser(request);
  if (authorization.response) return authorization.response;
  const params = new URL(request.url).searchParams;
  const currency = params.get("currency") ?? "";
  const date = params.get("date") ?? "";
  if (!isHistoricalRateRequest(currency, date)) {
    return NextResponse.json({ error: "Invalid currency or purchase date" }, { status: 400 });
  }
  try {
    return NextResponse.json(await fetchHistoricalUsdRate(currency, date));
  } catch (error) {
    console.error("LOAD HISTORICAL USD RATE ERROR:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Historical USD rate unavailable" },
      { status: 502 }
    );
  }
}
