import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { generateDigest, getStudentSummary } from '../lib/db'

export default function ParentDigest() {
  const { classId, studentId } = useParams()

  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [draft, setDraft] = useState('')
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const data = await getStudentSummary(classId, studentId)
        setSummary(data)
        setError(null)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [classId, studentId])

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    setCopied(false)
    try {
      const text = await generateDigest(summary)
      setDraft(text)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to clipboard.')
    }
  }

  if (loading) return <p className="status">Loading…</p>

  const att = summary?.stats?.attendance ?? {}
  const hw = summary?.stats?.homework ?? {}
  const quizzes = summary?.stats?.quizzes ?? []
  const attPct = att.total ? Math.round((att.rate ?? 0) * 100) : 0

  return (
    <div className="page">
      <p>
        <Link to={`/teacher/class/${classId}`} className="muted">
          ← Back to class
        </Link>
      </p>

      {error && <p className="error">{error}</p>}

      {summary && (
        <>
          <header className="page-header">
            <div>
              <h1>Parent digest</h1>
              <p className="muted">
                {summary.studentName}
                {summary.className ? ` · ${summary.className}` : ''}
              </p>
            </div>
          </header>

          <section className="panel">
            <h2>Summary</h2>
            <ul className="list">
              <li className="list-item">
                <span className="item-title">Attendance</span>
                <span className="muted">
                  {att.present ?? 0} of {att.total ?? 0} sessions
                  {att.total ? ` · ${attPct}%` : ''}
                </span>
              </li>
              <li className="list-item">
                <span className="item-title">Homework</span>
                <span className="muted">
                  {hw.submitted ?? 0} of {hw.total ?? 0} turned in
                </span>
              </li>
            </ul>

            <h3 style={{ marginBottom: '0.5rem' }}>Quiz scores</h3>
            {quizzes.length === 0 && <p className="muted">No quizzes taken yet.</p>}
            {quizzes.length > 0 && (
              <ul className="list">
                {quizzes.map((q, i) => (
                  <li key={i} className="list-item">
                    <span className="item-title">{q.title}</span>
                    <span className="muted">
                      {q.score} / {q.total}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.75rem',
              }}
            >
              <h2 style={{ margin: 0 }}>Draft message</h2>
              <button type="button" onClick={handleGenerate} disabled={generating}>
                {generating
                  ? 'Generating…'
                  : draft
                    ? 'Regenerate'
                    : 'Generate draft'}
              </button>
            </div>

            <p className="muted" style={{ marginTop: 0 }}>
              The AI drafts this from the numbers above. Review and edit before sending.
            </p>

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={12}
              placeholder="Click “Generate draft” to create a message you can edit and send."
              style={{
                width: '100%',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                fontSize: '1rem',
                padding: '0.75rem',
                borderRadius: 6,
                border: '1px solid #ccc',
                resize: 'vertical',
              }}
            />

            <div className="save-bar">
              <button type="button" onClick={handleCopy} disabled={!draft.trim()}>
                Copy
              </button>
              {copied && <span className="success">Copied!</span>}
            </div>
          </section>
        </>
      )}
    </div>
  )
}