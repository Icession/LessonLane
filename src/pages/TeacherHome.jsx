import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createClass, listMyClasses } from '../lib/db'

export default function TeacherHome() {
  const { profile, signOut } = useAuth()

  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function refresh() {
    try {
      const data = await listMyClasses()
      setClasses(data)
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
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      await createClass({ name, subject, gradeLevel })
      setName('')
      setSubject('')
      setGradeLevel('')
      await refresh()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
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
        <h2>Create a class</h2>
        <form onSubmit={handleCreate} className="form form-row">
          <label>
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label>
            Subject
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <label>
            Grade
            <input
              type="text"
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </form>
        {formError && <p className="error">{formError}</p>}
      </section>

      <section className="panel">
        <h2>Classes</h2>
        {loading && <p className="status">Loading…</p>}
        {loadError && <p className="error">{loadError}</p>}
        {!loading && !loadError && classes.length === 0 && (
          <p className="muted">No classes yet. Create one above.</p>
        )}
        {!loading && classes.length > 0 && (
          <ul className="list">
            {classes.map((c) => (
              <li key={c.id} className="list-item">
                <div>
                  <Link to={`/teacher/class/${c.id}`} className="item-title">
                    {c.name}
                  </Link>
                  <p className="muted">
                    {[c.subject, c.grade_level].filter(Boolean).join(' · ') ||
                      '—'}
                  </p>
                </div>
                <div className="join-code">
                  <span className="muted">Join code</span>
                  <code>{c.join_code}</code>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
