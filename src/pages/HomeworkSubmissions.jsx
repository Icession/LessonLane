import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getHomework, getHomeworkSubmissions, getRoster } from '../lib/db'

function formatDate(dateStr) {
  if (!dateStr) return null
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString()
}

export default function HomeworkSubmissions() {
  const { homeworkId } = useParams()

  const [hw, setHw] = useState(null)
  const [rows, setRows] = useState([]) // roster merged with submissions
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    void (async () => {
      try {
        const homework = await getHomework(homeworkId)
        setHw(homework)
        const [roster, submissions] = await Promise.all([
          getRoster(homework.class_id),
          getHomeworkSubmissions(homeworkId),
        ])
        const byStudent = {}
        for (const s of submissions) byStudent[s.student?.id] = s
        setRows(
          roster.map((r) => ({
            id: r.id,
            name: r.student?.full_name ?? 'Unknown',
            submission: byStudent[r.student?.id] ?? null,
          })),
        )
        setError(null)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [homeworkId])

  if (loading) return <p className="status">Loading…</p>

  const submittedCount = rows.filter((r) => r.submission).length

  return (
    <div className="page">
      <p>
        {hw?.class_id ? (
          <Link to={`/teacher/class/${hw.class_id}`} className="muted">
            ← Back to class
          </Link>
        ) : (
          <Link to="/teacher" className="muted">
            ← Back to classes
          </Link>
        )}
      </p>

      {error && <p className="error">{error}</p>}

      {hw && (
        <>
          <header className="page-header">
            <div>
              <h1>{hw.title}</h1>
              <p className="muted">
                {hw.due_date
                  ? `Due ${formatDate(hw.due_date)}`
                  : 'No due date'}
              </p>
            </div>
          </header>

          <section className="panel">
            <h2>
              Submissions ({submittedCount} / {rows.length})
            </h2>
            {rows.length === 0 && (
              <p className="muted">No active students in this class.</p>
            )}
            {rows.length > 0 && (
              <ul className="list">
                {rows.map((r) => (
                  <li key={r.id} className="list-item">
                    <div>
                      <span className="item-title">{r.name}</span>
                      {r.submission?.response && (
                        <p className="muted">{r.submission.response}</p>
                      )}
                    </div>
                    {r.submission ? (
                      <span className="muted">
                        Turned in{' '}
                        {new Date(
                          r.submission.submitted_at,
                        ).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="muted">Not submitted</span>
                    )}
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
