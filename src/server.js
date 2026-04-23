import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import {
  addAuditLog,
  createInsuranceSubmission,
  createReport,
  deleteReport,
  findUserByEmail,
  getHospitalByUserId,
  getHospitalById,
  getPatientByAbha,
  getPatientById,
  getPatientByUserId,
  getReportById,
  getReportsForPatient,
  isSupabaseEnabled,
  listInsuranceProviders,
  listHospitalPatients,
  listInsuranceRecords,
  registerUser,
  shareReport
} from "./data/dataStore.js";
import { authenticate } from "./middleware/authenticate.js";
import { authorizeRole } from "./middleware/authorizeRole.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { validateRequiredFields } from "./middleware/validateRequest.js";
import { summarizeReport } from "./services/aiService.js";
import { comparePassword, hashPassword, signToken } from "./services/authService.js";
import { updatePatientProfile, updateReportSummary } from "./data/dataStore.js";

const app = express();

function escapePdfText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, " ");
}

function wrapPdfText(text, maxLength = 80) {
  if (!text) {
    return [];
  }

  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > maxLength && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      continue;
    }

    currentLine = nextLine;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function formatPdfDate(value) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function buildReportPdf({ hospital, patient, report }) {
  const hospitalName = hospital?.name || "Medsync Care Network";
  const hospitalLocation = hospital?.location || "Digital Health Record System";
  const reportDate = formatPdfDate(report.createdAt);
  const findingsLines = wrapPdfText(report.findings || "No findings were added to this report yet.", 78);
  const content = [];

  const addText = (x, y, text, options = {}) => {
    const { color = "0 0 0", font = "F1", size = 12 } = options;
    content.push(`BT
/${font} ${size} Tf
${color} rg
1 0 0 1 ${x} ${y} Tm
(${escapePdfText(text)}) Tj
ET`);
  };

  const addCenteredText = (y, text, options = {}) => {
    const size = options.size || 12;
    const approximateWidth = text.length * size * 0.28;
    addText((595 - approximateWidth) / 2, y, text, options);
  };

  const addLine = (x1, y1, x2, y2, color = "0.72 0.72 0.72", width = 1) => {
    content.push(`${width} w
${color} RG
${x1} ${y1} m
${x2} ${y2} l
S`);
  };

  const addBox = (x, y, width, height, strokeColor = "0.89 0.92 0.90") => {
    content.push(`0.8 w
${strokeColor} RG
${x} ${y} ${width} ${height} re
S`);
  };

  const addLabelValue = (x, y, label, value, valueWidth = 170) => {
    addText(x, y, label, { color: "0.23 0.23 0.23", font: "F2", size: 11 });
    const wrappedValues = wrapPdfText(value || "Not available", Math.max(18, Math.floor(valueWidth / 6)));

    wrappedValues.forEach((line, index) => {
      addText(x + 92, y - index * 14, line, { color: "0.15 0.15 0.15", size: 11 });
    });
  };

  addLine(90, 810, 220, 810);
  addLine(375, 810, 505, 810);
  addCenteredText(805, "Medsync", { color: "0.60 0.60 0.60", font: "F2", size: 10 });
  addCenteredText(782, hospitalName, { color: "0.24 0.61 0.44", font: "F2", size: 22 });
  addCenteredText(764, hospitalLocation, { color: "0.35 0.35 0.35", size: 10 });
  addCenteredText(708, "MEDICAL REPORT", { color: "0.07 0.07 0.07", font: "F2", size: 24 });

  addBox(55, 560, 485, 118);
  addText(70, 652, "Visit Info", { color: "0.24 0.61 0.44", font: "F2", size: 15 });
  addLabelValue(70, 626, "Doctor's Name:", report.doctorName);
  addLabelValue(315, 626, "Visit Date:", reportDate, 130);
  addLabelValue(70, 598, "Report Type:", report.type);
  addLabelValue(315, 598, "File Name:", report.fileName, 130);

  addBox(55, 410, 485, 126);
  addText(70, 510, "Patient Info", { color: "0.24 0.61 0.44", font: "F2", size: 15 });
  addLabelValue(70, 484, "Full Name:", patient?.name);
  addLabelValue(315, 484, "ABHA No.:", patient?.abhaNumber, 130);
  addLabelValue(70, 456, "Age:", patient?.age ? String(patient.age) : "");
  addLabelValue(315, 456, "Sex:", patient?.sex, 130);
  addLabelValue(70, 428, "Blood Group:", patient?.bloodGroup);
  addLabelValue(315, 428, "Phone:", patient?.phone, 130);

  addBox(55, 90, 485, 292);
  addText(70, 356, "Assessment", { color: "0.24 0.61 0.44", font: "F2", size: 15 });

  findingsLines.forEach((line, index) => {
    addText(72, 332 - index * 18, line, { color: "0.15 0.15 0.15", size: 11 });
  });

  const contentStream = content.join("\n");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj",
    `4 0 obj\n<< /Length ${Buffer.byteLength(contentStream, "utf8")} >>\nstream\n${contentStream}\nendstream\nendobj`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj",
    "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj"
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref
0 ${objects.length + 1}
0000000000 65535 f 
`;

  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n 
`;
  }

  pdf += `trailer
<< /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${xrefOffset}
%%EOF`;

  return Buffer.from(pdf, "utf8");
}

