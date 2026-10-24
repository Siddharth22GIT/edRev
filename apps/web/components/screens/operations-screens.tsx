"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AnalyticsSnapshot, EarningsEntry, Proposal } from "@edurev/types";
import { analytics, earnings as mockEarningsData, proposals, safeguards, settings } from "@edurev/mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconCheckCircle,
  IconClock,
  IconDownload,
  IconEarnings,
  IconEye,
  IconGraduationCap,
  IconPlus,
  IconProposals,
  IconSafeguards,
  IconSettings,
  IconStudents,
  IconUserCheck,
  IconX,
} from "@/components/ui/icons";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export function EarningsScreen() {
  const { user, getAuthHeaders } = useAuth();
  const [earningsList, setEarningsList] = useState<EarningsEntry[]>([]);
  const [summary, setSummary] = useState<{ totalVerified: number; totalPending: number; totalRejected: number }>({
    totalVerified: 0,
    totalPending: 0,
    totalRejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ msg: string; isError?: boolean } | null>(null);

  // Submission Form State
  const [platformName, setPlatformName] = useState("Upwork");
  const [projectTitle, setProjectTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [evidence, setEvidence] = useState("");
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Verification & Detail Inspection Modal State
  const [inspectingEntry, setInspectingEntry] = useState<EarningsEntry | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const role = user?.role || "STUDENT";
  const isVerifier = role === "FACULTY_DIRECTOR" || role === "CELL_COORDINATOR" || role === "ADMINISTRATOR";

  const loadData = async () => {
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_BASE}/earnings`, { headers });
      if (res.ok) {
        const json = await res.json();
        const data: EarningsEntry[] = json.data || [];
        setEarningsList(data);

        // Compute summary totals
        const verified = data
          .filter((e) => e.verificationStatus === "VERIFIED")
          .reduce((acc, curr) => acc + (curr.convertedAmount || 0), 0);
        const pending = data
          .filter((e) => e.verificationStatus === "PENDING")
          .reduce((acc, curr) => acc + (curr.convertedAmount || 0), 0);
        const rejected = data
          .filter((e) => e.verificationStatus === "REJECTED")
          .reduce((acc, curr) => acc + (curr.convertedAmount || 0), 0);

        setSummary({
          totalVerified: Number(verified.toFixed(2)),
          totalPending: Number(pending.toFixed(2)),
          totalRejected: Number(rejected.toFixed(2)),
        });
      }
    } catch {
      // Offline fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setNotice({ msg: "Screenshot image is too large. Please select an image under 10MB.", isError: true });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshotPreview(reader.result as string);
        if (!evidence) {
          setEvidence(`Screenshot: ${file.name}`);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitEarning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0 || !platformName) {
      setNotice({ msg: "Please enter a valid platform and positive earning amount.", isError: true });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      const res = await fetch(`${API_BASE}/earnings`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          platformName,
          projectTitle: projectTitle || `${platformName} Work`,
          originalAmount: Number(amount),
          originalCurrency: currency,
          evidence: evidence || (screenshotPreview ? "Payment screenshot attached" : "Payment proof submitted"),
          screenshotUrl: screenshotPreview || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to submit earning.");

      setNotice({ msg: "Earning record and payment screenshot submitted successfully. Status is PENDING institutional review." });
      setAmount("");
      setProjectTitle("");
      setEvidence("");
      setScreenshotPreview(null);
      await loadData();
    } catch (err: any) {
      setNotice({ msg: err.message || "Submission failed.", isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveEntry = async (id: string) => {
    setActionLoading(id);
    setNotice(null);

    try {
      const res = await fetch(`${API_BASE}/earnings/${id}/verify`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: "VERIFIED" }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to verify entry.");

      setNotice({ msg: `Earnings record ${id} successfully verified and credited into the student ledger.` });
      setInspectingEntry(null);
      setRejectionReason("");
      await loadData();
    } catch (err: any) {
      setNotice({ msg: err.message || "Verification failed.", isError: true });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectEntry = async (id: string) => {
    if (!rejectionReason.trim()) {
      setNotice({ msg: "Please provide a specific remark/reason explaining why the earning is rejected.", isError: true });
      return;
    }

    setActionLoading(id);
    setNotice(null);

    try {
      const res = await fetch(`${API_BASE}/earnings/${id}/verify`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          status: "REJECTED",
          rejectionReason: rejectionReason.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to reject entry.");

      setNotice({ msg: `Record ${id} marked as REJECTED with feedback logged for the student.` });
      setInspectingEntry(null);
      setRejectionReason("");
      await loadData();
    } catch (err: any) {
      setNotice({ msg: err.message || "Rejection failed.", isError: true });
    } finally {
      setActionLoading(null);
    }
  };

  const openInspectionModal = (entry: EarningsEntry) => {
    setInspectingEntry(entry);
    setRejectionReason(entry.rejectionReason || "");
  };

  const quickRemarks = [
    "Payment screenshot is blurry or illegible. Please re-upload a clear screenshot.",
    "Amount on payment screenshot does not match the claimed amount.",
    "Client or platform name does not match the invoice statement.",
    "Missing transaction ID or confirmation of completed bank payout.",
    "Duplicate submission of an existing earnings transaction.",
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Finance & Verification"
        title="Student Earnings Ledger"
        description="Record, track, and verify student external freelancing and project earnings with institutional oversight."
      />

      {/* SUMMARY STAT CARDS */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          detail="Verified & Counted"
          label="Total Verified Earnings"
          trend="positive"
          accent="emerald"
          icon={<IconEarnings size={18} />}
          value={formatCurrency(summary.totalVerified)}
        />
        <StatCard
          detail="Awaiting Institutional Review"
          label="Pending Verification"
          accent="orange"
          icon={<IconClock size={18} />}
          value={formatCurrency(summary.totalPending)}
        />
        <StatCard
          detail="Not Counted in Total"
          label="Rejected Entries"
          accent="amber"
          icon={<IconAlertTriangle size={18} />}
          value={formatCurrency(summary.totalRejected)}
        />
      </div>

      {notice && (
        <div
          className={`p-4 rounded-xl border text-sm font-medium flex items-center justify-between ${
            notice.isError ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          <span>{notice.msg}</span>
          <button
            className="text-xs font-bold hover:underline ml-4"
            onClick={() => setNotice(null)}
            type="button"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* STUDENT SUBMISSION FORM (WITH PAYMENT SCREENSHOT UPLOAD) */}
      {role === "STUDENT" && (
        <Card className="p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-lg font-bold text-slate-950">Submit External Freelance Earning</h2>
            <p className="text-xs text-slate-500 mt-1">
              Submit proof of earnings from freelancing platforms (Upwork, Fiverr, Direct Work). Submissions start as <strong>PENDING</strong> institutional verification.
            </p>
          </div>

          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmitEarning}>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500" htmlFor="platformSelect">
                Platform / Client
              </label>
              <select
                id="platformSelect"
                className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-500"
                onChange={(e) => setPlatformName(e.target.value)}
                value={platformName}
              >
                <option value="Upwork">Upwork</option>
                <option value="Fiverr">Fiverr</option>
                <option value="Freelancer">Freelancer</option>
                <option value="Toptal">Toptal</option>
                <option value="Direct Client">Direct Client / Consulting</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500" htmlFor="projectTitleInput">
                Project / Deliverable Title
              </label>
              <input
                id="projectTitleInput"
                className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-500"
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder="e.g. E-commerce UI Redesign"
                value={projectTitle}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500" htmlFor="amountInput">
                Original Amount Earned
              </label>
              <input
                id="amountInput"
                className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-500"
                min="1"
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 250"
                type="number"
                value={amount}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500" htmlFor="currencySelect">
                Original Currency
              </label>
              <select
                id="currencySelect"
                className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-500"
                onChange={(e) => setCurrency(e.target.value)}
                value={currency}
              >
                <option value="USD">USD ($)</option>
                <option value="INR">INR (₹)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>

            {/* SCREENSHOT IMAGE UPLOAD INPUT */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase text-slate-500" htmlFor="screenshotFileInput">
                Payment Screenshot Image Proof (Required / Recommended)
              </label>
              <div className="mt-1.5 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-4 transition hover:bg-slate-50">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-100 text-blue-700 font-bold text-sm">
                      📷
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">
                        Upload invoice screenshot, platform payout notification, or bank transfer image
                      </p>
                      <p className="text-xs text-slate-500">Supports PNG, JPG, JPEG, WEBP (Max 10MB)</p>
                    </div>
                  </div>
                  <input
                    id="screenshotFileInput"
                    type="file"
                    accept="image/*"
                    className="block w-full sm:w-auto text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                    onChange={handleImageFileChange}
                  />
                </div>

                {screenshotPreview && (
                  <div className="mt-4 flex items-center gap-4 border-t border-slate-200/80 pt-3">
                    <div className="relative group">
                      <img
                        src={screenshotPreview}
                        alt="Payment Proof Preview"
                        className="h-24 w-32 rounded-lg border border-slate-200 object-cover shadow-sm bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setScreenshotPreview(null)}
                        className="absolute -top-2 -right-2 rounded-full bg-rose-600 p-1 text-white hover:bg-rose-700 shadow transition"
                        title="Remove uploaded image"
                      >
                        ✕
                      </button>
                    </div>
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                        ✓ Image Ready for Upload
                      </span>
                      <p className="text-xs text-slate-500 mt-1">
                        Screenshot attached will be displayed to the Institutional Verifier during ledger audit.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase text-slate-500" htmlFor="evidenceInput">
                Proof Reference Note / Payout Reference
              </label>
              <input
                id="evidenceInput"
                className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-500"
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="e.g. Upwork Transaction #928194 or Client Payout Receipt"
                value={evidence}
              />
            </div>

            <div className="sm:col-span-2 pt-2">
              <Button disabled={submitting} type="submit">
                {submitting ? "Submitting Record..." : "Submit Earning with Payment Screenshot"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* INSTITUTIONAL VERIFIER DESK (VISIBLE FOR FACULTY, COORDINATOR, ADMIN) */}
      {isVerifier && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Institutional Earnings Verification Desk</h2>
              <p className="text-xs text-slate-500">
                Review submitted earnings statements, inspect payment screenshot proofs, verify details, or reject with specific feedback remarks.
              </p>
            </div>
            <Badge tone="blue">Authorized Role: {role}</Badge>
          </div>

          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {earningsList.length > 0 ? (
              earningsList.map((entry) => (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-4" key={entry.id}>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{entry.studentId}</span>
                      <span className="text-xs text-slate-500">via</span>
                      <strong className="text-slate-800 text-sm">{entry.platformName}</strong>
                      <Badge
                        tone={
                          entry.verificationStatus === "VERIFIED"
                            ? "green"
                            : entry.verificationStatus === "REJECTED"
                            ? "red"
                            : "amber"
                        }
                      >
                        {entry.verificationStatus}
                      </Badge>
                      {entry.screenshotUrl && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
                          📷 Screenshot Attached
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-slate-700 font-medium">
                      {entry.projectTitle || "Freelance Deliverable"} · Original: <strong>{entry.originalAmount} {entry.originalCurrency}</strong> → Converted: <strong>{formatCurrency(entry.convertedAmount)}</strong>
                    </p>
                    <p className="text-xs text-slate-500">
                      Proof: <span className="italic text-slate-700">{entry.evidence}</span> · Submitted Date: {entry.earningDate}
                    </p>

                    {entry.verificationStatus === "VERIFIED" && (
                      <p className="text-xs text-emerald-700 font-medium">
                        ✓ Verified by {entry.verifiedBy} on {entry.verifiedAt ? formatDate(entry.verifiedAt) : "Date"}
                      </p>
                    )}

                    {entry.verificationStatus === "REJECTED" && (
                      <div className="rounded-lg bg-rose-50 border border-rose-200 p-2 text-xs text-rose-800 mt-1 max-w-xl">
                        <span className="font-semibold">✕ Rejection Remark:</span> "{entry.rejectionReason || "Proof unverified"}"
                        <span className="block text-slate-500 mt-0.5">Logged by {entry.verifiedBy}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      className="text-xs"
                      onClick={() => openInspectionModal(entry)}
                      variant={entry.verificationStatus === "PENDING" ? "primary" : "secondary"}
                    >
                      {entry.verificationStatus === "PENDING" ? "Inspect & Verify Window →" : "View Audit Record →"}
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="p-6 text-center text-xs text-slate-500">
                No pending or historical earnings records found.
              </p>
            )}
          </div>
        </Card>
      )}

      {/* MY EARNINGS HISTORY TABLE (FOR STUDENTS OR GENERAL AUDIT) */}
      <Card className="p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div>
            <h2 className="font-semibold text-slate-950">Earnings Record History</h2>
            <p className="text-xs text-slate-500">
              {role === "STUDENT" ? "Your submitted earning records, verification outcomes, and reviewer feedback." : "Institutional ledger history."}
            </p>
          </div>
          <Badge tone="blue">{earningsList.length} Total Records</Badge>
        </div>

        {earningsList.length > 0 ? (
          <div className="space-y-4">
            <DataTable columns={["Platform & Project", "Original Amount", "Converted (INR)", "Date", "Status", "Proof & Screenshot", "Action"]}>
              {earningsList.map((item) => (
                <tr className={`transition ${item.verificationStatus === "REJECTED" ? "bg-rose-50/40 hover:bg-rose-50" : "hover:bg-slate-50"}`} key={item.id}>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">{item.platformName}</p>
                    <p className="text-xs text-slate-500">{item.projectTitle || "Freelance Project"}</p>
                    {item.verificationStatus === "REJECTED" && (
                      <div className="mt-2 rounded-lg bg-rose-50 border border-rose-200 p-2 text-xs text-rose-800">
                        <p className="font-semibold flex items-center gap-1">
                          <span>✕ Rejection Reason:</span>
                          <span className="font-normal italic">"{item.rejectionReason || "Proof unverified"}"</span>
                        </p>
                        <p className="mt-1 text-slate-600">
                          💡 <strong>How to improve:</strong> Please address the reviewer's feedback above and submit a new record with the corrected screenshot or details.
                        </p>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 font-medium text-slate-800 whitespace-nowrap">
                    {item.originalAmount} {item.originalCurrency}
                  </td>
                  <td className="px-5 py-4 font-bold text-slate-900 whitespace-nowrap">
                    {formatCurrency(item.convertedAmount)}
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-600 whitespace-nowrap">{item.earningDate}</td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <Badge
                      tone={
                        item.verificationStatus === "VERIFIED"
                          ? "green"
                          : item.verificationStatus === "REJECTED"
                          ? "red"
                          : "amber"
                      }
                    >
                      {item.verificationStatus}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      {item.screenshotUrl ? (
                        <button
                          type="button"
                          onClick={() => openInspectionModal(item)}
                          className="group relative block"
                          title="Click to view payment screenshot in full window"
                        >
                          <img
                            src={item.screenshotUrl}
                            alt="Screenshot Proof"
                            className="h-10 w-14 rounded border border-slate-200 object-cover group-hover:ring-2 group-hover:ring-blue-500"
                          />
                        </button>
                      ) : (
                        <span className="text-slate-400 italic">No image</span>
                      )}
                      <span className="max-w-36 truncate" title={item.evidence}>{item.evidence}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right whitespace-nowrap">
                    <button
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                      onClick={() => openInspectionModal(item)}
                      type="button"
                    >
                      View Details →
                    </button>
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>
        ) : (
          <p className="text-center py-6 text-xs text-slate-500">No earnings recorded yet.</p>
        )}
      </Card>

      {/* PROPER VERIFICATION & AUDIT WINDOW MODAL */}
      {inspectingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-6">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  {isVerifier ? "Institutional Verification Audit Window" : "Student Earnings Record Audit"}
                </span>
                <h3 className="text-xl font-bold text-slate-950 mt-1">
                  {inspectingEntry.platformName} Freelance Earning
                </h3>
                <p className="text-xs text-slate-500">Record ID: {inspectingEntry.id} · Student: <strong>{inspectingEntry.studentId}</strong></p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  tone={
                    inspectingEntry.verificationStatus === "VERIFIED"
                      ? "green"
                      : inspectingEntry.verificationStatus === "REJECTED"
                      ? "red"
                      : "amber"
                  }
                >
                  {inspectingEntry.verificationStatus}
                </Badge>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => setInspectingEntry(null)}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Complete Record Information Grid */}
            <div className="grid gap-3 sm:grid-cols-2 rounded-xl bg-slate-50/80 p-4 border border-slate-100 text-xs">
              <div>
                <span className="block text-slate-500 font-medium">Deliverable / Project Title</span>
                <span className="font-semibold text-slate-900 text-sm">{inspectingEntry.projectTitle || "N/A"}</span>
              </div>
              <div>
                <span className="block text-slate-500 font-medium">Platform / Client</span>
                <span className="font-semibold text-slate-900 text-sm">{inspectingEntry.platformName}</span>
              </div>
              <div>
                <span className="block text-slate-500 font-medium">Original Amount Earned</span>
                <span className="font-bold text-slate-900 text-sm">
                  {inspectingEntry.originalAmount} {inspectingEntry.originalCurrency}
                </span>
              </div>
              <div>
                <span className="block text-slate-500 font-medium">Converted Amount (Ledger Standard)</span>
                <span className="font-bold text-blue-700 text-sm">
                  {formatCurrency(inspectingEntry.convertedAmount)} (Rate: {inspectingEntry.exchangeRate})
                </span>
              </div>
              <div>
                <span className="block text-slate-500 font-medium">Transaction Date</span>
                <span className="font-semibold text-slate-800">{inspectingEntry.earningDate}</span>
              </div>
              <div>
                <span className="block text-slate-500 font-medium">Proof Statement / Reference</span>
                <span className="font-semibold text-slate-800">{inspectingEntry.evidence}</span>
              </div>
            </div>

            {/* Payment Screenshot Display Window */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                Uploaded Payment Screenshot Proof
              </h4>
              {inspectingEntry.screenshotUrl ? (
                <div className="rounded-xl border border-slate-200 bg-slate-100/50 p-2 text-center">
                  <img
                    src={inspectingEntry.screenshotUrl}
                    alt="Payment Screenshot Proof"
                    className="mx-auto max-h-72 w-auto rounded-lg object-contain border border-slate-200 bg-white shadow-sm"
                  />
                  <div className="mt-2 text-right">
                    <a
                      href={inspectingEntry.screenshotUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      Open Screenshot Full Size in New Tab ↗
                    </a>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                  No payment screenshot image attached for this record. Proof Reference: "{inspectingEntry.evidence}"
                </div>
              )}
            </div>

            {/* Current Verification Remarks / Feedback Banner */}
            {inspectingEntry.verificationStatus === "VERIFIED" && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-800">
                <p className="font-bold text-sm">✓ Officially Verified & Counted in Student Ledger</p>
                <p className="mt-1">
                  Verified by <strong>{inspectingEntry.verifiedBy}</strong> on {inspectingEntry.verifiedAt ? formatDate(inspectingEntry.verifiedAt) : "Date"}.
                </p>
              </div>
            )}

            {inspectingEntry.verificationStatus === "REJECTED" && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800 space-y-1">
                <p className="font-bold text-sm">✕ Verification Rejected by Institutional Desk</p>
                <p>
                  <strong>Reviewer Remark:</strong> "{inspectingEntry.rejectionReason || "Proof document was insufficient."}"
                </p>
                <p className="text-slate-600">
                  Reviewed by {inspectingEntry.verifiedBy} on {inspectingEntry.verifiedAt ? formatDate(inspectingEntry.verifiedAt) : "Date"}.
                </p>
                <p className="text-slate-700 font-medium pt-1">
                  💡 <strong>Student Guidance:</strong> Please correct the flagged issue in the remark above and submit a new record with clear payment evidence.
                </p>
              </div>
            )}

            {/* Institutional Action & Remarks Section (Visible to Verifiers) */}
            {isVerifier && (
              <div className="border-t border-slate-100 pt-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700" htmlFor="rejectionReasonInput">
                    Verifier Remarks & Reason (Required if Rejecting):
                  </label>
                  <p className="text-xs text-slate-500 mb-2">
                    These remarks will be directly displayed on the student's earnings page so they understand why it was rejected and how to fix it.
                  </p>
                  <textarea
                    id="rejectionReasonInput"
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-slate-800"
                    placeholder="Explain what is wrong (e.g., amount mismatch, blurred screenshot, missing platform transaction id)..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                  />

                  {/* Quick-fill remark suggestion buttons */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="text-[11px] text-slate-400 self-center mr-1">Quick remarks:</span>
                    {quickRemarks.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setRejectionReason(q)}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 transition"
                      >
                        + {q.slice(0, 32)}…
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
                  <Button
                    variant="secondary"
                    onClick={() => setInspectingEntry(null)}
                  >
                    Close Window
                  </Button>
                  <button
                    type="button"
                    className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 transition"
                    disabled={actionLoading === inspectingEntry.id}
                    onClick={() => handleRejectEntry(inspectingEntry.id)}
                  >
                    {actionLoading === inspectingEntry.id ? "Processing..." : "Reject with Remarks"}
                  </button>
                  <Button
                    disabled={actionLoading === inspectingEntry.id}
                    onClick={() => handleApproveEntry(inspectingEntry.id)}
                  >
                    {actionLoading === inspectingEntry.id ? "Processing..." : "Approve & Verify into Ledger"}
                  </Button>
                </div>
              </div>
            )}

            {!isVerifier && (
              <div className="border-t border-slate-100 pt-3 text-right">
                <Button variant="secondary" onClick={() => setInspectingEntry(null)}>
                  Close Window
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProposalsScreen() {
  const { user, getAuthHeaders } = useAuth();
  const [proposalList, setProposalList] = useState<Proposal[]>(proposals);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState("");
  const [opportunityId, setOpportunityId] = useState("opp-1024");
  const [studentName, setStudentName] = useState(user?.name || "Maya Chen");
  const [value, setValue] = useState("18000");
  const [status, setStatus] = useState<"DRAFT" | "IN_REVIEW" | "APPROVED" | "SUBMITTED">("IN_REVIEW");

  const loadProposals = async () => {
    try {
      const res = await fetch(`${API_BASE}/proposals`);
      if (res.ok) {
        const json = await res.json();
        if (json?.data && Array.isArray(json.data) && json.data.length > 0) {
          const apiIds = new Set(json.data.map((p: Proposal) => p.id));
          const combined = [
            ...json.data,
            ...proposals.filter((p) => !apiIds.has(p.id)),
          ];
          setProposalList(combined);
          return;
        }
      }
    } catch {}
  };

  useEffect(() => {
    loadProposals();
  }, []);

  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !studentName) {
      alert("Please enter proposal title and student name.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/proposals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          title,
          studentName,
          opportunityId,
          author: user?.name || studentName,
          status,
          value: Number(value) || 0,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to create proposal.");

      setProposalList((prev) => [json.data, ...prev]);
      setNotice(`Proposal "${json.data.title}" successfully created!`);
      setIsModalOpen(false);
      setTitle("");
      setValue("18000");
    } catch (err: any) {
      alert(err.message || "Could not create proposal.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Placement Operations"
        title="Institutional Proposals"
        description="Track proposal drafts, editorial reviews, and submission status across student engagements."
        action={
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            <IconPlus size={16} />
            <span>New Proposal</span>
          </Button>
        }
      />

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <IconCheckCircle size={16} />
            {notice}
          </span>
          <button onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-900 font-bold">✕</button>
        </div>
      )}

      <Card className="overflow-hidden border-[#E6E6E6] bg-white shadow-card">
        <DataTable columns={["Proposal", "Student", "Submitted", "Value", "Status"]}>
          {proposalList.map((proposal) => (
            <tr className="transition hover:bg-[#F7F7F6]/80" key={proposal.id}>
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FC] text-[#3978B8]">
                    <IconProposals size={18} />
                  </span>
                  <div>
                    <p className="font-bold text-[#30343B]">{proposal.title}</p>
                    <p className="mt-0.5 text-xs text-[#666D7A]">{proposal.opportunityId}</p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-4 text-xs font-semibold text-[#666D7A]">{proposal.studentName}</td>
              <td className="px-5 py-4 text-xs text-[#666D7A]">
                {proposal.submittedAt ? formatDate(proposal.submittedAt) : "Not submitted"}
              </td>
              <td className="px-5 py-4 font-bold text-[#30343B]">
                {formatCurrency(proposal.value)}
              </td>
              <td className="px-5 py-4">
                <StatusBadge status={proposal.status} />
              </td>
            </tr>
          ))}
        </DataTable>
      </Card>

      {/* CREATE PROPOSAL MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#30343B]/60 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-[#E6E6E6]">
            <div className="flex items-center justify-between border-b border-[#E6E6E6] pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#3978B8]">Placement & Proposals</span>
                <h2 className="text-lg font-bold text-[#30343B] mt-0.5">Create New Proposal</h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-[#666D7A] hover:bg-[#F7F7F6] hover:text-[#30343B] transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateProposal} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="propTitle">
                  Proposal Title *
                </label>
                <input
                  id="propTitle"
                  required
                  className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                  placeholder="e.g. Discovery & UX Design Proposal"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="propStudent">
                    Student Name *
                  </label>
                  <input
                    id="propStudent"
                    required
                    className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                    placeholder="e.g. Maya Chen"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="propOpp">
                    Opportunity ID
                  </label>
                  <input
                    id="propOpp"
                    className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                    placeholder="e.g. opp-1024"
                    value={opportunityId}
                    onChange={(e) => setOpportunityId(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="propValue">
                    Proposal Value (INR ₹)
                  </label>
                  <input
                    id="propValue"
                    type="number"
                    min="0"
                    className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                    placeholder="e.g. 18000"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1" htmlFor="propStatus">
                    Workflow Status
                  </label>
                  <select
                    id="propStatus"
                    className="w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="IN_REVIEW">IN_REVIEW</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="SUBMITTED">SUBMITTED</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#E6E6E6] pt-4">
                <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={submitting}>
                  {submitting ? "Creating…" : "Create Proposal"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function SafeguardsScreen() {
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Institutional Governance"
        title="Academic Safeguards & Gates"
        description="A structured framework for student wellbeing, CGPA preservation, hour-caps, and exam blackout enforcement."
      />
      <div className="grid gap-5 lg:grid-cols-3">
        {safeguards.map((safeguard) => (
          <Card className="p-5 flex flex-col justify-between hover:border-[#D1D5DB] transition" key={safeguard.id}>
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF6FC] text-[#3978B8] border border-[#C2DCF2]">
                    <IconSafeguards size={16} />
                  </span>
                  <h2 className="font-bold text-[#30343B] text-sm">{safeguard.name}</h2>
                </div>
                <StatusBadge status={safeguard.status} />
              </div>
              <p className="mt-3 text-xs leading-5 text-[#666D7A]">{safeguard.description}</p>
            </div>
            <dl className="mt-6 space-y-2 border-t border-[#E6E6E6] pt-3 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-[#8C93A0] font-semibold">Governance Owner</dt>
                <dd className="font-bold text-[#30343B]">{safeguard.owner}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#8C93A0] font-semibold">Last Checked</dt>
                <dd className="font-semibold text-[#666D7A]">{formatDate(safeguard.lastCheckedAt)}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>
      <Card className="p-5 border-[#E6E6E6] bg-[#FEF6EE]/40">
        <h2 className="font-bold text-[#30343B] text-sm">Automated Institutional Policy Gates</h2>
        <p className="mt-1 text-xs leading-5 text-[#666D7A]">
          Work allocations and bid submissions run continuous automated checks against institutional policies: CGPA gates (minimum 7.5 requirement), 20-hour maximum weekly workload caps, and mandatory blackout freeze during midterm and final examination windows.
        </p>
      </Card>
    </div>
  );
}

export function AnalyticsScreen() {
  const { user, getAuthHeaders, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<AnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const headers = getAuthHeaders();
      const res = await fetch(`${API_BASE}/analytics`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          setData(json.data);
        }
      } else if (res.status === 401) {
        setError("Authentication required to view institutional analytics.");
      } else {
        const json = await res.json().catch(() => null);
        setError(json?.message || "Unable to fetch analytics.");
      }
    } catch {
      setError("Network error connecting to analytics service.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      loadAnalytics();
    }
  }, [authLoading]);

  const activityList = data?.weeklyActivity || [];
  const maxValue = Math.max(1, ...activityList.map((item) => item.value));
  const totalWeeklyActions = activityList.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Executive Institutional Reporting"
        title="Programme Analytics"
        description="Dynamic institutional metrics computed directly from learner workflow, allocations, and verified ledger events."
      />

      {!user && !authLoading && (
        <Card className="p-4 bg-[#FEF6EE] border-[#FBD7B3] text-[#30343B] text-sm flex items-center justify-between">
          <span>You are viewing in guest mode. Sign in to view live authenticated analytics.</span>
          <Link className="font-bold text-[#C27803] hover:underline" href="/login">
            Sign In →
          </Link>
        </Card>
      )}

      {error && (
        <Card className="p-4 bg-rose-50 border-rose-200 text-rose-800 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button className="text-xs px-2.5 py-1" onClick={loadAnalytics} variant="secondary">
            Retry
          </Button>
        </Card>
      )}

      {/* Top Aggregate Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          detail="Allocated in active client work"
          label="Placement Rate"
          trend="positive"
          accent="blue"
          icon={<IconUserCheck size={18} />}
          value={loading ? "…" : data ? `${data.placementRate}%` : "0%"}
        />
        <StatCard
          detail="Submitted proposals accepted"
          label="Proposal Win Rate"
          trend="positive"
          accent="orange"
          icon={<IconProposals size={18} />}
          value={loading ? "…" : data ? `${data.proposalWinRate}%` : "0%"}
        />
        <StatCard
          detail="Median client response SLA"
          label="SLA Response Time"
          accent="emerald"
          icon={<IconClock size={18} />}
          value={
            loading
              ? "…"
              : data?.averageResponseHours !== null && data?.averageResponseHours !== undefined
              ? `${data.averageResponseHours}h`
              : "N/A"
          }
        />
        <StatCard
          detail="Institutional benchmark: 4.5/5"
          label="Learner Satisfaction"
          accent="amber"
          icon={<IconGraduationCap size={18} />}
          value={
            loading
              ? "…"
              : data?.learnerSatisfaction !== null && data?.learnerSatisfaction !== undefined
              ? `${data.learnerSatisfaction}/5`
              : "N/A"
          }
        />
      </div>

      {/* Activity & Cohort Tier Breakdown */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Weekly Activity Bar Chart */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold text-[#30343B] text-base">Learner Activity Timeline</h2>
              <p className="mt-0.5 text-xs text-[#666D7A]">
                Workflow action events (bids, proposals, allocations, and earnings submissions) recorded this week.
              </p>
            </div>
            <Badge tone="orange">{totalWeeklyActions} Actions Logged</Badge>
          </div>

          <div className="mt-8 flex h-52 items-end justify-between gap-3 border-b border-[#E6E6E6] pb-2">
            {activityList.map((item) => {
              const isPeak = item.value === maxValue && item.value > 0;
              return (
                <div className="flex flex-1 flex-col items-center gap-2 h-full justify-end" key={item.label}>
                  <span className="text-[11px] font-bold text-[#30343B]">{item.value}</span>
                  <span
                    className={`w-full max-w-14 rounded-t-md transition-all duration-300 ${
                      isPeak ? "bg-[#F2A65A]" : "bg-[#3978B8]"
                    }`}
                    style={{
                      height: `${item.value > 0 ? (item.value / maxValue) * 100 : 4}%`,
                      minHeight: item.value > 0 ? "16px" : "4px",
                    }}
                    title={`${item.value} actions on ${item.date || item.label}`}
                  />
                  <span className="text-xs font-bold text-[#666D7A]">{item.label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-[#8C93A0]">
            <span>Monday</span>
            <span className="font-semibold text-[#666D7A]">Current Monday–Sunday Working Window</span>
            <span>Sunday</span>
          </div>
        </Card>

        {/* Students by Tier Distribution */}
        <Card className="p-6">
          <div className="flex items-center justify-between border-b border-[#E6E6E6] pb-3 mb-4">
            <div>
              <h2 className="font-bold text-[#30343B] text-base">Cohort by Tier</h2>
              <p className="text-xs text-[#666D7A]">Enrolled student tier distribution</p>
            </div>
            <Badge tone="blue">
              {data?.studentsByTier ? data.studentsByTier.reduce((acc, curr) => acc + curr.count, 0) : 0} Total
            </Badge>
          </div>

          <div className="space-y-4">
            {data?.studentsByTier && data.studentsByTier.length > 0 ? (
              data.studentsByTier.map((t) => {
                const totalStudents = data.studentsByTier.reduce((acc, curr) => acc + curr.count, 0);
                const pct = totalStudents > 0 ? Math.round((t.count / totalStudents) * 100) : 0;
                return (
                  <div className="space-y-1.5" key={t.tier}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#30343B]">{t.tier.replace("_", " ")}</span>
                      <span className="text-[#666D7A]">
                        <strong className="text-[#30343B]">{t.count}</strong> ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#E6E6E6] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#3978B8] transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-4 text-center text-xs text-[#8C93A0]">No tier distribution data available.</p>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] p-3 text-xs leading-5 text-[#666D7A]">
            Official tier progression is audited strictly through student training completion and verified earnings.
          </div>
        </Card>
      </div>

      {/* Institutional Privacy & Double-Counting Safeguards Note */}
      <Card className="p-5 bg-white border-[#E6E6E6] shadow-card">
        <div className="flex items-center gap-2">
          <span className="text-[#3978B8]">
            <IconCheckCircle size={18} />
          </span>
          <h3 className="text-sm font-bold text-[#30343B]">Privacy Safeguards & Double-Counting Protection</h3>
        </div>
        <p className="mt-2 text-xs leading-5 text-[#666D7A]">
          In strict compliance with institutional safeguards, all analytics metrics represent aggregate macro data.
          Individual student earnings are private, and public leaderboards are prohibited. Financial metrics only
          include officially verified records from the institutional ledger to prevent double-counting.
        </p>
      </Card>
    </div>
  );
}

export function SettingsScreen() {
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Administration"
        title="Institutional Settings"
        description="Configure organization defaults, notification email routing, and digest automation preferences."
      />
      <Card className="max-w-3xl p-6">
        <form className="space-y-5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]" htmlFor="organization-name">
              Organization Name
            </label>
            <input
              className="mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-white px-3.5 py-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
              defaultValue={settings.organizationName}
              id="organization-name"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]" htmlFor="notification-email">
              Notification Email
            </label>
            <input
              className="mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-white px-3.5 py-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
              defaultValue={settings.notificationEmail}
              id="notification-email"
              type="email"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]" htmlFor="timezone">
              Institutional Timezone
            </label>
            <select
              className="mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-white px-3.5 py-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
              defaultValue={settings.timezone}
              id="timezone"
            >
              <option>Asia/Kolkata (IST)</option>
              <option>Europe/London (GMT)</option>
              <option>America/New_York (EST)</option>
            </select>
          </div>
          <label className="flex items-center justify-between rounded-xl border border-[#E6E6E6] bg-[#F7F7F6]/50 px-4 py-3 cursor-pointer">
            <span>
              <span className="block text-sm font-bold text-[#30343B]">Weekly Operations Digest</span>
              <span className="mt-0.5 block text-xs text-[#666D7A]">Receive executive operational summary and risk notifications by email.</span>
            </span>
            <input
              className="h-4 w-4 accent-[#F2A65A]"
              defaultChecked={settings.weeklyDigestEnabled}
              type="checkbox"
            />
          </label>
          <div className="pt-2">
            <Button variant="primary" type="button">
              Save Institutional Changes
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
