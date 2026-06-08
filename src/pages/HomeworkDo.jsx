import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getHomework,
  getMyHomeworkSubmission,
  submitHomework,
} from '../lib/db'

function formatDate(dateStr) {
  if (!dateStr) return null
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString()
}

export default function HomeworkDo() {
  const { homeworkId } = useParams()

  const [hw, setHw] = useState(null)
  const [response, setResponse] = useState('')
  const [submittedAt, setSubmittedAt] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(null)

  useEffect(() => {
    void (async () => {
      try {
        const [homework, mine] = await Promise.all([
          getHomework(homeworkId),
          getMyHomeworkSubmission(homeworkId),
        ])
        setHw(homework)
        if (mine) {
          setResponse(mine.response ?? '')
          setSubmittedAt(mine.submitted_at)
        }
        setError(null)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [homeworkId])

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    setSavedMsg(null)
    try {
      const sub = await submitHomework(homeworkId, response)
      const wasSubmitted = Boolean(submittedAt)
      setSubmittedAt(sub.submitted_at)
      setSavedMsg(wasSubmitted ? 'Submission updated.' : 'Turned in!')
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
        <Link to="/student" className="muted">
          ← Back to my classes
        </Link>
      </p>

      {error && <p className="error">{error}</p>}

      {hw && (
        <>
          <header className="page-header">
            <div>
              <h1>{hw.title}</h1>
              <p className="muted">
                {hw.due_date ? `Due ${formatDate(hw.due_date)}` : 'No due date'}
              </p>
            </div>
            {submittedAt && <span className="badge badge-published">Turned in</span>}
          </header>

          {hw.instructions && (
            <section className="panel">
              <h2>Instructions</h2>
              <p>{hw.instructions}</p>
            </section>
          )}

          <section className="panel">
            <div className="form">
              <label>
                Your response
                <textarea
                  rows={6}
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  placeholder="Type your answer here…"
                />
              </label>
            </div>
          </section>

          <div className="save-bar">
            <button type="button" onClick={handleSubmit} disabled={saving}>
              {saving
                ? 'Submitting…'
                : submittedAt
                  ? 'Update submission'
                  : 'Turn in'}
            </button>
            {savedMsg && <span className="success">{savedMsg}</span>}
          </div>
        </>
      )}
    </div>
  )
}
