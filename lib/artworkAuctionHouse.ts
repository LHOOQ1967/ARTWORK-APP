export function auctionHouseContactFields(contactId: string | null) {
  return {
    auction_contact_id: contactId,
    ...(contactId ? { proposed_by_id: contactId } : {}),
  }
}
