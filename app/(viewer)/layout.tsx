
'use client' 

export default function ViewerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // ✅ Aucun hook, aucune logique bloquante
  return <>{children}</>
}