function getDownloadFileName(fileName) {
  const normalizedFileName = fileName?.toLowerCase().endsWith(".pdf") ? fileName : `${fileName || "report"}.pdf`;
  return normalizedFileName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

app.use(requestLogger);
app.use(rateLimit);
app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(express.json());
app.use(authenticate);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "medsync-api",
    supabaseConfigured: isSupabaseEnabled()
  });
});

app.post("/api/auth/register", validateRequiredFields(["email", "password", "name", "role"]), async (req, res) => {
  const { email, name, password, role } = req.body;

  if (await findUserByEmail(email)) {
    return res.status(409).json({
      error: "A user with this email already exists."
    });
  }

  const passwordHash = await hashPassword(password);
  const user = await registerUser({ email, name, passwordHash, role });
  const token = signToken(user);

  await addAuditLog("register", user.email, `New ${user.role} account created.`);

  res.status(201).json({
    token,
    user: {
      email: user.email,
      id: user.id,
      name: user.name,
      role: user.role
    }
  });
});

app.post("/api/auth/login", validateRequiredFields(["email", "password"]), async (req, res) => {
  const { email, password } = req.body;
  const user = await findUserByEmail(email);

  if (!user) {
    return res.status(401).json({
      error: "Invalid email or password."
    });
  }

  const isMatch = await comparePassword(password, user.passwordHash);

  if (!isMatch) {
    return res.status(401).json({
      error: "Invalid email or password."
    });
  }

  const token = signToken(user);
  await addAuditLog("login", user.email, `${user.role} signed in.`);

  res.json({
    token,
    user: {
      email: user.email,
      id: user.id,
      name: user.name,
      role: user.role
    }
  });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: "Authentication required."
    });
  }

  res.json({
    user: req.user
  });
});

app.get("/api/patient/profile", authorizeRole(["patient"]), async (req, res) => {
  const patient = await getPatientByUserId(req.user.id);

  if (!patient) {
    return res.status(404).json({
      error: "Patient profile not found."
    });
  }

  res.json({
    patient,
    hospital: patient.hospitalId ? await getHospitalById(patient.hospitalId) : null
  });
});

app.post(
  "/api/patient/profile",
  authorizeRole(["patient"]),
  validateRequiredFields(["name", "abhaNumber", "age", "bloodGroup", "sex", "phone", "email"]),
  async (req, res) => {
    const payload = await updatePatientProfile(req.user.id, req.body);

    if (!payload) {
      return res.status(404).json({
        error: "Patient profile not found."
      });
    }

    await addAuditLog("update_profile", req.user.email, `Updated patient profile for ${payload.patient.name}.`);

    res.json(payload);
  }
);

app.get("/api/patient/reports", authorizeRole(["patient"]), async (req, res) => {
  const patient = await getPatientByUserId(req.user.id);

  if (!patient) {
    return res.status(404).json({
      error: "Patient profile not found."
    });
  }

  res.json({
    reports: await getReportsForPatient(patient.id)
  });
});

app.get("/api/reports/:id", async (req, res) => {
  const report = await getReportById(req.params.id);

  if (!report) {
    return res.status(404).json({
      error: "Report not found."
    });
  }

  res.json({
    report
  });
});

app.get("/api/reports/:id/download", async (req, res) => {
  const report = await getReportById(req.params.id);

  if (!report) {
    return res.status(404).json({
      error: "Report not found."
    });
  }

  await addAuditLog("download_report", req.user?.email || "anonymous", `Downloaded ${report.fileName}.`);

  const [patient, hospital] = await Promise.all([
    report.patientId ? getPatientById(report.patientId) : null,
    report.hospitalId ? getHospitalById(report.hospitalId) : null
  ]);
  const pdfBuffer = buildReportPdf({ hospital, patient, report });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${getDownloadFileName(report.fileName)}"`);
  res.send(pdfBuffer);
});

app.delete("/api/reports/:id", authorizeRole(["patient"]), async (req, res) => {
  const patient = await getPatientByUserId(req.user.id);

  if (!patient) {
    return res.status(404).json({
      error: "Patient profile not found."
    });
  }

  const report = await getReportById(req.params.id);

  if (!report || report.patientId !== patient.id) {
    return res.status(404).json({
      error: "Report not found for this patient."
    });
  }

  await deleteReport(report.id);
  await addAuditLog("delete_report", req.user.email, `Deleted report ${report.id} (${report.fileName}).`);

  res.json({
    deletedReportId: report.id
  });
});

app.post("/api/reports/share", validateRequiredFields(["reportId", "shareTarget"]), async (req, res) => {
  const report = await shareReport(req.body.reportId, req.body.shareTarget);

  if (!report) {
    return res.status(404).json({
      error: "Report not found."
    });
  }

  await addAuditLog("share_report", req.user?.email || "unknown", `Shared report ${report.id} with ${req.body.shareTarget}.`);

  res.json({
    report
  });
});

