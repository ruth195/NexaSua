import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export interface ReportCardPdfData {
  schoolName: string;
  schoolAddress: string;
  schoolPhone: string;
  schoolEmail: string;
  schoolMotto?: string;
  schoolLogoDataUrl?: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  educationalLevel: string;
  academicYear: string;
  termName: string;
  referenceNumber: string;
  verificationUrl: string;
  issueDate: string;
  reopeningDate: string;
  overallAverage: number;
  classPosition: number | null;
  totalStudentsInClass: number;
  showClassPosition: boolean;
  showAttendanceSummary: boolean;
  showQrVerification: boolean;
  attendanceSummary: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    totalDays: number;
  };
  subjects: Array<{
    subjectName: string;
    caScore: number | null;
    examScore: number | null;
    finalScore: number | null;
    grade: string;
    remark: string;
  }>;
  classTeacherRemarks: string;
  headteacherRemarks: string;
  headteacherName: string;
  promotionStatus: string;
  footerNote?: string;
}

function dataUrlToBuffer(dataUrl?: string): Buffer | null {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  try {
    return Buffer.from(dataUrl.slice(commaIdx + 1), 'base64');
  } catch {
    return null;
  }
}

function getNexaSuaLogoBuffer(): Buffer | null {
  const logoPath = path.resolve(
    process.cwd(),
    'public/assets/aistudio/NexaSua_Education_Emblem_9038771b.png'
  );
  if (fs.existsSync(logoPath)) {
    return fs.readFileSync(logoPath);
  }
  return null;
}

