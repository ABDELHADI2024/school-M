export type UserRole = 'super_admin' | 'school_admin' | 'director' | 'staff' | 'teacher' | 'parent' | 'student';

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  role: UserRole;
  school_id: string | null;
  created_at?: string;
}

export interface School {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
}

export interface Student {
  id: string;
  school_id: string;
  class_id: string;
  matricule: string;
  first_name: string;
  last_name: string;
  gender: string;
  birth_date: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
}

export interface Attendance {
  id: string;
  school_id: string;
  class_id: string;
  student_id: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  note: string | null;
  recorded_by: string | null;
  created_at?: string;
}

export interface Grade {
  id: string;
  school_id: string;
  evaluation_id: string;
  student_id: string;
  score: number | null;
  comment: string | null;
  created_at?: string;
}

export interface Evaluation {
  id: string;
  school_id: string;
  class_id: string;
  subject_id: string;
  title: string;
  coefficient: number;
  max_score: number;
  created_at?: string;
  subjects?: { name: string };
}

export interface TimetableSlot {
  id: string;
  school_id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string;
  room_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  color: string | null;
  subjects?: { name: string };
  teachers?: { first_name: string; last_name: string };
  rooms?: { name: string };
}

export interface Subject {
  id: string;
  school_id: string;
  name: string;
}

export interface SchoolClass {
  id: string;
  school_id: string;
  name: string;
}
