import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getRoster, listMyClasses, removeStudent } from '../lib/db'

export default function ClassRoster() {
  const { classId } = useParams()

  const [cls, setCls] = useState(null)
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [removingId, setRemovingId] = useState(null)

  async function refresh() {
    try {
      // listMyClasses is RLS-scoped to this teacher; find the one we're viewing.
      const [classes, students] = await Promise.all([
        listMyClasses(),
        getRoster(classId),
      ])
      setCls(classes.find((c) => c.id === classId) ?? null)
      setRoster(students)
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

          <section className="panel">
            <h2>Students ({roster.length})</h2>
            {roster.length === 0 && (
              <p className="muted">No active students yet.</p>
            )}
            {roster.length > 0 && (
              <ul className="list">
                {roster.map((r) => (
                  <li key={r.id} className="list-item">
                    <div>
                      <span className="item-title">
                        {r.student?.full_name ?? 'Unknown'}
                      </span>
                      <p className="muted">
                        Joined {new Date(r.joined_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={() => handleRemove(r.id)}
                      disabled={removingId === r.id}
                    >
                      {removingId === r.id ? 'Removing…' : 'Remove'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