async function renderReportPage(doc: PDFKit.PDFDocument, item: ReportCardPdfData) {
  const pageWidth = doc.page.width;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const navy = '#102846';
  const teal = '#148D82';
  const slate = '#475569';
  const border = '#CBD5E1';

  // Header box (print-safe light border, clear in both colour & B&W)
  doc.rect(margin, 36, contentWidth, 82).lineWidth(1).strokeColor(navy).stroke();

  const schoolLogoBuf = dataUrlToBuffer(item.schoolLogoDataUrl);
  if (schoolLogoBuf) {
    try {
      doc.image(schoolLogoBuf, margin + 12, 46, { fit: [60, 60] });
    } catch {
      // Ignore malformed image
    }
  }

  const textStartX = schoolLogoBuf ? margin + 84 : margin + 16;
  const textWidth = schoolLogoBuf ? contentWidth - 100 : contentWidth - 32;

  doc
    .fillColor(navy)
    .font('Helvetica-Bold')
    .fontSize(15)
    .text(item.schoolName.toUpperCase(), textStartX, 46, { width: textWidth, align: 'center' });

  doc
    .fillColor(slate)
    .font('Helvetica')
    .fontSize(8.5)
    .text(`${item.schoolAddress} | Tel: ${item.schoolPhone} | Email: ${item.schoolEmail}`, textStartX, 66, {
      width: textWidth,
      align: 'center',
    });

  if (item.schoolMotto) {
    doc
      .fillColor(teal)
      .font('Helvetica-Oblique')
      .fontSize(8.5)
      .text(`"${item.schoolMotto}"`, textStartX, 80, { width: textWidth, align: 'center' });
  }

  doc
    .fillColor(navy)
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .text(
      `TERMINAL ACADEMIC REPORT CARD (${item.educationalLevel.toUpperCase()})`,
      textStartX,
      97,
      { width: textWidth, align: 'center' }
    );

  // Student Details Grid
  let y = 130;
  doc.rect(margin, y, contentWidth, 64).lineWidth(0.75).strokeColor(border).stroke();
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(navy);

  const col1 = margin + 12;
  const col2 = margin + contentWidth * 0.52;

  doc.text('Student Name:', col1, y + 10);
  doc.font('Helvetica').text(item.studentName, col1 + 85, y + 10);

  doc.font('Helvetica-Bold').text('Admission No:', col1, y + 27);
  doc.font('Helvetica').text(item.admissionNumber, col1 + 85, y + 27);

  doc.font('Helvetica-Bold').text('Class:', col1, y + 44);
  doc.font('Helvetica').text(item.className, col1 + 85, y + 44);

  doc.font('Helvetica-Bold').text('Academic Year:', col2, y + 10);
  doc.font('Helvetica').text(item.academicYear, col2 + 85, y + 10);

  doc.font('Helvetica-Bold').text('Term:', col2, y + 27);
  doc.font('Helvetica').text(item.termName, col2 + 85, y + 27);

  doc.font('Helvetica-Bold').text('Report Ref:', col2, y + 44);
  doc.font('Helvetica').text(item.referenceNumber, col2 + 85, y + 44);

  // Subjects Table
  y += 78;
  const colWidths = [185, 58, 58, 62, 48, contentWidth - 411];
  const headers = ['Subject', 'CA', 'Exam', 'Total (%)', 'Grade', 'Remark'];

  doc.rect(margin, y, contentWidth, 24).fillColor(navy).fill();
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);

  let cx = margin;
  headers.forEach((h, idx) => {
    doc.text(h, cx + 6, y + 8, {
      width: colWidths[idx] - 12,
      align: idx === 0 || idx === 5 ? 'left' : 'right',
    });
    cx += colWidths[idx];
  });

  y += 24;
  item.subjects.forEach((subj, rowIndex) => {
    if (y > 680) return;
    if (rowIndex % 2 === 1) {
      doc.rect(margin, y, contentWidth, 21).fillColor('#F8FAFC').fill();
    }
    doc.rect(margin, y, contentWidth, 21).lineWidth(0.5).strokeColor(border).stroke();

    const vals = [
      subj.subjectName,
      subj.caScore !== null ? subj.caScore.toFixed(1) : '-',
      subj.examScore !== null ? subj.examScore.toFixed(1) : '-',
      subj.finalScore !== null ? subj.finalScore.toFixed(1) : 'INC',
      subj.grade || '-',
      subj.remark || '-',
    ];

    doc.fillColor('#0F172A').font('Helvetica').fontSize(8.5);
    let rx = margin;
    vals.forEach((v, idx) => {
      if (idx === 4) doc.font('Helvetica-Bold');
      else doc.font('Helvetica');
      doc.text(v, rx + 6, y + 6, {
        width: colWidths[idx] - 12,
        align: idx === 0 || idx === 5 ? 'left' : 'right',
        ellipsis: true,
      });
      rx += colWidths[idx];
    });
    y += 21;
  });

  // Summary strip
  y += 12;
  doc.rect(margin, y, contentWidth, 34).lineWidth(0.75).strokeColor(navy).stroke();
  doc.fillColor(navy).font('Helvetica-Bold').fontSize(9);
  doc.text(`Overall Average: ${item.overallAverage.toFixed(1)}%`, margin + 12, y + 11);

  if (item.showClassPosition && item.classPosition !== null) {
    doc.text(
      `Class Position: ${item.classPosition} of ${item.totalStudentsInClass}`,
      margin + 180,
      y + 11
    );
  }
  doc.text(`Promotion Status: ${item.promotionStatus || 'Pending Review'}`, margin + 335, y + 11);

  if (item.showAttendanceSummary) {
    y += 42;
    doc.rect(margin, y, contentWidth, 28).lineWidth(0.5).strokeColor(border).stroke();
    doc.fillColor(slate).font('Helvetica-Bold').fontSize(8.5);
    doc.text(
      `Attendance Summary — Total Days: ${item.attendanceSummary.totalDays}   |   Present: ${item.attendanceSummary.present}   |   Absent: ${item.attendanceSummary.absent}   |   Late: ${item.attendanceSummary.late}   |   Excused: ${item.attendanceSummary.excused}`,
      margin + 12,
      y + 9
    );
  }

  // Remarks & Reopening
  y += 38;
  doc.rect(margin, y, contentWidth, 72).lineWidth(0.5).strokeColor(border).stroke();
  doc.fillColor(navy).font('Helvetica-Bold').fontSize(8.5).text('Class Teacher Remarks:', margin + 12, y + 10);
  doc
    .fillColor('#0F172A')
    .font('Helvetica')
    .fontSize(8.5)
    .text(item.classTeacherRemarks || 'Satisfactory conduct and academic effort.', margin + 130, y + 10, {
      width: contentWidth - 144,
    });

  doc.fillColor(navy).font('Helvetica-Bold').fontSize(8.5).text('Headteacher Remarks:', margin + 12, y + 34);
  doc
    .fillColor('#0F172A')
    .font('Helvetica')
    .fontSize(8.5)
    .text(item.headteacherRemarks || 'Approved for academic record.', margin + 130, y + 34, {
      width: contentWidth - 144,
    });

  doc.fillColor(navy).font('Helvetica-Bold').fontSize(8.5).text('Next Term Reopens:', margin + 12, y + 54);
  doc
    .fillColor('#0F172A')
    .font('Helvetica')
    .text(item.reopeningDate || 'To be announced', margin + 130, y + 54);

  // Signatures & QR Verification
  y += 88;
  const sigY = y;
  doc.moveTo(margin + 12, sigY + 26).lineTo(margin + 175, sigY + 26).strokeColor(slate).stroke();
  doc.fillColor(slate).font('Helvetica').fontSize(8).text('Class Teacher Signature', margin + 12, sigY + 30);

  doc.moveTo(margin + 210, sigY + 26).lineTo(margin + 380, sigY + 26).strokeColor(slate).stroke();
  doc
    .fillColor(slate)
    .font('Helvetica')
    .fontSize(8)
    .text(
      item.headteacherName ? `Headteacher (${item.headteacherName})` : 'Headteacher Signature',
      margin + 210,
      sigY + 30
    );

  if (item.showQrVerification && item.verificationUrl) {
    try {
      const qrDataUrl = await QRCode.toDataURL(item.verificationUrl, { margin: 1, width: 120 });
      const qrBuf = dataUrlToBuffer(qrDataUrl);
      if (qrBuf) {
        doc.image(qrBuf, margin + contentWidth - 68, sigY - 6, { width: 58, height: 58 });
        doc
          .fillColor(slate)
          .fontSize(6.5)
          .text('Scan to verify', margin + contentWidth - 72, sigY + 53, {
            width: 66,
            align: 'center',
          });
      }
    } catch {
      // Ignore QR error
    }
  }

  // Footer with official NexaSua emblem
  const footerY = doc.page.height - 46;
  doc.moveTo(margin, footerY - 6).lineTo(margin + contentWidth, footerY - 6).lineWidth(0.5).strokeColor(border).stroke();
  const nexaLogo = getNexaSuaLogoBuffer();
  if (nexaLogo) {
    try {
      doc.image(nexaLogo, margin, footerY - 2, { fit: [26, 26] });
    } catch {
      // ignore
    }
  }
  doc
    .fillColor(slate)
    .font('Helvetica')
    .fontSize(7.5)
    .text(
      `${item.footerNote || 'Official Terminal Report.'} | Issued: ${item.issueDate} | Powered by NexaSua (NexaFlow Technologies)`,
      margin + 34,
      footerY + 4,
      { width: contentWidth - 34 }
    );
}

