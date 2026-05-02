
'use client'

import type { ArtworkForm, Artist, Contact } from '@/app/types/artwork'



type Props = {
  artwork: ArtworkForm
  setArtwork: React.Dispatch<React.SetStateAction<ArtworkForm>>
  isEditing: boolean

  // 🔎 Artists
  artistQuery?: string
  setArtistQuery?: React.Dispatch<React.SetStateAction<string>>
  artistResults?: Artist[]
  artistOptions?: Artist[]

  // 🔎 Contacts
  contactQuery?: string
  setContactQuery?: React.Dispatch<React.SetStateAction<string>>
  contactResults?: Contact[]
  contactOptions?: Contact[]

  // 🔎 Auctions
  auctionQuery?: string
  setAuctionQuery?: React.Dispatch<React.SetStateAction<string>>
  auctionResults?: any[]   // remplace par Auction[] si tu as un type

  // 🔎 Buyers
  buyerResults?: Contact[]

  // 🔎 Destinations
  destinationResults?: Contact[]
}



const CURRENCY_OPTIONS = ['CHF', 'EUR', 'USD', 'GBP', 'HKD'] as const

function SectionBlock({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        backgroundColor: '#e6e5e5',
        color: '#000000',
        borderRadius: 8,
        padding: 24,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      {children}
    </section>
  )
}


function EditRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12 }}>{label}</div>
      {children}
    </div>
  )
}


const editInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #ccc',
  borderRadius: 4,
  fontSize: '0.95rem',
  backgroundColor: 'white'
}


function DimensionInput({
  placeholder,
  value,
  onChange,
  disabled,
}: {
  placeholder: string
  value: number | null | undefined
  onChange: (v: number | null) => void
  disabled?: boolean
}) {
  return (
    <input
      type="number"
      placeholder={placeholder}
      value={value ?? ''}
      onChange={e =>
        onChange(
          e.target.value ? Number(e.target.value) : null
        )
      }
      disabled={disabled}
      style={{ ...editInputStyle, width: 90 }}
    />
  )
}


function Divider() {
  return (
    <div
      style={{
        borderTop: '2px solid #8a8a8a',
        margin: '10px 0',
      }}
    />
  )
}

function contactLabel(c?: Contact | Artist | null): string {
  if (!c) return '—'

  // ✅ Si c'est un Contact (company_name existe)
  if ('company_name' in c && c.company_name) {
    return c.company_name
  }

  // ✅ Contact ou Artist → fallback nom/prénom
  return [c.first_name, c.last_name].filter(Boolean).join(' ')
}




export function ArtworkFieldsLayout({
  artwork,
  setArtwork,
  isEditing,

  // ✅ ARTIST (OBLIGATOIRE)
  artistQuery,
  setArtistQuery,
  artistResults,
  artistOptions,

  // ✅ CONTACT (déjà vu)
  contactQuery,
  setContactQuery,
  contactResults,
  contactOptions,

  auctionQuery,
  setAuctionQuery,
  auctionResults,
  buyerResults,
  destinationResults,
}: Props) {


  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 30,
        color: 'black',
        marginTop: '30px'
      }}
    >
      {/* ===================== */}
      {/* Proposal */}
      {/* ===================== */}
      <SectionBlock>
<h3
  style={{
    textAlign: 'center',   // ✅ centre uniquement cette ligne
    fontSize: '1.3rem',    // ✅ légèrement plus grand (optionnel)
    }}
>
  Proposition by
</h3>

        <EditRow label="Date proposed">
          <input
            type="date"
            value={artwork.date_proposition ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                date_proposition: e.target.value || null,
              })
            }
            style={{ ...editInputStyle, width: 160 }}
            disabled={!isEditing}
          />
        </EditRow>


<EditRow label="Proposed by">
  <div
    style={{
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    }}
  >
    {/* 🔍 Search */}
    {isEditing && (
      <input
        type="text"
        placeholder="Search"
        value={contactQuery}
onChange={e => {
  if (setContactQuery) {
    setContactQuery(e.target.value)
  }
}}
        style={{
          width: 120,
          padding: '6px 8px',
          fontSize: '0.9rem',
          border: '1px solid #ccc',
          borderRadius: 4,
          backgroundColor: 'white'
        }}
      />
    )}

    {/* ✅ Select */}
    <select
      value={artwork.proposed_by_id ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          proposed_by_id: e.target.value || null,
        })
      }
      style={{
        ...editInputStyle,
        flex: 1,
      }}
      disabled={!isEditing}
    >
      <option value="">—</option>

      {(contactQuery ? contactResults ?? [] : contactOptions ?? []).map(c => (
        <option key={c.id} value={c.id}>
          {contactLabel(c)}
        </option>
      ))}
    </select>
  </div>
