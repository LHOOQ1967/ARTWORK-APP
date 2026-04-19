
'use client'
import React from 'react'

type Props = {
  artwork: any
}

/* ---------- helpers ---------- */
function InfoRow({ label, value }: { label: string; value?: React.ReactNode }) {
  if (!value) return null

  return (
    <div style={{ display: 'flex', marginBottom: 6 }}>
      <div style={{ width: 140, }}>{label} :</div>
      <div>{value}</div>
    </div>
  )
}

/* ---------- component ---------- */
export default function ArtworkSheet({ artwork }: Props) {
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
        minHeight: '100vh',
        boxSizing: 'border-box',
      }}
    >
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
              maxHeight: '70vh',
              objectFit: 'contain',
            }}
          />
        </div>
      )}



      {/* ✅ Metadata */}

      <div style={{ marginTop: 24 }}>
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
        <InfoRow label="Viewed on" value={artwork.view_date} />
        <InfoRow label="Condition" value={artwork.condition} />
        <InfoRow label="Status" value={artwork.status} />
        <InfoRow label="Priority" value={artwork.priority} />
      </div>

      {/* ✅ Notes */}
      {artwork.notes && (
        <div style={{ marginTop: 30 }}>
          <strong>Notes</strong>
          <p>{artwork.notes}</p>
        </div>
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




{onedriveDocuments.length > 0 && (
  <div style={{ marginTop: 30 }}>
    <h3
      style={{
        fontSize: '1.1rem',
        marginBottom: 8,
        borderBottom: '1px solid #ccc',
        paddingBottom: 4,
      }}
    >
      Documents
    </h3>

    <ul style={{ margin: 0, paddingLeft: 20 }}>
      {onedriveDocuments.map((doc: any) => (
        <li key={doc.id} style={{ marginBottom: 6 }}>
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
        </li>
      ))}
    </ul>
  </div>
)}





    </section>
  )
}
