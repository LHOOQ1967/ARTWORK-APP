
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const router = useRouter()

  const handleLogin = async () => {
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Invalid credentials')
        setLoading(false)
        return
      }

      console.log('Login success:', data)

      // ✅ Redirection métier
      window.location.href = '/'

    } catch (err) {
      console.error(err)
      setError('Unable to reach authentication server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="p-10 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold mb-6">Login</h1>

      <input
        type="email"
        placeholder="Email"
        className="border p-2 mb-3 w-full"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={loading}
      />

      <input
        type="password"
        placeholder="Password"
        className="border p-2 mb-4 w-full"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={loading}
      />

      <button
        onClick={handleLogin}
        className="bg-black text-white py-2 w-full disabled:opacity-50"
        disabled={loading}
      >
        {loading ? 'Signing in…' : 'Login'}
      </button>

      {error && (
        <p className="text-red-600 mt-4">{error}</p>
      )}
    </main>
  )
}
