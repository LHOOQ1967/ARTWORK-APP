
export default function NotAuthorizedPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#006039',
        color: 'white',
        textAlign: 'center',
        padding: 24,
      }}
    >

  
      <div
        style={{
          maxWidth: 620,
          padding: 36,
          borderRadius: 12,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
        }}
      >
        
        <h1
          style={{
            fontSize: '3rem',
            fontWeight: 700,
            marginBottom: 18,
          }}
        >
          Blondeau & Cie
        </h1>
        <h1
          style={{
            fontSize: '2rem',
            fontWeight: 700,
            marginBottom: 18,
          }}
        >
          Access restricted
        </h1>

        <p
          style={{
            fontSize: '1.08rem',
            lineHeight: 1.7,
            marginBottom: 18,
          }}
        >
          Your Microsoft account has been authenticated successfully, but it is
          not currently authorized to access this application.
        </p>

        <p
          style={{
            fontSize: '1.02rem',
            lineHeight: 1.7,
            marginBottom: 18,
            opacity: 0.95,
          }}
        >
          Access is limited to users who have been invited by Blondeau &amp; Cie
        
        </p>

        <p
          style={{
            fontSize: '1rem',
            lineHeight: 1.7,
            marginBottom: 28,
            opacity: 0.9,
          }}
        >
          If you believe you should have access, please contact the
          administrator and ask to be added to the application.
        </p>

        <a
          href="/login"
          style={{
            display: 'inline-block',
            padding: '10px 18px',
            borderRadius: 10,
            background: 'white',
            color: '#006039',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Back to sign in
        </a>
      </div>
    </main>
  )
}
