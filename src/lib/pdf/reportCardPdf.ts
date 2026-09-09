import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ReportCardSubject {
  subject: string;
  teacher: string;
  studentAvg: number | null;
  classMin: number | null;
  classMax: number | null;
  classAvg: number | null;
  coefficient: number;
  comment: string;
}

export interface ReportCardData {
  studentFirstName: string;
  studentLastName: string;
  matricule: string;
  className: string;
  classSize: number;
  rank: number;
  trimester: string;
  generalAverage: number;
  totalWeightedPoints: number;
  totalCoefficients: number;
  subjects: ReportCardSubject[];
  decision: string;
  directorAppreciation: string;
}

export interface SchoolInfo {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  primaryColor: string;
  year: string;
}

function valOrDash(v: number | null, decimals = 2): string {
  return v !== null && !isNaN(v) ? v.toFixed(decimals) : '—';
}

function getAppreciation(avg: number | null): string {
  if (avg === null || isNaN(avg)) return '';
  if (avg >= 16) return 'Très bien';
  if (avg >= 14) return 'Bien';
  if (avg >= 12) return 'Assez bien';
  if (avg >= 10) return 'Passable';
  return 'Insuffisant';
}

export function getDecision(generalAverage: number): string {
  if (generalAverage >= 16) return 'Félicitations du Conseil';
  if (generalAverage >= 14) return 'Encouragements';
  if (generalAverage >= 12) return 'Mention Bien';
  if (generalAverage >= 10) return 'Admis(e)';
  return 'Ajourné(e)';
}

