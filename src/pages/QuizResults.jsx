import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getItemAnalysis, getQuizForEditing, getQuizResults } from '../lib/db'

export default function QuizResults() {
  const { quizId } = useParams()

  const [quiz, setQuiz] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    void (async () => {
      try {
        const [quizData, results, itemAnalysis] = await Promise.all([
          getQuizForEditing(quizId),
          getQuizResults(quizId),
          getItemAnalysis(quizId),
        ])
        setQuiz(quizData)
        setAttempts(results)
        setAnalysis(itemAnalysis)
        setError(null)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [quizId])

  if (loading) return <p className="status">Loading…</p>

  const total = quiz?.questions.length ?? 0

  return (
    <div className="page">
      <p>
        {quiz?.classId ? (
          <Link to={`/teacher/class/${quiz.classId}`} className="muted">
            ← Back to class
          </Link>
        ) : (
          <Link to="/teacher" className="muted">
            ← Back to classes
          </Link>
        )}
      </p>

      {error && <p className="error">{error}</p>}

      {quiz && (
        <>
          <header className="page-header">
            <div>
              <h1>{quiz.title}</h1>
              <p className="muted">Results · {total} questions</p>
            </div>
          </header>

          <section className="panel">
            <h2>Attempts ({attempts.length})</h2>
            {attempts.length === 0 && (
              <p className="muted">No students have taken this quiz yet.</p>
            )}
            {attempts.length > 0 && (
              <ul className="list">
                {attempts.map((a) => (
                  <li key={a.id} className="list-item">
                    <div>
                      <span className="item-title">
                        {a.student?.full_name ?? 'Unknown'}
                      </span>
                      <p className="muted">
                        {a.submitted_at
                          ? new Date(a.submitted_at).toLocaleString()
                          : '—'}
                      </p>
                    </div>
                    <span className="score">
                      {a.score} / {total}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2>Item analysis</h2>

            {(!analysis || analysis.totalAttempts === 0) && (
              <p className="muted">
                No attempts yet — item analysis appears once students submit.
              </p>
            )}

            {analysis &&
              analysis.totalAttempts > 0 &&
              analysis.questions.map((q, qi) => {
                const pct =
                  q.answered > 0 ? Math.round((q.correct / q.answered) * 100) : 0
                const barColor =
                  pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'

                // The wrong option the most students picked — a shared misconception.
                let topWrongId = null
                let topWrongCount = 0
                for (const o of q.options) {
                  if (!o.isCorrect && o.count > topWrongCount) {
                    topWrongCount = o.count
                    topWrongId = o.id
                  }
                }

                return (
                  <div key={q.id} style={{ marginBottom: '1.75rem' }}>
                    <p className="item-title" style={{ margin: '0 0 0.25rem' }}>
                      Q{qi + 1} · {q.prompt}
                    </p>
                    <p className="muted" style={{ margin: '0 0 0.5rem' }}>
                      {q.correct} of {q.answered} correct · {pct}%
                    </p>

                    {/* difficulty bar */}
                    <div
                      style={{
                        background: '#e5e7eb',
                        borderRadius: 999,
                        height: 8,
                        overflow: 'hidden',
                        marginBottom: '0.85rem',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          background: barColor,
                          height: '100%',
                        }}
                      />
                    </div>

                    {/* per-option breakdown */}
                    {q.options.map((o) => {
                      const optPct =
                        q.answered > 0
                          ? Math.round((o.count / q.answered) * 100)
                          : 0
                      return (
                        <div key={o.id} style={{ marginBottom: '0.55rem' }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'baseline',
                              gap: '0.75rem',
                            }}
                          >
                            <span>
                              {o.isCorrect && (
                                <span style={{ color: '#16a34a', fontWeight: 600 }}>
                                  ✓{' '}
                                </span>
                              )}
                              {o.text}
                              {o.id === topWrongId && (
                                <span
                                  className="muted"
                                  style={{ marginLeft: '0.4rem', fontSize: '0.85em' }}
                                >
                                  · most common wrong answer
                                </span>
                              )}
                            </span>
                            <span className="muted" style={{ whiteSpace: 'nowrap' }}>
                              {o.count} picked
                            </span>
                          </div>
                          <div
                            style={{
                              background: '#eef0f2',
                              borderRadius: 999,
                              height: 6,
                              overflow: 'hidden',
                              marginTop: '0.3rem',
                            }}
                          >
                            <div
                              style={{
                                width: `${optPct}%`,
                                background: o.isCorrect ? '#86efac' : '#cbd5e1',
                                height: '100%',
                              }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
          </section>
        </>
      )}
    </div>
  )
}