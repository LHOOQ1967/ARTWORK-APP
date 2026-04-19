
import HeaderNav from '@/app/components/layout/HeaderNav'
import './globals.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body style={{ margin: 0 }}>
        <HeaderNav />
        <main>{children}</main>
      </body>
    </html>
  )
}