export function generateReportCardPdf(school: SchoolInfo, data: ReportCardData): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 15;
  const contentW = pageW - 2 * margin;
  let y = margin;

  const primaryRGB = hexToRgb(school.primaryColor || '#2563EB');
  const r = primaryRGB?.r ?? 37;
  const g = primaryRGB?.g ?? 99;
  const b = primaryRGB?.b ?? 235;

  // ── HEADER ──
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, pageW, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(school.name.toUpperCase(), pageW / 2, 12, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Année scolaire ${school.year}`, pageW / 2, 19, { align: 'center' });

  const contactParts = [school.address, school.phone, school.email].filter(Boolean);
  if (contactParts.length > 0) {
    doc.setFontSize(7);
    doc.text(contactParts.join(' · '), pageW / 2, 25, { align: 'center' });
  }

  y = 38;

  // ── BULLETIN TITLE ──
  doc.setTextColor(r, g, b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`BULLETIN SCOLAIRE — ${data.trimester}`, pageW / 2, y, { align: 'center' });
  y += 10;

  // ── STUDENT INFO BOX ──
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(margin, y, contentW, 22, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentW, 22, 2, 2, 'S');

  const infoY = y + 6;
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Nom :', margin + 4, infoY);
  doc.setFont('helvetica', 'normal');
  doc.text(`${data.studentLastName.toUpperCase()} ${data.studentFirstName}`, margin + 20, infoY);

  doc.setFont('helvetica', 'bold');
  doc.text('Matricule :', margin + 4, infoY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(data.matricule || '—', margin + 28, infoY + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Classe :', margin + 80, infoY);
  doc.setFont('helvetica', 'normal');
  doc.text(data.className, margin + 98, infoY);

  doc.setFont('helvetica', 'bold');
  doc.text('Effectif :', margin + 80, infoY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(String(data.classSize), margin + 100, infoY + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Rang :', margin + 140, infoY);
  doc.setFont('helvetica', 'normal');
  doc.text(`${data.rank}ᵉ / ${data.classSize}`, margin + 155, infoY);

  y += 28;

  // ── GRADES TABLE ──
  const head = [['Matière', 'Enseignant', 'Moy. Élève', 'Min', 'Max', 'Moy. Classe', 'Coeff.', 'Total Pond.', 'Appréciation']];

  const body = data.subjects.map((s) => [
    s.subject,
    s.teacher,
    valOrDash(s.studentAvg),
    valOrDash(s.classMin),
    valOrDash(s.classMax),
    valOrDash(s.classAvg),
    String(s.coefficient),
    s.studentAvg !== null ? (s.studentAvg * s.coefficient).toFixed(1) : '—',
    s.comment || getAppreciation(s.studentAvg),
  ]);

  // Totals row
  const totalWeighted = data.subjects
    .filter((s) => s.studentAvg !== null)
    .reduce((sum, s) => sum + (s.studentAvg! * s.coefficient), 0);
  const totalCoeff = data.subjects.reduce((sum, s) => sum + s.coefficient, 0);
  body.push([
    'TOTAL',
    '',
    '',
    '',
    '',
    '',
    String(totalCoeff),
    totalWeighted.toFixed(1),
    '',
  ]);

  autoTable(doc, {
    startY: y,
    head,
    body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: [r, g, b],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold' },
      1: { cellWidth: 24 },
      2: { halign: 'center', cellWidth: 18, fontStyle: 'bold' },
      3: { halign: 'center', cellWidth: 14 },
      4: { halign: 'center', cellWidth: 14 },
      5: { halign: 'center', cellWidth: 18 },
      6: { halign: 'center', cellWidth: 12 },
      7: { halign: 'center', cellWidth: 16, fontStyle: 'bold' },
      8: { cellWidth: 40, fontSize: 7 },
    },
    margin: { left: margin, right: margin },
    didParseCell: (hookData) => {
      // Style the TOTAL row
      if (hookData.row.index === data.subjects.length) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [r, g, b];
        hookData.cell.styles.textColor = [255, 255, 255];
      }
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── GENERAL AVERAGE BOX ──
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(margin, y, contentW, 16, 2, 2, 'F');
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, y, contentW, 16, 2, 2, 'S');

  const avgY = y + 10;
  doc.setTextColor(r, g, b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('MOYENNE GÉNÉRALE :', margin + 4, avgY);

  doc.setFontSize(14);
  doc.text(`${data.generalAverage.toFixed(2)} / 20`, margin + 56, avgY);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Rang : ${data.rank}ᵉ / ${data.classSize}`, margin + 110, avgY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Total pondéré : ${data.totalWeightedPoints.toFixed(1)} / ${data.totalCoefficients * 20}`, margin + 150, avgY);

  y += 22;

  // ── DECISION & APPRECIATION ──
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Décision du conseil de classe :', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const decisionLines = doc.splitTextToSize(data.decision || '—', contentW);
  doc.text(decisionLines, margin, y);
  y += decisionLines.length * 4 + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Appréciation de la direction :', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const apprecLines = doc.splitTextToSize(data.directorAppreciation || '—', contentW);
  doc.text(apprecLines, margin, y);
  y += apprecLines.length * 4 + 8;

  // ── SIGNATURE FRAME ──
  const sigW = 55;
  const sigY = Math.max(y, 250);

  // Le Directeur
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(pageW - margin - sigW, sigY, sigW, 28, 2, 2, 'S');
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Le Directeur', pageW - margin - sigW / 2, sigY + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(school.name, pageW - margin - sigW / 2, sigY + 10, { align: 'center' });
  doc.text('Signature et cachet', pageW - margin - sigW / 2, sigY + 22, { align: 'center' });

  // Le Parent
  doc.roundedRect(margin, sigY, sigW, 28, 2, 2, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Le Parent / Tuteur', margin + sigW / 2, sigY + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Signature', margin + sigW / 2, sigY + 22, { align: 'center' });

  // ── FOOTER ──
  doc.setFillColor(r, g, b);
  doc.rect(0, 287, pageW, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(
    `${school.name} · ${school.year} · Document généré le ${new Date().toLocaleDateString('fr-FR')}`,
    pageW / 2,
    293,
    { align: 'center' }
  );

  return doc;
}

export function downloadReportCard(school: SchoolInfo, data: ReportCardData) {
  const doc = generateReportCardPdf(school, data);
  const filename = `bulletin_${data.studentLastName}_${data.studentFirstName}_${data.trimester.replace(/\s+/g, '_')}.pdf`;
  doc.save(filename);
}

export function generateAllReportCardsPdf(school: SchoolInfo, cards: ReportCardData[]) {
  if (cards.length === 0) return null;
  const doc = generateReportCardPdf(school, cards[0]);
  for (let i = 1; i < cards.length; i++) {
    doc.addPage();
    // Draw each subsequent card on its own page by re-generating into a temp doc
    // and copying the raw page stream
    const tempDoc = generateReportCardPdf(school, cards[i]);
    // Use jsPDF's internal page array to overlay content
    const tempInternal = (tempDoc as unknown as { internal: { pages: Array<Record<string, unknown>> } }).internal;
    const docInternal = (doc as unknown as { internal: { pages: Array<Record<string, unknown>> } }).internal;
    const tempPage = tempInternal.pages[1]; // page index 1 (0 is root template)
    if (tempPage) {
      docInternal.pages[docInternal.pages.length - 1] = tempPage;
    }
  }
  return doc;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
}
