
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseBrowser";

type InventoryRow = {
  id: string;
  image_url: string | null;
  title: string | null;
  year_execution: string | null;
  date_acquisition: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  cost_amount: number | null;
  cost_currency: string | null;
  purchase_cost: number | null; // toujours en EUR
  commission_blondeau: number | null;
  insurance_currency: string | null;
  insurance_value: number | null;
  total_foreign_currency: number | null; // ignoré côté UI (recalculé)
  fx_rate_to_eur: number | null;
  total_eur: number | null; // ignoré côté UI (recalculé)
};

type SortColumn =
  | "image_url"
  | "date_acquisition"
  | "artist"
  | "title"
  | "company_name"
  | "cost_amount"
  | "purchase_cost"
  | "commission_blondeau"
  | "insurance_value"
  | "total_foreign_currency"
  | "fx_rate_to_eur"
  | "total_eur";

type SortDirection = "asc" | "desc";

function formatAmount(
  value: number | null | undefined,
  currency: string | null | undefined
) {
  if (value === null || value === undefined) return "—";

  const formattedNumber = new Intl.NumberFormat("fr-CH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

  if (!currency || typeof currency !== "string" || currency.length !== 3) {
    return formattedNumber;
  }

  return `${currency} ${formattedNumber}`;
}

function formatDate(date: string | null) {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function toIsoDate(date: string | null | undefined) {
  if (!date) return null;
  return date.slice(0, 10);
}

function getArtistName(row: InventoryRow) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
}

/**
 * Sous-total dans la devise d'achat :
 * purchase_cost n'y entre PAS car il est toujours en EUR
 */
function getForeignSubtotal(row: InventoryRow): number {
  return (row.cost_amount ?? 0) + (row.commission_blondeau ?? 0);
}

/**
 * Total EUR :
 * (cost + commission) converti en EUR
 * + purchase_cost déjà en EUR
 */
function getComputedTotalEur(row: InventoryRow): number | null {
  const purchaseCostEur = row.purchase_cost ?? 0;
  const foreignSubtotal = getForeignSubtotal(row);

  if (foreignSubtotal === 0) {
    return purchaseCostEur;
  }

  if (row.fx_rate_to_eur === null || row.fx_rate_to_eur === undefined) {
    return null;
  }

  return foreignSubtotal * row.fx_rate_to_eur + purchaseCostEur;
}

function getSortValue(
  row: InventoryRow,
  column: SortColumn
): string | number | null {
  switch (column) {
    case "image_url":
      return row.image_url ?? null;
    case "date_acquisition":
      return row.date_acquisition ?? null;
    case "artist":
      return `${row.last_name ?? ""} ${row.first_name ?? ""}`.trim() || null;
    case "title":
      return row.title ?? null;
    case "company_name":
      return row.company_name ?? null;
    case "cost_amount":
      return row.cost_amount ?? null;
    case "purchase_cost":
      return row.purchase_cost ?? null;
    case "commission_blondeau":
      return row.commission_blondeau ?? null;
    case "insurance_value":
      return row.insurance_value ?? null;
    case "total_foreign_currency":
      return getForeignSubtotal(row);
    case "fx_rate_to_eur":
      return row.fx_rate_to_eur ?? null;
    case "total_eur":
      return getComputedTotalEur(row);
    default:
      return null;
  }
}

export default function FloracBoughtInventoryPage() {
  const [data, setData] = useState<InventoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortColumn, setSortColumn] =
    useState<SortColumn>("date_acquisition");
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("desc");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      const { data, error } = await supabase
        .from("v_inventory_bought_florac")
        .select("*")
        .order("date_acquisition", { ascending: false });

      if (error) {
        console.error("LOAD ERROR:", error);
        setLoading(false);
        return;
      }

      setData((data ?? []) as InventoryRow[]);
      setLoading(false);
    }

    fetchData();
  }, []);

  function handleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection(column === "date_acquisition" ? "desc" : "asc");
    }
  }

  function renderSortIndicator(column: SortColumn) {
    if (sortColumn !== column) {
      return <span className="ml-1 text-gray-300">↕</span>;
    }

    return (
      <span className="ml-1 text-black">
        {sortDirection === "asc" ? "↑" : "↓"}
      </span>
    );
  }

  const rows = useMemo(() => {
    const filtered = data.filter((row) => {
      const haystack = [
        row.first_name,
        row.last_name,
        row.title,
        row.company_name,
        row.date_acquisition,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesQuery = haystack.includes(query.toLowerCase());

      const acquisitionDate = toIsoDate(row.date_acquisition);

      const matchesDateFrom =
        !dateFrom || (acquisitionDate !== null && acquisitionDate >= dateFrom);

      const matchesDateTo =
        !dateTo || (acquisitionDate !== null && acquisitionDate <= dateTo);

      return matchesQuery && matchesDateFrom && matchesDateTo;
    });

    const sorted = [...filtered].sort((a, b) => {
      const aVal = getSortValue(a, sortColumn);
      const bVal = getSortValue(b, sortColumn);

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      if (sortColumn === "date_acquisition") {
        const result = String(aVal).localeCompare(String(bVal));
        return sortDirection === "asc" ? result : -result;
      }

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      const result = String(aVal).localeCompare(String(bVal), "fr", {
        numeric: true,
        sensitivity: "base",
      });

      return sortDirection === "asc" ? result : -result;
    });

    return sorted;
  }, [data, query, dateFrom, dateTo, sortColumn, sortDirection]);

  const totalEur = useMemo(() => {
    return rows.reduce((sum, r) => sum + (getComputedTotalEur(r) ?? 0), 0);
  }, [rows]);

  const insuranceTotalsByCurrency = useMemo(() => {
    const totals: Record<string, number> = {};

    for (const row of rows) {
      const currency = row.insurance_currency;
      const value = row.insurance_value ?? 0;

      if (!currency || currency.length !== 3) continue;
      totals[currency] = (totals[currency] ?? 0) + value;
    }

    return Object.entries(totals).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Inventaire Florac</h1>

      {/* Filtres */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 md:flex-row">
          <input
            className="border px-3 py-2 rounded w-full"
            placeholder="Recherche globale..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">
              Date d’acquisition de
            </label>
            <input
              type="date"
              className="border px-3 py-2 rounded"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">à</label>
            <input
              type="date"
              className="border px-3 py-2 rounded"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="px-3 py-2 rounded border bg-white"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
          >
            Réinitialiser les dates
          </button>
        </div>
      </div>


      {loading ? (
        <div className="text-sm text-gray-500">Chargement...</div>
      ) : (
        <div className="overflow-x-auto max-h-[75vh] border rounded print:overflow-visible print:max-h-none">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm print:static">
              <tr className="border-b">
                <th
                  className="w-[70px] px-3 py-2 text-left cursor-pointer select-none"
                  onClick={() => handleSort("image_url")}
                >
                  Image{renderSortIndicator("image_url")}
                </th>
                <th
                  className="w-[90px] px-3 py-2 text-left cursor-pointer select-none"
                  onClick={() => handleSort("date_acquisition")}
                >
                  Date{renderSortIndicator("date_acquisition")}
                </th>
                <th
                  className="w-[140px] px-3 py-2 text-left cursor-pointer select-none"
                  onClick={() => handleSort("artist")}
                >
                  Artiste{renderSortIndicator("artist")}
                </th>
                <th
                  className="w-[300px] px-3 py-2 text-left cursor-pointer select-none"
                  onClick={() => handleSort("title")}
                >
                  Titre{renderSortIndicator("title")}
                </th>

                <th
                  className="w-[140px] px-3 py-2 text-left cursor-pointer select-none"
                  onClick={() => handleSort("company_name")}
                >
                  Location{renderSortIndicator("company_name")}
                </th>
                <th
                  className="w-[160px] px-3 py-2 text-right cursor-pointer select-none"
                  onClick={() => handleSort("cost_amount")}
                >
                  Cost{renderSortIndicator("cost_amount")}
                </th>
                <th
                  className="w-[160px] px-3 py-2 text-right cursor-pointer select-none"
                  onClick={() => handleSort("purchase_cost")}
                >
                  Fees (EUR){renderSortIndicator("purchase_cost")}
                </th>
                <th
                  className="w-[160px] px-3 py-2 text-right cursor-pointer select-none"
                  onClick={() => handleSort("commission_blondeau")}
                >
                  Commission{renderSortIndicator("commission_blondeau")}
                </th>
                <th
                  className="w-[160px] px-3 py-2 text-right cursor-pointer select-none"
                  onClick={() => handleSort("insurance_value")}
                >
                  Assurance{renderSortIndicator("insurance_value")}
                </th>
                <th
                  className="w-[160px] px-3 py-2 text-right cursor-pointer select-none"
                  onClick={() => handleSort("total_foreign_currency")}
                >
                  Total devise{renderSortIndicator("total_foreign_currency")}
                </th>
                <th
                  className="print:hidden w-[160px] px-3 py-2 text-right cursor-pointer select-none"
                  onClick={() => handleSort("fx_rate_to_eur")}
                >
                  FX{renderSortIndicator("fx_rate_to_eur")}
                </th>
                <th
                  className="w-[160px] px-3 py-2 text-right cursor-pointer select-none"
                  onClick={() => handleSort("total_eur")}
                >
                  Total EUR{renderSortIndicator("total_eur")}
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => {
                    window.location.href = `/artworks/print/${r.id}`;
                  }}
                  className="cursor-pointer hover:bg-gray-100 border-b"
                >
                  <td className="w-[70px] px-3 py-2 align-middle">
                    {r.image_url ? (
                      <img
                        src={r.image_url}
                        alt={r.title ?? "Artwork"}
                        className="w-12 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 flex items-center justify-center text-xs text-gray-400 rounded">
                        img
                      </div>
                    )}
                  </td>

                  <td className="w-[90px] px-3 py-2">{formatDate(r.date_acquisition)}</td>
                  <td className="w-[140px] px-3 py-2">{getArtistName(r) || "—"}</td>
                  <td className="w-[300px] px-3 py-2">{r.title ?? "—"}, {r.year_execution ?? "—"}</td>
               
                  <td className="px-3 py-2">{r.company_name ?? "—"}</td>

                  <td className="w-[160px] px-3 py-2 text-right tabular-nums truncate">
                    {formatAmount(r.cost_amount, r.cost_currency)}
                  </td>

                  <td className="w-[160px] px-3 py-2 text-right tabular-nums truncate">
                    {formatAmount(r.purchase_cost, "EUR")}
                  </td>

                  <td className="w-[160px] px-3 py-2 text-right tabular-nums truncate">
                    {formatAmount(r.commission_blondeau, r.cost_currency)}
                  </td>

                  <td className="w-[160px] px-3 py-2 text-right tabular-nums truncate">
                    {formatAmount(r.insurance_value, r.insurance_currency)}
                  </td>

                  <td className="w-[160px] px-3 py-2 text-right tabular-nums truncate">
                    {formatAmount(getForeignSubtotal(r), r.cost_currency)}
                  </td>

                  <td
                    onClick={(e) => e.stopPropagation()}
                    className={`print:hidden w-[50px] px-3 py-2 text-right tabular-nums ${
                      !r.fx_rate_to_eur ? "text-red-500 font-medium" : ""
                    }`}
                  >
                    <input
                      type="number"
                      step="0.0001"
                      defaultValue={r.fx_rate_to_eur ?? undefined}
                      placeholder="taux"
                      className="border px-2 py-1 w-[80px] text-right"
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                      onBlur={async (e) => {
                        const value = parseFloat(e.target.value);
                        if (!value) return;

                        const { error } = await supabase
                          .from("fx_rates_history")
                          .upsert(
                            {
                              rate_date: r.date_acquisition?.slice(0, 10),
                              from_currency: r.cost_currency,
                              to_currency: "EUR",
                              rate: value,
                            },
                            { onConflict: "rate_date,from_currency,to_currency" }
                          );

                        if (error) {
                          console.error(error);
                          alert("Erreur enregistrement FX");
                          return;
                        }

                        setData((prev) =>
                          prev.map((item) =>
                            item.id === r.id
                              ? { ...item, fx_rate_to_eur: value }
                              : item
                          )
                        );
                      }}
                    />
                  </td>

                  <td className="px-3 py-2 text-right tabular-nums font-medium truncate">
                    {formatAmount(getComputedTotalEur(r), "EUR")}
                  </td>
                </tr>
              ))}
            </tbody>





<tfoot className="sticky bottom-0 z-10 bg-white border-t print:static print:table-footer-group">
  <tr className="font-semibold">
    
    {/* Colonnes vides jusqu'à Assurance */}
    <td colSpan={8}></td>

    {/* ✅ Colonne Assurance */}
    <td className="px-3 py-2 text-right tabular-nums truncate">
      {insuranceTotalsByCurrency.map(([currency, amount]) => (
        <div key={currency}>
          {formatAmount(amount, currency)}
        </div>
      ))}
    </td>

    {/* Colonnes Total devise + FX */}
    <td></td>
    <td></td>

    {/* ✅ Total EUR (colonne finale) */}
    <td className="px-3 py-2 text-right tabular-nums font-bold truncate">
      {formatAmount(totalEur, "EUR")}
    </td>

  </tr>
</tfoot>



          </table>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="text-center text-gray-500 py-6">
          Aucun résultat
        </div>
      )}
    </div>
  );
}
