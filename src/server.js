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
  getPatientByUserId,
  getReportById,
  getReportsForPatient,
  isSupabaseEnabled,
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

  res.json({
    downloadUrl: `/mock-downloads/${report.fileName}`,
    fileName: report.fileName
  });
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
  validateRequiredFields(["policyNumber", "reportId"]),
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
