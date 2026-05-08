
'use client'
import React from 'react'
import Link from 'next/link'
import type { ArtworkPrint, ArtworkDocument, Contact, Artist,} from '@/app/(protected)/types/artwork'

import { useSessionProfile } from '@/contexts/SessionContext'
import { canEditArtworks } from '@/lib/permissions'


type Props = {
  artwork: ArtworkPrint
  isEditMode?: boolean
  canEdit: boolean
}


const STATUS_STYLES: Record<
  string,
  { bg: string; color: string; label?: string }
> = {
  draft: {
    bg: '#d9d6d6',
    color: 'black',
    label: 'Draft',
  },
  Viewed: {
    bg: 'white',
    color: 'black',
    label: 'Viewed',
  }, 
    Negociation: {
    bg: 'white',
    color: 'black',
    label: 'Negociation',
  }, 
  bought: {
    bg: '#006039',
    color: 'white',
    label: 'Bought',
  },
  archived: {
    bg: '#F8D7DA',
    color: '#721C24',
    label: 'Archived',
  },
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

export default function ArtworkSheet({ artwork, isEditMode, canEdit }: Props) {
const artworkId = artwork.id

 const statusKey = artwork.status ?? 'UNKNOWN' 
 

const statusStyle =
  STATUS_STYLES[statusKey] ?? {
    bg: '#E2E3E5',
    color: '#383D41',
    label: statusKey,
  }



const proposedBy =
  artwork.proposedBy &&
  (
    artwork.proposedBy.company_name ||
    [artwork.proposedBy.first_name, artwork.proposedBy.last_name]
      .filter(Boolean)
      .join(' ')
  )



function formatPersonOrCompany(person?: {
  company_name?: string | null
  first_name?: string | null
  last_name?: string | null
}) {
  if (!person) return '—'

  return (
    person.company_name?.trim() ||
    [person.first_name, person.last_name]
      .filter(Boolean)
      .join(' ') ||
    '—'
  )
}


const images: ArtworkDocument[] =
  artwork.documents
    ?.filter((d: ArtworkDocument) => d.document_type === 'image')
    .sort(
      (a: ArtworkDocument, b: ArtworkDocument) =>
        (a.position ?? 0) - (b.position ?? 0)
    ) ?? []

const thumbnailCount = Math.max(0, images.length - 1)
const thumbnailRows = Math.max(1, Math.ceil(thumbnailCount / 2))
const thumbnailHeight = thumbnailCount === 4 ? '10cm' : 'auto'

  
  const onedriveDocuments =
    artwork.documents?.filter(
      (d: ArtworkDocument) => d.document_type === 'onedrive'
    ) || []

const { role } = useSessionProfile()




  return (
  <section
      style={{
        padding: 1,
        boxSizing: 'border-box',
      }}
    >

<div
  className="no-print"
  style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end', // ✅ tout à droite
    gap: 10,                    // ✅ espace entre les 3
    marginBottom: 8,
  }}
>
  {/* Priority */}
  <span
    style={{
      padding: '4px 12px',
      borderRadius: 14,
      fontSize: '1rem',
      fontWeight: 600,
      letterSpacing: '0.04em',
      backgroundColor: '#eef0f5', // optionnel
      color: '#111',
    }}
  >
    [{artwork.priority}]
  </span>

  {/* Status */}
  <span
    style={{
      backgroundColor: statusStyle.bg,
      color: statusStyle.color,
      padding: '4px 12px',
      borderRadius: 14,
      fontSize: '1rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }}
  >
    {statusStyle.label ?? artwork.status}
  </span>

  {/* Edit */}
  {!isEditMode && canEdit && (
    <Link href={`/artworks/${artworkId}/edit`}>
      <button
        className="edit-button"
        onMouseUp={e => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = '0 3px 0 #bbb'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = '0 3px 0 #bbb'
        }}
      >
        Edit
      </button>
    </Link>
  )}
</div>

<div key={artwork.id} className="artwork-block">

<h2 style={{ fontSize: '1.3rem', textAlign: 'center' }}>
  {artwork.date_proposition
    ? new Date(artwork.date_proposition).toLocaleDateString('fr-CH')
    : '—'}

  {proposedBy && (
    <>
      {' by '}
      {artwork.auction_link ? (
        <a
          href={artwork.auction_link}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#007a5e',
            textDecoration: 'underline',
          }}
        >
          {proposedBy}
        </a>
      ) : (
        <span>{proposedBy}</span>
      )}
    </>
  )}
