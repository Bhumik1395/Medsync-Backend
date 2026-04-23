export function summarizeReport(report) {
  if (report.aiSummary) {
    return report.aiSummary;
  }

  if (!report.findings) {
    return "No findings were added to this report yet.";
  }

  return `Summary: ${report.findings}`;
}
