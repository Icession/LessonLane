import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RequireAuth({ role, children }) {
  const { user, profile, loading } = useAuth()

  if (loading) return <p className="status">Loading…</p>

  if (!user) return <Navigate to="/signin" replace />

  // If a specific role is required, send mismatched users to their own home.
  if (role && profile && profile.role !== role) {
    const home = profile.role === 'teacher' ? '/teacher' : '/student'
    return <Navigate to={home} replace />
  }

  return children
}