</EditRow>

      </SectionBlock>

      {/* ===================== */}
      {/* Artwork */}
      {/* ===================== */}
      <SectionBlock>
<h3
  style={{
    textAlign: 'center',   // ✅ centre uniquement cette ligne
    fontSize: '1.3rem',    // ✅ légèrement plus grand (optionnel)
    }}
>
  Artwork detail
</h3>


<EditRow label="Artist">
  <div
    style={{
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      backgroundColor: 'white'
    }}
  >
    {/* 🔍 Search artist */}
    {isEditing && (
      <input
        type="text"
        placeholder="Search"
        value={artistQuery}
        onChange={e => setArtistQuery?.(e.target.value)}
        style={{
          width: 120,
          padding: '6px 8px',
          fontSize: '0.9rem',
          border: '1px solid #ccc',
          borderRadius: 4,
        }}
      />
    )}

    {/* ✅ Select artist */}
    <select
      value={artwork.artist_id ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          artist_id: e.target.value || null,
        })
      }
      style={{
        ...editInputStyle,
        flex: 1,
      }}
      disabled={!isEditing}
    >
      <option value="">—</option>

      {(artistQuery ? artistResults ?? [] : artistOptions ?? []).map(a => (
        <option key={a.id} value={a.id}>
          {[a.first_name, a.last_name].filter(Boolean).join(' ')}
        </option>
      ))}
    </select>
  </div>
</EditRow>


        <EditRow label="Title">
          <input
            type="text"
            value={artwork.title ?? ''}
            onChange={e =>
              setArtwork({ ...artwork, title: e.target.value })
            }
            style={editInputStyle}
            disabled={!isEditing}
          />
        </EditRow>

        <EditRow label="Year">
          <input
            type="number"
            value={artwork.year_execution ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                year_execution:
                  e.target.value === ''
                    ? null
                    : Number(e.target.value),
              })
            }
            style={{ ...editInputStyle, width: 120 }}
            disabled={!isEditing}
          />
        </EditRow>

        <EditRow label="Medium">
          <input
            type="text"
            value={artwork.medium ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                medium: e.target.value || null,
              })
            }
            style={editInputStyle}
            disabled={!isEditing}
          />
        </EditRow>

        <EditRow label="Signature">
          <input
            type="text"
            value={artwork.signature ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                signature: e.target.value || null,
              })
            }
            style={editInputStyle}
            disabled={!isEditing}
          />
        </EditRow>

        <EditRow label="Dimensions (cm)">
          <div style={{ display: 'flex', gap: 8 }}>
            <DimensionInput
              placeholder="H"
              value={artwork.height_cm}
              onChange={v =>
                setArtwork({ ...artwork, height_cm: v })
              }
              disabled={!isEditing}
            />
            <DimensionInput
              placeholder="W"
              value={artwork.width_cm}
              onChange={v =>
                setArtwork({ ...artwork, width_cm: v })
              }
              disabled={!isEditing}
            />
            <DimensionInput
              placeholder="D"
              value={artwork.depth_cm}
              onChange={v =>
                setArtwork({ ...artwork, depth_cm: v })
              }
              disabled={!isEditing}
            />
          </div>
        </EditRow>
      </SectionBlock>




<SectionBlock>
{/* ===================== */}
{/* Location */}
{/* ===================== */}

<EditRow label="Location">
  <div
    style={{
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    }}
  >
    {/* 🔍 Search */}
    {isEditing && (
      <input
        type="text"
        placeholder="Search"
        value={contactQuery}
        onChange={e => setContactQuery?.(e.target.value)}
        style={{
          width: 120,
          padding: '6px 8px',
          fontSize: '0.9rem',
          border: '1px solid #ccc',
          borderRadius: 4,
          backgroundColor: 'white'
        }}
      />
    )}

    {/* ✅ Select */}
    <select
      value={artwork.location_contact_id ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          location_contact_id: e.target.value || null,
        })
      }
      style={{
        ...editInputStyle,
        flex: 1,
      }}
      disabled={!isEditing}
    >
      <option value="">—</option>


