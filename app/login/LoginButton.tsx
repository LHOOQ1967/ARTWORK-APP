
'use client'

import { supabase } from '@/lib/supabaseBrowser'

export default function LoginButton() {
  async function handleMicrosoftLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <button className="edit-button" onClick={handleMicrosoftLogin}>
      Sign in with Microsoft
    </button>
  )
}
