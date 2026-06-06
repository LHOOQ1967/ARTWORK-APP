
'use client'
import React from 'react'
import Link from 'next/link'
import type { ArtworkPrint, ArtworkDocument, Contact, Artist,} from '@/app/(protected)/types/artwork'
import ArtworkViewerComment from '@/components/artwork/ArtworkViewerComment'
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
  Draft: {
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
Bought: {
    bg: '#006039',
    color: 'white',
    label: 'Bought',
  },
  Archived: {
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
        gridTemplateColumns: '100px 1fr',
        columnGap: 12,
        alignItems: 'baseline',
        marginTop: 12,
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

function InfoRowShort({
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
        gridTemplateColumns: '100px 1fr',
        columnGap: 12,
        alignItems: 'baseline',
        marginTop: 2,
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

  return `${formattedDate} at ${formattedTime} (local time)`
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
  console.log('artwork print data', artwork)
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

  const buyer =
  artwork.buyer &&
  (
    artwork.buyer.company_name ||
    [artwork.buyer.first_name, artwork.buyer.last_name]
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

  

const artworkDocuments =
  artwork.documents?.filter(
    (d: ArtworkDocument) =>
      d.document_type === 'onedrive' || d.document_type === 'link'
  ) || []


const { role } = useSessionProfile()


const isAuction = !!artwork.auctions

const displayDateText = (() => {
  if (isAuction) {
    const datePart = artwork.sale_date
      ? new Date(artwork.sale_date).toLocaleDateString('fr-CH')
      : '—'

    // sale_time peut être "14:30", "14:30:00", etc.
    const timePart =
      artwork.sale_time
        ? String(artwork.sale_time).slice(0, 5) // "HH:MM"
        : ''

    return timePart ? `${datePart} at ${timePart}` : datePart
  }

  return artwork.date_proposition
    ? new Date(artwork.date_proposition).toLocaleDateString('fr-CH')
    : '—'
})()

const displayTitle = (() => {
  // Pour le tooltip: si auction, on met date+heure; sinon date_proposition + proposedBy
  if (isAuction) {
    const datePart = artwork.sale_date ?? '—'
    const timePart = artwork.sale_time ? String(artwork.sale_time).slice(0, 5) : ''
    return timePart ? `${datePart} ${timePart}` : `${datePart}`
  }

  return `${artwork.date_proposition ?? '—'} ${proposedBy ?? ''}`.trim()
})()


  return (
  <section
      style={{
    paddingTop: 1,
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 10,

        boxSizing: 'border-box',
      }}
    >
<div key={artwork.id} className="artwork-block">
<div
  style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end', // ✅ gauche / droite
    gap: 12,
    marginBottom: 8,
    width: '100%',
  }}
>
  {/* LEFT: Proposed date + by */}


{/* LEFT: Proposed date + by */}

  {/* RIGHT: Priority + Status + Edit */}
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      flexShrink: 0,         // ✅ ne se compresse pas
      flexWrap: 'wrap',  // ✅ reste sur une ligne
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
        backgroundColor:
          artwork.priority === 'High'
            ? '#006039'
            : artwork.priority === 'Medium'
            ? '#f2c94c'
            : '#eef0f5',
        color: artwork.priority === 'High' ? '#fff' : '#111',
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
      <Link className="no-print" href={`/artworks/${artworkId}/edit`}>
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
</div>

<div
  style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between', // ✅ gauche / droite
    gap: 12,
    marginBottom: 8,
    width: '100%',
  }}
>
  {/* LEFT: Proposed date + by */}


{/* LEFT: Proposed date + by */}
<div
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    flex: 1,
  }}
>
  <h2
    style={{
      fontSize: '1.3rem',
      textAlign: 'left',
      margin: 0,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }}
    title={displayTitle}
  >
    {displayDateText}

    {proposedBy && (
      <>
        {' by '}
        {artwork.auction_link ? (
          <a
            href={artwork.auction_link}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#007a5e', textDecoration: 'underline' }}
          >
            {proposedBy}
          </a>
        ) : (
          <span>{proposedBy}</span>
        )}
      </>
    )}
  </h2>
</div>



  {/* RIGHT: Priority + Status + Edit */}
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      flexShrink: 0,         // ✅ ne se compresse pas
      flexWrap: 'wrap',  // ✅ reste sur une ligne
    }}
  >
  </div>
</div>



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




