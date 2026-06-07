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
