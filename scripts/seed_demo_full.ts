/**
 * Script de démonstration : école témoin "Collège d'Excellence" (college-excellence).
 *
 * Idempotent : peut être relancé sans risque (supprime puis recrée les données
 * de l'école témoin). Ne touche jamais aux autres écoles.
 *
 * Usage :
 *   npx tsx scripts/seed_demo_full.ts
 *
 * Attend les variables d'environnement (issues de .env.local) :
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Comptes créés (mot de passe commun : Password123!) :
 *   owner@excellence.fr        (school_admin)
 *   directeur@excellence.fr    (director)
 *   maths@excellence.fr        (teacher  - M. Koffi)
 *   francais@excellence.fr     (teacher  - Mme Diallo)
 *   sciences@excellence.fr     (teacher  - M. Traoré)
 *   compta@excellence.fr       (staff)
 *   parent.dupont@excellence.fr(parent   - 2 enfants)
 *   parent.diallo@excellence.fr(parent   - 2 enfants)
 */

import fs from "node:fs";
import path from "node:path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SCHOOL_SLUG = "college-excellence";
const PASSWORD = "Password123!";
const ACADEMIC_YEAR = "2026-2027";
const TERM = "Trimestre 1";
const DATES = {
  schoolStart: "2025-09-01",
  termStart: "2026-09-01",
  termEnd: "2026-12-19",
};

interface SeedUser {
  email: string;
  role: "school_admin" | "director" | "staff" | "teacher" | "parent";
  fullName: string;
  teacherFirst?: string;
  teacherLast?: string;
  teacherSpecialty?: string;
}

const USERS: SeedUser[] = [
  { email: "owner@excellence.fr", role: "school_admin", fullName: "Propriétaire École" },
  { email: "directeur@excellence.fr", role: "director", fullName: "M. Yao Ehouman" },
  { email: "maths@excellence.fr", role: "teacher", fullName: "M. Koffi N'Guessan", teacherFirst: "Koffi", teacherLast: "N'Guessan", teacherSpecialty: "Mathématiques" },
  { email: "francais@excellence.fr", role: "teacher", fullName: "Mme Diallo Awa", teacherFirst: "Awa", teacherLast: "Diallo", teacherSpecialty: "Français" },
  { email: "sciences@excellence.fr", role: "teacher", fullName: "M. Traoré Sékou", teacherFirst: "Sékou", teacherLast: "Traoré", teacherSpecialty: "Sciences & SVT" },
  { email: "compta@excellence.fr", role: "staff", fullName: "Mme Kacou Fatou" },
  { email: "parent.dupont@excellence.fr", role: "parent", fullName: "Mme Dupont Marie" },
  { email: "parent.diallo@excellence.fr", role: "parent", fullName: "M. Diallo Amadou" },
];

const SUBJECTS: { name: string; code: string; coefficient: number; color: string }[] = [
  { name: "Mathématiques", code: "MAT", coefficient: 4, color: "#4F46E5" },
  { name: "Français", code: "FRA", coefficient: 3, color: "#DC2626" },
  { name: "Anglais", code: "ANG", coefficient: 2, color: "#0891B2" },
  { name: "Physique-Chimie", code: "PC", coefficient: 2, color: "#7C3AED" },
  { name: "SVT", code: "SVT", coefficient: 2, color: "#059669" },
  { name: "Histoire-Géographie", code: "HG", coefficient: 2, color: "#D97706" },
  { name: "EPS", code: "EPS", coefficient: 1, color: "#16A34A" },
  { name: "Arts plastiques", code: "ART", coefficient: 1, color: "#DB2777" },
];

const CLASSES: { name: string; level: string; mainTeacherIdx: number }[] = [
  { name: "6ème A", level: "college", mainTeacherIdx: 2 },
  { name: "6ème B", level: "college", mainTeacherIdx: 4 },
  { name: "5ème A", level: "college", mainTeacherIdx: 3 },
];

interface StudentSeed {
  first: string;
  last: string;
  gender: string;
  classIdx: number;
  birthDate: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string | null;
  parentUserIdx: number | null;
}

