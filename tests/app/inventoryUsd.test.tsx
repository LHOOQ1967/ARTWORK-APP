import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as XLSX from "xlsx-js-style";
import InventoryPage from "@/app/(protected)/inventory/page";

const mocks = vi.hoisted(() => ({
  index: 0,
  client: null as { id: string; label: string } | null,
  buyer: null as string | null,
  buyerName: "Florac",
  writeFile: vi.fn(),
}));

const artwork = () => ({
  id: "work", title: "Work", buyer_contact_id: "buyer", company_name: mocks.buyerName,
  buyer_first_name: null, buyer_last_name: null, first_name: null, last_name: "Artist",
  cost_amount: 1000, commission_blondeau: 80, purchase_cost: 500,
  cost_currency: "EUR", date_acquisition: "2024-05-05", fx_rate_to_eur: 1,
  image_url: null, insurance_currency: null, insurance_value: null,
});

vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: () => {},
  useMemo: (fn: () => unknown) => fn(),
  useState: (initial: unknown) => {
    const index = mocks.index++;
    const values: Record<number, unknown> = {
      0: [artwork()],
      1: mocks.buyer,
      2: { "EUR:2024-05-05": { rate: 1.2, date: "2024-05-03" } },
      5: mocks.client ? { clientId: mocks.client.id, artworkIds: new Set(["work"]), error: null } : null,
      11: false,
    };
    return [index in values ? values[index] : initial, vi.fn()];
  },
}));
vi.mock("@/contexts/ClientFilterContext", () => ({
  useClientFilter: () => ({
    canSelectClient: true,
    clients: mocks.client ? [mocks.client] : [],
    selectedClient: mocks.client,
    selectedClientId: mocks.client?.id ?? null,
    setSelectedClientId: vi.fn(),
  }),
}));
vi.mock("@/contexts/SessionContext", () => ({
  useSessionProfile: () => ({ role: "Editor" }),
}));
vi.mock("@/lib/supabaseBrowser", () => ({ supabase: {} }));
vi.mock("xlsx-js-style", async importOriginal => {
  const actual = await importOriginal<typeof import("xlsx-js-style") & {
    default: typeof import("xlsx-js-style");
  }>();
  return { ...actual.default, ...actual, writeFile: mocks.writeFile };
});

function findExport(node: ReactNode): (() => void) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findExport(child);
      if (found) return found;
    }
  }
  if (isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) {
    if (node.type === "button" && node.props.children === "Exporter vers Excel") return node.props.onClick;
    return findExport(node.props.children);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.index = 0;
  mocks.client = null;
  mocks.buyer = null;
  mocks.buyerName = "Florac";
});

describe("USD inventory surfaces", () => {
  it.each(["client YAL", "buyer YAL", "buyer Indianart"])("applies USD rules to %s", selection => {
    if (selection === "client YAL") mocks.client = { id: "yal", label: "YAL" };
    else {
      mocks.buyer = "buyer";
      mocks.buyerName = selection === "buyer YAL" ? "YAL" : "Indianart";
    }
    const html = renderToStaticMarkup(<InventoryPage />);
    expect(html).not.toContain("Fees (EUR)");
    expect(html).toContain("Total USD");
    expect(html).toContain("USD 1&#x27;296");
    expect(html).toContain("2024-05-03");
  });

  it("preserves EUR calculations and fees for other inventories", () => {
    const html = renderToStaticMarkup(<InventoryPage />);
    expect(html).toContain("Fees (EUR)");
    expect(html).toContain("Total EUR");
    expect(html).toContain("EUR 1&#x27;580");
  });

  it("exports USD totals, no fees, and correct image references after removing the column", () => {
    mocks.client = { id: "yal", label: "YAL" };
    const exportFile = findExport(InventoryPage());
    expect(exportFile).toBeDefined();
    exportFile?.();
    const workbook = mocks.writeFile.mock.calls[0][0] as XLSX.WorkBook;
    const sheet = workbook.Sheets.Inventaire;
    expect(sheet.K3.v).toBe("Total USD");
    expect(sheet.K4.v).toBe(1296);
    expect(sheet.A4.f).toContain("P4");
    expect(sheet.Q3.v).toBe("Date FX BCE");
    expect(sheet.Q4.v).toBe("2024-05-03");
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1 })[2])
      .not.toContain("Frais (EUR)");
  });
});
