import { describe, expect, it } from 'vitest';
import { getInventoryBuyerOptions, matchesInventoryBuyer } from '@/lib/inventoryBuyers';

const rows = [
  { id: 'a', buyer_contact_id: 'florac', company_name: 'Florac', buyer_first_name: null, buyer_last_name: null },
  { id: 'b', buyer_contact_id: 'lm', company_name: null, buyer_first_name: 'Leopold', buyer_last_name: 'Meyer' },
  { id: 'c', buyer_contact_id: 'florac', company_name: 'Florac', buyer_first_name: null, buyer_last_name: null },
  { id: 'd', buyer_contact_id: null, company_name: null, buyer_first_name: null, buyer_last_name: null },
];

describe('inventory buyer options', () => {
  it('lists companies and individual buyers once, excluding unassigned works', () => {
    expect(getInventoryBuyerOptions(rows)).toEqual([
      { id: 'florac', label: 'Florac' },
      { id: 'lm', label: 'Leopold Meyer' },
    ]);
  });

  it('keeps contacts with identical names distinct by ID', () => {
    expect(getInventoryBuyerOptions([
      rows[0],
      { ...rows[0], buyer_contact_id: 'another-florac' },
    ])).toHaveLength(2);
  });

  it('uses an ID when the contact has no label', () => {
    expect(getInventoryBuyerOptions([{ ...rows[3], buyer_contact_id: 'unnamed' }]))
      .toEqual([{ id: 'unnamed', label: 'unnamed' }]);
  });
});

describe('inventory client and buyer filters', () => {
  const clientSelection = new Set(['a', 'b', 'd']);

  it('keeps all buyers, including unassigned works, when neither filter is active', () => {
    expect(rows.filter((row) => matchesInventoryBuyer(row, null, null, new Set()))).toEqual(rows);
  });

  it('selects the actual buyer, not other contacts or proposed-to links', () => {
    expect(rows.filter((row) => matchesInventoryBuyer(row, 'lm', null, new Set())))
      .toEqual([rows[1]]);
  });

  it('intersects buyer selection with proposals to the selected client', () => {
    expect(rows.filter((row) => matchesInventoryBuyer(row, 'florac', 'client', clientSelection)))
      .toEqual([rows[0]]);
  });

  it('includes every buyer, including unassigned works, when only a client is selected', () => {
    expect(rows.filter((row) => matchesInventoryBuyer(row, null, 'client', clientSelection)))
      .toEqual([rows[0], rows[1], rows[3]]);
  });

  it('returns no works for a client without proposals', () => {
    expect(rows.filter((row) => matchesInventoryBuyer(row, 'lm', 'client', new Set())))
      .toEqual([]);
  });

  it('does not include a matching buyer without a proposal to the selected client', () => {
    expect(matchesInventoryBuyer(rows[2], null, 'florac', clientSelection)).toBe(false);
  });

  it('restores buyer filtering when no client is selected', () => {
    expect(rows.filter((row) => matchesInventoryBuyer(row, 'florac', null, clientSelection)))
      .toEqual([rows[0], rows[2]]);
  });
});
