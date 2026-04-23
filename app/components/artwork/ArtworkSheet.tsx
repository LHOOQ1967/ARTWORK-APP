
'use client'
import React from 'react'
import Link from 'next/link'

type Props = {
  artwork: any
}


type ArtworkSheetProps = {
  artworkId: string
}


/* ---------- helpers ---------- */



function InfoRow({
  label,
  value,
}: {
  label: string
  value?: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '160px 1fr',
        columnGap: 12,
        alignItems: 'baseline',
        marginBottom: 8,
      }}
    >
      <div style={{ color: '#777', whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div style={{ minWidth: 0 }}>
        {value}
      </div>
    </div>
  )
}

function formatDateTimeGeneva(
  date: string | null,
  time?: string | null
) {
  if (!date) return '—'

  const formattedDate = new Date(date).toLocaleDateString('fr-CH')

  if (!time) return formattedDate

  // ✅ on GUARANTIT HH:mm sans secondes
  const formattedTime = new Intl.DateTimeFormat('fr-CH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Zurich',
  }).format(new Date(`${date}T${time}`))

  return `${formattedDate} at ${formattedTime} (Geneva time)`
}


function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('fr-CH')
}


function hasValidNumber(value: unknown) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    Number.isFinite(Number(value))
  )
}




/* ---------- component ---------- */