export async function generateReportCardPdfBuffer(
  items: ReportCardPdfData[]
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    for (let i = 0; i < items.length; i++) {
      if (i > 0) doc.addPage();
      await renderReportPage(doc, items[i]);
    }

    doc.end();
  });
}

export async function generateReceiptPdfBuffer(data: {
  schoolName: string;
  schoolAddress: string;
  schoolPhone: string;
  receiptNumber: string;
  paymentReference: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  invoiceNumber: string;
  amountPaidGhs: number;
  balanceRemainingGhs: number;
  channel: string;
  paidAt: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const navy = '#102846';
    const teal = '#148D82';

    doc.fillColor(navy).font('Helvetica-Bold').fontSize(18).text(data.schoolName);
    doc
      .fillColor('#475569')
      .font('Helvetica')
      .fontSize(9.5)
      .text(`${data.schoolAddress} | Tel: ${data.schoolPhone}`);
    doc.moveDown(1.2);

    doc.fillColor(teal).font('Helvetica-Bold').fontSize(14).text('OFFICIAL SCHOOL FEE RECEIPT');
    doc.moveDown(0.5);

    doc.rect(48, doc.y, 499, 195).lineWidth(1).strokeColor('#CBD5E1').stroke();
    const startY = doc.y + 14;
    const rows: Array<[string, string]> = [
      ['Receipt Number', data.receiptNumber],
      ['Payment Reference', data.paymentReference],
      ['Date Paid', data.paidAt],
      ['Student Name', data.studentName],
      ['Admission Number', data.admissionNumber],
      ['Class', data.className],
      ['Invoice Number', data.invoiceNumber],
      ['Payment Channel', data.channel],
      ['Amount Paid', `GH₵ ${data.amountPaidGhs.toFixed(2)}`],
      ['Remaining Balance', `GH₵ ${data.balanceRemainingGhs.toFixed(2)}`],
    ];

    rows.forEach(([label, val], idx) => {
      const ry = startY + idx * 17;
      doc.fillColor(navy).font('Helvetica-Bold').fontSize(9.5).text(label, 64, ry);
      doc.fillColor('#0F172A').font('Helvetica').fontSize(9.5).text(val, 220, ry);
    });

    const nexaLogo = getNexaSuaLogoBuffer();
    if (nexaLogo) {
      try {
        doc.image(nexaLogo, 48, 740, { fit: [24, 24] });
      } catch {
        // ignore
      }
    }
    doc
      .fillColor('#64748B')
      .font('Helvetica')
      .fontSize(8)
      .text(
        'Verified financial record · Issued via NexaSua School Finance (NexaFlow Technologies)',
        80,
        748
      );

    doc.end();
  });
}