const STUDENTS: StudentSeed[] = [
  { first: "Kouassi", last: "Yao", gender: "M", classIdx: 0, birthDate: "2014-03-12", parentName: "M. Yao", parentPhone: "+225 07 00 01 01 01", parentEmail: "parent.dupont@excellence.fr", parentUserIdx: 6 },
  { first: "Aya", last: "Konan", gender: "F", classIdx: 0, birthDate: "2014-07-19", parentName: "Mme Konan", parentPhone: "+225 07 00 01 01 02", parentEmail: "parent.dupont@excellence.fr", parentUserIdx: 6 },
  { first: "Fanta", last: "Coulibaly", gender: "F", classIdx: 0, birthDate: "2013-11-02", parentName: "M. Coulibaly", parentPhone: "+225 07 00 01 01 03", parentEmail: null, parentUserIdx: null },
  { first: "Ibrahim", last: "Cissé", gender: "M", classIdx: 0, birthDate: "2014-01-25", parentName: "Mme Cissé", parentPhone: "+225 07 00 01 01 04", parentEmail: null, parentUserIdx: null },
  { first: "Adjoua", last: "N'Guessan", gender: "F", classIdx: 0, birthDate: "2013-09-30", parentName: "M. N'Guessan", parentPhone: "+225 07 00 01 01 05", parentEmail: null, parentUserIdx: null },
  { first: "Marc", last: "Bamba", gender: "M", classIdx: 0, birthDate: "2014-05-08", parentName: "Mme Bamba", parentPhone: "+225 07 00 01 01 06", parentEmail: "parent.diallo@excellence.fr", parentUserIdx: 7 },
  { first: "Rachelle", last: "Tanoh", gender: "F", classIdx: 1, birthDate: "2014-04-15", parentName: "M. Tanoh", parentPhone: "+225 07 00 01 02 01", parentEmail: "parent.diallo@excellence.fr", parentUserIdx: 7 },
  { first: "Serge", last: "Gnamien", gender: "M", classIdx: 1, birthDate: "2013-12-01", parentName: "Mme Gnamien", parentPhone: "+225 07 00 01 02 02", parentEmail: null, parentUserIdx: null },
  { first: "Emilie", last: "Kouadio", gender: "F", classIdx: 1, birthDate: "2014-08-21", parentName: "M. Kouadio", parentPhone: "+225 07 00 01 02 03", parentEmail: null, parentUserIdx: null },
  { first: "Victor", last: "Djedje", gender: "M", classIdx: 1, birthDate: "2013-10-10", parentName: "Mme Djedje", parentPhone: "+225 07 00 01 02 04", parentEmail: null, parentUserIdx: null },
  { first: "Nadège", last: "Kra", gender: "F", classIdx: 1, birthDate: "2014-06-17", parentName: "M. Kra", parentPhone: "+225 07 00 01 02 05", parentEmail: null, parentUserIdx: null },
  { first: "Salif", last: "Diarra", gender: "M", classIdx: 2, birthDate: "2013-02-28", parentName: "Mme Diarra", parentPhone: "+225 07 00 01 03 01", parentEmail: null, parentUserIdx: null },
  { first: "Estelle", last: "Ble", gender: "F", classIdx: 2, birthDate: "2012-11-14", parentName: "M. Ble", parentPhone: "+225 07 00 01 03 02", parentEmail: null, parentUserIdx: null },
  { first: "Hervé", last: "Assi", gender: "M", classIdx: 2, birthDate: "2013-04-05", parentName: "Mme Assi", parentPhone: "+225 07 00 01 03 03", parentEmail: null, parentUserIdx: null },
  { first: "Mariam", last: "Sangaré", gender: "F", classIdx: 2, birthDate: "2012-12-22", parentName: "M. Sangaré", parentPhone: "+225 07 00 01 03 04", parentEmail: null, parentUserIdx: null },
];

