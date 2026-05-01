
'use client'

import { useState } from 'react'

type AuditResult = {
  checked_at: string
  total_artworks: number
  invalid_count: number
  invalid_artworks: {
    id: string
    title: string | null
    proposals_count: number
  }[]
}


const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid #ddd',
  fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid #eee',
}



export function AuditProposedAtShortcut() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AuditResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runAudit() {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch(
        '/api/artworks/checks/missing-proposed-at'
      )

      if (!res.ok) {
        throw new Error('Audit failed')
      }

      const data = await res.json()
      setResult(data)
    } catch (err) {
      setError('Impossible de lancer le contrôle')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: 16,
        maxWidth: 420,
      }}
    >
      <button
        onClick={runAudit}
        disabled={loading}
        style={{ backgroundColor: 'white', color: '#333', 
          padding: '6px 12px',
          borderRadius: 4,
          border: '1px solid #ccc',
          cursor: 'pointer',
        }}
      >
        {loading ? 'Vérification…' : 'Vérifier les proposed_at'}
      </button>

      {error && (
        <div style={{ backgroundColor: 'white', color: '#b00020', marginTop: 10 }}>
          {error}
        </div>
      )}


{result && (
  <div
    style={{
      backgroundColor: 'white',
      marginTop: 12,
      fontSize: '0.9rem',
      borderRadius: 6,
      padding: 12,
      border: '1px solid #e0e0e0',
    }}
  >
    {result.invalid_count === 0 ? (
      <div style={{ color: '#1b5e20' }}>
        ✅ Tous les artworks ont au moins une date de proposition.
      </div>
    ) : (
      <>
        <div style={{ color: '#333', marginBottom: 8 }}>
          ⚠️ {result.invalid_count} artwork
          {result.invalid_count > 1 ? 's' : ''} sans
          <strong> proposed_at</strong>
        </div>

        <table
          style={{ color: '#333', 
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.85rem',
          }}
        >
          <thead>
            <tr>
              <th style={thStyle}>Titre</th>
              <th style={thStyle}>Artiste</th>
              <th style={thStyle}>Date proposée</th>
            </tr>
          </thead>
          <tbody>
            {result.artworks.map(artwork => (
              <tr key={artwork.id}>
                <td style={tdStyle}>
                  {artwork.title || '—'}
                </td>
                <td style={tdStyle}>
                  {artwork.artist_name || '—'}
                </td>
                <td style={tdStyle}>
                  {artwork.proposed_by_date || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )}
  </div>
)}

    </div>
  )
}
