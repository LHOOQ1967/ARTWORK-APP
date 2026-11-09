'use client'

import AuctionLotImporter, { type AuctionLotImporterProps } from './AuctionLotImporter'

export default function PhillipsLotImporter(props: AuctionLotImporterProps) {
  return <AuctionLotImporter {...props} provider="phillips" />
}