const FEE_TYPES: { name: string; category: string; amount: number; description: string }[] = [
  { name: "Frais d'inscription", category: "inscription", amount: 50000, description: "Frais annuels d'inscription" },
  { name: "Écolage trimestre 1", category: "ecolage", amount: 120000, description: "Scolarité trimestre 1" },
  { name: "Cantine", category: "cantine", amount: 60000, description: "Abonnement cantine trimestre" },
  { name: "Transport scolaire", category: "transport", amount: 45000, description: "Transport trimestre" },
];

const CANTEEN_PLANS: { name: string; price: number; description: string }[] = [
  { name: "Formule Repas complet", price: 1500, description: "Déjeuner complet servi tous les jours" },
  { name: "Formule Snack", price: 700, description: "Collation du matin et goûter" },
];

// --- Helpers ---------------------------------------------------------------

function loadEnv(): { url: string; serviceKey: string } {
  const envFile = path.resolve(process.cwd(), ".env.local");
  const parse = (txt: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[line.slice(0, eq).trim()] = v;
    }
    return out;
  };

  let env: Record<string, string | undefined> = { ...process.env };
  if (fs.existsSync(envFile)) env = { ...env, ...parse(fs.readFileSync(envFile, "utf-8")) };

  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis (dans .env.local ou l'environnement).",
    );
  }
  return { url, serviceKey };
}

