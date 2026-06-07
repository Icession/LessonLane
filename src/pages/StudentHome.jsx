import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getAttendanceSummary,
  joinClassByCode,
  listMyEnrollments,
} from '../lib/db'

export default function StudentHome() {
  const { profile, signOut } = useAuth()

  const [enrollments, setEnrollments] = useState([])
  const [summaries, setSummaries] = useState({}) // classId -> my summary
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [code, setCode] = useState('')
  const [joinError, setJoinError] = useState(null)
  const [joining, setJoining] = useState(false)

  async function refresh() {
    try {
      const data = await listMyEnrollments()
      setEnrollments(data)

      // RLS scopes getAttendanceSummary to my own records, so the only
      // entry returned is mine.
      const entries = await Promise.all(
        data
          .filter((e) => e.class?.id)
          .map(async (e) => {
            const summary = await getAttendanceSummary(e.class.id)
            return [e.class.id, summary[profile?.id] ?? null]
          }),
      )
      setSummaries(Object.fromEntries(entries))
      setLoadError(null)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void (async () => {
      await refresh()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleJoin(e) {
    e.preventDefault()
    setJoinError(null)
    setJoining(true)
    try {
      const trimmed = code.trim()
      if (!trimmed) {
        setJoinError('Enter a class code')
        return
      }
      const cls = await joinClassByCode(trimmed)
      if (!cls) {
        setJoinError('Invalid class code')
        return
      }
      setCode('')
      await refresh()
    } catch (err) {
      // The RPC returns no row / errors for a bad code.
      setJoinError(
        /not found|invalid|no rows/i.test(err.message)
          ? 'Invalid class code'
          : err.message,
      )
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>My classes</h1>
          <p className="muted">Signed in as {profile?.full_name}</p>
        </div>
        <button type="button" className="ghost" onClick={signOut}>
          Sign out
        </button>
      </header>

      <section className="panel">
        <h2>Join a class</h2>
        <form onSubmit={handleJoin} className="form form-row">
          <label>
            Class code
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. ABC123"
            />
          </label>
          <button type="submit" disabled={joining}>
            {joining ? 'Joining…' : 'Join'}
          </button>
        </form>
        {joinError && <p className="error">{joinError}</p>}
      </section>

      <section className="panel">
        <h2>Enrolled classes</h2>
        {loading && <p className="status">Loading…</p>}
        {loadError && <p className="error">{loadError}</p>}
        {!loading && !loadError && enrollments.length === 0 && (
          <p className="muted">
            You haven't joined any classes yet. Use a code above.
          </p>
        )}
        {!loading && enrollments.length > 0 && (
          <ul className="list">
            {enrollments.map((e) => {
              const stats = e.class?.id ? summaries[e.class.id] : null
              return (
                <li key={e.id} className="list-item">
                  <div>
                    <span className="item-title">{e.class?.name}</span>
                    <p className="muted">
                      {[e.class?.subject, e.class?.grade_level]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                    <p className="muted">
                      {stats && stats.total > 0
                        ? `Present ${stats.present} · Absent ${stats.absent} · Late ${stats.late}`
                        : 'No attendance recorded yet'}
                    </p>
                  </div>
                  <span className="muted">
                    Joined {new Date(e.joined_at).toLocaleDateString()}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
