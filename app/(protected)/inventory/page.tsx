
"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "@/lib/supabaseBrowser";
import { privateImageUrl } from "@/lib/privateImageUrl";
import { useClientFilter } from "@/contexts/ClientFilterContext";
import { useSessionProfile } from "@/contexts/SessionContext";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { inventoryLocationLabel, type InventoryLocation } from "@/lib/inventoryLocation";
import {
  usesUsdInventory, usdRateKey, getUsdInventoryTotal, type HistoricalUsdRate,
} from "@/lib/inventoryCurrency";
import {
  getInventoryBuyerOptions,
  matchesInventoryBuyer,
  type InventoryBuyer,
} from "@/lib/inventoryBuyers";

type InventoryRow = InventoryBuyer & InventoryLocation & {
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

function getExportFileName(endDate: string, buyerLabel: string) {
  const buyer = buyerLabel.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  return `inventaire-${buyer}-${endDate}.xlsx`;
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
      return inventoryLocationLabel(row);
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

export default function BoughtInventoryPage() {
  const {
    canSelectClient, clients, selectedClient, selectedClientId, setSelectedClientId,
  } = useClientFilter();
  const { role } = useSessionProfile();
  const [data, setData] = useState<InventoryRow[]>([]);
  const [buyerId, setBuyerId] = useState<string | null>(null);
  const [usdRates, setUsdRates] = useState<Record<string, HistoricalUsdRate>>({});
  const [usdRatesLoading, setUsdRatesLoading] = useState(false);
  const [usdRatesError, setUsdRatesError] = useState("");
  const [clientProposals, setClientProposals] = useState<{
    clientId: string;
    artworkIds: Set<string>;
    error: string | null;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortColumn, setSortColumn] =
    useState<SortColumn>("date_acquisition");
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("desc");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingArtworkIds, setSavingArtworkIds] = useState<Set<string>>(
    new Set()
  );
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setLoadError("");
      try {
        const rows: InventoryRow[] = [];
        const pageSize = 1000;
        for (let offset = 0; ; offset += pageSize) {
          const { data: page, error } = await supabase
            .from("v_inventory_bought")
            .select("*")
            .order("date_acquisition", { ascending: false })
            .order("id")
            .range(offset, offset + pageSize - 1);

          if (cancelled) return;
          if (error) throw new Error(error.message);
          const batch = (page ?? []) as InventoryRow[];
          rows.push(...batch);
          if (batch.length < pageSize) break;
        }
        setData(rows);
      } catch (error) {
        if (cancelled) return;
        console.error("LOAD INVENTORY ERROR:", error);
        setLoadError(
          error instanceof Error ? error.message : "Impossible de charger l'inventaire."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedClientId) return;
    let cancelled = false;
    const clientId = selectedClientId;

    async function loadClientProposals() {
      try {
        const artworkIds = new Set<string>();
        const pageSize = 1000;
        for (let offset = 0; ; offset += pageSize) {
          const { data: proposals, error } = await supabase
            .from("artwork_proposals")
            .select("artwork_id")
            .eq("contact_id", clientId)
            .order("artwork_id")
            .range(offset, offset + pageSize - 1);
          if (cancelled) return;
          if (error) throw new Error(error.message);
          for (const proposal of proposals ?? []) artworkIds.add(proposal.artwork_id);
          if ((proposals ?? []).length < pageSize) break;
        }
        setClientProposals({ clientId, artworkIds, error: null });
      } catch (error) {
        if (cancelled) return;
        console.error("LOAD INVENTORY CLIENT PROPOSALS ERROR:", error);
        setClientProposals({
          clientId,
          artworkIds: new Set(),
          error: error instanceof Error ? error.message : "Impossible de charger les achats du client.",
        });
      }
    }

    void loadClientProposals();
    return () => {
      cancelled = true;
    };
  }, [selectedClientId]);

  const clientProposalsLoading = Boolean(
    selectedClientId && clientProposals?.clientId !== selectedClientId
  );
  const clientProposalsError =
    selectedClientId && clientProposals?.clientId === selectedClientId
      ? clientProposals.error : null;
  const inventoryLoading = loading || clientProposalsLoading;
  const inventoryError = loadError || clientProposalsError;
  const buyerOptions = useMemo(
    () => getInventoryBuyerOptions(data.filter(row =>
      !selectedClientId || (
        clientProposals?.clientId === selectedClientId
        && clientProposals.artworkIds.has(row.id)
      )
    )),
    [data, selectedClientId, clientProposals]
  );
  const buyerLabel = buyerOptions.find((buyer) => buyer.id === buyerId)?.label;
  const usdInventory = usesUsdInventory(selectedClient?.label, buyerLabel);
  const totalCurrency = usdInventory ? "USD" : "EUR";
  const effectiveBuyerId = buyerOptions.some(buyer => buyer.id === buyerId) ? buyerId : null;
  const inventoryTitle = selectedClient
    ? `Inventaire ${selectedClient.label}${buyerLabel ? ` - ${buyerLabel}` : ""}`
    : buyerLabel ? `Inventaire ${buyerLabel}` : "Inventaire";
  const clientFilterLabel = selectedClient ? `Client : ${selectedClient.label}` : "";
  const canEdit = role === "Administrator" || role === "Editor";
  const editingEnabled = canEdit && isEditing;

  function inventoryRate(row: InventoryRow) {
    if (!usdInventory) return row.fx_rate_to_eur;
    if (row.cost_currency === "USD") return 1;
    return usdRates[usdRateKey(row.cost_currency, row.date_acquisition)]?.rate ?? null;
  }

  function inventoryTotal(row: InventoryRow) {
    return usdInventory
      ? getUsdInventoryTotal(row.cost_amount, row.commission_blondeau, inventoryRate(row))
      : getComputedTotalEur(row);
  }

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
      if (selectedClientId && clientProposals?.clientId !== selectedClientId) return false;
      if (!matchesInventoryBuyer(
        row, effectiveBuyerId, selectedClientId, clientProposals?.artworkIds ?? new Set<string>()
      )) return false;
      const haystack = [
        row.first_name,
        row.last_name,
        row.title,
        row.company_name,
        inventoryLocationLabel(row),
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
      const sortValue = (row: InventoryRow) => sortColumn === "total_eur"
        ? inventoryTotal(row)
        : sortColumn === "fx_rate_to_eur" ? inventoryRate(row) : getSortValue(row, sortColumn);
      const aVal = sortValue(a);
      const bVal = sortValue(b);

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
  // Rates affect both numeric sorting and the displayed totals.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, query, dateFrom, dateTo, sortColumn, sortDirection, selectedClientId, clientProposals, effectiveBuyerId, usdInventory, usdRates]);

  const usdRateRequests = useMemo(() => {
    if (!usdInventory) return "";
    return JSON.stringify([...new Set(rows
      .filter(row => row.cost_currency !== "USD")
      .map(row => usdRateKey(row.cost_currency, row.date_acquisition))
    )].sort());
  }, [rows, usdInventory]);

  useEffect(() => {
    if (!usdRateRequests) return;
    let cancelled = false;
    async function loadRates() {
      setUsdRatesLoading(true);
      setUsdRatesError("");
      try {
        const rates: Record<string, HistoricalUsdRate> = {};
        const keys: string[] = JSON.parse(usdRateRequests);
        for (const key of keys) {
          const [currency, date] = key.split(":");
          if (!currency || !date) throw new Error("Devise ou date d'achat manquante : conversion USD impossible.");
          const response = await fetchWithAuth(
            `/api/inventory/usd-rate?currency=${encodeURIComponent(currency)}&date=${encodeURIComponent(date)}`
          );
          const payload = await response.json() as HistoricalUsdRate & { error?: string };
          if (!response.ok) throw new Error(`${currency} au ${date} : ${payload.error ?? "Taux indisponible"}`);
          rates[key] = { rate: payload.rate, date: payload.date };
          if (cancelled) return;
        }
        setUsdRates(rates);
      } catch (error) {
        if (!cancelled) {
          console.error("LOAD INVENTORY USD RATES ERROR:", error);
          setUsdRatesError(error instanceof Error ? error.message : "Impossible de charger les taux USD.");
        }
      } finally {
        if (!cancelled) setUsdRatesLoading(false);
      }
    }
    void loadRates();
    return () => { cancelled = true; };
  }, [usdRateRequests]);

  const totalEur = useMemo(() => {
    if (usdInventory && rows.some(row => inventoryTotal(row) === null)) return null;
    return rows.reduce((sum, r) => sum + (inventoryTotal(r) ?? 0), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, usdInventory, usdRates]);

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
    const title = `${inventoryTitle} au ${formatTitleDate(endDate)}${clientFilterLabel ? ` - ${clientFilterLabel}` : ""}`;
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
      `Taux vers ${totalCurrency}`,
      "Frais (EUR)",
      `Total ${totalCurrency}`,
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
        inventoryRate(row) === null || inventoryRate(row) === undefined
          ? ""
          : { t: "n", v: inventoryRate(row), z: "0.0000" },
        row.purchase_cost ?? "",
        inventoryTotal(row) ?? "",
        row.insurance_currency ?? "",
        row.insurance_value ?? "",
        inventoryLocationLabel(row),
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
        totalEur === null ? "Total incomplet" : formatNumber(totalEur),
        insuranceCurrencies,
        insuranceTotal,
        "",
        "",
        "",
      ],
    ];

    if (usdInventory) {
      headers.splice(10, 1);
      for (const row of exportRows) row.splice(10, 1);
      for (const row of totalRows) row.splice(10, 1);
      exportRows.forEach((row, index) => {
        row[0] = { t: "e", v: 15, f: createImageFormula(index + 4).replace(/Q/g, "P") };
      });
      headers.push("Date FX BCE");
      exportRows.forEach((row, index) => {
        const artwork = rows[index];
        row.push(usdRates[usdRateKey(artwork.cost_currency, artwork.date_acquisition)]?.date
          ?? artwork.date_acquisition ?? "");
      });
    }

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
    if (usdInventory) {
      worksheet["!cols"].splice(10, 1);
      worksheet["!cols"].push({ wch: 12 });
    }
    const visibleColumns = usdInventory ? 14 : 15;
    worksheet["!rows"] = [
      { hpt: 24 },
      {},
      { hpt: 28.15 },
      ...exportRows.map(() => ({ hpt: 50 })),
      {},
      ...totalRows.map(() => ({ hpt: 15.4 })),
    ];
    worksheet["!autofilter"] = {
      ref: `A3:${usdInventory ? "N" : "O"}${exportRows.length + 3}`,
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
        ...getCellStyle(usdInventory && column >= 10 ? column + 1 : column, rowType),
        border: getBorder(usdInventory && column >= 10 ? column + 1 : column, rowType),
      };
      worksheet[address] = cell;
    };

    for (let column = 0; column < visibleColumns; column += 1) {
      applyCellStyle(column, 2, "header");
    }

    for (let row = 0; row < exportRows.length; row += 1) {
      for (let column = 0; column < visibleColumns; column += 1) {
        applyCellStyle(column, row + 3, "body");
      }
    }

    for (let row = 0; row < totalRows.length; row += 1) {
      for (let column = 0; column < visibleColumns; column += 1) {
        applyCellStyle(column, exportRows.length + row + 4, "total");
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventaire");
    XLSX.writeFile(workbook, getExportFileName(endDate, selectedClient?.label ?? buyerLabel ?? "tous-buyers"));
  }

  return (
    <div className="p-6 pt-20 space-y-6">
      <div className="no-print flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{inventoryTitle}</h1>
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
        {canSelectClient && (
          <div className="flex flex-col gap-2">
            <label htmlFor="inventory-client" className="text-sm text-gray-600">Client</label>
            <select
              id="inventory-client"
              className="border px-3 py-2 rounded bg-white"
              value={selectedClientId ?? ""}
              onChange={(event) => {
                setBuyerId(null);
                setClientProposals(null);
                setSelectedClientId(event.target.value || null);
              }}
            >
              <option value="">Tous les clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.label}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor="inventory-buyer" className="text-sm text-gray-600">
            Buyer
          </label>
          <select
            id="inventory-buyer"
            className="border px-3 py-2 rounded bg-white"
            value={effectiveBuyerId ?? ""}
            onChange={(event) => setBuyerId(event.target.value || null)}
            disabled={inventoryLoading || Boolean(inventoryError)}
          >
            <option value="">Tous les buyers</option>
            {buyerOptions.map((buyer) => (
              <option key={buyer.id} value={buyer.id}>{buyer.label}</option>
            ))}
          </select>
          {selectedClient && (
            <p className="text-sm text-gray-600">
              Les filtres Client et Buyer se cumulent. « Tous les buyers » affiche toutes
              les œuvres achetées et proposées à {selectedClient.label}, quel que soit leur buyer.
              Le choix du client est synchronisé avec l&apos;en-tête.
            </p>
          )}
        </div>
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
        <h1>{inventoryTitle}</h1>
        {clientFilterLabel && <p>{clientFilterLabel}</p>}
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
          disabled={inventoryLoading || Boolean(inventoryError) || (usdInventory && (usdRatesLoading || Boolean(usdRatesError) || totalEur === null))}
        >
          Exporter vers Excel
        </button>
        <button
          type="button"
          className="rounded border bg-white px-3 py-2 font-medium"
          onClick={() => window.print()}
          disabled={inventoryLoading || Boolean(inventoryError) || (usdInventory && (usdRatesLoading || Boolean(usdRatesError) || totalEur === null))}
        >
          Imprimer l&apos;inventaire
        </button>
      </div>

      {usdInventory && (
        <div role="status">
          Total USD = (cost + commission) × FX. Sans fees.
          Taux BCE via Frankfurter au dernier jour publié au plus tard à la date d&apos;achat.
          {usdRatesLoading && <p>Chargement des taux historiques USD…</p>}
          {usdRatesError && <p role="alert" className="text-red-600">{usdRatesError}</p>}
          {!usdRatesLoading && totalEur === null && (
            <p role="alert" className="text-red-600">Total incomplet : coût ou taux de change manquant.</p>
          )}
        </div>
      )}
      {inventoryLoading ? (
        <div className="text-sm text-gray-500">Chargement...</div>
      ) : inventoryError ? (
        <div className="ux-feedback-card ux-feedback-card-error" role="alert">
          <strong>Impossible de charger l&apos;inventaire.</strong>
          <span>{inventoryError}</span>
        </div>
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
                  className={`${usdInventory ? "" : "print:hidden"} w-[160px] px-3 py-2 text-right cursor-pointer select-none`}
                  onClick={() => handleSort("fx_rate_to_eur")}
                >
                  FX{renderSortIndicator("fx_rate_to_eur")}
                </th>
                {!usdInventory && <th
                  className="w-[160px] px-3 py-2 text-right cursor-pointer select-none"
                  onClick={() => handleSort("purchase_cost")}
                >
                  Fees (EUR){renderSortIndicator("purchase_cost")}
                </th>}
                <th
                  className="w-[160px] px-3 py-2 text-right cursor-pointer select-none"
                  onClick={() => handleSort("total_eur")}
                >
                  Total {totalCurrency}{renderSortIndicator("total_eur")}
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
                        src={privateImageUrl(r.image_url)}
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
                    className={`${usdInventory ? "" : "print:hidden"} w-[50px] px-3 py-2 text-right tabular-nums ${
                      !inventoryRate(r) ? "text-red-500 font-medium" : ""
                    }`}
                  >
                    {usdInventory ? (
                      <span title="Taux BCE via Frankfurter">
                        {inventoryRate(r)?.toFixed(4) ?? "—"}
                        <small className="block">
                          {usdRates[usdRateKey(r.cost_currency, r.date_acquisition)]?.date
                            ?? (r.cost_currency === "USD" ? "USD / USD" : "")}
                        </small>
                      </span>
                    ) : editingEnabled ? (
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

                  {!usdInventory && <td
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
                  </td>}

                  <td className="px-3 py-2 text-right tabular-nums font-medium truncate">
                    {formatAmount(inventoryTotal(r), totalCurrency)}
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

                  <td className="px-3 py-2 whitespace-normal">{inventoryLocationLabel(r)}</td>
                </tr>
              ))}
            </tbody>





<tfoot className="sticky bottom-0 z-10 bg-white border-t print:static print:table-footer-group">
  <tr className="font-semibold">
    <td colSpan={7}></td>

    <td className={usdInventory ? "" : "print:hidden"}></td>

    {!usdInventory && <td></td>}

    <td className="px-3 py-2 text-right tabular-nums font-bold truncate">
      {formatAmount(totalEur, totalCurrency)}
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
