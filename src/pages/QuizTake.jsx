import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getMyQuizResult, getQuizForStudent, submitQuiz } from '../lib/db'

export default function QuizTake() {
  const { quizId } = useParams()

  const [quiz, setQuiz] = useState(null)
  const [selections, setSelections] = useState({}) // questionId -> optionId
  const [result, setResult] = useState(null) // { score, total, correctByQuestion }

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Build a { questionId: isCorrect } map from a getMyQuizResult payload.
  function correctMap(answers) {
    const map = {}
    for (const a of answers) map[a.question_id] = a.is_correct
    return map
  }

  useEffect(() => {
    void (async () => {
      try {
        const data = await getQuizForStudent(quizId)
        setQuiz(data)

        // If already attempted, show the result instead of the form.
        const existing = await getMyQuizResult(quizId)
        if (existing.attempt) {
          setResult({
            score: existing.attempt.score,
            total: data.questions.length,
            correctByQuestion: correctMap(existing.answers),
          })
        }
        setError(null)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [quizId])

  function selectOption(questionId, optionId) {
    setSelections((prev) => ({ ...prev, [questionId]: optionId }))
  }

  const allAnswered =
    quiz && quiz.questions.every((q) => selections[q.id] != null)

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const answers = quiz.questions.map((q) => ({
        questionId: q.id,
        optionId: selections[q.id],
      }))
      const { score, total } = await submitQuiz(quizId, answers)
      const mine = await getMyQuizResult(quizId)
      setResult({
        score,
        total,
        correctByQuestion: correctMap(mine.answers),
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
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

      {quiz && (
        <>
          <header className="page-header">
            <div>
              <h1>{quiz.title}</h1>
              {quiz.topic && <p className="muted">{quiz.topic}</p>}
            </div>
            {result && (
              <div className="score">
                {result.score} / {result.total}
              </div>
            )}
          </header>

          {result && (
            <p className="notice">You've completed this quiz.</p>
          )}

          {quiz.questions.map((q, qi) => {
            const correct = result?.correctByQuestion[q.id]
            return (
              <section className="panel" key={q.id}>
                <div className="question-head">
                  <h2>
                    Question {qi + 1}
                    {result && (
                      <span className={correct ? 'mark right' : 'mark wrong'}>
                        {correct ? ' ✓ Correct' : ' ✗ Incorrect'}
                      </span>
                    )}
                  </h2>
                </div>
                <p>{q.prompt}</p>
                <fieldset className="options-field">
                  {q.options.map((o) => (
                    <label className="radio" key={o.id}>
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={selections[q.id] === o.id}
                        onChange={() => selectOption(q.id, o.id)}
                        disabled={Boolean(result)}
                      />
                      {o.text}
                    </label>
                  ))}
                </fieldset>
              </section>
            )
          })}

          {!result && (
            <div className="save-bar">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !allAnswered}
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
              {!allAnswered && (
                <span className="muted">Answer every question to submit.</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
