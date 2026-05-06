
'use client'

import { supabase } from '@/lib/supabaseBrowser'

export default function LoginPage() {
  async function handleMicrosoftLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        background: '#006039',
      }}
    >
      <div
        style={{
          padding: 40,
          borderRadius: 8,
          width: 400,
          textAlign: 'center',
        }}
      >
                <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            marginBottom: 24,
            color: 'white'
            
          }}
        >
          Blondeau & Cie
        </h1><h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            marginBottom: 40,
            color: 'white'
          }}
        >
          Application Proposals
        </h1>

        <button className="edit-button"
          onClick={handleMicrosoftLogin}
          >
          Sign in with Microsoft
        </button>
      </div>
    </main>
  )
}
