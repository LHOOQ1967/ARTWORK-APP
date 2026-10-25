'use client'

import {
  DOCUMENT_VISIBILITY_LABELS,
  type DocumentAccess,
  type DocumentClientOption,
} from '@/lib/documentVisibility'

export default function DocumentVisibilityFields({
  value,
  clients,
  onChange,
  disabled = false,
  label = 'Document',
}: {
  value: DocumentAccess
  clients: DocumentClientOption[]
  onChange: (access: DocumentAccess) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <label className="document-edit-field" style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, minWidth: 0, maxWidth: '100%' }}>
        Visibility{' '}
        <select
          className="document-edit-select"
          style={{ border: '1px solid #c8ceca', borderRadius: 5, backgroundColor: '#fff', padding: '5px 8px', minHeight: 34 }}
          aria-label={`${label} visibility`}
          value={value.visibility}
          disabled={disabled}
          onChange={event => {
            const visibility = event.target.value
            if (visibility === 'all_clients' || visibility === 'internal' || visibility === 'selected_client') {
              onChange({
                visibility,
                recipient_contact_id: visibility === 'selected_client' ? value.recipient_contact_id : null,
              })
            }
          }}
        >
          {Object.entries(DOCUMENT_VISIBILITY_LABELS).map(([key, text]) => (
            <option key={key} value={key}>{text}</option>
          ))}
        </select>
      </label>
      {value.visibility === 'selected_client' && (
        <label className="document-edit-field" style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, minWidth: 0, maxWidth: '100%' }}>
          Client{' '}
          <select
            className="document-edit-select"
            style={{ border: '1px solid #c8ceca', borderRadius: 5, backgroundColor: '#fff', padding: '5px 8px', minHeight: 34 }}
            aria-label={`${label} client`}
            value={value.recipient_contact_id ?? ''}
            disabled={disabled}
            onChange={event => onChange({ ...value, recipient_contact_id: event.target.value || null })}
          >
            <option value="">Select a client</option>
            {value.recipient_contact_id && !clients.some(client => client.id === value.recipient_contact_id) && (
              <option value={value.recipient_contact_id}>Previously selected client</option>
            )}
            {clients.map(client => <option key={client.id} value={client.id}>{client.label}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}
