import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getQuizForEditing, getQuizResults } from '../lib/db'

export default function QuizResults() {
  const { quizId } = useParams()

  const [quiz, setQuiz] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    void (async () => {
      try {
        const [quizData, results] = await Promise.all([
          getQuizForEditing(quizId),
          getQuizResults(quizId),
        ])
        setQuiz(quizData)
        setAttempts(results)
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
        </>
      )}
    </div>
  )
}
