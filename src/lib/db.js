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

// ---- Homework (teacher) ----

// Create a homework assignment for a class. dueDate may be null.
export async function createHomework({ classId, title, instructions, dueDate }) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('homework')
    .insert({
      class_id: classId,
      created_by: user.id,
      title,
      instructions: instructions || null,
      due_date: dueDate || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateHomework(homeworkId, { title, instructions, dueDate }) {
  const { data, error } = await supabase
    .from('homework')
    .update({
      title,
      instructions: instructions || null,
      due_date: dueDate || null,
    })
    .eq('id', homeworkId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteHomework(homeworkId) {
  const { error } = await supabase
    .from('homework')
    .delete()
    .eq('id', homeworkId)
  if (error) throw error
}

// One homework assignment (includes class_id). Readable by the owning teacher
// and by students enrolled in its class.
export async function getHomework(homeworkId) {
  const { data, error } = await supabase
    .from('homework')
    .select('id, class_id, title, instructions, due_date, created_at')
    .eq('id', homeworkId)
    .single()
  if (error) throw error
  return data
}

// A class's homework with a submission count (teacher view).
export async function listClassHomework(classId) {
  const { data, error } = await supabase
    .from('homework')
    .select('id, title, instructions, due_date, created_at, homework_submissions(count)')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((h) => ({
    id: h.id,
    title: h.title,
    instructions: h.instructions,
    dueDate: h.due_date,
    submissionCount: h.homework_submissions?.[0]?.count ?? 0,
  }))
}

// Submissions for one assignment, with each student's name (teacher view).
export async function getHomeworkSubmissions(homeworkId) {
  const { data, error } = await supabase
    .from('homework_submissions')
    .select('id, response, submitted_at, student:profiles(id, full_name)')
    .eq('homework_id', homeworkId)
  if (error) throw error
  return data
}

// ---- Homework (student) ----

// A class's homework, each flagged with whether I've turned it in.
export async function listClassHomeworkForStudent(classId) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data: homework, error } = await supabase
    .from('homework')
    .select('id, title, instructions, due_date')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
  if (error) throw error

  const ids = homework.map((h) => h.id)
  let submissions = []
  if (ids.length > 0) {
    const { data, error: submissionsError } = await supabase
      .from('homework_submissions')
      .select('homework_id, submitted_at')
      .eq('student_id', user.id)
      .in('homework_id', ids)
    if (submissionsError) throw submissionsError
    submissions = data
  }

  const byHomework = {}
  for (const s of submissions) byHomework[s.homework_id] = s
  return homework.map((h) => ({
    id: h.id,
    title: h.title,
    dueDate: h.due_date,
    submitted: Boolean(byHomework[h.id]),
    submittedAt: byHomework[h.id]?.submitted_at ?? null,
  }))
}

// The current student's own submission for an assignment, or null.
export async function getMyHomeworkSubmission(homeworkId) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('homework_submissions')
    .select('id, response, submitted_at, updated_at')
    .eq('homework_id', homeworkId)
    .eq('student_id', user.id)
    .maybeSingle()
  if (error) throw error
  return data
}

// Turn in (or re-submit) homework. Upserts the student's own submission;
// submitted_at is preserved across edits (the trigger bumps updated_at).
export async function submitHomework(homeworkId, response) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('homework_submissions')
    .upsert(
      { homework_id: homeworkId, student_id: user.id, response: response || null },
      { onConflict: 'homework_id,student_id' },
    )
    .select()
    .single()
  if (error) throw error
  return data
}