export async function generateFinancialSummaryPdfBuffer(data: {
  schoolName: string;
  generatedAt: string;
  totalBilledGhs: number;
  totalCollectedGhs: number;
  outstandingGhs: number;
  collectionRatePercent: number;
  invoices: Array<{
    invoiceNumber: string;
    studentName: string;
    totalGhs: number;
    paidGhs: number;
    balanceGhs: number;
    status: string;
  }>;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor('#102846').font('Helvetica-Bold').fontSize(16).text(data.schoolName);
    doc
      .fillColor('#148D82')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('SCHOOL FINANCIAL SUMMARY REPORT');
    doc.fillColor('#64748B').font('Helvetica').fontSize(8.5).text(`Generated: ${data.generatedAt}`);
    doc.moveDown(1);

    doc.fillColor('#102846').font('Helvetica-Bold').fontSize(10);
    doc.text(`Total Billed: GH₵ ${data.totalBilledGhs.toFixed(2)}`);
    doc.text(`Total Collected: GH₵ ${data.totalCollectedGhs.toFixed(2)}`);
    doc.text(`Outstanding Balance: GH₵ ${data.outstandingGhs.toFixed(2)}`);
    doc.text(`Collection Rate: ${data.collectionRatePercent.toFixed(1)}%`);
    doc.moveDown(1);

    let y = doc.y;
    doc.rect(42, y, 511, 22).fillColor('#102846').fill();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);
    doc.text('Invoice #', 48, y + 7);
    doc.text('Student', 140, y + 7);
    doc.text('Billed (GH₵)', 300, y + 7, { width: 65, align: 'right' });
    doc.text('Paid (GH₵)', 372, y + 7, { width: 65, align: 'right' });
    doc.text('Balance (GH₵)', 442, y + 7, { width: 65, align: 'right' });
    doc.text('Status', 512, y + 7);
    y += 22;

    data.invoices.slice(0, 30).forEach((inv) => {
      doc.rect(42, y, 511, 20).lineWidth(0.4).strokeColor('#CBD5E1').stroke();
      doc.fillColor('#0F172A').font('Helvetica').fontSize(8);
      doc.text(inv.invoiceNumber, 48, y + 6);
      doc.text(inv.studentName, 140, y + 6, { width: 155, ellipsis: true });
      doc.text(inv.totalGhs.toFixed(2), 300, y + 6, { width: 65, align: 'right' });
      doc.text(inv.paidGhs.toFixed(2), 372, y + 6, { width: 65, align: 'right' });
      doc.text(inv.balanceGhs.toFixed(2), 442, y + 6, { width: 65, align: 'right' });
      doc.text(inv.status, 512, y + 6);
      y += 20;
    });

    doc.end();
  });
}
