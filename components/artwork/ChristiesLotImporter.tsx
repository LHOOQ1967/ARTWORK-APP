'use client'

import AuctionLotImporter, { type AuctionLotImporterProps } from './AuctionLotImporter'

export default function ChristiesLotImporter(props: AuctionLotImporterProps) {
  return <AuctionLotImporter {...props} provider="christies" />
}
