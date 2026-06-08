import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { generateLesson, getClassWeakAreas } from '../lib/db'

export default function LessonPlanner() {
  const { classId } = useParams()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [focusTopic, setFocusTopic] = useState('')
  const [plan, setPlan] = useState('')
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const d = await getClassWeakAreas(classId)
        setData(d)
        setError(null)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [classId])

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    setCopied(false)
    try {
      const text = await generateLesson({
        className: data.className,
        gradeLevel: data.gradeLevel,
        focusTopic,
        weakQuestions: data.weakQuestions,
      })
      setPlan(text)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(plan)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to clipboard.')
    }
  }

  if (loading) return <p className="status">Loading…</p>

  const weak = data?.weakQuestions ?? []

  return (
    <div className="page">
      <p>
        <Link to={`/teacher/class/${classId}`} className="muted">
          ← Back to class
        </Link>
      </p>

      {error && <p className="error">{error}</p>}

      {data && (
        <>
          <header className="page-header">
            <div>
              <h1>Lesson planner</h1>
              <p className="muted">
                {data.className}
                {data.gradeLevel ? ` · ${data.gradeLevel}` : ''}
              </p>
            </div>
          </header>

          <section className="panel">
            <h2>What the class is struggling with</h2>
            {weak.length === 0 && (
              <p className="muted">
                No quiz data yet. Add a focus topic below and the planner will build a
                lesson around it.
              </p>
            )}
            {weak.length > 0 && (
              <ul className="list">
                {weak.map((w, i) => (
                  <li key={i} className="list-item">
                    <div>
                      <span className="item-title">{w.prompt}</span>
                      <p className="muted">{w.quizTitle}</p>
                    </div>
                    <span className="muted">{w.correctPct}% correct</span>
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
              <h2 style={{ margin: 0 }}>Lesson plan</h2>
              <button type="button" onClick={handleGenerate} disabled={generating}>
                {generating
                  ? 'Generating…'
                  : plan
                    ? 'Regenerate'
                    : 'Generate lesson plan'}
              </button>
            </div>

            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              Focus topic (optional)
              <input
                type="text"
                value={focusTopic}
                onChange={(e) => setFocusTopic(e.target.value)}
                placeholder="e.g. verb tenses — leave blank to plan from the weak areas above"
                disabled={generating}
                style={{
                  display: 'block',
                  width: '100%',
                  boxSizing: 'border-box',
                  marginTop: '0.25rem',
                  padding: '0.5rem',
                  borderRadius: 6,
                  border: '1px solid #ccc',
                  fontFamily: 'inherit',
                  fontSize: '1rem',
                }}
              />
            </label>

            <p className="muted" style={{ marginTop: 0 }}>
              The AI builds a single-period plan targeting the gaps above. Review and edit
              before using it.
            </p>

            <textarea
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              rows={18}
              placeholder="Click “Generate lesson plan” to create a plan you can edit."
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
              <button type="button" onClick={handleCopy} disabled={!plan.trim()}>
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