function fail(step: string, error: unknown): never {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[Echec] ${step} : ${msg}`);
  process.exit(1);
}

async function deleteIfError(cb: () => Promise<void>, ctx: string) {
  try {
    await cb();
  } catch (e) {
    fail(ctx, e);
  }
}

// --- Main -------------------------------------------------------------------

async function run(): Promise<void> {
  const { url: supabaseUrl, serviceKey } = loadEnv();
  const admin: SupabaseClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const step = (msg: string) => console.log(`\n>>> ${msg}`);

  // 1. École
  step("École « Collège d'Excellence » (« college-excellence »)");
  const { data: existingSchool, error: schoolGetErr } = await admin
    .from("schools")
    .select("id")
    .eq("slug", SCHOOL_SLUG)
    .maybeSingle();
  if (schoolGetErr) fail("récupération école", schoolGetErr);

  const schoolId = existingSchool?.id ?? crypto.randomUUID();
  if (!existingSchool) {
    const { error } = await admin.from("schools").insert({
      id: schoolId,
      name: "Collège d'Excellence",
      slug: SCHOOL_SLUG,
      email: "contact@excellence.fr",
      phone: "+225 07 00 00 00 00",
      address: "Abidjan, Cocody, Côte d'Ivoire",
      primary_color: "#2563EB",
      secondary_color: "#1E40AF",
      is_active: true,
    });
    if (error) fail("insertion école", error);
  }
  console.log(`  École id : ${schoolId}`);

  // 2. Purge idempotente des données de l'école témoin (ordre dépendances)
  step("Purge idempotente des anciennes données (« college-excellence »)");
  const cleanTables = [
    "notifications_log",
    "announcements",
    "bus_assignments",
    "bus_stops",
    "bus_lines",
    "canteen_attendance",
    "student_canteen_subscriptions",
    "canteen_plans",
    "payments",
    "invoices",
    "fee_types",
    "attendance",
    "grades",
    "evaluations",
    "timetable_slots",
    "class_subjects",
    "students",
    "classes",
    "teachers",
    "rooms",
    "subjects",
    "user_modules",
    "school_modules",
    "user_profiles",
  ];
  await deleteIfError(async () => {
    // Tables sans colonne school_id : purge par sous-requête FK.
    const delByIn = async (table: string, col: string, fkTable: string, fkCol: string) => {
      const { data: fkIds } = await admin.from(fkTable).select(fkCol).eq("school_id", schoolId);
      const ids = (fkIds || []).map((r: any) => r[fkCol]).filter(Boolean);
      if (ids.length === 0) return;
      // par lots de 900 (PostgREST limite l'URL)
      for (let i = 0; i < ids.length; i += 900) {
        const { error } = await admin.from(table).delete().in(col, ids.slice(i, i + 900));
        if (error) throw error;
      }
    };
    // announcement_targets -> announcements.id
    await delByIn("announcement_targets", "announcement_id", "announcements", "id");
    // fee_class_prices -> fee_types.id + classes.id
    await delByIn("fee_class_prices", "fee_type_id", "fee_types", "id");

    for (const table of cleanTables) {
      const { error } = await admin.from(table).delete().eq("school_id", schoolId);
      if (error && !/does not exist/.test(error.message)) throw error;
    }
  }, "purge des tables");

  // 3. Comptes Auth (idempotent : crée les manquants)
  step("Comptes Auth + profils");
  const authUserIds = new Map<string, string>();
  const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) fail("listUsers", listErr);
  const existingByEmail = new Map<string, string>();
  (listData?.users || []).forEach((u: { email: string; id: string }) => existingByEmail.set(u.email, u.id));

  for (const u of USERS) {
    let userId = existingByEmail.get(u.email);
    if (!userId) {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: u.email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) fail(`création utilisateur ${u.email}`, error);
      if (!created?.user?.id) fail(`création utilisateur ${u.email}`, new Error("id absent"));
      userId = created!.user!.id!;
    }
    authUserIds.set(u.email, userId!);
  }
  console.log(`  ${USERS.length} comptes Auth assurés.`);

  // user_modules à purger (dépend de user_id, fait avant suppression des users plus bas)

  // 4. Profils
  step("Profils (user_profiles)");
  for (const u of USERS) {
    const userId = authUserIds.get(u.email)!;
    const { error } = await admin.from("user_profiles").insert({
      user_id: userId,
      school_id: schoolId,
      role: u.role,
      full_name: u.fullName,
    });
    if (error && !/duplicate/.test(error.message)) fail(`profil ${u.email}`, error);
  }

  // 5. Modules
  step("Modules activés");
  const moduleIds = ["students", "attendance", "grades", "timetable", "users", "finance", "canteen", "transport", "communication", "portal"];
  for (const m of moduleIds) {
    const { error } = await admin.from("school_modules").insert({
      school_id: schoolId,
      module_id: m,
      is_enabled: true,
    });
    if (error) fail(`module ${m}`, error);
  }

  // 6. Enseignants (liens vers comptes teacher via user_id)
  step("Enseignants");
  const teacherIds = new Map<number, string>();
  const teacherUserIds = new Map<number, string>();
  for (let i = 0; i < USERS.length; i++) {
    const u = USERS[i];
    if (u.role !== "teacher" || !u.teacherFirst || !u.teacherLast) continue;
    const res = await admin
      .from("teachers")
      .insert({
        school_id: schoolId,
        user_id: authUserIds.get(u.email)!,
        first_name: u.teacherFirst,
        last_name: u.teacherLast,
        email: u.email,
        specialty: u.teacherSpecialty ?? null,
      })
      .select("id")
      .single();
    if (res.error) fail(`enseignant ${u.email}`, res.error);
    teacherIds.set(i, res.data!.id);
    teacherUserIds.set(i, authUserIds.get(u.email)!);
  }
  console.log(`  ${teacherIds.size} enseignants créés.`);

  // 7. Matières
  step("Matières");
  const subjectIds = new Map<string, string>();
  for (const s of SUBJECTS) {
    const res = await admin
      .from("subjects")
      .insert({
        school_id: schoolId,
        name: s.name,
        code: s.code,
        coefficient: s.coefficient,
        default_color: s.color,
      })
      .select("id")
      .single();
    if (res.error) fail(`matière ${s.name}`, res.error);
    subjectIds.set(s.code, res.data!.id);
  }

  // 8. Classes
  step("Classes");
  const classIds = new Map<number, string>();
  for (let i = 0; i < CLASSES.length; i++) {
    const c = CLASSES[i];
    const res = await admin
      .from("classes")
      .insert({
        school_id: schoolId,
        name: c.name,
        level: c.level,
        academic_year: ACADEMIC_YEAR,
        main_teacher_id: teacherIds.get(c.mainTeacherIdx) ?? null,
        max_students: 30,
      })
      .select("id")
      .single();
    if (res.error) fail(`classe ${c.name}`, res.error);
    classIds.set(i, res.data!.id);
  }

  // 9. association matières-classes (class_subjects)
  step("Matières par classe");
  const classSubjectKeys: { classIdx: number; subject: string; coeff: number }[] = [];
  for (let ci = 0; ci < CLASSES.length; ci++) {
    for (const s of SUBJECTS) {
      classSubjectKeys.push({ classIdx: ci, subject: s.code, coeff: s.coefficient });
      const { error } = await admin.from("class_subjects").insert({
        class_id: classIds.get(ci)!,
        subject_id: subjectIds.get(s.code)!,
        coefficient: s.coefficient,
      });
      if (error) fail(`class_subject ${s.code} classe ${ci}`, error);
    }
  }

  // 10. Salles
  step("Salles");
  const roomIds: string[] = [];
  for (const name of ["Salle 101", "Salle 102", "Salle 103", "Labo Physique", "Salle Info"]) {
    const res = await admin
      .from("rooms")
      .insert({ school_id: schoolId, name, capacity: 30, type: name.startsWith("Labo") ? "lab" : "classroom" })
      .select("id")
      .single();
    if (res.error) fail(`salle ${name}`, res.error);
    roomIds.push(res.data!.id);
  }

  // 11. Emploi du temps
  step("Emploi du temps (semaine type)");
  const days = [1, 2, 3, 4, 5];
  const timeSlots = [
    ["08:00", "09:00"],
    ["09:00", "10:00"],
    ["10:15", "11:15"],
    ["11:15", "12:15"],
    ["14:00", "15:00"],
  ];
  {
    let slotIdx = 0;
    for (let ci = 0; ci < CLASSES.length; ci++) {
      for (const day of days) {
        for (const [s, e] of timeSlots) {
          const subj = SUBJECTS[slotIdx % SUBJECTS.length];
          const { error } = await admin.from("timetable_slots").insert({
            school_id: schoolId,
            class_id: classIds.get(ci)!,
            subject_id: subjectIds.get(subj.code)!,
            teacher_id: teacherIds.get(CI_TEACHER[subj.code] ?? 0) ?? null,
            room_id: roomIds[slotIdx % roomIds.length],
            day_of_week: day,
            start_time: s,
            end_time: e,
            color: subj.color,
          });
          if (error) fail("créneau emploi du temps", error);
          slotIdx++;
        }
      }
    }
  }

  // 12. Élèves
  step("Élèves (15)");
  const studentIds = new Map<number, string>();
  for (let i = 0; i < STUDENTS.length; i++) {
    const st = STUDENTS[i];
    const matricule = `CE-${String(i + 1).padStart(3, "0")}-${new Date().getFullYear()}`;
    const res = await admin
      .from("students")
      .insert({
        school_id: schoolId,
        class_id: classIds.get(st.classIdx)!,
        matricule,
        first_name: st.first,
        last_name: st.last,
        gender: st.gender,
        birth_date: st.birthDate,
        parent_name: st.parentName,
        parent_phone: st.parentPhone,
        parent_email: st.parentEmail,
        parent_user_id: st.parentUserIdx != null ? authUserIds.get(USERS[st.parentUserIdx!].email)! : null,
        status: "active",
      })
      .select("id")
      .single();
    if (res.error) fail(`élève ${st.first} ${st.last}`, res.error);
    studentIds.set(i, res.data!.id);
  }

  // 13. Évaluations + notes (Trimestre 1)
  step("Évaluations & notes (Trimestre 1)");
  const evalIds: string[] = [];
  const gradesRows: { school_id: string; evaluation_id: string; student_id: string; score: number; comment: string }[] = [];
  {
    let evalIdx = 0;
    for (let ci = 0; ci < CLASSES.length; ci++) {
      for (const subj of SUBJECTS.slice(0, 6)) {
        const types = ["devoir", "interro", "examen"];
        for (let t = 0; t < 3; t++) {
          const title = `${subj.name} — ${t === 0 ? "Devoir" : t === 1 ? "Interrogation" : "Examen"}`;
          const res = await admin
            .from("evaluations")
            .insert({
              school_id: schoolId,
              class_id: classIds.get(ci)!,
              subject_id: subjectIds.get(subj.code)!,
              title,
              coefficient: subj.coefficient,
              max_score: 20,
              evaluation_date: addDays(DATES.termStart, evalIdx % 40),
              term: TERM,
              type: types[t] as "devoir" | "interro" | "examen",
            })
            .select("id")
            .single();
          if (res.error) fail(`évaluation ${title}`, res.error);
          evalIds.push(res.data!.id);
          evalIdx++;
        }
      }
    }
    console.log(`  ${evalIds.length} évaluations créées.`);
  }

  for (let ci = 0; ci < CLASSES.length; ci++) {
    const classStudents = STUDENTS.map((s, i) => ({ s, i }))
      .filter(({ s }) => s.classIdx === ci)
      .map(({ i }) => i);
    let evIdxForClass = 0;
    for (const subj of SUBJECTS.slice(0, 6)) {
      for (let t = 0; t < 3; t++) {
        const evIndex = ci * SUBJECTS.slice(0, 6).length * 3 + evIdxForClass;
        const evId = evalIds[evIndex];
        evIdxForClass++;
        for (const si of classStudents) {
          const score = round1(8 + ((si * 13 + evIndex * 7) % 13)); // 8..20
          gradesRows.push({
            school_id: schoolId,
            evaluation_id: evId,
            student_id: studentIds.get(si)!,
            score,
            comment: score >= 16 ? "Excellent" : score >= 14 ? "Très bien" : score >= 10 ? "Bien" : "À consolider",
          });
        }
      }
    }
  }
  {
    const batchSize = 500;
    for (let i = 0; i < gradesRows.length; i += batchSize) {
      const { error } = await admin.from("grades").insert(gradesRows.slice(i, i + batchSize));
      if (error) fail("insertion notes", error);
    }
    console.log(`  ${gradesRows.length} notes insérées.`);
  }

  // 14. Présences (émargement de la semaine écoulée)
  step("Présences (dernière semaine)");
  {
    const attendanceRows: any[] = [];
    const lastWeek = lastWeekdayDates(7);
    const recordedBy = authUserIds.get("maths@excellence.fr") ?? null;
    let seed = 1;
    for (const si of studentIds.keys()) {
      for (const d of lastWeek) {
        const dayNum = new Date(`${d}T00:00:00Z`).getUTCDate();
        const r = (seed * 7 + si * 3 + dayNum) % 10;
        let status = "present";
        if (r >= 8) status = "absent";
        else if (r >= 7) status = "late";
        const st = STUDENTS[si];
        attendanceRows.push({
          school_id: schoolId,
          class_id: classIds.get(st.classIdx)!,
          student_id: studentIds.get(si)!,
          date: d,
          status,
          recorded_by: recordedBy,
          note: status === "absent" ? "Absence non justifiée" : status === "late" ? "Arrivé en retard" : null,
        });
        seed++;
      }
    }
    const batchSize = 500;
    for (let i = 0; i < attendanceRows.length; i += batchSize) {
      const { error } = await admin.from("attendance").insert(attendanceRows.slice(i, i + batchSize));
      if (error) fail("insertion présences", error);
    }
    console.log(`  ${attendanceRows.length} lignes d'émargement.`);
  }

  // 15. Finance : grille, factures, paiements
  step("Finance : grille tarifaire, factures, paiements");
  const feeTypeIds = new Map<string, string>();
  for (const f of FEE_TYPES) {
    const res = await admin
      .from("fee_types")
      .insert({ school_id: schoolId, name: f.name, category: f.category, amount: f.amount, description: f.description })
      .select("id")
      .single();
    if (res.error) fail(`type de frais ${f.name}`, res.error);
    feeTypeIds.set(f.name, res.data!.id);
  }

  const invoiceIds: string[] = [];
  const syncStatus = async (invoiceId: string) => {
    // Re-déclenche le trigger update_invoice_status_on_invoice (qui recalcule
    // amount_paid via la somme des payments + status selon due_date / aujourd'hui).
    const { error } = await admin
      .from("invoices")
      .update({ due_date: (await admin.from("invoices").select("due_date").eq("id", invoiceId).single()).data?.due_date ?? null })
      .eq("id", invoiceId);
    if (error) fail("synchronisation statut facture", error);
  };

  {
    let invSeed = 1;
    for (const si of studentIds.keys()) {
      const st = STUDENTS[si];
      const compta = authUserIds.get("compta@excellence.fr") ?? null;

      // --- Inscription (payée) ---
      const invIns = await insertInvoice(
        admin, schoolId, studentIds.get(si)!, feeTypeIds.get("Frais d'inscription")!,
        "Frais d'inscription", 50000, addDays(DATES.schoolStart, 10), `${st.last.toUpperCase()}-INS-${invSeed}`,
      );
      invoiceIds.push(invIns);
      const { error: payIns } = await admin.from("payments").insert({
        school_id: schoolId,
        invoice_id: invIns,
        amount_paid: 50000,
        payment_method: "cash",
        payment_date: addDays(DATES.schoolStart, 15),
        recorded_by: compta,
      });
      if (payIns) fail("paiement inscription", payIns);
      await syncStatus(invIns);
      invSeed++;

      // --- Écolage T1 : mix payée / partielle / en retard ---
      const isParentChild = st.parentUserIdx != null;
      const ecoAmount = 120000;
      const overdue = !isParentChild && si % 3 === 0;
      const ecoPaid = isParentChild ? ecoAmount : overdue ? 0 : si % 3 === 1 ? 60000 : ecoAmount;
      // due_date : passé => "overdue" ; sinon futur => pending/partial/paid.
      const ecoDue = overdue ? addDays(DATES.termStart, -20) : addDays(DATES.termStart, 20);

      const invEco = await insertInvoice(
        admin, schoolId, studentIds.get(si)!, feeTypeIds.get("Écolage trimestre 1")!,
        "Écolage trimestre 1", ecoAmount, ecoDue, `${st.last.toUpperCase()}-ECO-${invSeed}`,
      );
      invoiceIds.push(invEco);
      if (ecoPaid > 0) {
        const { error } = await admin.from("payments").insert({
          school_id: schoolId,
          invoice_id: invEco,
          amount_paid: ecoPaid,
          payment_method: "bank_transfer",
          payment_date: addDays(DATES.termStart, 25),
          recorded_by: compta,
        });
        if (error) fail("paiement écolage", error);
      }
      await syncStatus(invEco);
      invSeed++;
    }
  }
  console.log(`  ${invoiceIds.length} factures créées.`);

  // 16. Cantine : formules + abonnements
  step("Cantine : formules & abonnements");
  const canteenPlanIds = new Map<string, string>();
  for (const p of CANTEEN_PLANS) {
    const res = await admin
      .from("canteen_plans")
      .insert({ school_id: schoolId, name: p.name, price: p.price, description: p.description })
      .select("id")
      .single();
    if (res.error) fail(`formule cantine ${p.name}`, res.error);
    canteenPlanIds.set(p.name, res.data!.id);
  }
  for (let si = 0; si < studentIds.size; si++) {
    if (si % 2 !== 0) continue;
    const planName = si % 4 === 0 ? "Formule Repas complet" : "Formule Snack";
    const { error } = await admin.from("student_canteen_subscriptions").insert({
      school_id: schoolId,
      student_id: studentIds.get(si)!,
      plan_id: canteenPlanIds.get(planName)!,
      start_date: DATES.termStart,
      end_date: DATES.termEnd,
      status: "active",
    });
    if (error) fail("abonnement cantine", error);
  }

  // 17. Transport : ligne + arrêts + affectations
  step("Transport : ligne, arrêts, affectations");
  const lineRes = await admin
    .from("bus_lines")
    .insert({ school_id: schoolId, name: "Ligne Cocody", zone: "Cocody", driver_name: "M. Anoh", driver_phone: "+225 07 99 00 00 00" })
    .select("id")
    .single();
  if (lineRes.error) fail("ligne bus", lineRes.error);
  const lineId = lineRes.data!.id;
  const stopIds: string[] = [];
  for (const [i, name] of ["Rond-point", "Pharmacie", "Marché", "Carrefour", "École"].entries()) {
    const res = await admin
      .from("bus_stops")
      .insert({ school_id: schoolId, line_id: lineId, name, stop_order: i, is_active: true })
      .select("id")
      .single();
    if (res.error) fail(`arrêt ${name}`, res.error);
    stopIds.push(res.data!.id);
  }
  for (let si = 0; si < studentIds.size; si++) {
    if (si % 3 !== 0) continue;
    if (si >= stopIds.length) break;
    const { error } = await admin.from("bus_assignments").insert({
      school_id: schoolId,
      student_id: studentIds.get(si)!,
      line_id: lineId,
      stop_id: stopIds[si % stopIds.length],
      direction: "both",
    });
    if (error) fail("affectation bus", error);
  }

  // 18. Annonces
  step("Annonces & ciblage");
  const ann1 = await admin
    .from("announcements")
    .insert({
      school_id: schoolId,
      title: "Réunion de rentrée",
      content: "La réunion de rentrée des parents aura lieu le samedi 12 septembre à 9h00 dans la salle polyvalente.",
      target: "all",
      created_by: authUserIds.get("directeur@excellence.fr") ?? null,
    })
    .select("id")
    .single();
  if (ann1.error) fail("annonce 1", ann1.error);
  const ann2 = await admin
    .from("announcements")
    .insert({
      school_id: schoolId,
      title: "Sortie pédagogique — 6ème",
      content: "Sortie au musée prévue le 5 octobre pour toutes les classes de 6ème. Autorisation parentale exigée.",
      target: "classes",
      created_by: authUserIds.get("directeur@excellence.fr") ?? null,
    })
    .select("id")
    .single();
  if (ann2.error) fail("annonce 2", ann2.error);
  for (const ci of [0, 1]) {
    const { error } = await admin.from("announcement_targets").insert({
      announcement_id: ann2.data!.id,
      class_id: classIds.get(ci)!,
    });
    if (error) fail("ciblage annonce", error);
  }

  console.log("\n================================================");
  console.log("Seed terminé avec succès.");
  console.log(`École : ${SCHOOL_SLUG} (${schoolId})`);
  console.log(`Comptes : ${USERS.map((u) => u.email).join(", ")}`);
  console.log("Mot de passe commun : Password123!");
  console.log("================================================");
}

