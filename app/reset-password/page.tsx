
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    // Supabase lit automatiquement access_token depuis le hash
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setError('Invalid or expired recovery link.')
      }
      setLoading(false)
    })
  }, [])

  const handleUpdatePassword = async () => {
    setError(null)

    const { error } = await supabase.auth.updateUser({
      password,
    })

    if (error) {
      setError(error.message)
    } else {
      router.push('/artworks')
    }
  }

  if (loading) {
    return <p className="p-10">Checking recovery link…</p>
  }

  return (
    <main className="p-10 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold mb-6">Reset password</h1>

      <input
        type="password"
        placeholder="New password"
        className="border p-2 mb-4 w-full"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        onClick={handleUpdatePassword}
        className="bg-black text-white py-2 w-full"
      >
        Set new password
      </button>

      {error && (
        <p className="text-red-600 mt-4">{error}</p>
      )}
    </main>
  )
}