{(artistQuery ? contactResults ?? [] : contactOptions ?? []).map(a => (
  <option key={a.id} value={a.id}>
    {contactLabel(a)}
  </option>

      ))}
    </select>
  </div>
</EditRow>


{/* ===================== */}
{/* View date */}
{/* ===================== */}
<EditRow label="View date">
  <input
    type="date"
    value={artwork.view_date ?? ''}
    onChange={e =>
      setArtwork({
        ...artwork,
        view_date: e.target.value || null,
      })
    }
    style={{ ...editInputStyle, width: 160 }}
    disabled={!isEditing}
  />
</EditRow>

{/* ===================== */}
{/* Condition */}
{/* ===================== */}
<EditRow label="Condition">
  <input
    value={artwork.condition ?? ''}
    onChange={e =>
      setArtwork({
        ...artwork,
        condition: e.target.value || null,
      })
    }
    style={editInputStyle}
    disabled={!isEditing}
  />
</EditRow>

{/* ===================== */}
{/* Certificate */}
{/* ===================== */}
<EditRow label="Certificate">
  <select
    value={artwork.certificate ? 'yes' : 'no'}
    onChange={e =>
      setArtwork({
        ...artwork,
        certificate: e.target.value === 'yes',
      })
    }
    style={{ ...editInputStyle, width: 90 }}
    disabled={!isEditing}
  >
    <option value="no">No</option>
    <option value="yes">Yes</option>
  </select>
</EditRow>

{/* ===================== */}
{/* Certificate location */}
{/* ===================== */}

{artwork.certificate && (
<EditRow label="Certificate Location">
  <div
    style={{
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    }}
  >
    {/* 🔍 Search */}
    {isEditing && (
      <input
        type="text"
        placeholder="Search"
        value={contactQuery}
        onChange={e => setContactQuery?.(e.target.value)}
        style={{
          width: 120,
          padding: '6px 8px',
          fontSize: '0.9rem',
          border: '1px solid #ccc',
          borderRadius: 4,
          backgroundColor: 'white'
        }}
      />
    )}

    {/* ✅ Select */}
    <select
      value={artwork.certificate_location_contact_id ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          certificate_location_contact_id: e.target.value || null,
        })
      }
      style={{
        ...editInputStyle,
        flex: 1,
      }}
      disabled={!isEditing}
    >
      <option value="">—</option>

      {(contactQuery ? contactResults ?? [] : contactOptions ?? []).map(c => (
        <option key={c.id} value={c.id}>
          {contactLabel(c)}
        </option>
      ))}
    </select>
  </div>
</EditRow>
)}


{/* ===================== */}
{/* Priority */}
{/* ===================== */}
<EditRow label="Priority">
  <select
    value={artwork.priority ?? ''}
    onChange={e =>
      setArtwork({
        ...artwork,
        priority: e.target.value as 'information' | 'medium' | 'high',
      })
    }
    style={{ ...editInputStyle, width: 120 }}
    disabled={!isEditing}
  >
    <option value="">—</option>
    <option value="information">Information</option>
    <option value="medium">Medium</option>
    <option value="high">High</option>
  </select>
</EditRow>

{/* ===================== */}
{/* Status */}
{/* ===================== */}
<EditRow label="Status">
  <select
    value={artwork.status ?? ''}
    onChange={e =>
      setArtwork({
        ...artwork,
        status: e.target.value as
          | 'draft'
          | 'viewed'
          | 'negotiation'
          | 'bought'
          | 'archived',
      })
    }
    style={{ ...editInputStyle, width: 160 }}
    disabled={!isEditing}
  >
    <option value="">—</option>
    <option value="draft">Draft</option>
    <option value="viewed">Viewed</option>
    <option value="negotiation">Negotiation</option>
    <option value="bought">Bought</option>
    <option value="archived">Archived</option>
  </select>
</EditRow>
</SectionBlock>


<SectionBlock>
<h3
  style={{
    textAlign: 'center',   // ✅ centre uniquement cette ligne
    fontSize: '1.3rem',    // ✅ légèrement plus grand (optionnel)
    }}
>
  Auction
