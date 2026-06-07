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
