import { supabase } from './supabase'

// Teacher: create a new class owned by the current user.
export async function createClass({ name, subject, gradeLevel }) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('classes')
    .insert({
      teacher_id: user.id,
      name,
      subject,
      grade_level: gradeLevel,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// Teacher: list classes I own (RLS scopes this to the current teacher).
export async function listMyClasses() {
  const { data, error } = await supabase
    .from('classes')
    .select('id, name, subject, grade_level, join_code, is_archived')
    .order('name', { ascending: true })
  if (error) throw error
  return data
}

// Teacher: active roster for one class, with student profile info.
export async function getRoster(classId) {
  const { data, error } = await supabase
    .from('enrollments')
    .select('id, joined_at, status, student:profiles(id, full_name)')
    .eq('class_id', classId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })
  if (error) throw error
  return data
}

// Teacher: remove a student by marking their enrollment as removed.
export async function removeStudent(enrollmentId) {
  const { error } = await supabase
    .from('enrollments')
    .update({ status: 'removed' })
    .eq('id', enrollmentId)
  if (error) throw error
}

// Student: join a class via its code (server-side RPC handles enrollment).
export async function joinClassByCode(code) {
  const { data, error } = await supabase.rpc('join_class_by_code', {
    p_code: code,
  })
  if (error) throw error
  return data
}

// Student: list the classes I'm actively enrolled in.
export async function listMyEnrollments() {
  const { data, error } = await supabase
    .from('enrollments')
    .select('id, joined_at, class:classes(id, name, subject, grade_level)')
    .eq('status', 'active')
    .order('joined_at', { ascending: false })
  if (error) throw error
  return data
}

// ---- Attendance ----

const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused']

// Teacher: ensure a session exists for (class, date), recording who took it.
export async function getOrCreateSession(classId, dateStr) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('attendance_sessions')
    .upsert(
      { class_id: classId, session_date: dateStr, taken_by: user.id },
      { onConflict: 'class_id,session_date' },
    )
    .select()
    .single()
  if (error) throw error
  return data
}

// Find the session for a class+date and its records. Returns
// { session, records } or { session: null, records: [] } if none exists yet.
export async function getAttendanceForDate(classId, dateStr) {
  const { data: session, error: sessionError } = await supabase
    .from('attendance_sessions')
    .select('id, class_id, session_date, note')
    .eq('class_id', classId)
    .eq('session_date', dateStr)
    .maybeSingle()
  if (sessionError) throw sessionError
  if (!session) return { session: null, records: [] }

  const { data: records, error: recordsError } = await supabase
    .from('attendance_records')
    .select('student_id, status')
    .eq('session_id', session.id)
  if (recordsError) throw recordsError
  return { session, records }
}

// Teacher: upsert attendance for a session. marks = [{ studentId, status }].
export async function saveAttendance(sessionId, marks) {
  const rows = marks.map((m) => ({
    session_id: sessionId,
    student_id: m.studentId,
    status: m.status,
  }))
  const { error } = await supabase
    .from('attendance_records')
    .upsert(rows, { onConflict: 'session_id,student_id' })
  if (error) throw error
}

// Per-student attendance totals + rate for a class, aggregated in JS.
// Returns an object keyed by student_id:
//   { [studentId]: { present, absent, late, excused, total, rate } }
// Attendance rate counts present + late as attended.
// (For a student, RLS limits this to their own records.)
export async function getAttendanceSummary(classId) {
  const { data: sessions, error: sessionError } = await supabase
    .from('attendance_sessions')
    .select('id')
    .eq('class_id', classId)
  if (sessionError) throw sessionError

  const sessionIds = sessions.map((s) => s.id)
  let records = []
  if (sessionIds.length > 0) {
    const { data, error: recordsError } = await supabase
      .from('attendance_records')
      .select('student_id, status')
      .in('session_id', sessionIds)
    if (recordsError) throw recordsError
    records = data
  }

  const summary = {}
  for (const rec of records) {
    if (!summary[rec.student_id]) {
      summary[rec.student_id] = {
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        total: 0,
        rate: 0,
      }
    }
    const s = summary[rec.student_id]
    if (ATTENDANCE_STATUSES.includes(rec.status)) s[rec.status] += 1
    s.total += 1
  }
  for (const s of Object.values(summary)) {
    s.rate = s.total > 0 ? (s.present + s.late) / s.total : 0
  }
  return summary
}

