import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const passwordHash = bcrypt.hashSync("medsync123", 10);

const users = [
  {
    id: "user-patient-1",
    email: "patient@medsync.local",
    passwordHash,
    role: "patient",
    name: "Aarav Mehta",
    abhaNumber: "458722019942",
    hospitalId: null
  },
  {
    id: "user-hospital-1",
    email: "hospital@medsync.local",
    passwordHash,
    role: "hospital",
    name: "Dr. Neha Sharma",
    abhaNumber: null,
    hospitalId: "hospital-1"
  },
  {
    id: "user-lab-1",
    email: "lab@medsync.local",
    passwordHash,
    role: "path_lab",
    name: "City Path Lab",
    abhaNumber: null,
    hospitalId: null
  },
  {
    id: "user-insurance-1",
    email: "insurance@medsync.local",
    passwordHash,
    role: "insurance",
    name: "Apex Insurance Desk",
    abhaNumber: null,
    hospitalId: null
  },
  {
    id: "user-admin-1",
    email: "admin@medsync.local",
    passwordHash,
    role: "admin",
    name: "Platform Admin",
    abhaNumber: null,
    hospitalId: null
  }
];

const hospitals = [
  {
    id: "hospital-1",
    name: "Sunrise Care Hospital",
    location: "Mumbai"
  }
];

const patients = [
  {
    id: "patient-1",
    userId: "user-patient-1",
    name: "Aarav Mehta",
    abhaNumber: "458722019942",
    age: 34,
    bloodGroup: "B+",
    hospitalId: "hospital-1",
    history: [
      "Type 2 diabetes under review",
      "Routine blood tests every 3 months"
    ],
    appointments: [
      { id: "appt-1", date: "2026-04-26", status: "Scheduled", department: "General Medicine" }
    ],
    notifications: [
      { id: "note-1", text: "New CBC report uploaded by City Path Lab.", createdAt: "2026-04-22T10:15:00Z" }
    ]
  }
];

const reports = [
  {
    id: "report-1",
    patientId: "patient-1",
    hospitalId: "hospital-1",
    uploadedByUserId: "user-lab-1",
    doctorName: "Dr. Neha Sharma",
    type: "CBC Report",
    fileName: "cbc-apr-2026.pdf",
    findings: "Hemoglobin and white cell count are in range. Platelets are slightly low.",
    aiSummary:
      "Most values are in range. Platelets are slightly low. A doctor should review the result with the patient.",
    createdAt: "2026-04-22T09:30:00Z",
    sharedWith: ["insurance"]
  },
  {
    id: "report-2",
    patientId: "patient-1",
    hospitalId: "hospital-1",
    uploadedByUserId: "user-hospital-1",
    doctorName: "Dr. Neha Sharma",
    type: "Discharge Summary",
    fileName: "discharge-summary.pdf",
    findings: "Patient discharged with medication update and follow-up after 14 days.",
    aiSummary:
      "The patient was discharged with updated medication and should return for follow-up in 14 days.",
    createdAt: "2026-04-19T15:40:00Z",
    sharedWith: []
  }
];

const insuranceSubmissions = [];

const auditLogs = [
  {
    id: "log-1",
    action: "login",
    actor: "patient@medsync.local",
    createdAt: "2026-04-22T08:00:00Z",
    details: "Patient login completed."
  }
];

export const db = {
  auditLogs,
  hospitals,
  insuranceSubmissions,
  patients,
  reports,
  users
};

export function findUserByEmail(email) {
  return users.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

export function findUserById(id) {
  return users.find((user) => user.id === id);
}

export function getPatientByUserId(userId) {
  return patients.find((patient) => patient.userId === userId);
}

export function getPatientByAbha(abhaNumber) {
  return patients.find((patient) => patient.abhaNumber === abhaNumber);
}

export function getHospitalById(hospitalId) {
  return hospitals.find((hospital) => hospital.id === hospitalId);
}

export function getReportsForPatient(patientId) {
  return reports
    .filter((report) => report.patientId === patientId)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

export function getReportById(reportId) {
  return reports.find((report) => report.id === reportId);
}

export function addAuditLog(action, actor, details) {
  auditLogs.unshift({
    id: randomUUID(),
    action,
    actor,
    details,
    createdAt: new Date().toISOString()
  });
}

export function registerUser({ email, name, passwordHash: nextPasswordHash, role }) {
  const user = {
    id: randomUUID(),
    email,
    passwordHash: nextPasswordHash,
    role,
    name,
    abhaNumber: role === "patient" ? String(Math.floor(100000000000 + Math.random() * 900000000000)) : null,
    hospitalId: role === "hospital" ? "hospital-1" : null
  };

  users.push(user);

  if (role === "patient") {
    patients.push({
      id: randomUUID(),
      userId: user.id,
      name,
      abhaNumber: user.abhaNumber,
      age: 30,
      bloodGroup: "Unknown",
      hospitalId: "hospital-1",
      history: [],
      appointments: [],
      notifications: []
    });
  }

  return user;
}

export function createReport({
  doctorName,
  fileName,
  findings,
  patientId,
  hospitalId,
  type,
  uploadedByUserId
}) {
  const report = {
    id: randomUUID(),
    patientId,
    hospitalId,
    uploadedByUserId,
    doctorName,
    type,
    fileName,
    findings,
    aiSummary: "",
    createdAt: new Date().toISOString(),
    sharedWith: []
  };

  reports.unshift(report);
  return report;
}

export function shareReport(reportId, shareTarget) {
  const report = getReportById(reportId);

  if (!report) {
    return null;
  }

  if (!report.sharedWith.includes(shareTarget)) {
    report.sharedWith.push(shareTarget);
  }

  return report;
}

export function createInsuranceSubmission({
  forwardedByUserId,
  hospitalId,
  insuranceUserId = null,
  patientId,
  policyNumber,
  reportId
}) {
  const submission = {
    id: randomUUID(),
    reportId,
    patientId,
    hospitalId,
    forwardedByUserId,
    insuranceUserId,
    policyNumber,
    status: "Received",
    createdAt: new Date().toISOString()
  };

  insuranceSubmissions.unshift(submission);
  return submission;
}
