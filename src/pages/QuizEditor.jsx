import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createQuiz,
  generateQuizQuestions,
  getQuizForEditing,
  publishQuiz,
  saveQuizQuestions,
  unpublishQuiz,
} from '../lib/db'

function blankOption() {
  return { text: '', isCorrect: false }
}

function blankQuestion() {
  const options = [blankOption(), blankOption()]
  options[0].isCorrect = true
  return { prompt: '', explanation: '', options }
}

// Validate before saving; returns an error string or null.
function validate(title, questions) {
  if (!title.trim()) return 'Give the quiz a title.'
  if (questions.length === 0) return 'Add at least one question.'
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const n = i + 1
    if (!q.prompt.trim()) return `Question ${n} needs a prompt.`
    if (q.options.length < 2 || q.options.length > 4) {
      return `Question ${n} must have 2–4 options.`
    }
    if (q.options.some((o) => !o.text.trim())) {
      return `Question ${n} has an empty option.`
    }
    if (q.options.filter((o) => o.isCorrect).length !== 1) {
      return `Question ${n} must have exactly one correct option.`
    }
  }
  return null
}

export default function QuizEditor() {
  const { classId: routeClassId, quizId: routeQuizId } = useParams()
  const navigate = useNavigate()

  // In edit mode we have a quizId; in new mode we have a classId.
  const [quizId, setQuizId] = useState(routeQuizId ?? null)
  const [classId, setClassId] = useState(routeClassId ?? null)
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [status, setStatus] = useState('draft')
  const [questions, setQuestions] = useState(routeQuizId ? [] : [blankQuestion()])

  const [loading, setLoading] = useState(Boolean(routeQuizId))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(null)

  // AI generation panel.
  const [genTopic, setGenTopic] = useState('')
  const [genCount, setGenCount] = useState(5)
  const [generating, setGenerating] = useState(false)

  // Stable keys for question rows so inputs keep focus across edits.
  const keyCounter = useRef(0)
  const [keys, setKeys] = useState(routeQuizId ? [] : [0])
  function freshKeys(count) {
    return Array.from({ length: count }, () => keyCounter.current++)
  }

  const readOnly = status === 'published'

  useEffect(() => {
    if (!routeQuizId) {
      keyCounter.current = 1 // we seeded one question with key 0
      return
    }
    void (async () => {
      try {
        const quiz = await getQuizForEditing(routeQuizId)
        setClassId(quiz.classId)
        setTitle(quiz.title)
        setTopic(quiz.topic ?? '')
        setStatus(quiz.status)
        const loaded = quiz.questions.map((q) => ({
          prompt: q.prompt,
          explanation: q.explanation ?? '',
          options: q.options.map((o) => ({
            text: o.text,
            isCorrect: o.isCorrect,
          })),
        }))
        setQuestions(loaded)
        setKeys(freshKeys(loaded.length))
        setError(null)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [routeQuizId])

  // ---- question/option editing helpers ----
  function updateQuestion(qi, patch) {
    setSavedMsg(null)
    setQuestions((prev) =>
      prev.map((q, i) => (i === qi ? { ...q, ...patch } : q)),
    )
  }

  function addQuestion() {
    setSavedMsg(null)
    setQuestions((prev) => [...prev, blankQuestion()])
    setKeys((prev) => [...prev, keyCounter.current++])
  }

  function removeQuestion(qi) {
    setSavedMsg(null)
    setQuestions((prev) => prev.filter((_, i) => i !== qi))
    setKeys((prev) => prev.filter((_, i) => i !== qi))
  }

  function updateOption(qi, oi, text) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qi
          ? {
              ...q,
              options: q.options.map((o, j) =>
                j === oi ? { ...o, text } : o,
              ),
            }
          : q,
      ),
    )
    setSavedMsg(null)
  }

  function setCorrect(qi, oi) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qi
          ? { ...q, options: q.options.map((o, j) => ({ ...o, isCorrect: j === oi })) }
          : q,
      ),
    )
    setSavedMsg(null)
  }

  function addOption(qi) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qi && q.options.length < 4
          ? { ...q, options: [...q.options, blankOption()] }
          : q,
      ),
    )
    setSavedMsg(null)
  }

  function removeOption(qi, oi) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qi || q.options.length <= 2) return q
        const options = q.options.filter((_, j) => j !== oi)
        // Ensure a correct option still exists after removal.
        if (!options.some((o) => o.isCorrect)) options[0].isCorrect = true
        return { ...q, options }
      }),
    )
    setSavedMsg(null)
  }

  async function handleGenerate() {
    if (!genTopic.trim()) {
      setError('Enter a topic to generate questions.')
      return
    }
    setGenerating(true)
    setError(null)
    setSavedMsg(null)
    try {
      const generated = await generateQuizQuestions({
        topic: genTopic,
        numQuestions: genCount,
      })
      // Normalize into the editor's question shape, carrying isCorrect through.
      const next = (generated ?? []).map((q) => ({
        prompt: q.prompt ?? '',
        explanation: q.explanation ?? '',
        options: (q.options ?? []).map((o) => ({
          text: o.text ?? '',
          isCorrect: Boolean(o.isCorrect),
        })),
      }))
      setQuestions(next)
      setKeys(freshKeys(next.length))
      // Default the title/topic from the prompt topic if still empty.
      if (!topic.trim()) setTopic(genTopic)
      if (!title.trim()) setTitle(genTopic)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    const validationError = validate(title, questions)
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    setError(null)
    setSavedMsg(null)
    try {
      let id = quizId
      if (!id) {
        const quiz = await createQuiz({ classId, title, topic })
        id = quiz.id
        setQuizId(id)
      }
      await saveQuizQuestions(id, questions)
      setSavedMsg('Quiz saved.')
      // Move to the stable edit URL so reloads/links work.
      if (!quizId) navigate(`/quiz/${id}/edit`, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    setError(null)
    setSavedMsg(null)
    try {
      await publishQuiz(quizId)
      setStatus('published')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleUnpublish() {
    setError(null)
    setSavedMsg(null)
    try {
      await unpublishQuiz(quizId)
      setStatus('draft')
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
        <div>
          <h1>{quizId ? 'Edit quiz' : 'New quiz'}</h1>
          <span className={`badge badge-${status}`}>{status}</span>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {readOnly && (
        <p className="notice">
          This quiz is published and read-only. Unpublish it to edit questions
          (re-saving recreates questions and would clear submitted answers).
        </p>
      )}

      {!readOnly && (
        <section className="panel">
          <h2>Generate with AI</h2>
          <p className="muted">
            Generate draft questions to review and edit before saving.
          </p>
          <div className="form form-row">
            <label>
              Topic
              <input
                type="text"
                value={genTopic}
                onChange={(e) => setGenTopic(e.target.value)}
                placeholder="e.g. Photosynthesis"
                disabled={generating}
              />
            </label>
            <label>
              Questions
              <input
                type="number"
                min={1}
                max={20}
                value={genCount}
                onChange={(e) => setGenCount(Number(e.target.value))}
                disabled={generating}
              />
            </label>
            <button type="button" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate'}
            </button>
          </div>
          {questions.length > 0 && !generating && (
            <p className="muted">
              Generating replaces the questions below.
            </p>
          )}
        </section>
      )}

      <section className="panel">
        <div className="form">
          <label>
            Title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={readOnly}
            />
          </label>
          <label>
            Topic
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={readOnly}
            />
          </label>
        </div>
      </section>

      {questions.map((q, qi) => (
        <section className="panel" key={keys[qi]}>
          <div className="question-head">
            <h2>Question {qi + 1}</h2>
            {!readOnly && (
              <button
                type="button"
                className="ghost danger"
                onClick={() => removeQuestion(qi)}
              >
                Remove question
              </button>
            )}
          </div>

          <div className="form">
            <label>
              Prompt
              <input
                type="text"
                value={q.prompt}
                onChange={(e) => updateQuestion(qi, { prompt: e.target.value })}
                disabled={readOnly}
              />
            </label>

            <fieldset className="options-field">
              <legend>Options (mark the correct one)</legend>
              {q.options.map((o, oi) => (
                <div className="option-row" key={oi}>
                  <input
                    type="radio"
                    name={`correct-${keys[qi]}`}
                    checked={o.isCorrect}
                    onChange={() => setCorrect(qi, oi)}
                    disabled={readOnly}
                  />
                  <input
                    type="text"
                    value={o.text}
                    placeholder={`Option ${oi + 1}`}
                    onChange={(e) => updateOption(qi, oi, e.target.value)}
                    disabled={readOnly}
                  />
                  {!readOnly && q.options.length > 2 && (
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={() => removeOption(qi, oi)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {!readOnly && q.options.length < 4 && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => addOption(qi)}
                >
                  Add option
                </button>
              )}
            </fieldset>

            <label>
              Explanation (optional)
              <input
                type="text"
                value={q.explanation}
                onChange={(e) =>
                  updateQuestion(qi, { explanation: e.target.value })
                }
                disabled={readOnly}
              />
            </label>
          </div>
        </section>
      ))}

      {!readOnly && (
        <p>
          <button type="button" className="ghost" onClick={addQuestion}>
            Add question
          </button>
        </p>
      )}

      <div className="save-bar">
        {!readOnly && (
          <button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
        {quizId && !readOnly && (
          <button type="button" className="ghost" onClick={handlePublish}>
            Publish
          </button>
        )}
        {quizId && readOnly && (
          <button type="button" className="ghost" onClick={handleUnpublish}>
            Unpublish
          </button>
        )}
        {savedMsg && <span className="success">{savedMsg}</span>}
      </div>
    </div>
  )
}