// Gather one student's stats for a parent digest. Teacher-only; relies on the
// RLS the teacher already has over their class's attendance, quizzes, homework.
export async function getStudentSummary(classId, studentId) {
  const [{ data: student, error: sErr }, { data: cls, error: cErr }] =
    await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', studentId).single(),
      supabase.from('classes').select('name').eq('id', classId).single(),
    ])
  if (sErr) throw sErr
  if (cErr) throw cErr

  // Attendance: reuse the roster's summary so the % is identical.
  const attendanceSummary = await getAttendanceSummary(classId)
  const a = attendanceSummary?.[studentId] ?? {}
  const attTotal = a.total ?? 0
  const attRate = a.rate ?? 0
  const attendance = {
    present: a.present ?? Math.round(attRate * attTotal),
    total: attTotal,
    rate: attRate,
  }

  // Quizzes the student has submitted, scored out of the question count.
  const { data: quizRows, error: qErr } = await supabase
    .from('quizzes')
    .select('id, title, quiz_questions(count)')
    .eq('class_id', classId)
  if (qErr) throw qErr
  const quizIds = (quizRows ?? []).map((q) => q.id)
  let quizzes = []
  if (quizIds.length > 0) {
    const { data: attempts, error: aErr } = await supabase
      .from('quiz_attempts')
      .select('quiz_id, score')
      .eq('student_id', studentId)
      .in('quiz_id', quizIds)
      .not('submitted_at', 'is', null)
    if (aErr) throw aErr
    const scoreByQuiz = {}
    for (const at of attempts ?? []) scoreByQuiz[at.quiz_id] = at.score
    quizzes = (quizRows ?? [])
      .filter((q) => Object.prototype.hasOwnProperty.call(scoreByQuiz, q.id))
      .map((q) => ({
        title: q.title,
        score: scoreByQuiz[q.id],
        total: q.quiz_questions?.[0]?.count ?? 0,
      }))
  }

  // Homework completion.
  const { data: hw, error: hErr } = await supabase
    .from('homework')
    .select('id')
    .eq('class_id', classId)
  if (hErr) throw hErr
  const hwIds = (hw ?? []).map((h) => h.id)
  let submitted = 0
  if (hwIds.length > 0) {
    const { count, error: subErr } = await supabase
      .from('homework_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .in('homework_id', hwIds)
    if (subErr) throw subErr
    submitted = count ?? 0
  }
  const homework = { submitted, total: hwIds.length }

  return {
    studentName: student?.full_name ?? 'Student',
    className: cls?.name ?? '',
    stats: { attendance, quizzes, homework },
  }
}

// Ask the generate-digest Edge Function for a draft from those stats.
export async function generateDigest({ studentName, className, stats }) {
  const { data, error } = await supabase.functions.invoke('generate-digest', {
    body: { studentName, className, stats },
  })
  if (error) throw error
  return data.digest
}

// Aggregate a class's weakest quiz areas for the lesson planner.
// Reuses listClassQuizzes + getItemAnalysis (both teacher-readable).
export async function getClassWeakAreas(classId) {
  const { data: cls, error: cErr } = await supabase
    .from('classes')
    .select('name, grade_level')
    .eq('id', classId)
    .single()
  if (cErr) throw cErr

  const quizzes = await listClassQuizzes(classId)
  const perQuiz = []
  const weakQuestions = []

  for (const q of quizzes) {
    const ia = await getItemAnalysis(q.id)
    if (!ia || ia.totalAttempts === 0) continue
    let totalCorrect = 0
    let totalAnswered = 0
    for (const question of ia.questions) {
      totalCorrect += question.correct
      totalAnswered += question.answered
      const pct =
        question.answered > 0
          ? Math.round((question.correct / question.answered) * 100)
          : 0
      weakQuestions.push({ quizTitle: q.title, prompt: question.prompt, correctPct: pct })
    }
    const avgPct =
      totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0
    perQuiz.push({ title: q.title, avgPct })
  }

  // Weakest questions first; keep the bottom 8.
  weakQuestions.sort((a, b) => a.correctPct - b.correctPct)

  return {
    className: cls?.name ?? '',
    gradeLevel: cls?.grade_level ?? '',
    quizzes: perQuiz,
    weakQuestions: weakQuestions.slice(0, 8),
  }
}

// Ask the generate-lesson Edge Function for a plan targeting those weak areas.
export async function generateLesson({ className, gradeLevel, focusTopic, weakQuestions }) {
  const { data, error } = await supabase.functions.invoke('generate-lesson', {
    body: { className, gradeLevel, focusTopic, weakQuestions },
  })
  if (error) throw error
  return data.lesson
}