</h3>

  {/* Auction yes / no */}
  <EditRow label="Auction">
    <select
      value={artwork.auctions ? 'yes' : 'no'}
      onChange={e =>
        setArtwork({
          ...artwork,
          auctions: e.target.value === 'yes',
          auction_link:
            e.target.value === 'yes'
              ? artwork.auction_link
              : null,
        })
      }
      style={{ ...editInputStyle, width: 90 }}
      disabled={!isEditing}
    >
      <option value="no">No</option>
      <option value="yes">Yes</option>
    </select>
  </EditRow>

  {artwork.auctions && (
    <>
      <EditRow label="Auction link">
        <input
          type="url"
          value={artwork.auction_link ?? ''}
          onChange={e =>
            setArtwork({
              ...artwork,
              auction_link: e.target.value || null,
            })
          }
          style={editInputStyle}
          disabled={!isEditing}
        />
      </EditRow>

      {artwork.certificate && (
<EditRow label="Auction House">
  <div
    style={{
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    }}
  >
    {/* 🔍 Search */}
    {isEditing && (
      <input
        type="text"
        placeholder="Search"
        value={contactQuery}
        onChange={e => setContactQuery?.(e.target.value)}
        style={{
          width: 120,
          padding: '6px 8px',
          fontSize: '0.9rem',
          border: '1px solid #ccc',
          borderRadius: 4,
          backgroundColor: 'white'
        }}
      />
    )}

    {/* ✅ Select */}
    <select
      value={artwork.auction_contact_id ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          auction_contact_id: e.target.value || null,
        })
      }
      style={{
        ...editInputStyle,
        flex: 1,
      }}
      disabled={!isEditing}
    >
      <option value="">—</option>

      {(contactQuery ? contactResults ?? [] : contactOptions ?? []).map(c => (
        <option key={c.id} value={c.id}>
          {contactLabel(c)}
        </option>
      ))}
    </select>
  </div>
</EditRow>
)}


      <EditRow label="Sale date">
        <input
          type="date"
          value={artwork.sale_date ?? ''}
          onChange={e =>
            setArtwork({
              ...artwork,
              sale_date: e.target.value || null,
            })
          }
          style={editInputStyle}
          disabled={!isEditing}
        />
      </EditRow>

      <EditRow label="Sale time">
        <input
          type="time"
          value={artwork.sale_time ?? ''}
          onChange={e =>
            setArtwork({
              ...artwork,
              sale_time: e.target.value || null,
            })
          }
          style={editInputStyle}
          disabled={!isEditing}
        />
      </EditRow>

      <EditRow label="Lot #">
        <input
          type="text"
          value={artwork.lot ?? ''}
          onChange={e =>
            setArtwork({
              ...artwork,
              lot: e.target.value || null,
            })
          }
          style={editInputStyle}
          disabled={!isEditing}
        />
      </EditRow>

      <EditRow label="Auction currency">
        <select
          value={artwork.auction_currency ?? ''}
          onChange={e =>
            setArtwork({
              ...artwork,
              auction_currency: e.target.value || null,
            })
          }
          style={{ ...editInputStyle, width: 110 }}
          disabled={!isEditing}
        >
          <option value="">—</option>
          <option value="CHF">CHF</option>
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
          <option value="GBP">GBP</option>
          <option value="HKD">HKD</option>
        </select>
      </EditRow>

      <EditRow label="Estimate">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            placeholder="Low"
            value={artwork.estimate_low ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                estimate_low:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
            style={{ ...editInputStyle, width: 120 }}
            disabled={!isEditing}
          />
          <input
            type="number"
            placeholder="High"
            value={artwork.estimate_high ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                estimate_high:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
            style={{ ...editInputStyle, width: 120 }}
            disabled={!isEditing}
          />
        </div>
      </EditRow>

      <EditRow label="Result">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            placeholder="Hammer"
            value={artwork.sold_hammer ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                sold_hammer:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
            style={{ ...editInputStyle, width: 120 }}
            disabled={!isEditing}
          />
          <input
            type="number"
            placeholder="Premium"
            value={artwork.sold_premium ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                sold_premium:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
            style={{ ...editInputStyle, width: 120 }}
            disabled={!isEditing}
          />
        </div>
      </EditRow>

      <EditRow label="Guarantee">
        <select
          value={artwork.guarantee ? 'yes' : 'no'}
          onChange={e =>
            setArtwork({
              ...artwork,
              guarantee: e.target.value === 'yes',
            })
          }
          style={{ ...editInputStyle, width: 90 }}
          disabled={!isEditing}
        >
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </EditRow>
    </>
  )}
</SectionBlock>


<SectionBlock>
<h3
  style={{
    textAlign: 'center',   // ✅ centre uniquement cette ligne
    fontSize: '1.3rem',    // ✅ légèrement plus grand (optionnel)
    }}
>
  Private Market
</h3>

  <EditRow label="Currency">
    <select
      value={artwork.currency ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          currency: e.target.value || null,
        })
      }
      style={{ ...editInputStyle, width: 100 }}
      disabled={!isEditing}
    >
      <option value="">—</option>
      {CURRENCY_OPTIONS.map(c => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  </EditRow>

  <EditRow label="Asking price">
    <input
      type="number"
      value={artwork.asking_price ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          asking_price:
            e.target.value === '' ? null : Number(e.target.value),
        })
      }
      style={{ ...editInputStyle, width: 160 }}
      disabled={!isEditing}
    />
  </EditRow>
