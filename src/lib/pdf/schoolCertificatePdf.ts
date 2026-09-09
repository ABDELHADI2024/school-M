import jsPDF from 'jspdf';

export interface CertificateData {
  studentLastName: string;
  studentFirstName: string;
  matricule: string;
  birthDate: string | null;
  className: string;
  academicYear: string;
  schoolName: string;
  schoolAddress: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
  primaryColor: string;
  issuedDate: string;
}

export function generateSchoolCertificatePdf(school: CertificateData): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 18;
  const contentW = pageW - 2 * margin;

  const primaryRGB = hexToRgb(school.primaryColor || '#4F46E5');
  const r = primaryRGB?.r ?? 79;
  const g = primaryRGB?.g ?? 70;
  const b = primaryRGB?.b ?? 229;

  // ── Bordure décorative ──
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(1.5);
  doc.rect(margin - 4, margin - 4, contentW + 8, 291 - 2 * (margin - 4), 'S');
  doc.setLineWidth(0.4);
  doc.rect(margin - 2, margin - 2, contentW + 4, 291 - 2 * (margin - 2), 'S');

  let y = margin + 12;

  // ── En-tête ──
  doc.setTextColor(r, g, b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(school.schoolName.toUpperCase(), pageW / 2, y, { align: 'center' });
  y += 6;

  const contactParts = [school.schoolAddress, school.schoolPhone, school.schoolEmail].filter(Boolean);
  if (contactParts.length > 0) {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(contactParts.join(' · '), pageW / 2, y, { align: 'center' });
    y += 8;
  }

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageW - margin, y);
  y += 12;

  // ── Titre ──
  doc.setTextColor(r, g, b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('ATTESTATION DE SCOLARITÉ', pageW / 2, y, { align: 'center' });
  y += 14;

  // ── Corps ──
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);

  const intro = `Je soussigné(e), représentant de ${school.schoolName}, certifie que l'élève :`;
  const introLines = doc.splitTextToSize(intro, contentW);
  doc.text(introLines, margin, y, { align: 'left' });
  y += introLines.length * 6 + 6;

  // Encadré élève
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(margin, y, contentW, 20, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentW, 20, 2, 2, 'S');

  const infoY = y + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Nom et prénom :', margin + 4, infoY);
  doc.setFont('helvetica', 'normal');
  doc.text(`${school.studentLastName.toUpperCase()} ${school.studentFirstName}`, margin + 40, infoY);

  doc.setFont('helvetica', 'bold');
  doc.text('Matricule :', margin + 4, infoY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(school.matricule || '—', margin + 28, infoY + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Date de naissance :', margin + 100, infoY);
  doc.setFont('helvetica', 'normal');
  doc.text(school.birthDate ? new Date(school.birthDate).toLocaleDateString('fr-FR') : '—', margin + 128, infoY);

  doc.setFont('helvetica', 'bold');
  doc.text('Classe :', margin + 100, infoY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(school.className || '—', margin + 116, infoY + 6);

  y += 26;

  const body = `est régulièrement inscrit(e) auprès de notre établissement pour l'année scolaire ${school.academicYear} et y poursuit sa scolarité en ${school.className || 'classe non précisée'}.`;
  const bodyLines = doc.splitTextToSize(body, contentW);
  doc.setFontSize(11);
  doc.text(bodyLines, margin, y);
  y += bodyLines.length * 6 + 6;

  const purpose = `La présente attestation est établie pour servir et valoir ce que de droit, notamment pour toutes démarches administratives (bourses, transport, activités parascolaires).`;
  const purposeLines = doc.splitTextToSize(purpose, contentW);
  doc.text(purposeLines, margin, y);
  y += purposeLines.length * 6 + 16;

  // ── Signature ──
  const sigW = 60;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.roundedRect(pageW - margin - sigW, y, sigW, 30, 2, 2, 'S');
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Le Directeur', pageW - margin - sigW / 2, y + 6, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(school.schoolName, pageW - margin - sigW / 2, y + 11, { align: 'center' });
  doc.setTextColor(100, 116, 139);
  doc.text(`Fait le ${school.issuedDate}`, pageW - margin - sigW / 2, y + 17, { align: 'center' });
  doc.text('Signature et cachet', pageW - margin - sigW / 2, y + 26, { align: 'center' });

  // ── Pied de page ──
  doc.setFillColor(r, g, b);
  doc.rect(0, 285, pageW, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(
    `${school.schoolName} · ${school.academicYear} · Certification de scolarité`,
    pageW / 2,
    292,
    { align: 'center' }
  );

  return doc;
}

export function downloadSchoolCertificate(data: CertificateData) {
  const doc = generateSchoolCertificatePdf(data);
  const filename = `certificat_scolarite_${data.studentLastName}_${data.studentFirstName}.pdf`;
  doc.save(filename);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
}
