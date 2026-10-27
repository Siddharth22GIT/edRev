"use client";

import { useEffect, useState } from "react";
import { can, type EarningsEntry } from "@edurev/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { celebrate } from "@/lib/celebrate";
import { formatCurrency, formatDate } from "@/lib/format";
import { useQuickAction } from "@/lib/quick-actions";
import { useToast } from "@/lib/toast";
import { useWorkQueue } from "@/lib/work-queue";
import { IconEarnings } from "@/components/ui/icons";

type EarningsTab = "submit" | "records" | "verify" | "history";

export function EarningsScreen() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
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
  const isVerifier = can(role, "EARNINGS_VERIFY");
  const isStudent = role === "STUDENT";
  const canViewLedger = isStudent || can(role, "EARNINGS_VIEW_ALL");
  const { toast } = useToast();
  const workQueue = useWorkQueue();

  // One focused view at a time instead of every section stacked on one page
  const tabs: { id: EarningsTab; label: string }[] = isStudent
    ? [
        { id: "submit", label: "Log an earning" },
        { id: "records", label: "My records" },
      ]
    : isVerifier
      ? [
          { id: "verify", label: "To verify" },
          { id: "history", label: "History" },
        ]
      : [{ id: "history", label: "History" }];
  const [tab, setTab] = useState<EarningsTab>(() => {
    if (typeof window !== "undefined") {
      const requested = new URLSearchParams(window.location.search).get("tab");
      if (tabs.some((t) => t.id === requested)) return requested as EarningsTab;
    }
    return tabs[0].id;
  });
  useQuickAction("new-earning", () => {
    if (isStudent) setTab("submit");
  });
  const pendingEntries = earningsList.filter((e) => e.verificationStatus === "PENDING");

  const loadData = async () => {
    try {
      const res = await apiFetch("/earnings");
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
      const res = await apiFetch("/earnings", {
        method: "POST",
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
      toast("Earning submitted. It is now pending verification.");
      setTab("records");
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
      const res = await apiFetch(`/earnings/${id}/verify`, {
        method: "PATCH",
        body: JSON.stringify({ status: "VERIFIED" }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to verify entry.");

      setNotice({ msg: `Earnings record ${id} successfully verified and credited into the student ledger.` });
      toast("Earning verified and credited.");
      celebrate();
      setInspectingEntry(null);
      setRejectionReason("");
      await loadData();
      workQueue.refresh();
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
      const res = await apiFetch(`/earnings/${id}/verify`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "REJECTED",
          rejectionReason: rejectionReason.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to reject entry.");

      setNotice({ msg: `Record ${id} marked as REJECTED with feedback logged for the student.` });
      toast("Earning rejected with feedback for the student.", "info");
      setInspectingEntry(null);
      setRejectionReason("");
      await loadData();
      workQueue.refresh();
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

      {!canViewLedger ? (
        <EmptyState
          description="Earnings are recorded by students and verified by faculty, coordinators and deans. Nothing here needs your role."
          icon={<IconEarnings size={22} />}
          title="Earnings aren't part of your role"
        />
      ) : (
      <>
      {/* SUMMARY STRIP */}
      <Card className="grid grid-cols-3 divide-x divide-[#E6E6E6]">
        <div className="p-4">
          <p className="text-xs font-semibold text-[#666D7A]">Verified</p>
          <p className="mt-0.5 text-lg font-extrabold text-emerald-700 sm:text-xl">{formatCurrency(summary.totalVerified)}</p>
        </div>
        <div className="p-4">
          <p className="text-xs font-semibold text-[#666D7A]">Pending</p>
          <p className="mt-0.5 text-lg font-extrabold text-[#C27803] sm:text-xl">{formatCurrency(summary.totalPending)}</p>
        </div>
        <div className="p-4">
          <p className="text-xs font-semibold text-[#666D7A]">Rejected</p>
          <p className="mt-0.5 text-lg font-extrabold text-rose-700 sm:text-xl">{formatCurrency(summary.totalRejected)}</p>
        </div>
      </Card>

      {tabs.length > 1 && (
        <div className="inline-flex rounded-xl border border-[#E6E6E6] bg-white p-1 shadow-card" role="tablist">
          {tabs.map((t) => {
            const count = t.id === "verify" ? pendingEntries.length : t.id === "records" ? earningsList.length : 0;
            return (
              <button
                aria-selected={tab === t.id}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${
                  tab === t.id ? "bg-[#FEF6EE] text-[#30343B] ring-1 ring-[#FBD7B3]" : "text-[#666D7A] hover:text-[#30343B]"
                }`}
                key={t.id}
                onClick={() => setTab(t.id)}
                role="tab"
                type="button"
              >
                {t.label}
                {count > 0 && (
                  <span className={`rounded-full px-1.5 text-[11px] ${t.id === "verify" ? "bg-[#F2A65A] text-[#30343B]" : "bg-[#F7F7F6] text-[#666D7A]"}`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

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
      {isStudent && tab === "submit" && (
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

      {/* INSTITUTIONAL VERIFIER DESK: only records still waiting for a decision (all records are under History) */}
      {isVerifier && tab === "verify" && (
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
            {loading ? (
              <SkeletonRows rows={3} />
            ) : pendingEntries.length > 0 ? (
              pendingEntries.map((entry) => (
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
              <p className="p-6 text-center text-sm text-slate-500">
                All clear: nothing is waiting for verification. Past decisions are under <strong>History</strong>.
              </p>
            )}
          </div>
        </Card>
      )}

      {/* MY EARNINGS HISTORY TABLE (FOR STUDENTS OR GENERAL AUDIT) */}
      {(tab === "records" || tab === "history") && (
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
        ) : loading ? (
          <SkeletonRows rows={3} />
        ) : (
          <p className="text-center py-6 text-xs text-slate-500">No earnings recorded yet.</p>
        )}
      </Card>
      )}
      </>
      )}

      {/* PROPER VERIFICATION & AUDIT WINDOW MODAL */}
      {inspectingEntry && (
        <div className="fixed inset-0 z-50 !mt-0 flex justify-end bg-slate-950/50 backdrop-blur-sm" onMouseDown={() => setInspectingEntry(null)}>
          {/* Side panel: details, screenshot and verifier actions slide in from the right */}
          <div
            className="drawer-in relative h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl space-y-6"
            onMouseDown={(e) => e.stopPropagation()}
          >
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
