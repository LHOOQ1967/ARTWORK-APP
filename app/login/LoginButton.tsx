
'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseBrowser'

export default function LoginButton() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleLogin(provider: 'azure' | 'google') {
    setErrorMessage(null)

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        setErrorMessage(error.message)
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Sign-in failed. Please try again.'
      )
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button className="edit-button" onClick={() => handleLogin('azure')}>
        Sign in with Microsoft
      </button>
      <button className="edit-button" onClick={() => handleLogin('google')}>
        Sign in with Google
      </button>
      {errorMessage && (
        <p role="alert" style={{ color: '#F8D7DA' }}>
          {errorMessage}
        </p>
      )}
    </div>
  )
}