</h2>



      {/* ✅ Artist */}
      {artwork.artist && (
        <h2 style={{ fontSize: '1.6rem', }}>
          {[artwork.artist.first_name, artwork.artist.last_name]
            .filter(Boolean)
            .join(' ')}
        </h2>
      )}

      {/* ✅ Title */}
      <h1 style={{ fontSize: '1.4rem',  }}>
        {artwork.title || 'Untitled'}
        {artwork.year_execution ? `, ${artwork.year_execution}` : ''}
      </h1>


      {/* ✅ Medium */}
      <h1 style={{ fontSize: '1.2rem',  }}>{artwork.medium}</h1> 

             {/* ✅ Medium */}

        
       {artwork.signature && (
          <h1 style={{fontSize: '1.2rem',  }}>{artwork.signature}</h1>  
        
      )}

      {/* ✅ Dimensions */}
      {artwork.height_cm && (
        <div style={{ fontSize: '1.2rem', marginBottom: 5 }}>
          {artwork.height_cm} × {artwork.width_cm}
          {artwork.depth_cm ? ` × ${artwork.depth_cm}` : ''} cm
        </div>
      )}






{images.length > 0 && (

<div
  className="artwork-images"
  style={{
    display: 'flex',
    gap: 16,
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    width: '100%',
  }}
>
  <div
    className="artwork-image-wrapper"
    style={{
      flex: '1 1 auto',
      minWidth: 240,
      maxWidth: '100%',
      maxHeight: '10cm',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      overflow: 'hidden',
    }}
  >
    <a
      href={images[0].url ?? ''}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      <img
        src={images[0].url ?? ''}
        alt={artwork.title ?? 'Artwork image'}
        style={{
          width: '100%',
          height: '100%',
          maxHeight: '10cm',
          objectFit: 'contain',
          objectPosition: 'left top',
          cursor: 'zoom-in',
        }}
      />
    </a>
  </div>

  {images.length > 1 && (
    <div
      className="artwork-image-thumbnails"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gridTemplateRows: `repeat(${thumbnailRows}, minmax(0, 1fr))`,
        gridAutoRows: '1fr',
        gap: 12,
        width: 320,
        minWidth: 320,
        height: thumbnailHeight,
        alignSelf: 'flex-start',
      }}
    >
      {images.slice(1).map((image) => (
        <a
          key={image.id}
          href={image.url ?? ''}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'block', width: '100%', height: '100%' }}
        >
          <img
            src={image.url ?? ''}
            alt={image.label ?? artwork.title ?? 'Artwork thumbnail'}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: 4,
              cursor: 'zoom-in',
              display: 'block',
            }}
          />
        </a>
      ))}
    </div>
  )}
</div>

)}



      {/* ✅ Metadata */}

      <div style={{ marginTop: 12 }}>
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

      {artwork.lot && (
        <InfoRow
        label="Lot#"
        value={(artwork.lot)}
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
{artwork.location && (
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
        )}
{artwork.view_date && (        
<InfoRow
  label="Viewed on"
  value={formatDate(artwork.view_date ?? null)}
/>
 )}
{artwork.condition && (
        <InfoRow label="Condition" value={artwork.condition} />
 )}

        
        <InfoRow label="Priority" value={artwork.priority} />
  

{artwork.certificate === true && (
  <InfoRow
    label="Certificate"
    value={
      artwork.certificateLocation
        ? artwork.certificateLocation.company_name ||
          [artwork.certificateLocation.first_name,
           artwork.certificateLocation.last_name]
            .filter(Boolean)
            .join(' ')
        : 'Yes'
    }
  />
)}


{artwork.date_acquisition && (        
<InfoRow
  label="Date acquisition"
  value={formatDate(artwork.date_acquisition ?? null)}
/>
 )}

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
        {onedriveDocuments.map((doc: ArtworkDocument, index: number) => (
          <span key={doc.id}>
            <a
              href={doc.url ?? undefined}
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
</div>
<div className="artwork-separator" />
    </section>
  )
}