</SectionBlock>


<SectionBlock>
<h3
  style={{
    textAlign: 'center',   // ✅ centre uniquement cette ligne
    fontSize: '1.3rem',    // ✅ légèrement plus grand (optionnel)
    }}
>
  Acquisition
</h3>

  <EditRow label="Acquired">
    <select
      value={artwork.date_acquisition ? 'yes' : 'no'}
      onChange={e =>
        setArtwork({
          ...artwork,
          date_acquisition:
            e.target.value === 'yes'
              ? artwork.date_acquisition ??
                new Date().toISOString().slice(0, 10)
              : null,
        })
      }
      style={{ ...editInputStyle, width: 90 }}
      disabled={!isEditing}
    >
      <option value="no">No</option>
      <option value="yes">Yes</option>
    </select>
  </EditRow>



  {artwork.date_acquisition && (
    <>
<EditRow label="Buyer">
  <div
    style={{
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    }}
  >
    {/* 🔍 Search */}
    {isEditing && (
      <input
        type="text"
        placeholder="Search"
        value={contactQuery}
        onChange={e => setContactQuery?.(e.target.value)}
        style={{
          width: 120,
          padding: '6px 8px',
          fontSize: '0.9rem',
          border: '1px solid #ccc',
          borderRadius: 4,
          backgroundColor: 'white'
        }}
      />
    )}

    {/* ✅ Select */}
    <select
      value={artwork.buyer_contact_id ?? ''}
      onChange={e =>
        setArtwork({
          ...artwork,
          buyer_contact_id: e.target.value || null,
        })
      }
      style={{
        ...editInputStyle,
        flex: 1,
      }}
      disabled={!isEditing}
    >
      <option value="">—</option>

      {(contactQuery ? contactResults ?? [] : contactOptions ?? []).map(c => (
        <option key={c.id} value={c.id}>
          {contactLabel(c)}
        </option>
      ))}
    </select>
  </div>
</EditRow>

      <EditRow label="Date acquisition">
        <input
          type="date"
          value={artwork.date_acquisition ?? ''}
          onChange={e =>
            setArtwork({
              ...artwork,
              date_acquisition: e.target.value || null,
            })
          }
          style={editInputStyle}
          disabled={!isEditing}
        />
      </EditRow>

      <EditRow label="Cost">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            value={artwork.cost_amount ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                cost_amount:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
            style={{ ...editInputStyle, width: 140 }}
            disabled={!isEditing}
          />
          <select
            value={artwork.cost_currency ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                cost_currency: e.target.value || null,
              })
            }
            style={{ ...editInputStyle, width: 90 }}
            disabled={!isEditing}
          >
            <option value="">—</option>
            {CURRENCY_OPTIONS.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </EditRow>
    </>
  )}
</SectionBlock>



      {/* ===================== */}
      {/* Notes */}
      {/* ===================== */}
      <SectionBlock>
<h3
  style={{
    textAlign: 'center',   // ✅ centre uniquement cette ligne
    fontSize: '1.3rem',    // ✅ légèrement plus grand (optionnel)
    }}
>
  Notes
</h3>

        <EditRow label=" ">
          <textarea
            value={artwork.notes ?? ''}
            onChange={e =>
              setArtwork({
                ...artwork,
                notes: e.target.value,
              })
            }
            style={{
              marginTop: '10px',
              width: '100%',
              minHeight: 120,
              padding: 8,
              fontSize: '0.95rem',
              border: '1px solid #ccc',
              borderRadius: 4,
              resize: 'vertical',
              backgroundColor: 'white'
            }}
            disabled={!isEditing}
          />
        </EditRow>
      </SectionBlock>
    </div>
  )
}
