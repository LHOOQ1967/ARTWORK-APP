import { contactLabel } from '@/components/artwork/artworkIndexHelpers';

export type InventoryBuyer = {
  buyer_contact_id: string | null;
  company_name: string | null;
  buyer_first_name: string | null;
  buyer_last_name: string | null;
};

export function getInventoryBuyerOptions(rows: InventoryBuyer[]) {
  const buyers = new Map<string, string>();
  for (const row of rows) {
    if (!row.buyer_contact_id) continue;
    const label = contactLabel({
      id: row.buyer_contact_id,
      company_name: row.company_name,
      first_name: row.buyer_first_name,
      last_name: row.buyer_last_name,
      email: null,
    });
    buyers.set(row.buyer_contact_id, label || row.buyer_contact_id);
  }
  return Array.from(buyers, ([id, label]) => ({ id, label })).sort(
    (a, b) => a.label.localeCompare(b.label, 'fr-CH', { sensitivity: 'base' })
  );
}

export function matchesInventoryBuyer(
  row: { id: string; buyer_contact_id: string | null },
  buyerId: string | null,
  clientId: string | null,
  proposedArtworkIds: ReadonlySet<string>
) {
  return (!clientId || proposedArtworkIds.has(row.id))
    && (!buyerId || row.buyer_contact_id === buyerId);
}
