
'use client'

import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  async function handleMicrosoftLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/artworks`,
      },
    })
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
      }}
    >
      <div
        style={{
          background: 'white',
          padding: 40,
          borderRadius: 8,
          width: 360,
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            marginBottom: 24,
          }}
        >
          Sign in
        </h1>

        <button
          onClick={handleMicrosoftLogin}
          style={{
            width: '100%',
            padding: '14px 16px',
            fontSize: '1rem',
            fontWeight: 600,
            borderRadius: 6,
            border: '1px solid #ccc',
            cursor: 'pointer',
            backgroundColor: '#fff',
          }}
        >
          Sign in with Microsoft
        </button>
      </div>
    </main>
  )
}
