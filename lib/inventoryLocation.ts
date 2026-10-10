import { addressLabel, type ContactAddress } from "@/lib/contactAddress";

export type InventoryLocation = {
  has_ongoing_transport: boolean;
  destination_contact_id: string | null;
  destination_contact_name: string | null;
  inventory_destination_address: ContactAddress | null;
  location_contact_name: string | null;
  inventory_location_address: ContactAddress | null;
};

export function inventoryLocationLabel(row: InventoryLocation) {
  const useLocation = row.has_ongoing_transport || !row.destination_contact_id;
  const name = useLocation ? row.location_contact_name : row.destination_contact_name;
  const address = useLocation ? row.inventory_location_address : row.inventory_destination_address;
  if (!name && !address) return "—";
  return [name, address ? addressLabel(address) : "Adresse non renseignée"]
    .filter(Boolean).join(" — ");
}