{images.length > 0 && (() => {
  const mainMaxHeight = '12cm'
  const thumbnails = images.slice(1)
  const thumbnailCount = thumbnails.length
  const thumbColumns = thumbnailCount > 4 ? 3 : 2

  return (
    <div
      className="artwork-images"
      style={{
        display: 'inline-flex',
        gap: 12,
        flexWrap: 'nowrap',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        maxWidth: '100%',
      }}
    >
      {/* ===== Image principale (gauche) ===== */}
      <div
        className="artwork-image-wrapper"
        style={{
          flex: '0 0 auto',
          height: mainMaxHeight,
          maxHeight: mainMaxHeight,
          maxWidth: 420,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
        }}
      >
        <a
          href={images[0].url ?? ''}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            height: '100%',
            width: 'auto',
            maxWidth: '100%',
          }}
        >
          <img
            src={images[0].url ?? ''}
            alt={artwork.title ?? 'Artwork image'}
            style={{
              display: 'block',
              height: '100%',
              width: 'auto',
              maxWidth: '100%',
              objectFit: 'contain',
              objectPosition: 'left top',
              cursor: 'zoom-in',
            }}
          />
        </a>
      </div>

      {/* ===== Petites images à droite ===== */}
      {thumbnailCount > 0 && (
        <div
          className="artwork-image-thumbnails"
          style={{
            flex: '0 0 auto',
            display: 'grid',
            gridTemplateColumns: `repeat(${thumbColumns}, 5cm)`,
            gridAutoRows: '5cm',
            gap: 10,
            alignSelf: 'flex-start',
          }}
        >
          {thumbnails.map((image, index) => (
            <a
              key={image.id ?? `${image.url}-${index}`}
              href={image.url ?? ''}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                width: '5cm',
                height: '5cm',
                overflow: 'hidden',
                borderRadius: 4,
              }}
            >
              <img
                src={image.url ?? ''}
                alt={artwork.title ?? 'Artwork thumbnail'}
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                  cursor: 'zoom-in',
                }}
              />
            </a>
          ))}
        </div>
      )}
    </div>
  )
})()}



      {/* ✅ Metadata */}
{artwork.view_date && (        
<InfoRow
  label="Viewed on"
  value={formatDate(artwork.view_date ?? null)}
/>
 )}
{artwork.condition && (
        <InfoRowShort label="Condition" value={artwork.condition} />
 )}
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
        label="Auction Date"
        value={formatDateTimeGeneva(
          artwork.sale_date, 
          artwork.sale_time
        )}
      />
      )}

      {artwork.lot && (
        <InfoRowShort
        label="Lot#"
        value={(artwork.lot)}
      />
      )}
      
      {artwork.auction_link && (
      <InfoRowShort
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



{artwork.auctions === true && (
  <InfoRowShort
    label="Guarantee"
    value={artwork.guarantee === true ? 'Yes' : 'No'}
  />
)}

      {artwork.estimate_low && (
        <InfoRowShort
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

    {artwork.auction_max_hammer && (
        <InfoRowShort
        label="Suggestion B."
        value={
          artwork.auction_max_hammer && artwork.auction_max_premium
            ? `${artwork.auction_currency} ${new Intl.NumberFormat('fr-CH').format(
                artwork.auction_max_hammer
              )} – ${new Intl.NumberFormat('fr-CH').format(
                artwork.auction_max_premium
              )}`
            : artwork.auction_max_hammer
            ? `${artwork.auction_currency} ${new Intl.NumberFormat('fr-CH').format(
                artwork.auction_max_hammer
              )}`
            : '—'
        }
      />
      )}


{hasValidNumber(artwork.sold_hammer) && (
  <InfoRowShort
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
  <InfoRowShort
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
  label="Acquisition on"
  value={formatDate(artwork.date_acquisition ?? null)}
/>
 )}


{artwork.buyer && (
  <InfoRowShort
    label="Buyer"
    value={formatPersonOrCompany(artwork.buyer)}
  />
)}

        {artwork.cost_amount && (
        <InfoRowShort
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

        {artwork.commission_blondeau && (
        <InfoRowShort
          label="Commission B."
          value={
            artwork.commission_blondeau
              ? `${artwork.cost_currency} ${new Intl.NumberFormat('fr-CH').format(
                  artwork.commission_blondeau
                )}`
              : null
          }
        />
        )}


        {artwork.insurance_value && (
        <InfoRowShort
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


{artworkDocuments.length > 0 && (
  <InfoRow
    label="Links"
    value={
      <>
        {artworkDocuments.map((doc: ArtworkDocument, index: number) => (
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
            {index < artworkDocuments.length - 1 && ' / '}
          </span>
        ))}
      </>
    }
  />
)}
      </div>

      {/* ✅ Notes */}
      {artwork.notes && (
        <div style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>
          <strong>Notes</strong>
          <p>{artwork.notes}</p>
        </div>
      )}
<ArtworkViewerComment artworkId={artwork.id} />

</div>

<div className="artwork-separator" />
    </section>
  )
}
