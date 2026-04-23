import { randomUUID } from "crypto";
import {
  addAuditLog as addMockAuditLog,
  createInsuranceSubmission as createMockInsuranceSubmission,
  createReport as createMockReport,
  db,
  findUserByEmail as findMockUserByEmail,
  getHospitalById as getMockHospitalById,
  getPatientByAbha as getMockPatientByAbha,
  getPatientByUserId as getMockPatientByUserId,
  getReportById as getMockReportById,
  getReportsForPatient as getMockReportsForPatient,
  registerUser as registerMockUser,
  shareReport as shareMockReport
} from "./mockDb.js";
import { createSupabaseAdminClient } from "../lib/supabase.js";

const supabase = createSupabaseAdminClient();

function ensureNoSupabaseError(error, fallbackMessage) {
  if (error) {
    throw new Error(error.message || fallbackMessage);
  }
}

function generateAbhaNumber() {
  return String(Math.floor(100000000000 + Math.random() * 900000000000));
}

function normalizePatientAge(age) {
  return age && age > 0 ? age : 0;
}

function normalizePatientBloodGroup(bloodGroup) {
  return bloodGroup && bloodGroup !== "Unknown" ? bloodGroup : "";
}

function normalizePatientSex(sex) {
  return sex && sex !== "Unspecified" ? sex : "";
}

async function fetchPatientRowByUserId(userId) {
  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  ensureNoSupabaseError(patientError, "Unable to load patient profile.");
  return patient;
}

