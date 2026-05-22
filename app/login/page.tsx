
import LoginButton from './LoginButton'

function getErrorMessage(error?: string) {
  switch (error) {
    case 'oauth_callback_failed':
      return 'Microsoft sign-in failed. Please try again.'
    case 'no_user':
      return 'No authenticated user was found after sign-in. Please try again.'
    default:
      return null
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const errorMessage = getErrorMessage(params?.error)

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#006039',
        padding: 24,
      }}
    >
      <div
        style={{
          padding: 40,
          borderRadius: 12,
          width: '100%',
          maxWidth: 420,
          textAlign: 'center',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
        }}
      >
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            marginBottom: 20,
            color: 'white',
          }}
        >
          Blondeau &amp; Cie
        </h1>

        <h2
          style={{
            fontSize: '1.35rem',
            fontWeight: 700,
            marginBottom: 28,
            color: 'white',
          }}
        >
          Application Proposals
        </h2>

        {errorMessage && (
          <div
            style={{
              marginBottom: 24,
              padding: '12px 14px',
              borderRadius: 10,
              background: '#F8D7DA',
              color: '#721C24',
              fontSize: '0.98rem',
              lineHeight: 1.5,
              textAlign: 'left',
            }}
          >
            {errorMessage}
          </div>
        )}

        <LoginButton />
      </div>
    </main>
  )
}