app.post(
  "/api/patient/forward-report",
  authorizeRole(["patient"]),
  validateRequiredFields(["insuranceUserId", "policyNumber", "reportId"]),
  async (req, res) => {
    const patient = await getPatientByUserId(req.user.id);

    if (!patient) {
      return res.status(404).json({
        error: "Patient profile not found."
      });
    }

    const report = await getReportById(req.body.reportId);

    if (!report || report.patientId !== patient.id) {
      return res.status(404).json({
        error: "Report not found for this patient."
      });
    }

    const submission = await createInsuranceSubmission({
      forwardedByUserId: req.user.id,
      hospitalId: report.hospitalId,
      insuranceUserId: req.body.insuranceUserId,
      patientId: patient.id,
      policyNumber: String(req.body.policyNumber).trim(),
      reportId: report.id
    });

    await addAuditLog(
      "forward_report_to_insurance",
      req.user.email,
      `Forwarded report ${report.id} to insurance with policy ${submission.policyNumber}.`
    );

    res.status(201).json({
      submission
    });
  }
);

app.get("/api/insurance/providers", authorizeRole(["patient"]), async (_req, res) => {
  res.json({
    providers: await listInsuranceProviders()
  });
});

app.get("/api/hospital/patients", authorizeRole(["hospital"]), async (req, res) => {
  res.json({
    patients: await listHospitalPatients(req.user.id)
  });
});

app.get("/api/hospital/patient-preview", authorizeRole(["hospital", "path_lab"]), async (req, res) => {
  const abhaNumber = String(req.query.abhaNumber || "").trim();
  const patientName = String(req.query.name || "").trim();

  if (!abhaNumber || !patientName) {
    return res.status(400).json({
      error: "Patient name and ABHA number are required."
    });
  }

  const patient = await getPatientByAbha(abhaNumber);

  if (!patient) {
    return res.status(404).json({
      error: "Patient not found."
    });
  }

  const normalizedInputName = patientName.toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedPatientName = patient.name.toLowerCase().replace(/\s+/g, " ").trim();

  if (
    normalizedInputName !== normalizedPatientName &&
    !normalizedPatientName.includes(normalizedInputName) &&
    !normalizedInputName.includes(normalizedPatientName)
  ) {
    return res.status(404).json({
      error: "Patient name does not match the provided ABHA number."
    });
  }

  const reports = await getReportsForPatient(patient.id);

  res.json({
    patient: {
      abhaNumber: patient.abhaNumber,
      age: patient.age,
      bloodGroup: patient.bloodGroup,
      history: patient.history,
      id: patient.id,
      name: patient.name,
      phone: patient.phone || "",
      sex: patient.sex || ""
    },
    reportSummary: {
      latestReportDate: reports[0]?.createdAt || null,
      recentReports: reports.slice(0, 3).map((report) => ({
        createdAt: report.createdAt,
        doctorName: report.doctorName,
        id: report.id,
        type: report.type
      })),
      totalReports: reports.length
    }
  });
});

app.post(
  "/api/hospital/report",
  authorizeRole(["hospital", "path_lab"]),
  validateRequiredFields(["patientAbha", "type", "findings", "doctorName"]),
  async (req, res) => {
    const patient = await getPatientByAbha(req.body.patientAbha);

    if (!patient) {
      return res.status(404).json({
        error: "Patient not found for the provided ABHA number."
      });
    }

    const hospital = req.user.role === "hospital" ? await getHospitalByUserId(req.user.id) : null;
    const report = await createReport({
      doctorName: req.body.doctorName,
      fileName: req.body.fileName || `${req.body.type.toLowerCase().replace(/\s+/g, "-")}.pdf`,
      findings: req.body.findings,
      patientId: patient.id,
      hospitalId: hospital?.id || patient.hospitalId || null,
      type: req.body.type,
      uploadedByUserId: req.user.id
    });

    await addAuditLog("upload_report", req.user.email, `Uploaded ${report.type} for ${patient.name}.`);

    res.status(201).json({
      report
    });
  }
);

app.get("/api/insurance/records", authorizeRole(["insurance"]), async (req, res) => {
  res.json({
    records: await listInsuranceRecords()
  });
});

app.post("/api/ai/summarize", validateRequiredFields(["reportId"]), async (req, res) => {
  const report = await getReportById(req.body.reportId);

  if (!report) {
    return res.status(404).json({
      error: "Report not found."
    });
  }

  const summary = summarizeReport(report);
  await updateReportSummary(report.id, summary);

  res.json({
    summary
  });
});

app.post("/api/security/analyze", (_req, res) => {
  res.json({
    message: "Security analysis placeholder endpoint is ready."
  });
});

app.use(errorHandler);

app.listen(env.apiPort, () => {
  console.log(`MedSync API listening on port ${env.apiPort}`);
});