async function ensurePatientProfileForUser(userId) {
  const user = await findUserById(userId);

  if (!user || user.role !== "patient") {
    return null;
  }

  let patient = await fetchPatientRowByUserId(userId);

  if (patient || !supabase) {
    return patient ? mapPatientRecord(patient) : null;
  }

  const abhaNumber = user.abhaNumber || generateAbhaNumber();

  const { error: userError } = await supabase
    .from("users")
    .update({
      abha_number: abhaNumber,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId);
  ensureNoSupabaseError(userError, "Unable to repair patient user record.");

  const { error: patientError } = await supabase.from("patients").insert({
    abha_number: abhaNumber,
    age: 0,
    blood_group: "Unknown",
    history: [],
    hospital_id: null,
    name: user.name,
    patient_id: randomUUID(),
    phone: "",
    sex: "Unspecified",
    user_id: userId
  });
  ensureNoSupabaseError(patientError, "Unable to create missing patient profile.");

  patient = await fetchPatientRowByUserId(userId);
  return patient ? mapPatientRecord(patient) : null;
}

function mapUserRecord(user) {
  if (!user) {
    return null;
  }

  return {
    abhaNumber: user.abha_number ?? null,
    email: user.email,
    hospitalId: user.hospital_id ?? null,
    id: user.user_id,
    name: user.name,
    passwordHash: user.password_hash,
    role: user.role
  };
}

function mapPatientRecord(patient, appointments = [], notifications = []) {
  if (!patient) {
    return null;
  }

  return {
    abhaNumber: patient.abha_number,
    age: normalizePatientAge(patient.age),
    appointments: appointments.map((appointment) => ({
      date: appointment.appointment_date,
      department: appointment.department,
      id: appointment.appointment_id,
      status: appointment.status
    })),
    bloodGroup: normalizePatientBloodGroup(patient.blood_group),
    history: patient.history ?? [],
    hospitalId: patient.hospital_id ?? null,
    id: patient.patient_id,
    name: patient.name,
    notifications: notifications.map((notification) => ({
      createdAt: notification.created_at,
      id: notification.notification_id,
      text: notification.text
    })),
    phone: patient.phone ?? "",
    sex: normalizePatientSex(patient.sex)
  };
}

function mapHospitalRecord(hospital) {
  if (!hospital) {
    return null;
  }

  return {
    id: hospital.hospital_id,
    location: hospital.location,
    name: hospital.name,
    userId: hospital.user_id ?? null
  };
}

function mapReportRecord(report) {
  if (!report) {
    return null;
  }

  return {
    aiSummary: report.ai_summary ?? "",
    createdAt: report.created_at,
    doctorName: report.doctor_name,
    fileName: report.file_name,
    findings: report.findings ?? "",
    hospitalId: report.hospital_id ?? null,
    id: report.report_id,
    patientId: report.patient_id,
    sharedWith: report.shared_with ?? [],
    type: report.type,
    uploadedByUserId: report.uploaded_by_user_id ?? null
  };
}

function mapInsuranceSubmissionRecord(submission) {
  if (!submission) {
    return null;
  }

  return {
    createdAt: submission.created_at ?? submission.createdAt,
    forwardedByUserId: submission.forwarded_by_user_id ?? submission.forwardedByUserId ?? null,
    hospitalId: submission.hospital_id ?? submission.hospitalId ?? null,
    id: submission.submission_id ?? submission.id,
    insuranceUserId: submission.insurance_user_id ?? submission.insuranceUserId ?? null,
    patientId: submission.patient_id ?? submission.patientId,
    policyNumber: submission.policy_number ?? submission.policyNumber,
    reportId: submission.report_id ?? submission.reportId,
    status: submission.status
  };
}

export function isSupabaseEnabled() {
  return Boolean(supabase);
}

export async function findUserByEmail(email) {
  if (!supabase) {
    return findMockUserByEmail(email);
  }

  const { data, error } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
  ensureNoSupabaseError(error, "Unable to load user.");
  return mapUserRecord(data);
}

export async function findUserById(userId) {
  if (!supabase) {
    return db.users.find((user) => user.id === userId) || null;
  }

  const { data, error } = await supabase.from("users").select("*").eq("user_id", userId).maybeSingle();
  ensureNoSupabaseError(error, "Unable to load user.");
  return mapUserRecord(data);
}

export async function registerUser({ email, name, passwordHash, role }) {
  if (!supabase) {
    return registerMockUser({ email, name, passwordHash, role });
  }

  const userId = randomUUID();
  const abhaNumber = role === "patient" ? generateAbhaNumber() : null;

  const { error: userError } = await supabase.from("users").insert({
    abha_number: abhaNumber,
    email,
    name,
    password_hash: passwordHash,
    role,
    user_id: userId
  });
  ensureNoSupabaseError(userError, "Unable to create user.");

  if (role === "patient") {
    const { error: patientError } = await supabase.from("patients").insert({
      abha_number: abhaNumber,
      age: 0,
      blood_group: "Unknown",
      history: [],
      hospital_id: null,
      name,
      patient_id: randomUUID(),
      phone: "",
      sex: "Unspecified",
      user_id: userId
    });
    ensureNoSupabaseError(patientError, "Unable to create patient profile.");
  }

  if (role === "hospital") {
    const { error: hospitalError } = await supabase.from("hospitals").insert({
      hospital_id: randomUUID(),
      location: "Not set",
      name,
      user_id: userId
    });
    ensureNoSupabaseError(hospitalError, "Unable to create hospital profile.");
  }

  return {
    abhaNumber,
    email,
    hospitalId: null,
    id: userId,
    name,
    passwordHash,
    role
  };
}

export async function getPatientByUserId(userId) {
  if (!supabase) {
    return getMockPatientByUserId(userId);
  }

  let patient = await fetchPatientRowByUserId(userId);

  if (!patient) {
    return ensurePatientProfileForUser(userId);
  }

  const [{ data: appointments, error: appointmentsError }, { data: notifications, error: notificationsError }] =
    await Promise.all([
      supabase
        .from("appointments")
        .select("*")
        .eq("patient_id", patient.patient_id)
        .order("appointment_date", { ascending: true }),
      supabase
        .from("notifications")
        .select("*")
        .eq("patient_id", patient.patient_id)
        .order("created_at", { ascending: false })
    ]);

  ensureNoSupabaseError(appointmentsError, "Unable to load appointments.");
  ensureNoSupabaseError(notificationsError, "Unable to load notifications.");

  return mapPatientRecord(patient, appointments || [], notifications || []);
}

export async function getPatientByAbha(abhaNumber) {
  if (!supabase) {
    return getMockPatientByAbha(abhaNumber);
  }

  const { data, error } = await supabase.from("patients").select("*").eq("abha_number", abhaNumber).maybeSingle();
  ensureNoSupabaseError(error, "Unable to load patient.");
  return mapPatientRecord(data);
}

export async function getPatientById(patientId) {
  if (!supabase) {
    return db.patients.find((patient) => patient.id === patientId) || null;
  }

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("*")
    .eq("patient_id", patientId)
    .maybeSingle();
  ensureNoSupabaseError(patientError, "Unable to load patient.");

  if (!patient) {
    return null;
  }

  const [{ data: appointments, error: appointmentsError }, { data: notifications, error: notificationsError }] =
    await Promise.all([
      supabase
        .from("appointments")
        .select("*")
        .eq("patient_id", patient.patient_id)
        .order("appointment_date", { ascending: true }),
      supabase
        .from("notifications")
        .select("*")
        .eq("patient_id", patient.patient_id)
        .order("created_at", { ascending: false })
    ]);

  ensureNoSupabaseError(appointmentsError, "Unable to load appointments.");
  ensureNoSupabaseError(notificationsError, "Unable to load notifications.");

  return mapPatientRecord(patient, appointments || [], notifications || []);
}

export async function getHospitalById(hospitalId) {
  if (!supabase) {
    return getMockHospitalById(hospitalId);
  }

  const { data, error } = await supabase.from("hospitals").select("*").eq("hospital_id", hospitalId).maybeSingle();
  ensureNoSupabaseError(error, "Unable to load hospital.");
  return mapHospitalRecord(data);
}

export async function getHospitalByUserId(userId) {
  if (!supabase) {
    return db.hospitals.find((hospital) => hospital.id === db.users.find((user) => user.id === userId)?.hospitalId) || null;
  }

  const { data, error } = await supabase.from("hospitals").select("*").eq("user_id", userId).maybeSingle();
  ensureNoSupabaseError(error, "Unable to load hospital.");
  return mapHospitalRecord(data);
}

export async function getReportsForPatient(patientId) {
  if (!supabase) {
    return getMockReportsForPatient(patientId);
  }

  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  ensureNoSupabaseError(error, "Unable to load reports.");
  return (data || []).map(mapReportRecord);
}

export async function getReportById(reportId) {
  if (!supabase) {
    return getMockReportById(reportId);
  }

  const { data, error } = await supabase.from("reports").select("*").eq("report_id", reportId).maybeSingle();
  ensureNoSupabaseError(error, "Unable to load report.");
  return mapReportRecord(data);
}

export async function createReport({ doctorName, fileName, findings, patientId, hospitalId, type, uploadedByUserId }) {
  if (!supabase) {
    return createMockReport({ doctorName, fileName, findings, patientId, hospitalId, type, uploadedByUserId });
  }

  const reportRow = {
    ai_summary: "",
    doctor_name: doctorName,
    file_name: fileName,
    findings,
    hospital_id: hospitalId,
    patient_id: patientId,
    report_id: randomUUID(),
    shared_with: [],
    type,
    uploaded_by_user_id: uploadedByUserId
  };

  const { data, error } = await supabase.from("reports").insert(reportRow).select("*").single();
  ensureNoSupabaseError(error, "Unable to create report.");
  return mapReportRecord(data);
}

export async function deleteReport(reportId) {
  if (!supabase) {
    const reportIndex = db.reports.findIndex((report) => report.id === reportId);

    if (reportIndex === -1) {
      return null;
    }

    const [deletedReport] = db.reports.splice(reportIndex, 1);
    return deletedReport;
  }

  const report = await getReportById(reportId);

  if (!report) {
    return null;
  }

  const { error } = await supabase.from("reports").delete().eq("report_id", reportId);
  ensureNoSupabaseError(error, "Unable to delete report.");
  return report;
}

export async function shareReport(reportId, shareTarget) {
  if (!supabase) {
    return shareMockReport(reportId, shareTarget);
  }

  const report = await getReportById(reportId);

  if (!report) {
    return null;
  }

  const nextSharedWith = Array.from(new Set([...(report.sharedWith || []), shareTarget]));
  const { data, error } = await supabase
    .from("reports")
    .update({ shared_with: nextSharedWith })
    .eq("report_id", reportId)
    .select("*")
    .single();
  ensureNoSupabaseError(error, "Unable to share report.");
  return mapReportRecord(data);
}

export async function createInsuranceSubmission({
  forwardedByUserId,
  hospitalId,
  insuranceUserId = null,
  patientId,
  policyNumber,
  reportId
}) {
  if (!supabase) {
    return createMockInsuranceSubmission({
      forwardedByUserId,
      hospitalId,
      insuranceUserId,
      patientId,
      policyNumber,
      reportId
    });
  }

  const { data, error } = await supabase
    .from("insurance_submissions")
    .insert({
      forwarded_by_user_id: forwardedByUserId,
      hospital_id: hospitalId,
      insurance_user_id: insuranceUserId,
      patient_id: patientId,
      policy_number: policyNumber,
      report_id: reportId,
      submission_id: randomUUID(),
      status: "Received"
    })
    .select("*")
    .single();
  ensureNoSupabaseError(error, "Unable to create insurance submission.");
  return mapInsuranceSubmissionRecord(data);
}

export async function updateReportSummary(reportId, summary) {
  if (!supabase) {
    const report = getMockReportById(reportId);

    if (!report) {
      return null;
    }

    report.aiSummary = summary;
    return report;
  }

  const { data, error } = await supabase
    .from("reports")
    .update({ ai_summary: summary })
    .eq("report_id", reportId)
    .select("*")
    .single();
  ensureNoSupabaseError(error, "Unable to update report summary.");
  return mapReportRecord(data);
}

export async function addAuditLog(action, actor, details) {
  if (!supabase) {
    addMockAuditLog(action, actor, details);
    return;
  }

  const { error } = await supabase.from("audit_logs").insert({
    action,
    actor,
    details,
    log_id: randomUUID()
  });
  ensureNoSupabaseError(error, "Unable to write audit log.");
}

export async function listHospitalPatients(userId) {
  if (!supabase) {
    return db.patients.map((patient) => ({
      abhaNumber: patient.abhaNumber,
      id: patient.id,
      latestReportCount: getMockReportsForPatient(patient.id).length,
      name: patient.name
    }));
  }

  const hospital = await getHospitalByUserId(userId);
  let query = supabase.from("patients").select("*");

  if (hospital?.id) {
    query = query.eq("hospital_id", hospital.id);
  }

  const { data, error } = await query.order("name", { ascending: true });
  ensureNoSupabaseError(error, "Unable to load hospital patients.");

  const patients = await Promise.all(
    (data || []).map(async (patient) => {
      const reports = await getReportsForPatient(patient.patient_id);
      return {
        abhaNumber: patient.abha_number,
        id: patient.patient_id,
        latestReportCount: reports.length,
        name: patient.name
      };
    })
  );

  return patients;
}

export async function listInsuranceRecords() {
  if (!supabase) {
    return db.insuranceSubmissions.map((submission) => {
      const patient = db.patients.find((item) => item.id === submission.patientId);
      const report = db.reports.find((item) => item.id === submission.reportId);
      const hospital = db.hospitals.find((item) => item.id === submission.hospitalId);

      return {
        createdAt: submission.createdAt,
        doctorName: report?.doctorName || "",
        hospitalName: hospital?.name || "Unknown Hospital",
        patientAbha: patient?.abhaNumber || "",
        patientId: patient?.id || submission.patientId,
        patientName: patient?.name || "Unknown Patient",
        policyNumber: submission.policyNumber,
        reportId: submission.reportId,
        reportType: report?.type || "Unknown",
        status: submission.status
      };
    });
  }

  const { data, error } = await supabase
    .from("insurance_submissions")
    .select("*")
    .order("created_at", { ascending: false });
  ensureNoSupabaseError(error, "Unable to load insurance records.");

  return Promise.all(
    (data || []).map(async (submissionRow) => {
      const submission = mapInsuranceSubmissionRecord(submissionRow);
      const report = await getReportById(submission.reportId);
      const patient = await getPatientById(submission.patientId);
      const hospital = submission.hospitalId ? await getHospitalById(submission.hospitalId) : null;

      return {
        createdAt: submission.createdAt,
        doctorName: report?.doctorName || "",
        hospitalName: hospital?.name || "Unknown Hospital",
        patientAbha: patient?.abhaNumber || "",
        patientId: submission.patientId,
        patientName: patient?.name || "Unknown Patient",
        policyNumber: submission.policyNumber,
        reportId: submission.reportId,
        reportType: report?.type || "Unknown",
        status: submission.status
      };
    })
  );
}

export async function updatePatientProfile(userId, profile) {
  if (!supabase) {
    const patient = getMockPatientByUserId(userId);
    const user = db.users.find((currentUser) => currentUser.id === userId);

    if (!patient || !user) {
      return null;
    }

    patient.name = profile.name;
    patient.abhaNumber = profile.abhaNumber;
    patient.age = Number(profile.age);
    patient.bloodGroup = profile.bloodGroup;
    patient.sex = profile.sex;
    patient.phone = profile.phone;
    user.name = profile.name;
    user.email = profile.email;
    user.abhaNumber = profile.abhaNumber;

    return {
      patient,
      user: {
        email: user.email,
        id: user.id,
        name: user.name,
        role: user.role
      }
    };
  }

  const patient = (await getPatientByUserId(userId)) || (await ensurePatientProfileForUser(userId));

  if (!patient) {
    return null;
  }

  const { error: userError } = await supabase
    .from("users")
    .update({
      abha_number: profile.abhaNumber,
      email: profile.email,
      name: profile.name,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId);
  ensureNoSupabaseError(userError, "Unable to update user details.");

  const { error: patientError } = await supabase
    .from("patients")
    .update({
      abha_number: profile.abhaNumber,
      age: Number(profile.age),
      blood_group: profile.bloodGroup,
      name: profile.name,
      phone: profile.phone,
      sex: profile.sex,
      updated_at: new Date().toISOString()
    })
    .eq("patient_id", patient.id);
  ensureNoSupabaseError(patientError, "Unable to update patient profile.");

  const updatedUser = await findUserById(userId);
  const updatedPatient = await getPatientByUserId(userId);

  return {
    patient: updatedPatient,
    user: {
      email: updatedUser.email,
      id: updatedUser.id,
      name: updatedUser.name,
      role: updatedUser.role
    }
  };
}
