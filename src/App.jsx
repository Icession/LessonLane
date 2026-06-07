import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import RequireAuth from './components/RequireAuth'
import SignUp from './pages/SignUp'
import SignIn from './pages/SignIn'
import TeacherHome from './pages/TeacherHome'
import ClassRoster from './pages/ClassRoster'
import StudentHome from './pages/StudentHome'

// Index route: send a logged-in user to their role's home, else to sign in.
function Home() {
  const { user, profile, loading } = useAuth()
  if (loading) return <p className="status">Loading…</p>
  if (!user) return <Navigate to="/signin" replace />
  if (!profile) return <p className="status">Loading profile…</p>
  return <Navigate to={profile.role === 'teacher' ? '/teacher' : '/student'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/signin" element={<SignIn />} />

      <Route
        path="/teacher"
        element={
          <RequireAuth role="teacher">
            <TeacherHome />
          </RequireAuth>
        }
      />
      <Route
        path="/teacher/class/:classId"
        element={
          <RequireAuth role="teacher">
            <ClassRoster />
          </RequireAuth>
        }
      />
      <Route
        path="/student"
        element={
          <RequireAuth role="student">
            <StudentHome />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
