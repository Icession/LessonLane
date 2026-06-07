import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  getAttendanceSummary,
  getRoster,
  listMyClasses,
  removeStudent,
} from '../lib/db'

export default function ClassRoster() {
  const { classId } = useParams()
  const navigate = useNavigate()

  const [cls, setCls] = useState(null)
  const [roster, setRoster] = useState([])
  const [summary, setSummary] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [removingId, setRemovingId] = useState(null)

  async function refresh() {
    try {
      // listMyClasses is RLS-scoped to this teacher; find the one we're viewing.
      const [classes, students, attendance] = await Promise.all([
        listMyClasses(),
        getRoster(classId),
        getAttendanceSummary(classId),
      ])
      setCls(classes.find((c) => c.id === classId) ?? null)
      setRoster(students)
      setSummary(attendance)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void (async () => {
      await refresh()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId])

  async function handleRemove(enrollmentId) {
    setRemovingId(enrollmentId)
    setError(null)
    try {
      await removeStudent(enrollmentId)
      setRoster((prev) => prev.filter((r) => r.id !== enrollmentId))
    } catch (err) {
      setError(err.message)
    } finally {
      setRemovingId(null)
    }
  }

  if (loading) return <p className="status">Loading…</p>

  return (
    <div className="page">
      <p>
        <Link to="/teacher" className="muted">
          ← Back to classes
        </Link>
      </p>

      {error && <p className="error">{error}</p>}

      {!cls && !error && <p className="muted">Class not found.</p>}

      {cls && (
        <>
          <header className="page-header">
            <h1>{cls.name}</h1>
            <div className="join-code">
              <span className="muted">Join code</span>
              <code className="big-code">{cls.join_code}</code>
            </div>
          </header>

          <p>
            <button
              type="button"
              onClick={() => navigate(`/class/${classId}/attendance`)}
            >
              Take attendance
            </button>
          </p>

          <section className="panel">
            <h2>Students ({roster.length})</h2>
            {roster.length === 0 && (
              <p className="muted">No active students yet.</p>
            )}
            {roster.length > 0 && (
              <ul className="list">
                {roster.map((r) => {
                  const stats = r.student?.id ? summary[r.student.id] : null
                  return (
                    <li key={r.id} className="list-item">
                      <div>
                        <span className="item-title">
                          {r.student?.full_name ?? 'Unknown'}
                        </span>
                        <p className="muted">
                          Joined {new Date(r.joined_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="row-actions">
                        <span className="muted">
                          {stats && stats.total > 0
                            ? `${Math.round(stats.rate * 100)}% attendance`
                            : 'No attendance yet'}
                        </span>
                        <button
                          type="button"
                          className="ghost danger"
                          onClick={() => handleRemove(r.id)}
                          disabled={removingId === r.id}
                        >
                          {removingId === r.id ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
