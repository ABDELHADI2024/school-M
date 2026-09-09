import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { supabase } from "../lib/supabase";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/AppNavigator";
import type { SchoolClass, TimetableSlot } from "../types";

const DAY_NAMES_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DAY_INDEX = new Date().getDay();

interface AttendanceStudent {
  id: string;
  first_name: string;
  last_name: string;
  matricule: string;
  status: "present" | "absent" | "late" | "";
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "TeacherHome">;
  route: { params: { profile: { role: string; school_id: string } } };
};

export default function TeacherHomeScreen({ navigation, route }: Props) {
  const { profile } = route.params;
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [students, setStudents] = useState<AttendanceStudent[]>([]);
  const [todaySlots, setTodaySlots] = useState<TimetableSlot[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!profile.school_id) return;

    try {
      setError(null);
      setOffline(false);

      // Résolution de l'enseignant connecté par email : user_profiles/profile
      // n'expose pas d'user_id sur teachers, on relie via teachers.email.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const teacherEmail = user?.email?.toLowerCase() ?? null;

      const teacherId = teacherEmail
        ? (
            await supabase
              .from("teachers")
              .select("id")
              .eq("school_id", profile.school_id)
              .ilike("email", teacherEmail)
              .maybeSingle()
          ).data?.id ?? null
        : null;

      const [clsRes, slotsRes] = await Promise.all([
        supabase
          .from("classes")
          .select("id, school_id, name, main_teacher_id")
          .eq("school_id", profile.school_id),
        DAY_INDEX >= 1 && DAY_INDEX <= 6
          ? supabase
              .from("timetable_slots")
              .select(
                "*, subjects(name), teachers(first_name, last_name), rooms(name)",
              )
              .eq("school_id", profile.school_id)
              .eq("day_of_week", DAY_INDEX)
              .order("start_time")
          : Promise.resolve({ data: [] }),
      ]);

      const cls = clsRes.data || [];

      // Classes assignées : dont l'enseignant est professeur principal (main_teacher_id).
      const myClasses = teacherId
        ? cls.filter((c) => c.main_teacher_id === teacherId)
        : cls;

      setClasses(myClasses);
      if (myClasses.length > 0) {
        setSelectedClassId((prev) =>
          myClasses.some((c) => c.id === prev)
            ? prev
            : myClasses[0].id,
        );
      } else {
        setSelectedClassId("");
      }

      // Créneaux du jour où l'enseignant intervient (timetable_slots.teacher_id).
      const allSlots = (slotsRes.data || []) as TimetableSlot[];
      setTodaySlots(
        teacherId
          ? allSlots.filter((s) => s.teacher_id === teacherId)
          : allSlots,
      );
    } catch {
      setError("Impossible de charger les données. Vérifiez votre connexion et réessayez.");
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [profile.school_id]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const fetchStudents = useCallback(async () => {
    if (!selectedClassId || !profile.school_id) return;
    try {
      const today = new Date().toISOString().split("T")[0];

      const [studentsRes, attRes] = await Promise.all([
        supabase
          .from("students")
          .select("id, first_name, last_name, matricule")
          .eq("school_id", profile.school_id)
          .eq("class_id", selectedClassId)
          .order("last_name"),
        supabase
          .from("attendance")
          .select("student_id, status")
          .eq("school_id", profile.school_id)
          .eq("class_id", selectedClassId)
          .eq("date", today),
      ]);

      const attMap: Record<string, string> = {};
      (attRes.data || []).forEach(
        (a: { student_id: string; status: string }) => {
          attMap[a.student_id] = a.status;
        },
      );

      setStudents(
        (
          (studentsRes.data || []) as {
            id: string;
            first_name: string;
            last_name: string;
            matricule: string;
          }[]
        ).map((s) => ({
          ...s,
          status: (attMap[s.id] as AttendanceStudent["status"]) || "",
        })),
      );
    } catch {
      setError("Impossible de charger la liste des élèves.");
      setOffline(true);
    }
  }, [selectedClassId, profile.school_id]);

  useEffect(() => {
    void Promise.resolve().then(fetchStudents);
  }, [fetchStudents]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const toggleStatus = (
    studentId: string,
    newStatus: "present" | "absent" | "late",
  ) => {
    setStudents((prev) =>
      prev.map((s) =>
        s.id === studentId
          ? { ...s, status: s.status === newStatus ? "" : newStatus }
          : s,
      ),
    );
  };

  const saveAttendance = async () => {
    if (!profile.school_id || !selectedClassId) return;
    setSaving(true);
    const today = new Date().toISOString().split("T")[0];

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const rows = students
        .filter((s) => s.status !== "")
        .map((s) => ({
          school_id: profile.school_id,
          class_id: selectedClassId,
          student_id: s.id,
          date: today,
          status: s.status,
          recorded_by: user?.id ?? null,
        }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from("attendance")
          .upsert(rows, { onConflict: "class_id,student_id,date" });
        if (error) throw error;
        Alert.alert("Appel enregistré", "La prise d'appel a bien été enregistrée.");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur inconnue";
      Alert.alert("Échec de l'enregistrement", message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigation.replace("Login");
  };

  const presentCount = students.filter((s) => s.status === "present").length;
  const absentCount = students.filter((s) => s.status === "absent").length;
  const lateCount = students.filter((s) => s.status === "late").length;

  const retry = async () => {
    setLoading(true);
    setError(null);
    await Promise.all([loadData(), fetchStudents()]);
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Une erreur est survenue</Text>
        <Text style={styles.errorSubtitle}>{error}</Text>
        <TouchableOpacity onPress={retry} style={styles.retryBtn}>
          <Text style={styles.retryText}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Bonjour,</Text>
          <Text style={styles.headerTitle}>Espace Enseignant</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Deconnexion</Text>
        </TouchableOpacity>
      </View>

      {offline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            Connexion instable : certaines donnees peuvent etre obsoletes.
          </Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Planning du jour {"\u2014"} {DAY_NAMES_FR[DAY_INDEX]}
        </Text>
        {todaySlots.length === 0 ? (
          <Text style={styles.emptyText}>
            Aucun cours prevu aujourd&apos;hui.
          </Text>
        ) : (
          todaySlots.map((slot, i) => (
            <View key={i} style={styles.slotCard}>
              <View
                style={[
                  styles.slotColor,
                  { backgroundColor: slot.color || "#2563EB" },
                ]}
              />
              <View style={styles.slotContent}>
                <Text style={styles.slotSubject}>
                  {(slot.subjects as { name?: string })?.name || "\u2014"}
                </Text>
                <Text style={styles.slotDetail}>
                  {(slot.teachers as { last_name?: string })?.last_name} {"\u00B7"}{" "}
                  {(slot.rooms as { name?: string })?.name || "\u2014"}
                </Text>
              </View>
              <Text style={styles.slotTime}>
                {slot.start_time} {"\u2013"} {slot.end_time}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Prise d&apos;appel
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.classRow}
        >
          {classes.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setSelectedClassId(c.id)}
              style={[
                styles.classChip,
                selectedClassId === c.id && styles.classChipActive,
              ]}
            >
              <Text
                style={[
                  styles.classChipText,
                  selectedClassId === c.id && styles.classChipTextActive,
                ]}
              >
                {c.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.attStats}>
          <View style={[styles.statBox, { backgroundColor: "#ECFDF5" }]}>
            <Text style={[styles.statNum, { color: "#059669" }]}>
              {presentCount}
            </Text>
            <Text style={styles.statLabel}>Presents</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: "#FEF2F2" }]}>
            <Text style={[styles.statNum, { color: "#DC2626" }]}>
              {absentCount}
            </Text>
            <Text style={styles.statLabel}>Absents</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: "#FFFBEB" }]}>
            <Text style={[styles.statNum, { color: "#D97706" }]}>
              {lateCount}
            </Text>
            <Text style={styles.statLabel}>Retards</Text>
          </View>
        </View>

        {students.length === 0 ? (
          <Text style={styles.emptyText}>Aucun eleve dans cette classe.</Text>
        ) : (
          students.map((st) => (
            <View key={st.id} style={styles.studentRow}>
              <View style={styles.studentAvatar}>
                <Text style={styles.avatarText}>
                  {st.last_name.charAt(0)}
                  {st.first_name.charAt(0)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.studentName}>
                  {st.last_name} {st.first_name}
                </Text>
                <Text style={styles.studentMat}>{st.matricule}</Text>
              </View>
              <View style={styles.statusBtns}>
                {(["present", "absent", "late"] as const).map((status) => (
                  <TouchableOpacity
                    key={status}
                    onPress={() => toggleStatus(st.id, status)}
                    style={[
                      styles.statusBtn,
                      st.status === status &&
                        styles[`statusBtn_${status}`],
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBtnText,
                        st.status === status && styles.statusBtnTextActive,
                      ]}
                    >
                      {status === "present"
                        ? "P"
                        : status === "absent"
                          ? "A"
                          : "R"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))
        )}

        {students.length > 0 && (
          <TouchableOpacity
            onPress={saveAttendance}
            disabled={saving}
            style={[styles.saveBtn, saving && { opacity: 0.5 }]}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>
                Enregistrer l&apos;appel
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  errorTitle: { fontSize: 18, fontWeight: "700", color: "#1E293B", marginBottom: 8 },
  errorSubtitle: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 20,
  },
  retryBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  retryText: { color: "#FFF", fontWeight: "600" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: "#2563EB",
  },
  greeting: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  headerTitle: { color: "#FFF", fontSize: 20, fontWeight: "800" },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
  },
  logoutText: { color: "#FFF", fontSize: 11, fontWeight: "600" },

  offlineBanner: {
    backgroundColor: "#FEF3C7",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  offlineText: { fontSize: 11, color: "#92400E", textAlign: "center" },

  section: { padding: 20 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 12,
  },
  emptyText: {
    color: "#94A3B8",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 20,
  },

  slotCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  slotColor: { width: 4, height: 36, borderRadius: 2, marginRight: 12 },
  slotContent: { flex: 1 },
  slotSubject: { fontSize: 14, fontWeight: "600", color: "#1E293B" },
  slotDetail: { fontSize: 11, color: "#64748B", marginTop: 2 },
  slotTime: { fontSize: 11, color: "#94A3B8", fontWeight: "500" },

  classRow: { marginBottom: 16 },
  classChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#E2E8F0",
    marginRight: 8,
  },
  classChipActive: { backgroundColor: "#2563EB" },
  classChipText: { fontSize: 13, fontWeight: "600", color: "#475569" },
  classChipTextActive: { color: "#FFF" },

  attStats: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statBox: { flex: 1, borderRadius: 12, padding: 12, alignItems: "center" },
  statNum: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 10, color: "#64748B", fontWeight: "600", marginTop: 2 },

  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
  },
  studentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  avatarText: { fontSize: 12, fontWeight: "700", color: "#4F46E5" },
  studentName: { fontSize: 13, fontWeight: "600", color: "#1E293B" },
  studentMat: { fontSize: 10, color: "#94A3B8", marginTop: 1 },

  statusBtns: { flexDirection: "row", gap: 4 },
  statusBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  statusBtn_present: { backgroundColor: "#D1FAE5" },
  statusBtn_absent: { backgroundColor: "#FEE2E2" },
  statusBtn_late: { backgroundColor: "#FEF3C7" },
  statusBtnText: { fontSize: 12, fontWeight: "700", color: "#94A3B8" },
  statusBtnTextActive: { color: "#1E293B" },

  saveBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  saveBtnText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
});
