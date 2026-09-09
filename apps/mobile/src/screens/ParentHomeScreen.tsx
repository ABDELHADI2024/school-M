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

interface GradeRow {
  score: number | null;
  comment: string | null;
  evaluations: {
    title: string;
    coefficient: number;
    subjects: { name: string };
  } | null;
  created_at: string;
}

interface AbsenceRow {
  date: string;
  status: string;
  note: string | null;
}

interface InvoiceRow {
  id: string;
  title: string;
  amount_due: number;
  amount_paid: number;
  due_date: string | null;
}

interface StudentInfo {
  id: string;
  first_name: string;
  last_name: string;
  matricule: string;
  class_id: string;
  classes?: { name: string } | null;
}

interface AttendanceSummary {
  present: number;
  late: number;
  absent: number;
  excused: number;
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, "ParentHome">;
  route: {
    params: { profile: { role: string; school_id: string; user_id: string } };
  };
};

export default function ParentHomeScreen({ navigation, route }: Props) {
  const { profile } = route.params;
  const [children, setChildren] = useState<StudentInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [absences, setAbsences] = useState<AbsenceRow[]>([]);
  const [attSummary, setAttSummary] = useState<AttendanceSummary>({
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
  });
  const [remainingDue, setRemainingDue] = useState(0);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [generalAvg, setGeneralAvg] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const student = children[selectedIndex] ?? null;

  const loadStudent = useCallback(async (index: number) => {
    const studentInfo = children[index];
    if (!studentInfo) return;

    try {
      setError(null);
      setOffline(false);

      // Notes récentes de l'élève, avec moyenne pondérée générale.
      const { data: gradesData } = await supabase
        .from("grades")
        .select(
          "score, comment, created_at, evaluations(title, coefficient, subjects(name))",
        )
        .eq("student_id", studentInfo.id)
        .order("created_at", { ascending: false })
        .limit(10);

      const gradeRows = (gradesData || []) as unknown as GradeRow[];
      setGrades(gradeRows);

      let totalWeighted = 0;
      let totalCoeff = 0;
      gradeRows.forEach((g) => {
        const ev = g.evaluations;
        if (ev && g.score !== null) {
          totalWeighted += g.score * ev.coefficient;
          totalCoeff += ev.coefficient;
        }
      });
      setGeneralAvg(totalCoeff > 0 ? totalWeighted / totalCoeff : 0);

      // Récapitulatif d'assiduité du mois courant.
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      const from = startOfMonth.toISOString().slice(0, 10);

      const { data: monthAtt } = await supabase
        .from("attendance")
        .select("status")
        .eq("student_id", studentInfo.id)
        .gte("date", from);

      const att: AttendanceSummary = {
        present: 0,
        late: 0,
        absent: 0,
        excused: 0,
      };
      (monthAtt || []).forEach(
        (a: { status: string }) => {
          const key = a.status as keyof AttendanceSummary;
          if (key in att) att[key] += 1;
        },
      );
      setAttSummary(att);

      // Dernières absences / retards / justifiés.
      const { data: absData } = await supabase
        .from("attendance")
        .select("date, status, note")
        .eq("student_id", studentInfo.id)
        .in("status", ["absent", "late", "excused"])
        .order("date", { ascending: false })
        .limit(10);

      setAbsences((absData || []) as AbsenceRow[]);

      // Solde financier restant (factures non soldées).
      const { data: invData } = await supabase
        .from("invoices")
        .select("id, title, amount_due, amount_paid, due_date")
        .eq("school_id", profile.school_id)
        .eq("student_id", studentInfo.id);

      const invs = (invData || []) as InvoiceRow[];
      setInvoices(invs);
      setRemainingDue(
        invs.reduce(
          (s, i) => s + Math.max(0, Number(i.amount_due) - Number(i.amount_paid)),
          0,
        ),
      );
    } catch {
      setError("Impossible de charger les données. Vérifiez votre connexion et réessayez.");
      setOffline(true);
    }
  }, [children, profile.school_id]);

  const loadData = useCallback(async () => {
    if (!profile.school_id) return;

    try {
      setError(null);
      setOffline(false);

      // Liaison identitaire : students.parent_user_id = auth.users(id) du parent.
      // (Historique : comparaison parent_email (TEXT) à user_id (UUID) → jamais match.)
      const { data: studentRows } = await supabase
        .from("students")
        .select("id, first_name, last_name, matricule, class_id, classes(name)")
        .eq("school_id", profile.school_id)
        .eq("parent_user_id", profile.user_id)
        .order("last_name")
        .order("first_name");

      const rows = (studentRows || []) as unknown as StudentInfo[];
      setChildren(rows);
      setSelectedIndex(0);

      if (rows.length === 0) return;
    } catch {
      setError("Impossible de charger les données. Vérifiez votre connexion et réessayez.");
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [profile.school_id, profile.user_id]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadData]);

  useEffect(() => {
    void Promise.resolve().then(() => loadStudent(selectedIndex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    if (children.length > 0) await loadStudent(selectedIndex);
    setRefreshing(false);
  };

  const retry = async () => {
    setLoading(true);
    setError(null);
    setOffline(false);
    await loadData();
    setLoading(false);
  };

  const selectChild = (index: number) => {
    setSelectedIndex(index);
  };

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Une erreur est survenue</Text>
        <Text style={styles.emptySubtitle}>{error}</Text>
        <TouchableOpacity onPress={retry} style={styles.retryBtn}>
          <Text style={styles.retryText}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigation.replace("Login");
  };

  const handleViewBulletin = () => {
    Alert.alert(
      "Bulletin scolaire",
      "Le telechargement du bulletin PDF est disponible depuis l'application web.\n\nConnectez-vous depuis un navigateur pour acceder aux bulletins.",
      [{ text: "OK" }],
    );
  };

  const getAvgColor = (avg: number) => {
    if (avg >= 14) return "#059669";
    if (avg >= 10) return "#D97706";
    return "#DC2626";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "absent":
        return { label: "Absent", bg: "#FEE2E2", color: "#DC2626" };
      case "late":
        return { label: "Retard", bg: "#FEF3C7", color: "#D97706" };
      case "excused":
        return { label: "Justifie", bg: "#E0E7FF", color: "#4F46E5" };
      default:
        return { label: status, bg: "#F1F5F9", color: "#64748B" };
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!student) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Aucun eleve trouve</Text>
        <Text style={styles.emptySubtitle}>
          Votre compte n&apos;est pas encore lie a un profil eleve.
        </Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtnAlt}>
          <Text style={styles.logoutBtnAltText}>Deconnexion</Text>
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
        <View style={styles.headerRow}>
          <View style={styles.studentAvatar}>
            <Text style={styles.avatarText}>
              {student.last_name.charAt(0)}
              {student.first_name.charAt(0)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Espace Parent / Eleve</Text>
            <Text style={styles.studentName}>
              {student.last_name} {student.first_name}
            </Text>
            <Text style={styles.studentMat}>
              {student.classes?.name || "Eleve"} {"\u00B7"} Mat. {student.matricule}
            </Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Deconnexion</Text>
          </TouchableOpacity>
        </View>

        {children.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.childRow}
          >
            {children.map((c, i) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => selectChild(i)}
                style={[
                  styles.childChip,
                  selectedIndex === i && styles.childChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.childChipText,
                    selectedIndex === i && styles.childChipTextActive,
                  ]}
                >
                  {c.first_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {offline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            Connexion instable : certaines donnees peuvent etre obsoletes.
          </Text>
        </View>
      )}

      <View style={styles.avgCard}>
        <Text style={styles.avgLabel}>Moyenne generale</Text>
        <Text style={[styles.avgValue, { color: getAvgColor(generalAvg) }]}>
          {generalAvg > 0 ? generalAvg.toFixed(2) : "\u2014"}{" "}
          <Text style={styles.avgUnit}>/ 20</Text>
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Assiduite (ce mois)</Text>
        <View style={styles.attStats}>
          <View style={[styles.statBox, { backgroundColor: "#ECFDF5" }]}>
            <Text style={[styles.statNum, { color: "#059669" }]}>
              {attSummary.present}
            </Text>
            <Text style={styles.statLabel}>Presences</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: "#FFFBEB" }]}>
            <Text style={[styles.statNum, { color: "#D97706" }]}>
              {attSummary.late}
            </Text>
            <Text style={styles.statLabel}>Retards</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: "#FEF2F2" }]}>
            <Text style={[styles.statNum, { color: "#DC2626" }]}>
              {attSummary.absent}
            </Text>
            <Text style={styles.statLabel}>Absences</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: "#E0E7FF" }]}>
            <Text style={[styles.statNum, { color: "#4F46E5" }]}>
              {attSummary.excused}
            </Text>
            <Text style={styles.statLabel}>Justifies</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notes recentes</Text>
        {grades.length === 0 ? (
          <Text style={styles.emptyText}>Aucune note enregistree.</Text>
        ) : (
          grades.map((g, i) => {
            const ev = g.evaluations;
            const subjectName = ev?.subjects?.name || "\u2014";
            return (
              <View key={i} style={styles.gradeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gradeSubject}>{subjectName}</Text>
                  <Text style={styles.gradeEval}>{ev?.title || "\u2014"}</Text>
                </View>
                <View style={styles.gradeScoreBox}>
                  <Text
                    style={[
                      styles.gradeScore,
                      { color: getAvgColor(g.score || 0) },
                    ]}
                  >
                    {g.score !== null ? g.score.toFixed(1) : "\u2014"}
                  </Text>
                  <Text style={styles.gradeUnit}>/ 20</Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Absences & Retards</Text>
        {absences.length === 0 ? (
          <Text style={styles.emptyText}>Aucune absence ou retard.</Text>
        ) : (
          absences.map((a, i) => {
            const badge = getStatusBadge(a.status);
            return (
              <View key={i} style={styles.absenceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.absenceDate}>{a.date}</Text>
                  {a.note ? (
                    <Text style={styles.absenceNote}>{a.note}</Text>
                  ) : null}
                </View>
                <View
                  style={[styles.badge, { backgroundColor: badge.bg }]}
                >
                  <Text style={[styles.badgeText, { color: badge.color }]}>
                    {badge.label}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Finances</Text>
        <View style={styles.financeCard}>
          <Text style={styles.financeLabel}>Solde restant</Text>
          <Text
            style={[
              styles.financeValue,
              { color: remainingDue > 0 ? "#D97706" : "#059669" },
            ]}
          >
            {remainingDue.toLocaleString("fr-FR")} XOF
          </Text>
          {invoices.filter((i) => Number(i.amount_due) - Number(i.amount_paid) > 0)
            .length === 0 ? (
            <Text style={styles.financeSub}>Aucune facture en attente.</Text>
          ) : (
            <Text style={styles.financeSub}>
              {invoices.filter((i) => Number(i.amount_due) - Number(i.amount_paid) > 0).length}{" "}
              facture(s) en attente de reglement.
            </Text>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.bulletinBtn}
          onPress={handleViewBulletin}
        >
          <Text style={styles.bulletinBtnText}>
            Consulter mon bulletin
          </Text>
          <Text style={styles.bulletinBtnSub}>
            Telecharger le bulletin PDF depuis l&apos;application web
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },

  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: "#2563EB",
  },
  headerRow: { flexDirection: "row", alignItems: "center" },
  studentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  greeting: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  studentName: { color: "#FFF", fontSize: 18, fontWeight: "800" },
  studentMat: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 1 },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
  },
  logoutText: { color: "#FFF", fontSize: 11, fontWeight: "600" },

  avgCard: {
    margin: 20,
    padding: 20,
    backgroundColor: "#FFF",
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  avgLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 4,
  },
  avgValue: { fontSize: 36, fontWeight: "800" },
  avgUnit: { fontSize: 14, fontWeight: "500", color: "#94A3B8" },

  childRow: { marginTop: 16 },
  childChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginRight: 8,
  },
  childChipActive: { backgroundColor: "#FFF" },
  childChipText: { fontSize: 13, fontWeight: "600", color: "#FFFFFF" },
  childChipTextActive: { color: "#2563EB" },

  offlineBanner: {
    backgroundColor: "#FEF3C7",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  offlineText: { fontSize: 11, color: "#92400E", textAlign: "center" },

  attStats: { flexDirection: "row", gap: 8 },
  statBox: { flex: 1, borderRadius: 12, padding: 12, alignItems: "center" },
  statNum: { fontSize: 20, fontWeight: "800" },
  statLabel: {
    fontSize: 9,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 2,
  },

  financeCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
  },
  financeLabel: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  financeValue: { fontSize: 24, fontWeight: "800", marginTop: 4 },
  financeSub: { fontSize: 11, color: "#94A3B8", marginTop: 4 },

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
    paddingVertical: 16,
  },

  gradeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
  },
  gradeSubject: { fontSize: 14, fontWeight: "600", color: "#1E293B" },
  gradeEval: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  gradeScoreBox: { alignItems: "center" },
  gradeScore: { fontSize: 20, fontWeight: "800" },
  gradeUnit: { fontSize: 10, color: "#94A3B8" },

  absenceRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
  },
  absenceDate: { fontSize: 13, fontWeight: "600", color: "#1E293B" },
  absenceNote: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: "700" },

  bulletinBtn: {
    backgroundColor: "#EEF2FF",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#C7D2FE",
    borderStyle: "dashed",
  },
  bulletinBtnText: { fontSize: 15, fontWeight: "700", color: "#4F46E5" },
  bulletinBtnSub: { fontSize: 11, color: "#6366F1", marginTop: 4 },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
    marginBottom: 20,
  },
  logoutBtnAlt: {
    backgroundColor: "#EF4444",
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  logoutBtnAltText: { color: "#FFF", fontWeight: "600" },
  retryBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  retryText: { color: "#FFF", fontWeight: "600" },
});
