import { describe, expect, it } from "vitest";
import { inventoryLocationLabel, type InventoryLocation } from "@/lib/inventoryLocation";

const address = {
  id: "address", contact_id: "destination", label: "Depot",
  address: "12 rue Exemple", postal_code: "1200", city: "Geneve", country: "Suisse",
};
const row: InventoryLocation = {
  has_ongoing_transport: false,
  destination_contact_id: "destination",
  destination_contact_name: "Destination",
  inventory_destination_address: address,
  location_contact_name: "Localisation",
  inventory_location_address: { ...address, address: "8 autre rue", city: "Lausanne" },
};

describe("inventory location", () => {
  it("shows destination and the selected full address without an ongoing transport", () => {
    expect(inventoryLocationLabel(row))
      .toBe("Destination — Depot, 12 rue Exemple, 1200 Geneve, Suisse");
  });
  it("shows the current location during a transport", () => {
    expect(inventoryLocationLabel({ ...row, has_ongoing_transport: true }))
      .toContain("Localisation — Depot, 8 autre rue, 1200 Lausanne, Suisse");
  });
  it("uses current location after arrival clears the destination", () => {
    expect(inventoryLocationLabel({ ...row, destination_contact_id: null }))
      .toContain("Localisation");
  });
  it("reports a missing selected address without borrowing the other address", () => {
    expect(inventoryLocationLabel({ ...row, inventory_destination_address: null }))
      .toBe("Destination — Adresse non renseignée");
  });
  it("returns a dash when neither location nor destination is known", () => {
    expect(inventoryLocationLabel({
      ...row, destination_contact_id: null, location_contact_name: null,
      inventory_location_address: null,
    })).toBe("—");
  });
});
