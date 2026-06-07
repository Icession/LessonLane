import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getAttendanceForDate,
  getOrCreateSession,
  getRoster,
  listMyClasses,
  saveAttendance,
} from '../lib/db'

const STATUSES = ['present', 'absent', 'late', 'excused']

function todayStr() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export default function Attendance() {
  const { classId } = useParams()

  const [cls, setCls] = useState(null)
  const [roster, setRoster] = useState([])
  const [date, setDate] = useState(todayStr())
  const [marks, setMarks] = useState({}) // studentId -> status

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(null)

  // Load roster + class info once.
  useEffect(() => {
    void (async () => {
      try {
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
    })()
  }, [classId])

  // Pre-fill marks from existing records whenever the date (or roster) changes.
  useEffect(() => {
    if (roster.length === 0) return
    void (async () => {
      setSavedMsg(null)
      try {
        const { records } = await getAttendanceForDate(classId, date)
        const byStudent = {}
        for (const rec of records) byStudent[rec.student_id] = rec.status
        const next = {}
        for (const r of roster) {
          const sid = r.student?.id
          if (sid) next[sid] = byStudent[sid] ?? 'present'
        }
        setMarks(next)
        setError(null)
      } catch (err) {
        setError(err.message)
      }
    })()
  }, [classId, date, roster])

  function setStatus(studentId, status) {
    setSavedMsg(null)
    setMarks((prev) => ({ ...prev, [studentId]: status }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSavedMsg(null)
    try {
      const session = await getOrCreateSession(classId, date)
      const payload = roster
        .filter((r) => r.student?.id)
        .map((r) => ({ studentId: r.student.id, status: marks[r.student.id] }))
      await saveAttendance(session.id, payload)
      setSavedMsg('Attendance saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="status">Loading…</p>

  return (
    <div className="page">
      <p>
        <Link to={`/teacher/class/${classId}`} className="muted">
          ← Back to roster
        </Link>
      </p>

      {error && <p className="error">{error}</p>}

      {!cls && !error && <p className="muted">Class not found.</p>}

      {cls && (
        <>
          <header className="page-header">
            <div>
              <h1>Take attendance</h1>
              <p className="muted">{cls.name}</p>
            </div>
            <label className="date-field">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={todayStr()}
              />
            </label>
          </header>

          <section className="panel">
            <h2>Students ({roster.length})</h2>
            {roster.length === 0 && (
              <p className="muted">No active students to mark.</p>
            )}
            {roster.length > 0 && (
              <ul className="list">
                {roster.map((r) => {
                  const sid = r.student?.id
                  return (
                    <li key={r.id} className="list-item">
                      <span className="item-title">
                        {r.student?.full_name ?? 'Unknown'}
                      </span>
                      <div className="status-group">
                        {STATUSES.map((status) => (
                          <button
                            key={status}
                            type="button"
                            className={
                              marks[sid] === status
                                ? 'status-btn active'
                                : 'status-btn'
                            }
                            onClick={() => setStatus(sid, status)}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <div className="save-bar">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || roster.length === 0}
            >
              {saving ? 'Saving…' : 'Save attendance'}
            </button>
            {savedMsg && <span className="success">{savedMsg}</span>}
          </div>
        </>
      )}
    </div>
  )
}
