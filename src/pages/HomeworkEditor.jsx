import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createHomework,
  deleteHomework,
  getHomework,
  updateHomework,
} from '../lib/db'

export default function HomeworkEditor() {
  const { classId: routeClassId, homeworkId: routeHomeworkId } = useParams()
  const navigate = useNavigate()

  // Edit mode has a homeworkId; new mode has a classId.
  const [homeworkId, setHomeworkId] = useState(routeHomeworkId ?? null)
  const [classId, setClassId] = useState(routeClassId ?? null)
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [dueDate, setDueDate] = useState('')

  const [loading, setLoading] = useState(Boolean(routeHomeworkId))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(null)

  useEffect(() => {
    if (!routeHomeworkId) return
    void (async () => {
      try {
        const hw = await getHomework(routeHomeworkId)
        setClassId(hw.class_id)
        setTitle(hw.title)
        setInstructions(hw.instructions ?? '')
        setDueDate(hw.due_date ?? '')
        setError(null)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [routeHomeworkId])

  async function handleSave() {
    if (!title.trim()) {
      setError('Give the assignment a title.')
      return
    }
    setSaving(true)
    setError(null)
    setSavedMsg(null)
    try {
      const payload = { title, instructions, dueDate: dueDate || null }
      if (homeworkId) {
        await updateHomework(homeworkId, payload)
      } else {
        const hw = await createHomework({ classId, ...payload })
        setHomeworkId(hw.id)
        navigate(`/homework/${hw.id}/edit`, { replace: true })
      }
      setSavedMsg('Assignment saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this assignment and all its submissions?')) {
      return
    }
    setError(null)
    try {
      await deleteHomework(homeworkId)
      navigate(`/teacher/class/${classId}`)
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <p className="status">Loading…</p>

  return (
    <div className="page">
      <p>
        {classId ? (
          <Link to={`/teacher/class/${classId}`} className="muted">
            ← Back to class
          </Link>
        ) : (
          <Link to="/teacher" className="muted">
            ← Back to classes
          </Link>
        )}
      </p>

      <header className="page-header">
        <h1>{homeworkId ? 'Edit assignment' : 'New assignment'}</h1>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="panel">
        <div className="form">
          <label>
            Title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Instructions
            <textarea
              rows={5}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </label>
          <label className="date-field">
            Due date (optional)
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
        </div>
      </section>

      <div className="save-bar">
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {homeworkId && (
          <button
            type="button"
            className="ghost"
            onClick={() => navigate(`/homework/${homeworkId}/submissions`)}
          >
            View submissions
          </button>
        )}
        {homeworkId && (
          <button type="button" className="ghost danger" onClick={handleDelete}>
            Delete
          </button>
        )}
        {savedMsg && <span className="success">{savedMsg}</span>}
      </div>
    </div>
  )
}
