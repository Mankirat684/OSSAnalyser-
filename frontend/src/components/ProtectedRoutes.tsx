import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

interface Props {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: Props) {
  const { user, loading } = useAuth()

  // Still checking if session exists — show nothing
  if (loading) return <div>Loading...</div>

  // No session — redirect to login
  if (!user) return <Navigate to="/login" replace />

  // Session exists — render the protected page
  return <>{children}</>
}