// ---- Quizzes (teacher) ----

// Create a new draft quiz owned by the current teacher.
export async function createQuiz({ classId, title, topic }) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('quizzes')
    .insert({
      class_id: classId,
      created_by: user.id,
      title,
      topic,
      status: 'draft',
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// Replace a quiz's questions wholesale. questions = [{ prompt, explanation,
// options: [{ text, isCorrect }] }]. Deletes existing questions (options
// cascade) then re-inserts with positions. Only safe on draft quizzes.
export async function saveQuizQuestions(quizId, questions) {
  const { error: deleteError } = await supabase
    .from('quiz_questions')
    .delete()
    .eq('quiz_id', quizId)
  if (deleteError) throw deleteError

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const { data: inserted, error: questionError } = await supabase
      .from('quiz_questions')
      .insert({
        quiz_id: quizId,
        position: i,
        prompt: q.prompt,
        explanation: q.explanation ?? null,
      })
      .select()
      .single()
    if (questionError) throw questionError

    const optionRows = q.options.map((o, j) => ({
      question_id: inserted.id,
      position: j,
      text: o.text,
      is_correct: o.isCorrect,
    }))
    const { error: optionsError } = await supabase
      .from('quiz_options')
      .insert(optionRows)
    if (optionsError) throw optionsError
  }
}

export async function publishQuiz(quizId) {
  const { error } = await supabase
    .from('quizzes')
    .update({ status: 'published' })
    .eq('id', quizId)
  if (error) throw error
}

export async function unpublishQuiz(quizId) {
  const { error } = await supabase
    .from('quizzes')
    .update({ status: 'draft' })
    .eq('id', quizId)
  if (error) throw error
}

// List a class's quizzes with status and a question count.
export async function listClassQuizzes(classId) {
  const { data, error } = await supabase
    .from('quizzes')
    .select('id, title, topic, status, quiz_questions(count)')
    .eq('class_id', classId)
    .order('title', { ascending: true })
  if (error) throw error
  return data.map((q) => ({
    id: q.id,
    title: q.title,
    topic: q.topic,
    status: q.status,
    questionCount: q.quiz_questions?.[0]?.count ?? 0,
  }))
}

// Full quiz with questions + options (including is_correct), for the editor.
export async function getQuizForEditing(quizId) {
  const { data, error } = await supabase
    .from('quizzes')
    .select(
      'id, class_id, title, topic, status, quiz_questions(id, position, prompt, explanation, quiz_options(id, position, text, is_correct))',
    )
    .eq('id', quizId)
    .single()
  if (error) throw error

  const questions = (data.quiz_questions ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((q) => ({
      id: q.id,
      prompt: q.prompt,
      explanation: q.explanation,
      options: (q.quiz_options ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((o) => ({ id: o.id, text: o.text, isCorrect: o.is_correct })),
    }))

  return {
    id: data.id,
    classId: data.class_id,
    title: data.title,
    topic: data.topic,
    status: data.status,
    questions,
  }
}

// Attempts for one quiz, newest first, with each student's name + score.
export async function getQuizResults(quizId) {
  const { data, error } = await supabase
    .from('quiz_attempts')
    .select('id, score, submitted_at, student:profiles(id, full_name)')
    .eq('quiz_id', quizId)
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return data
}

// ---- Quizzes (student) ----

// Published quizzes for a class, each flagged with whether I've attempted it.
export async function listAvailableQuizzes(classId) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data: quizzes, error } = await supabase
    .from('quizzes')
    .select('id, title, topic, status')
    .eq('class_id', classId)
    .eq('status', 'published')
    .order('title', { ascending: true })
  if (error) throw error

  const ids = quizzes.map((q) => q.id)
  let attempts = []
  if (ids.length > 0) {
    const { data, error: attemptsError } = await supabase
      .from('quiz_attempts')
      .select('quiz_id, score')
      .eq('student_id', user.id)
      .in('quiz_id', ids)
    if (attemptsError) throw attemptsError
    attempts = data
  }

  const byQuiz = {}
  for (const a of attempts) byQuiz[a.quiz_id] = a
  return quizzes.map((q) => ({
    ...q,
    attempted: Boolean(byQuiz[q.id]),
    score: byQuiz[q.id]?.score ?? null,
  }))
}

// Student-safe quiz payload (no correct answers) via RPC.
export async function getQuizForStudent(quizId) {
  const { data, error } = await supabase.rpc('get_quiz_for_student', {
    p_quiz_id: quizId,
  })
  if (error) throw error
  return data
}

// Submit answers via RPC. answers = [{ questionId, optionId }].
export async function submitQuiz(quizId, answers) {
  const payload = answers.map((a) => ({
    question_id: a.questionId,
    option_id: a.optionId,
  }))
  const { data, error } = await supabase.rpc('submit_quiz', {
    p_quiz_id: quizId,
    p_answers: payload,
  })
  if (error) throw error
  return { score: data.score, total: data.total }
}

// The current student's own attempt + answers (is_correct per question).
export async function getMyQuizResult(quizId) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data: attempt, error } = await supabase
    .from('quiz_attempts')
    .select('id, score, submitted_at')
    .eq('quiz_id', quizId)
    .eq('student_id', user.id)
    .maybeSingle()
  if (error) throw error
  if (!attempt) return { attempt: null, answers: [] }

  const { data: answers, error: answersError } = await supabase
    .from('quiz_answers')
    .select('question_id, selected_option_id, is_correct')
    .eq('attempt_id', attempt.id)
  if (answersError) throw answersError
  return { attempt, answers }
}

