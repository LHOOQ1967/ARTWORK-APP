
'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import ArtworkCreateContent from '@/components/artwork/ArtworkCreateContent'
import { supabase } from '@/lib/supabaseBrowser'
import mapImportToArtworkPrefill from '@/lib/imports/mapImportToArtworkPrefill'

type ArtworkImportRow = {
  id: string
  artist_match_id: string | null
  parsed_data?: Record<string, any> | null
  confidence?: Record<string, any> | null
  status?: string
  image_url?: string | null
  ocr_text?: string | null
}

export default function ArtworkNewPage() {
  const searchParams = useSearchParams()
  const importId = searchParams.get('import_id')

  const [loading, setLoading] = useState(true)
  const [initialValues, setInitialValues] = useState<any>(null)
  const [importRow, setImportRow] = useState<ArtworkImportRow | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')


useEffect(() => {
  let cancelled = false

  async function loadImport() {
    if (!importId) {
      if (!cancelled) {
        setInitialValues(null)
        setImportRow(null)
        setLoading(false)
      }
      return
    }

    try {
      setLoading(true)
      setErrorMessage('')

      // ✅ 1. charger import DB
      const { data, error } = await supabase
        .from('artwork_imports')
        .select('*')
        .eq('id', importId)
        .single()

      if (error) {
        throw new Error(error.message || "Impossible de charger l'import.")
      }

      if (!cancelled && data) {
        setImportRow(data)

        // ✅ 2. essayer sessionStorage (PRIORITAIRE)
        const storageKey = `artwork_import_prefill_${importId}`
        const raw = sessionStorage.getItem(storageKey)

        if (raw) {
          try {
            const prefillFromSession = JSON.parse(raw)

            console.log("[ARTWORK NEW] prefill from session =", prefillFromSession)

            setInitialValues(prefillFromSession)
            sessionStorage.removeItem(storageKey)
            return
          } catch (e) {
            console.error("[ARTWORK NEW] invalid session prefill", e)
          }
        }

        // ✅ 3. fallback DB
        const mapped = mapImportToArtworkPrefill(data)

        console.log("[ARTWORK NEW] prefill from DB =", mapped)

        setInitialValues(mapped)
      }

    } catch (error: any) {
      if (!cancelled) {
        setErrorMessage(
          error?.message || "Erreur inattendue lors du chargement de l’import."
        )
        setInitialValues(null)
        setImportRow(null)
      }
    } finally {
      if (!cancelled) {
        setLoading(false)
      }
    }
  }

  loadImport()

  return () => {
    cancelled = true
  }
}, [importId])


  if (loading) {
    return (     <main
      style={{
        paddingTop: 80,
        paddingLeft: 10,
        paddingRight: 10,
        paddingBottom: 10,
        minHeight: "100vh",
        background: "#006039",
      }}
    >
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.title}>Création d’œuvre</div>
          <div style={styles.message}>Chargement du préremplissage…</div>
        </div>
      </div></main>
    )
  }

  return (
    <main
      style={{
        paddingTop: 10,
        paddingLeft: 10,
        paddingRight: 10,
        paddingBottom: 10,
        minHeight: "100vh",
        background: "#006039",
      }}
    >


      <ArtworkCreateContent
        initialValues={initialValues}
        importRow={importRow}
      />
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  card: {
    border: '1px solid #d9e1e7',
    borderRadius: '10px',
    background: '#ffffff',
    padding: '16px 18px',
  },
  infoCard: {
    background: '#eef6ff',
    border: '1px solid #cfe0f3',
  },
  errorCard: {
    background: '#fdeceb',
    border: '1px solid #f3c8c5',
  },
  title: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#183247',
    marginBottom: '8px',
  },
  message: {
    fontSize: '14px',
    color: '#4b5b68',
  },
  infoText: {
    fontSize: '14px',
    color: '#183247',
    marginBottom: '4px',
  },
  subtleText: {
    fontSize: '13px',
    color: '#5d6c78',
    lineHeight: 1.45,
  },
  errorText: {
    fontSize: '14px',
    color: '#8b1e1a',
    marginBottom: '4px',
  },
}
