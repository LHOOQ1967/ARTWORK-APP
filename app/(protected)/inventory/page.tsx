
"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "@/lib/supabaseBrowser";

type ProfileRole = "Administrator" | "Editor" | "Viewer" | null;

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

type EditableField =
  | "cost_amount"
  | "cost_currency"
  | "commission_blondeau"
  | "purchase_cost"
  | "insurance_value"
  | "insurance_currency";

const CURRENCY_OPTIONS = ["CHF", "EUR", "USD", "GBP", "HKD"] as const;

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(value)
    .replace(/,/g, "'");
}

function formatAmount(
  value: number | null | undefined,
  currency: string | null | undefined
) {
  if (value === null || value === undefined) return "—";

  const formattedNumber = formatNumber(value);

  if (!currency || typeof currency !== "string" || currency.length !== 3) {
    return formattedNumber;
  }

  return `${currency} ${formattedNumber}`;
}

function formatArtworkTitle(
  title: string | null | undefined,
  year: string | null | undefined
) {
  if (!title) return year ?? "";
  return year ? `${title}, ${year}` : title;
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

function formatTitleDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

function getExportEndDate(dateTo: string) {
  if (dateTo) return dateTo;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getExportFileName(endDate: string) {
  return `inventaire-florac-${endDate}.xlsx`;
}

function createImageFormula(rowNumber: number) {
  return `IF(Q${rowNumber}="","",_xlfn.IMAGE(Q${rowNumber},C${rowNumber}&" - "&D${rowNumber}))`;
}

function toExcelDate(date: string | null | undefined) {
  const isoDate = toIsoDate(date);
  if (!isoDate) return "";

  const [year, month, day] = isoDate.split("-").map(Number);
  return Math.floor(
    (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000
  );
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
  const [role, setRole] = useState<ProfileRole>(null);
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortColumn, setSortColumn] =
    useState<SortColumn>("date_acquisition");
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("desc");
  const [loading, setLoading] = useState(true);
  const [savingArtworkIds, setSavingArtworkIds] = useState<Set<string>>(
    new Set()
  );
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      const [{ data: authData, error: authError }, { data, error }] =
        await Promise.all([
          supabase.auth.getUser(),
          supabase
            .from("v_inventory_bought_florac")
            .select("*")
            .order("date_acquisition", { ascending: false }),
        ]);

      if (authError) {
        console.error("LOAD AUTH USER ERROR:", authError);
      } else if (authData.user) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authData.user.id)
          .maybeSingle();

        if (profileError) {
          console.error("LOAD PROFILE ROLE ERROR:", profileError);
        } else {
          setRole((profile?.role as ProfileRole) ?? null);
        }
      }

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

  const canEdit = role === "Administrator" || role === "Editor";
  const editingEnabled = canEdit && isEditing;

  function updateRow(id: string, changes: Partial<InventoryRow>) {
    setData((previous) =>
      previous.map((item) => (item.id === id ? { ...item, ...changes } : item))
    );
  }

  async function saveArtworkFields(
    row: InventoryRow,
    changes: Pick<Partial<InventoryRow>, EditableField>
  ) {
    const previousValues = Object.fromEntries(
      Object.keys(changes).map((field) => [
        field,
        row[field as EditableField],
      ])
    ) as Pick<InventoryRow, EditableField>;

    updateRow(row.id, changes);
    setSavingArtworkIds((previous) => new Set(previous).add(row.id));

    try {
      const response = await fetch(`/api/artworks/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Erreur lors de l'enregistrement");
      }
    } catch (error) {
      updateRow(row.id, previousValues);
      console.error("SAVE INVENTORY FIELDS ERROR:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Erreur lors de l'enregistrement"
      );
    } finally {
      setSavingArtworkIds((previous) => {
        const next = new Set(previous);
        next.delete(row.id);
        return next;
      });
    }
  }

  function parseAmount(value: string) {
    if (value.trim() === "") return null;
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
  }

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

  function exportToExcel() {
    const endDate = getExportEndDate(dateTo);
    const title = `Inventaire Florac Works au ${formatTitleDate(endDate)}`;
    const headers = [
      "Image",
      "Date d'acquisition",
      "Artiste",
      "Titre",
      "Année",
      "Devise coût",
      "Coût",
      "Commission",
      "Total devise",
      "Taux vers EUR",
      "Frais (EUR)",
      "Total EUR",
      "Devise assurance",
      "Assurance",
      "Localisation",
      "",
      "URL image",
    ];

    const exportRows = rows.map((row, index) => {
      return [
        { t: "e", v: 15, f: createImageFormula(index + 4) },
        row.date_acquisition
          ? { t: "n", v: toExcelDate(row.date_acquisition), z: "dd/mm/yyyy" }
          : "",
        getArtistName(row),
        row.title ?? "",
        row.year_execution ?? "",
        row.cost_currency ?? "",
        row.cost_amount ?? "",
        row.commission_blondeau ?? "",
        getForeignSubtotal(row),
        row.fx_rate_to_eur === null || row.fx_rate_to_eur === undefined
          ? ""
          : { t: "n", v: row.fx_rate_to_eur, z: "0.0000" },
        row.purchase_cost ?? "",
        getComputedTotalEur(row) ?? "",
        row.insurance_currency ?? "",
        row.insurance_value ?? "",
        row.company_name ?? "",
        "",
        row.image_url ?? "",
      ];
    });

    const insuranceCurrencies = insuranceTotalsByCurrency
      .map(([currency]) => currency)
      .join("\n");
    const insuranceTotal = insuranceTotalsByCurrency
      .map(([, amount]) => formatNumber(amount))
      .join("\n");
    const totalRows = [
      [
        "Total",
        ...Array(10).fill(""),
        formatNumber(totalEur),
        insuranceCurrencies,
        insuranceTotal,
        "",
        "",
        "",
      ],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([
      [title],
      [],
      headers,
      ...exportRows,
      [],
      ...totalRows,
    ]);

    worksheet["!cols"] = [
      { wch: 14.36 },
      { wch: 11 },
      { wch: 17.73 },
      { wch: 29 },
      { wch: 8 },
      { wch: 10.64 },
      { wch: 10.64 },
      { wch: 10.64 },
      { wch: 10.64 },
      { wch: 10.64 },
      { wch: 10.64 },
      { wch: 12.36 },
      { wch: 10.64 },
      { wch: 16.09 },
      { wch: 18 },
      { wch: 2 },
      { wch: 48.36, hidden: true },
    ];
    worksheet["!rows"] = [
      { hpt: 24 },
      {},
      { hpt: 28.15 },
      ...exportRows.map(() => ({ hpt: 50 })),
      {},
      ...totalRows.map(() => ({ hpt: 15.4 })),
    ];
    worksheet["!autofilter"] = {
      ref: `A3:O${exportRows.length + 3}`,
    };

    const thinBorder = { style: "thin", color: { auto: 1 } };
    const hairBorder = { style: "hair", color: { auto: 1 } };
    const thickBorder = { style: "thick", color: { auto: 1 } };
    const getCellStyle = (
      column: number,
      rowType: "header" | "body" | "total"
    ) => ({
      font: {
        name: "Arial",
        sz: 12,
        ...(rowType === "total" ? { bold: true } : {}),
      },
      alignment: {
        vertical: "center",
        ...(column === 0 ? { horizontal: "center" } : {}),
        ...(column === 2 || column === 3 || column === 14
          ? { wrapText: true }
          : {}),
      },
      border: {
        left: column === 0 ? thickBorder : thinBorder,
        right: column === 14 ? thickBorder : thinBorder,
        top: rowType === "header" ? thickBorder : hairBorder,
        bottom: rowType === "total" ? thickBorder : hairBorder,
      },
      ...(column === 1 ? { numFmt: "dd/mm/yyyy" } : {}),
      ...(column === 9 ? { numFmt: "0.0000" } : {}),
    });

    const getBorder = (
      column: number,
      rowType: "header" | "body" | "total"
    ) => ({
      left:
        column === 0
          ? thickBorder
          : column === 6 || column === 13
            ? undefined
            : thinBorder,
      right:
        column === 14
          ? thickBorder
          : column === 5 || column === 12
            ? undefined
            : thinBorder,
      top: rowType === "header" ? thickBorder : hairBorder,
      bottom: rowType === "total" ? thickBorder : hairBorder,
    });

    worksheet["A1"].s = {
      font: { name: "Arial", sz: 15 },
      alignment: { vertical: "center" },
    };

    const applyCellStyle = (
      column: number,
      row: number,
      rowType: "header" | "body" | "total"
    ) => {
      const address = XLSX.utils.encode_cell({ c: column, r: row });
      const cell = worksheet[address] ?? { t: "s", v: "" };
      cell.s = {
        ...getCellStyle(column, rowType),
        border: getBorder(column, rowType),
      };
      worksheet[address] = cell;
    };

    for (let column = 0; column < 15; column += 1) {
      applyCellStyle(column, 2, "header");
    }

    for (let row = 0; row < exportRows.length; row += 1) {
      for (let column = 0; column < 15; column += 1) {
        applyCellStyle(column, row + 3, "body");
      }
    }

    for (let row = 0; row < totalRows.length; row += 1) {
      for (let column = 0; column < 15; column += 1) {
        applyCellStyle(column, exportRows.length + row + 4, "total");
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventaire");
    XLSX.writeFile(workbook, getExportFileName(endDate));
  }

  return (
    <div className="p-6 pt-20 space-y-6">
      <div className="no-print flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Inventaire Florac</h1>
        {canEdit && (
          <button
            type="button"
            className="edit-button"
            onClick={() => setIsEditing((previous) => !previous)}
          >
            {isEditing ? "Terminer l’édition" : "Edit"}
          </button>
        )}
      </div>

      {/* Filtres */}
      <div className="no-print flex flex-col gap-4">
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

      <div className="inventory-print-header">
        <h1>Inventaire Florac</h1>
        <p>
          {rows.length} œuvre{rows.length > 1 ? "s" : ""}
          {dateFrom || dateTo
            ? ` · Acquisitions du ${dateFrom || "début"} au ${dateTo || "aujourd'hui"}`
            : ""}
        </p>
      </div>

      <div className="no-print flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded border bg-white px-3 py-2 font-medium"
          onClick={exportToExcel}
        >
          Exporter vers Excel
        </button>
        <button
          type="button"
          className="rounded border bg-white px-3 py-2 font-medium"
          onClick={() => window.print()}
        >
          Imprimer l&apos;inventaire
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Chargement...</div>
      ) : (
        <div className="inventory-table-container overflow-x-auto max-h-[75vh] border rounded print:overflow-visible print:max-h-none">
          <table className="inventory-table w-full text-sm border-collapse">
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
                  className="w-[160px] px-3 py-2 text-right cursor-pointer select-none"
                  onClick={() => handleSort("cost_amount")}
                >
                  Cost{renderSortIndicator("cost_amount")}
                </th>
                <th
                  className="w-[160px] px-3 py-2 text-right cursor-pointer select-none"
                  onClick={() => handleSort("commission_blondeau")}
                >
                  Commission{renderSortIndicator("commission_blondeau")}
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
                  onClick={() => handleSort("purchase_cost")}
                >
                  Fees (EUR){renderSortIndicator("purchase_cost")}
                </th>
                <th
                  className="w-[160px] px-3 py-2 text-right cursor-pointer select-none"
                  onClick={() => handleSort("total_eur")}
                >
                  Total EUR{renderSortIndicator("total_eur")}
                </th>
                <th
                  className="w-[160px] px-3 py-2 text-right cursor-pointer select-none"
                  onClick={() => handleSort("insurance_value")}
                >
                  Assurance{renderSortIndicator("insurance_value")}
                </th>
                <th
                  className="w-[140px] px-3 py-2 text-left cursor-pointer select-none"
                  onClick={() => handleSort("company_name")}
                >
                  Location{renderSortIndicator("company_name")}
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
                  <td className="w-[300px] px-3 py-2">
                    {formatArtworkTitle(r.title, r.year_execution) || "—"}
                  </td>

                  <td
                    className="w-[160px] px-3 py-2 text-right tabular-nums"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {editingEnabled ? (
                      <>
                        <div className="flex items-center justify-end gap-1 print:hidden">
                          <select
                            aria-label={`Devise du coût de ${r.title ?? "l'œuvre"}`}
                            className="w-16 border bg-white px-1 py-1 text-xs"
                            value={r.cost_currency ?? ""}
                            disabled={savingArtworkIds.has(r.id)}
                            onChange={(event) =>
                              void saveArtworkFields(r, {
                                cost_currency: event.target.value || null,
                              })
                            }
                          >
                            <option value="">—</option>
                            {CURRENCY_OPTIONS.map((currency) => (
                              <option key={currency} value={currency}>
                                {currency}
                              </option>
                            ))}
                          </select>
                          <input
                            aria-label={`Coût de ${r.title ?? "l'œuvre"}`}
                            className="w-24 border px-2 py-1 text-right"
                            type="number"
                            step="any"
                            value={r.cost_amount ?? ""}
                            disabled={savingArtworkIds.has(r.id)}
                            onChange={(event) =>
                              updateRow(r.id, {
                                cost_amount: parseAmount(event.target.value),
                              })
                            }
                            onBlur={(event) => {
                              const amount = parseAmount(event.target.value);
                              if (amount !== r.cost_amount) {
                                void saveArtworkFields(r, { cost_amount: amount });
                              }
                            }}
                          />
                        </div>
                        <span className="print-text">
                          {formatAmount(r.cost_amount, r.cost_currency)}
                        </span>
                      </>
                    ) : (
                      formatAmount(r.cost_amount, r.cost_currency)
                    )}
                  </td>

                  <td
                    className="w-[160px] px-3 py-2 text-right tabular-nums"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {editingEnabled ? (
                      <>
                        <div className="flex items-center justify-end gap-1 print:hidden">
                          <span className="w-16 text-xs text-gray-600">
                            {r.cost_currency ?? "—"}
                          </span>
                          <input
                            aria-label={`Commission de ${r.title ?? "l'œuvre"}`}
                            className="w-24 border px-2 py-1 text-right"
                            type="number"
                            step="any"
                            value={r.commission_blondeau ?? ""}
                            disabled={savingArtworkIds.has(r.id)}
                            onChange={(event) =>
                              updateRow(r.id, {
                                commission_blondeau: parseAmount(event.target.value),
                              })
                            }
                            onBlur={(event) => {
                              const amount = parseAmount(event.target.value);
                              if (amount !== r.commission_blondeau) {
                                void saveArtworkFields(r, {
                                  commission_blondeau: amount,
                                });
                              }
                            }}
                          />
                        </div>
                        <span className="print-text">
                          {formatAmount(r.commission_blondeau, r.cost_currency)}
                        </span>
                      </>
                    ) : (
                      formatAmount(r.commission_blondeau, r.cost_currency)
                    )}
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
                    {editingEnabled ? (
                      <input
                        type="number"
                        step="0.0001"
                        defaultValue={
                          r.fx_rate_to_eur === null ||
                          r.fx_rate_to_eur === undefined
                            ? undefined
                            : r.fx_rate_to_eur.toFixed(4)
                        }
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
                    ) : (
                      r.fx_rate_to_eur?.toFixed(4) ?? "—"
                    )}
                  </td>

                  <td
                    className="w-[160px] px-3 py-2 text-right tabular-nums"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {editingEnabled ? (
                      <>
                        <div className="flex items-center justify-end gap-1 print:hidden">
                          <span className="w-16 text-xs text-gray-600">EUR</span>
                          <input
                            aria-label={`Frais de ${r.title ?? "l'œuvre"}`}
                            className="w-24 border px-2 py-1 text-right"
                            type="number"
                            step="any"
                            value={r.purchase_cost ?? ""}
                            disabled={savingArtworkIds.has(r.id)}
                            onChange={(event) =>
                              updateRow(r.id, {
                                purchase_cost: parseAmount(event.target.value),
                              })
                            }
                            onBlur={(event) => {
                              const amount = parseAmount(event.target.value);
                              if (amount !== r.purchase_cost) {
                                void saveArtworkFields(r, { purchase_cost: amount });
                              }
                            }}
                          />
                        </div>
                        <span className="print-text">
                          {formatAmount(r.purchase_cost, "EUR")}
                        </span>
                      </>
                    ) : (
                      formatAmount(r.purchase_cost, "EUR")
                    )}
                  </td>

                  <td className="px-3 py-2 text-right tabular-nums font-medium truncate">
                    {formatAmount(getComputedTotalEur(r), "EUR")}
                  </td>

                  <td
                    className="w-[160px] px-3 py-2 text-right tabular-nums"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {editingEnabled ? (
                      <>
                        <div className="flex items-center justify-end gap-1 print:hidden">
                          <select
                            aria-label={`Devise d'assurance de ${r.title ?? "l'œuvre"}`}
                            className="w-16 border bg-white px-1 py-1 text-xs"
                            value={r.insurance_currency ?? ""}
                            disabled={savingArtworkIds.has(r.id)}
                            onChange={(event) =>
                              void saveArtworkFields(r, {
                                insurance_currency: event.target.value || null,
                              })
                            }
                          >
                            <option value="">—</option>
                            {CURRENCY_OPTIONS.map((currency) => (
                              <option key={currency} value={currency}>
                                {currency}
                              </option>
                            ))}
                          </select>
                          <input
                            aria-label={`Assurance de ${r.title ?? "l'œuvre"}`}
                            className="w-24 border px-2 py-1 text-right"
                            type="number"
                            step="any"
                            value={r.insurance_value ?? ""}
                            disabled={savingArtworkIds.has(r.id)}
                            onChange={(event) =>
                              updateRow(r.id, {
                                insurance_value: parseAmount(event.target.value),
                              })
                            }
                            onBlur={(event) => {
                              const amount = parseAmount(event.target.value);
                              if (amount !== r.insurance_value) {
                                void saveArtworkFields(r, { insurance_value: amount });
                              }
                            }}
                          />
                        </div>
                        <span className="print-text">
                          {formatAmount(r.insurance_value, r.insurance_currency)}
                        </span>
                      </>
                    ) : (
                      formatAmount(r.insurance_value, r.insurance_currency)
                    )}
                  </td>

                  <td className="px-3 py-2">{r.company_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>





<tfoot className="sticky bottom-0 z-10 bg-white border-t print:static print:table-footer-group">
  <tr className="font-semibold">
    <td colSpan={7}></td>

    <td className="print:hidden"></td>

    <td></td>

    <td className="px-3 py-2 text-right tabular-nums font-bold truncate">
      {formatAmount(totalEur, "EUR")}
    </td>

    <td className="px-3 py-2 text-right tabular-nums truncate">
      {insuranceTotalsByCurrency.map(([currency, amount]) => (
        <div key={currency}>
          {formatAmount(amount, currency)}
        </div>
      ))}
    </td>

    <td></td>

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