export default function ArtworkSheet({ artwork }: Props) {
  const artworkId = artwork.id

  const images =
    artwork.documents
      ?.filter((d: any) => d.document_type === 'image')
      .sort((a: any, b: any) => a.position - b.position) || []

  const mainImage = images[0]

  const onedriveDocuments =
    artwork.documents?.filter(
      (d: any) => d.document_type === 'onedrive'
    ) || []



  return (
    <section
      style={{
        pageBreakAfter: 'always',
        padding: 40,
        boxSizing: 'border-box',
      }}
    >

<div className="print-controls no-print">
  <Link href={`/artworks/${artworkId}?edit=1`}>
    <button
      style={{
        padding: '6px 12px',
        fontSize: '0.9rem',
        borderRadius: 4,
        border: '1px solid #ccc',
        backgroundColor: '#f3f3f3',
        cursor: 'pointer',
      }}
    >
      Edit
    </button>
  </Link>
</div>


    <h2 style={{ marginBottom: 8 }}>
    { artwork.date_proposition? new Date(artwork.date_proposition).toLocaleDateString('fr-CH') : null } by { artwork.proposedBy ? artwork.proposedBy.company_name || 
            [artwork.proposedBy.first_name, artwork.proposedBy.last_name]
            .filter(Boolean)
            .join(' ')
        : null
    }
    </h2>

      {/* ✅ Artist */}
      {artwork.artist && (
        <h2 style={{ fontSize: '1.6rem', marginBottom: 4 }}>
          {[artwork.artist.first_name, artwork.artist.last_name]
            .filter(Boolean)
            .join(' ')}
        </h2>
      )}

      {/* ✅ Title */}
      <h1 style={{ fontSize: '1.4rem', marginBottom: 8 }}>
        {artwork.title || 'Untitled'}
        {artwork.year_execution ? `, ${artwork.year_execution}` : ''}
      </h1>


      {/* ✅ Medium */}
      <h1 style={{ marginBottom: 0 }}>{artwork.medium}</h1> 

        
        
       {artwork.signature && (
        <InfoRow
        label="Signature"
        value={artwork.signature}
      />
      )}

      {/* ✅ Dimensions */}
      {artwork.height_cm && artwork.width_cm && (
        <div style={{ marginBottom: 20 }}>
          {artwork.height_cm} × {artwork.width_cm}
          {artwork.depth_cm ? ` × ${artwork.depth_cm}` : ''} cm
        </div>
      )}

      {/* ✅ Main image */}
      {mainImage?.url && (
        <div style={{ margin: '24px 0' }}>
          <img
            src={mainImage.url}
            alt=""
            style={{
              maxWidth: '100%',
              maxHeight: '8cm',
              objectFit: 'contain',
            }}
          />
        </div>
      )}

      {/* ✅ Metadata */}

      <div style={{ marginTop: 24 }}>
        {artwork.asking_price && (
        <InfoRow
          label="Asking price"
          value={
            artwork.asking_price
              ? `${artwork.currency} ${new Intl.NumberFormat('fr-CH').format(
                  artwork.asking_price
                )}`
              : null
          }
        />
        )}


      {artwork.sale_date && (
        <InfoRow
        label="Sale Date"
        value={formatDateTimeGeneva(
          artwork.sale_date, 
          artwork.sale_time
        )}
      />
      )}

      
      {artwork.auction_link && (
      <InfoRow
        label="Auction link"
        value={
          artwork.auction_link ? (
            <a
              href={artwork.auction_link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#007a5e',
                textDecoration: 'underline',
              }}
            >
              {(() => {
                try {
                  return new URL(artwork.auction_link).hostname
                } catch {
                  return artwork.auction_link
                }
              })()}
            </a>
          ) : (
            '—'
          )
        }
      />
      )}


      {artwork.estimate_low && (
        <InfoRow
        label="Estimation"
        value={
          artwork.estimate_low && artwork.estimate_high
            ? `${artwork.auction_currency} ${new Intl.NumberFormat('fr-CH').format(
                artwork.estimate_low
              )} – ${new Intl.NumberFormat('fr-CH').format(
                artwork.estimate_high
              )}`
            : artwork.estimate_low
            ? `${artwork.auction_currency} ${new Intl.NumberFormat('fr-CH').format(
                artwork.estimate_low
              )}`
            : '—'
        }
      />
      )}


{artwork.auctions === true && (
  <InfoRow
    label="Guarantee"
    value={artwork.guarantee === true ? 'Yes' : 'No'}
  />
)}




{hasValidNumber(artwork.sold_hammer) && (
  <InfoRow
    label="Sold"
    value={
      <>
        {artwork.auction_currency}{' '}
        {new Intl.NumberFormat('fr-CH').format(
          Number(artwork.sold_hammer)
        )}{' '}
        (hammer)
        {hasValidNumber(artwork.sold_premium) && (
          <>
            {' '}
            –{' '}
            {new Intl.NumberFormat('fr-CH').format(
              Number(artwork.sold_premium)
            )}{' '}
            (premium)
          </>
        )}
      </>
    }
  />
)}

{artwork.underbidder === true && (
  <InfoRow
    label="Underbidder"
    value="Yes"
  />
)}

      <InfoRow
        label="Location"
          value={
            artwork.location
              ? artwork.location.company_name ||
                [artwork.location.first_name, artwork.location.last_name]
                  .filter(Boolean)
                  .join(' ')
              : null
          }
        />
        <InfoRow label="Viewed on" value={formatDate(artwork.view_date)} />
        <InfoRow label="Condition" value={artwork.condition} />
        <InfoRow label="Status" value={artwork.status} />
        <InfoRow label="Priority" value={artwork.priority} />
        
      {artwork.certificate === true && (
      <InfoRow
        label="Certificate"
        value="Yes"
        />
      )}

      <InfoRow
        label="Certificate"
        value={
          artwork.certificate && artwork.certificateLocation
            ? artwork.certificateLocation.company_name ||
              [artwork.certificateLocation.first_name,
              artwork.certificateLocation.last_name]
                .filter(Boolean)
                .join(' ')
            : null
        }
      />



{artwork.buyer && (
  <InfoRow
    label="Buyer"
    value={
      artwork.buyer.company_name ||
      [artwork.buyer.first_name, artwork.buyer.last_name]
        .filter(Boolean)
        .join(' ')
    }
  />
)}

        {artwork.cost_amount && (
        <InfoRow
          label="Cost"
          value={
            artwork.cost_amount
              ? `${artwork.cost_currency} ${new Intl.NumberFormat('fr-CH').format(
                  artwork.cost_amount
                )}`
              : null
          }
        />
        )}

        {artwork.insurance_value && (
        <InfoRow
          label="Insurance"
          value={
            artwork.insurance_value
              ? `${artwork.insurance_currency} ${new Intl.NumberFormat('fr-CH').format(
                  artwork.insurance_value
                )}`
              : null
          }
        />
        )}

{artwork.destination && (
  <InfoRow
    label="Destination"
    value={
      artwork.destination.company_name ||
      [artwork.destination.first_name, artwork.destination.last_name]
        .filter(Boolean)
        .join(' ')
    }
  />
)}


{onedriveDocuments.length > 0 && (
  <InfoRow
    label="Links (OneDrive)"
    value={
      <>
        {onedriveDocuments.map((doc: any, index: number) => (
          <span key={doc.id}>
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#007a5e',
                textDecoration: 'underline',
                wordBreak: 'break-all',
              }}
            >
              {doc.label || 'Open document'}
            </a>

            {/* Séparateur sauf après le dernier */}
            {index < onedriveDocuments.length - 1 && ' / '}
          </span>
        ))}
      </>
    }
  />
)}



      </div>

      {/* ✅ Notes */}
      {artwork.notes && (
        <div style={{ whiteSpace: 'pre-wrap' }}>
          <strong>Notes</strong>
          <p>{artwork.notes}</p>
        </div>
      )}
<div className="page-break-indicator" />
    </section>
  )
}