// ---- AI quiz generation ----

// Call the "generate-quiz" Edge Function. Returns an array of
// { prompt, explanation, options: [{ text, isCorrect }] }.
export async function generateQuizQuestions({
  topic,
  numQuestions = 5,
  gradeLevel = '',
}) {
  const { data, error } = await supabase.functions.invoke('generate-quiz', {
    body: { topic, numQuestions, gradeLevel },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data.questions
}

export async function getItemAnalysis(quizId) {
  // 1) Questions + their options, in order.
  const { data: questions, error: qErr } = await supabase
    .from('quiz_questions')
    .select('id, position, prompt, explanation, quiz_options(id, position, text, is_correct)')
    .eq('quiz_id', quizId)
    .order('position')
  if (qErr) throw qErr

  // 2) Count submitted attempts.
  const { count: attemptCount, error: aErr } = await supabase
    .from('quiz_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('quiz_id', quizId)
    .not('submitted_at', 'is', null)
  if (aErr) throw aErr

  const questionIds = (questions ?? []).map((q) => q.id)
  if (questionIds.length === 0) {
    return { totalAttempts: attemptCount ?? 0, questions: [] }
  }

  // 3) All answers for these questions. (quiz_answers has no quiz_id column,
  //    so we fetch by question_id IN the quiz's question ids.)
  const { data: answers, error: ansErr } = await supabase
    .from('quiz_answers')
    .select('question_id, selected_option_id, is_correct')
    .in('question_id', questionIds)
  if (ansErr) throw ansErr

  // 4) Aggregate in JS.
  const byQuestion = {}
  for (const a of answers ?? []) {
    const b = (byQuestion[a.question_id] ??= { answered: 0, correct: 0, byOption: {} })
    b.answered += 1
    if (a.is_correct) b.correct += 1
    if (a.selected_option_id) {
      b.byOption[a.selected_option_id] = (b.byOption[a.selected_option_id] ?? 0) + 1
    }
  }

  const shaped = (questions ?? []).map((q) => {
    const agg = byQuestion[q.id] ?? { answered: 0, correct: 0, byOption: {} }
    const options = (q.quiz_options ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ id: o.id, text: o.text, isCorrect: o.is_correct, count: agg.byOption[o.id] ?? 0 }))
    return {
      id: q.id, position: q.position, prompt: q.prompt, explanation: q.explanation,
      answered: agg.answered, correct: agg.correct, options,
    }
  })

  return { totalAttempts: attemptCount ?? 0, questions: shaped }
}