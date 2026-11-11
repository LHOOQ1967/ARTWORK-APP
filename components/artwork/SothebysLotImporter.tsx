'use client'

import AuctionLotImporter, { type AuctionLotImporterProps } from './AuctionLotImporter'

export default function SothebysLotImporter(props: AuctionLotImporterProps) {
  return <AuctionLotImporter {...props} provider="sothebys" />
}