// --- Petites fonctions utilitaires ------------------------------------------

const CI_TEACHER: Record<string, number> = { MAT: 2, FRA: 3, SVT: 4, PC: 4 };

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function lastWeekdayDates(count: number): string[] {
  const out: string[] = [];
  const today = new Date();
  // on remonte 7 jours ouvrés max ; on génère les 'count' derniers jours calendaires ouvrés
  let day = new Date(today);
  day.setDate(day.getDate() - 1); // commence hier
  while (out.length < count) {
    const dow = day.getDay();
    if (dow !== 0 && dow !== 6) {
      out.unshift(day.toISOString().slice(0, 10));
    }
    day.setDate(day.getDate() - 1);
    if (out.length >= 12) break;
  }
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

async function insertInvoice(
  admin: SupabaseClient,
  schoolId: string,
  studentId: string,
  feeTypeId: string | undefined,
  title: string,
  amountDue: number,
  dueDate: string,
  reference: string,
): Promise<string> {
  const res = await admin
    .from("invoices")
    .insert({ school_id: schoolId, student_id: studentId, fee_type_id: feeTypeId ?? null, title, amount_due: amountDue, amount_paid: 0, due_date: dueDate, status: "pending", reference })
    .select("id")
    .single();
  if (res.error) fail(`facture ${reference}`, res.error);
  return res.data!.id;
}

run().catch((e) => fail("exécution globale", e));
