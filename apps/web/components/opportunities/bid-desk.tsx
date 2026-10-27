"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { can, type Allocation, type Bid, type Opportunity } from "@edurev/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { celebrate } from "@/lib/celebrate";
import { useWorkQueue } from "@/lib/work-queue";
import { formatDate } from "@/lib/format";
import {
  IconBriefcase,
  IconFileText,
  IconCheckCircle,
  IconAlertTriangle,
  IconArrowRight,
  IconSend,
  IconClock,
  IconUserCheck,
} from "@/components/ui/icons";

export function BidDesk({ opportunity }: { opportunity: Opportunity }) {
  const { user } = useAuth();
  const { apiFetch, fetchBlobUrl } = useApi();
  const workQueue = useWorkQueue();
  const [bids, setBids] = useState<Bid[]>([]);
  const [allocation, setAllocation] = useState<Allocation | null>(null);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [amount, setAmount] = useState(String(opportunity.budget));
  const [days, setDays] = useState("7 days");
  const [skills, setSkills] = useState("");
  const [notice, setNotice] = useState("");

  // Proposal PDF upload state
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfFileSize, setPdfFileSize] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Reviewing bid modal state
  const [reviewingBid, setReviewingBid] = useState<Bid | null>(null);

  // Preview info state for the modal
  const [previewInfo, setPreviewInfo] = useState<{
    blobUrl: string;
    isPdf: boolean;
    isDocx: boolean;
    resolvedName: string;
  } | null>(null);
  // Authenticated object URL for the inline PDF preview of the bid under review
  const [previewFrameUrl, setPreviewFrameUrl] = useState<string | null>(null);

  const proposalPath = (bidId: string, disposition: "inline" | "attachment") =>
    `/opportunities/${opportunity.id}/bids/${bidId}/proposal?disposition=${disposition}`;

  function parseFileFromDataUrl(dataUrl: string, fallbackName = "proposal.pdf") {
    const cleanFallback = fallbackName.replace(/\s+\./g, ".").trim().replace(/[/\\?%*:|"<>]/g, "_");
    if (!dataUrl) return { blob: null, blobUrl: "", isPdf: false, isDocx: false, resolvedName: cleanFallback };

    if (!dataUrl.startsWith("data:")) {
      const isDoc = cleanFallback.toLowerCase().endsWith(".docx") || cleanFallback.toLowerCase().endsWith(".doc");
      return { blob: null, blobUrl: dataUrl, isPdf: !isDoc, isDocx: isDoc, resolvedName: cleanFallback };
    }

    try {
      const parts = dataUrl.split(",");
      const base64 = parts[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const isDocx = binary.startsWith("PK\x03\x04");
      const isPdf = binary.startsWith("%PDF");

      let mime = parts[0].match(/:(.*?);/)?.[1] || "application/pdf";
      let resolvedName = cleanFallback;

      if (isDocx) {
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (!resolvedName.toLowerCase().endsWith(".docx")) {
          resolvedName = resolvedName.replace(/\.[^/.]+$/, "") + ".docx";
        }
      } else if (isPdf) {
        mime = "application/pdf";
        if (!resolvedName.toLowerCase().endsWith(".pdf")) {
          resolvedName = resolvedName.replace(/\.[^/.]+$/, "") + ".pdf";
        }
      }

      const blob = new Blob([bytes], { type: mime });
      const blobUrl = URL.createObjectURL(blob);

      return { blob, blobUrl, isPdf: isPdf || (!isDocx && mime === "application/pdf"), isDocx, resolvedName };
    } catch (err) {
      console.error("Failed to parse data URL:", err);
      return { blob: null, blobUrl: dataUrl, isPdf: true, isDocx: false, resolvedName: cleanFallback };
    }
  }

  const handleDownloadPdf = (dataUrl: string, rawFilename?: string, bidderId?: string, bidId?: string) => {
    const targetBidId = bidId || bidderId;
    if (opportunity?.id && targetBidId) {
      fetchBlobUrl(proposalPath(targetBidId, "attachment"))
        .then(({ url, filename }) => {
          const link = document.createElement("a");
          link.href = url;
          link.download = filename || (rawFilename || "proposal.pdf").replace(/\s+\./g, ".").trim();
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        })
        .catch((err) => {
          setState("error");
          setNotice(err instanceof Error ? err.message : "Unable to download proposal.");
        });
      return;
    }

    const fallback = (rawFilename || `proposal-${bidderId || "document"}.pdf`).replace(/\s+\./g, ".").trim();
    const { blob, blobUrl, resolvedName } = parseFileFromDataUrl(dataUrl, fallback);

    const url = blobUrl || dataUrl;
    const link = document.createElement("a");
    link.href = url;
    link.download = resolvedName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (blob) {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    }
  };

  const handleOpenInTab = (dataUrl: string, rawFilename?: string, bidId?: string) => {
    const fallback = (rawFilename || "proposal.pdf").replace(/\s+\./g, ".").trim();
    const { isDocx } = parseFileFromDataUrl(dataUrl, fallback);

    if (isDocx) {
      handleDownloadPdf(dataUrl, rawFilename, undefined, bidId);
      return;
    }

    if (opportunity?.id && bidId) {
      // Open the tab synchronously (avoids popup blockers), then point it at the authenticated document.
      const tab = window.open("", "_blank");
      fetchBlobUrl(proposalPath(bidId, "inline"))
        .then(({ url }) => {
          if (tab) tab.location.href = url;
          else window.open(url, "_blank");
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        })
        .catch((err) => {
          tab?.close();
          setState("error");
          setNotice(err instanceof Error ? err.message : "Unable to open proposal.");
        });
      return;
    }

    const { blobUrl } = parseFileFromDataUrl(dataUrl, fallback);
    const url = blobUrl || dataUrl;
    window.open(url, "_blank");
  };

  useEffect(() => {
    if (reviewingBid?.proposalPdfUrl) {
      const info = parseFileFromDataUrl(
        reviewingBid.proposalPdfUrl,
        reviewingBid.proposalPdfName || `proposal-${reviewingBid.studentId}.pdf`
      );
      setPreviewInfo(info);
      return () => {
        if (info.blobUrl && info.blobUrl.startsWith("blob:")) {
          URL.revokeObjectURL(info.blobUrl);
        }
      };
    } else {
      setPreviewInfo(null);
    }
  }, [reviewingBid]);

  useEffect(() => {
    setPreviewFrameUrl(null);
    if (!reviewingBid?.proposalPdfUrl || !opportunity?.id || previewInfo?.isDocx) return;

    let objectUrl: string | null = null;
    let cancelled = false;
    fetchBlobUrl(proposalPath(reviewingBid.id || reviewingBid.studentId, "inline"))
      .then(({ url }) => {
        objectUrl = url;
        if (cancelled) URL.revokeObjectURL(url);
        else setPreviewFrameUrl(url);
      })
      .catch(() => {
        // Fall back to the locally decoded copy of the document
        if (!cancelled && previewInfo?.blobUrl) setPreviewFrameUrl(previewInfo.blobUrl);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [reviewingBid, previewInfo?.isDocx]);

  const role = user?.role || "STUDENT";
  const studentId = user?.studentId || user?.id || "stu-202";
  const mine = bids.some((b) => b.studentId === studentId);
  const canAllocate = can(role, "OPPORTUNITY_ALLOCATE");

  const loadData = async () => {
    try {
      const [bidsRes, allocRes] = await Promise.all([
        apiFetch(`/opportunities/${opportunity.id}/bids`),
        apiFetch(`/opportunities/${opportunity.id}/allocation`),
      ]);

      if (bidsRes.ok) {
        const bidsJson = await bidsRes.json();
        setBids(bidsJson.data ?? []);
      }

      if (allocRes.ok) {
        const allocJson = await allocRes.json();
        setAllocation(allocJson.data ?? null);
      }
    } catch {
      setNotice("API is currently offline. Viewing in offline mode.");
    }
  };

  useEffect(() => {
    loadData();
  }, [opportunity.id]);

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPdfError(null);
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
        setPdfError("Please upload a valid PDF document (.pdf).");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setPdfError("PDF file size must be less than 10MB.");
        return;
      }
      const cleanFileName = file.name.replace(/\s+\./g, ".").trim().replace(/[/\\?%*:|"<>]/g, "_");
      const sizeStr = (file.size / (1024 * 1024)).toFixed(2) + " MB";
      const reader = new FileReader();
      reader.onloadend = () => {
        setPdfDataUrl(reader.result as string);
        setPdfFileName(cleanFileName);
        setPdfFileSize(sizeStr);
      };
      reader.readAsDataURL(file);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setState("error");
      setNotice("Please sign in as a Student to submit a bid.");
      return;
    }
    if (!amount || !days || !message || !skills) {
      setState("error");
      setNotice("Complete every bid field before submitting.");
      return;
    }
    setState("loading");
    try {
      const r = await apiFetch(`/opportunities/${opportunity.id}/bids`, {
        method: "POST",
        body: JSON.stringify({
          proposedAmount: Number(amount),
          estimatedCompletionTime: days,
          message,
          relevantSkills: skills,
          proposalPdfUrl: pdfDataUrl || undefined,
          proposalPdfName: pdfFileName || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);
      setBids((x) => [...x, j.data]);
      setState("success");
      setNotice("Bid and proposal submitted successfully.");
      celebrate();
      setPdfDataUrl(null);
      setPdfFileName(null);
      setPdfFileSize(null);
      setPdfError(null);
    } catch (e) {
      setState("error");
      setNotice(e instanceof Error ? e.message : "Unable to submit bid.");
    }
  };

  const allocate = async (bidderStudentId: string) => {
    if (!user) {
      setState("error");
      setNotice("Please sign in as a Bid Desk Analyst to allocate work.");
      return;
    }
    setState("loading");
    try {
      const r = await apiFetch(`/opportunities/${opportunity.id}/allocate`, {
        method: "POST",
        body: JSON.stringify({
          studentId: bidderStudentId,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);

      setState("success");
      setNotice(`Opportunity successfully allocated to Student ${bidderStudentId}.`);
      celebrate();
      await loadData();
      workQueue.refresh();
    } catch (e) {
      setState("error");
      setNotice(e instanceof Error ? e.message : "Allocation blocked.");
    }
  };

  return (
    <div id="bid-desk-section" className="space-y-6">
      {/* SLA Persistent Tracking Display Card if Allocated */}
      {allocation && (
        <Card className="border-[#C2DCF2] bg-[#EFF6FC]/70 p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#C2DCF2]/70 pb-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3978B8] text-white">
                <IconClock size={18} />
              </span>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#3978B8]">Active SLA Commitment</span>
                <h3 className="mt-0.5 text-lg font-bold text-[#30343B]">Work Allocation & SLA Tracking</h3>
              </div>
            </div>
            <Badge tone={allocation.slaStatus === "OVERDUE" ? "red" : allocation.slaStatus === "AT_RISK" ? "amber" : "green"}>
              SLA Status: {allocation.slaStatus || "ACTIVE"}
            </Badge>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="rounded-xl border border-[#C2DCF2]/50 bg-white/70 p-3">
              <span className="block text-[#666D7A] font-medium">Assigned Student</span>
              <span className="mt-0.5 block font-bold text-[#30343B] text-sm">{allocation.studentId}</span>
            </div>
            <div className="rounded-xl border border-[#C2DCF2]/50 bg-white/70 p-3">
              <span className="block text-[#666D7A] font-medium">Allocated By</span>
              <span className="mt-0.5 block font-bold text-[#30343B] text-sm">{allocation.allocatedBy}</span>
            </div>
            <div className="rounded-xl border border-[#C2DCF2]/50 bg-white/70 p-3">
              <span className="block text-[#666D7A] font-medium">Allocated At</span>
              <span className="mt-0.5 block font-bold text-[#30343B] text-sm">{formatDate(allocation.allocatedAt)}</span>
            </div>
            <div className="rounded-xl border border-[#C2DCF2]/50 bg-white/70 p-3">
              <span className="block text-[#666D7A] font-medium">SLA Target Deadline</span>
              <span className="mt-0.5 block font-bold text-[#3978B8] text-sm">{allocation.slaDeadline ? formatDate(allocation.slaDeadline) : "72 hours"}</span>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6 border-[#E6E6E6] bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E6E6] pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FEF6EE] text-[#C27803] ring-1 ring-[#F2A65A]/30">
              <IconBriefcase size={20} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-[#30343B]">Opportunity Bid Desk</h2>
              <p className="mt-0.5 text-xs text-[#666D7A]">
                {user ? (
                  <span>Authenticated Session: <strong className="text-[#30343B]">{user.name}</strong></span>
                ) : (
                  <span>Public View Mode. <Link className="font-bold text-[#3978B8] hover:underline" href="/login">Sign in</Link> to bid or allocate.</span>
                )}
              </p>
            </div>
          </div>
          {user && (
            <span className="rounded-full bg-[#FEF6EE] px-3 py-1 text-xs font-bold text-[#C27803] border border-[#F2A65A]/40">
              Role: {user.role}
            </span>
          )}
        </div>

        {notice && (
          <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold flex items-center gap-2 ${state === "error" ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {state === "error" ? <IconAlertTriangle size={18} /> : <IconCheckCircle size={18} />}
            <span>{notice}</span>
          </div>
        )}

        {/* STUDENT BID FORM */}
        {role === "STUDENT" ? (
          <form className="mt-6 grid gap-4" onSubmit={submit}>
            {mine ? (
              <div className="rounded-xl border border-amber-200 bg-[#FEF6EE] p-4 text-sm font-semibold text-[#C27803] flex items-center gap-2">
                <IconCheckCircle size={18} />
                <span>You have already submitted a bid for this opportunity.</span>
              </div>
            ) : opportunity.status === "ALLOCATED" ? (
              <div className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6] p-4 text-sm font-medium text-[#666D7A]">
                This opportunity has already been allocated to a student.
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]" htmlFor="proposedAmount">
                      Proposed Amount ({opportunity.currency})
                    </label>
                    <input
                      id="proposedAmount"
                      className="mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                      min="1"
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="e.g. 18000"
                      type="number"
                      value={amount}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]" htmlFor="estimatedCompletionTime">
                      Estimated Delivery Time
                    </label>
                    <input
                      id="estimatedCompletionTime"
                      className="mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                      onChange={(e) => setDays(e.target.value)}
                      placeholder="e.g. 7 days"
                      value={days}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]" htmlFor="relevantSkills">
                    Relevant Skills & Tools
                  </label>
                  <input
                    id="relevantSkills"
                    className="mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                    onChange={(e) => setSkills(e.target.value)}
                    placeholder="e.g. Figma, User Interviews, React"
                    value={skills}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A]" htmlFor="bidMessage">
                    Cover Message / Delivery Proposal
                  </label>
                  <textarea
                    id="bidMessage"
                    className="mt-1.5 w-full rounded-xl border border-[#E6E6E6] bg-white p-2.5 text-sm text-[#30343B] outline-none transition focus:border-[#3978B8] focus:ring-2 focus:ring-[#C2DCF2]"
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Explain why you are a great fit for this client project..."
                    rows={3}
                    value={message}
                  />
                </div>

                {/* PDF PROPOSAL UPLOAD */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-1.5">
                    Proposal Document (PDF)
                  </label>
                  {pdfDataUrl ? (
                    <div className="flex items-center justify-between rounded-xl border border-[#C2DCF2] bg-[#EFF6FC]/80 p-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#3978B8] text-white font-bold text-xs shadow-sm">
                          <IconFileText size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#30343B]">{pdfFileName}</p>
                          <p className="text-xs text-[#666D7A]">{pdfFileSize} · Ready for submission</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPdfDataUrl(null);
                          setPdfFileName(null);
                          setPdfFileSize(null);
                        }}
                        className="rounded-lg px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-100 transition"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl border-2 border-dashed border-[#E6E6E6] bg-[#F7F7F6]/60 p-4 transition hover:bg-[#F7F7F6]">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#FEF6EE] text-[#C27803] font-bold text-sm">
                            <IconFileText size={20} />
                          </span>
                          <div>
                            <p className="text-xs font-bold text-[#30343B]">
                              Upload Project Proposal Document (PDF)
                            </p>
                            <p className="text-xs text-[#666D7A]">Supports PDF format up to 10MB (detailed scope, timeline, deliverables)</p>
                          </div>
                        </div>
                        <input
                          id="proposalPdfInput"
                          type="file"
                          accept="application/pdf"
                          className="block w-full sm:w-auto text-xs text-[#666D7A] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#3978B8] file:text-white hover:file:bg-[#2F659C] cursor-pointer"
                          onChange={handlePdfUpload}
                        />
                      </div>
                    </div>
                  )}
                  {pdfError && <p className="mt-1.5 text-xs font-semibold text-rose-600">{pdfError}</p>}
                </div>

                <div className="pt-2">
                  <Button variant="primary" disabled={state === "loading"} type="submit">
                    <IconSend size={16} />
                    <span>{state === "loading" ? "Submitting Bid…" : "Submit Bid to Opportunity"}</span>
                  </Button>
                </div>
              </>
            )}
          </form>
        ) : (
          /* ANALYST / ADMIN BID REVIEW & ALLOCATION BOARD */
          <div className="mt-6 space-y-4">
            <h3 className="font-bold text-[#30343B] text-base">Submitted Student Bids ({bids.length})</h3>
            {bids.length ? (
              <div className="divide-y divide-[#E6E6E6] rounded-xl border border-[#E6E6E6] bg-white">
                {bids.map((b) => (
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between transition hover:bg-[#F7F7F6]/50" key={b.id}>
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-[#30343B]">{b.studentId}</span>
                        <Badge tone={b.status === "ALLOCATED" ? "green" : "blue"}>{b.status}</Badge>
                        {b.proposalPdfUrl && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#FEF6EE] px-2 py-0.5 text-xs font-bold text-[#C27803] border border-[#F2A65A]/40">
                            📄 Proposal Document Attached
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-[#30343B]">Proposed: ₹{b.proposedAmount} · Delivery: {b.estimatedCompletionTime}</p>
                      <p className="text-xs text-[#666D7A]">Skills: {b.relevantSkills}</p>
                      <p className="text-xs italic text-[#666D7A]">"{b.message}"</p>
                      {b.proposalPdfUrl && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => handleDownloadPdf(b.proposalPdfUrl!, b.proposalPdfName, b.studentId, b.id)}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#3978B8] hover:text-[#2F659C] bg-[#EFF6FC] px-2.5 py-1 rounded-lg border border-[#C2DCF2] transition"
                          >
                            📥 Download Proposal ({b.proposalPdfName?.replace(/\s+\./g, ".").trim() || "proposal.pdf"})
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="secondary"
                        className="text-xs"
                        onClick={() => setReviewingBid(b)}
                      >
                        Review Proposal & Allocate →
                      </Button>
                      {canAllocate && opportunity.status !== "ALLOCATED" && b.status !== "ALLOCATED" && (
                        <Button
                          variant="primary"
                          className="text-xs"
                          disabled={state === "loading"}
                          onClick={() => allocate(b.studentId)}
                        >
                          <IconUserCheck size={14} />
                          <span>{state === "loading" ? "Processing…" : "Quick Allocate"}</span>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-[#E6E6E6] bg-[#F7F7F6]/50 p-6 text-center text-sm text-[#666D7A]">
                No bids have been submitted for this opportunity yet.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* PROPOSAL REVIEW & ALLOCATION INSPECTION MODAL */}
      {reviewingBid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#30343B]/60 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-[#E6E6E6]">
            <div className="flex items-start justify-between border-b border-[#E6E6E6] pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#3978B8]">Institutional Review & Allocation Desk</span>
                <h2 className="text-xl font-bold text-[#30343B] mt-0.5">Review Student Proposal: {reviewingBid.studentId}</h2>
                <p className="text-xs text-[#666D7A]">Opportunity: {opportunity.project} ({opportunity.id})</p>
              </div>
              <button
                onClick={() => setReviewingBid(null)}
                className="rounded-lg p-1.5 text-[#666D7A] hover:bg-[#F7F7F6] hover:text-[#30343B] transition"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-5">
              {/* Bid Metrics Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#F7F7F6] p-3.5 rounded-xl border border-[#E6E6E6] text-xs">
                <div>
                  <span className="text-[#666D7A] block">Proposed Amount</span>
                  <span className="font-bold text-[#30343B] text-sm">₹{reviewingBid.proposedAmount}</span>
                </div>
                <div>
                  <span className="text-[#666D7A] block">Delivery Timeline</span>
                  <span className="font-bold text-[#30343B] text-sm">{reviewingBid.estimatedCompletionTime}</span>
                </div>
                <div>
                  <span className="text-[#666D7A] block">Bid Status</span>
                  <span className="font-bold text-[#3978B8] text-sm">{reviewingBid.status}</span>
                </div>
                <div>
                  <span className="text-[#666D7A] block">Target SLA</span>
                  <span className="font-bold text-emerald-700 text-sm">72 Hours Commitment</span>
                </div>
              </div>

              {/* Relevant Skills & Cover Pitch */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">Relevant Skills & Tooling</h4>
                <p className="mt-1 text-sm text-[#30343B] bg-white p-2.5 rounded-lg border border-[#E6E6E6]">{reviewingBid.relevantSkills || "Not specified"}</p>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#666D7A]">Cover Message / Delivery Pitch</h4>
                <p className="mt-1 text-sm text-[#30343B] bg-white p-3 rounded-lg border border-[#E6E6E6] whitespace-pre-wrap">{reviewingBid.message}</p>
              </div>

              {/* PDF Proposal Review & Download Section */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#666D7A] mb-2">Attached Proposal Document</h4>
                {reviewingBid.proposalPdfUrl ? (
                  <div className="space-y-3 rounded-xl border border-[#C2DCF2] bg-[#EFF6FC]/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#C2DCF2]/70 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${previewInfo?.isDocx ? "bg-[#3978B8]" : "bg-red-600"} text-[10px] font-bold text-white shadow-sm`}>
                          {previewInfo?.isDocx ? "DOC" : "PDF"}
                        </span>
                        <span className="font-bold text-[#30343B] text-sm">
                          {previewInfo?.resolvedName || reviewingBid.proposalPdfName || "Proposal_Document.pdf"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadPdf(reviewingBid.proposalPdfUrl!, reviewingBid.proposalPdfName, reviewingBid.studentId, reviewingBid.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#3978B8] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#2F659C] shadow-sm transition"
                        >
                          📥 Download Document
                        </button>
                        {!previewInfo?.isDocx && (
                          <button
                            type="button"
                            onClick={() => handleOpenInTab(reviewingBid.proposalPdfUrl!, reviewingBid.proposalPdfName, reviewingBid.id || reviewingBid.studentId)}
                            className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[#30343B] hover:bg-[#F7F7F6] border border-[#E6E6E6] shadow-sm transition"
                          >
                            ↗ Open in Tab
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Document Preview Section */}
                    {previewInfo?.isDocx ? (
                      <div className="rounded-xl border border-[#C2DCF2] bg-white p-6 text-center shadow-inner">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3978B8] text-white font-extrabold text-xl shadow-md">
                          W
                        </div>
                        <h4 className="mt-3 text-sm font-bold text-[#30343B]">
                          Microsoft Word / Office Proposal Document
                        </h4>
                        <p className="mt-1 text-xs text-[#666D7A] max-w-md mx-auto">
                          "{previewInfo.resolvedName}" is an Office document. Download to inspect the full formatted proposal in Microsoft Word, LibreOffice, or Google Docs.
                        </p>
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={() => handleDownloadPdf(reviewingBid.proposalPdfUrl!, reviewingBid.proposalPdfName, reviewingBid.studentId, reviewingBid.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#3978B8] px-4 py-2 text-xs font-bold text-white hover:bg-[#2F659C] shadow-sm transition"
                          >
                            📥 Download Office Document ({previewInfo.resolvedName})
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-lg border border-[#E6E6E6] bg-white shadow-inner">
                        {previewFrameUrl ? (
                          <iframe
                            src={previewFrameUrl}
                            title="Proposal PDF Document"
                            className="w-full h-80 border-none"
                          />
                        ) : (
                          <div className="grid h-80 place-items-center text-xs font-semibold text-[#666D7A]">Loading document preview…</div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#E6E6E6] bg-[#F7F7F6] p-6 text-center text-sm text-[#666D7A]">
                    <p className="font-bold text-[#30343B]">No PDF proposal document was attached to this bid.</p>
                    <p className="text-xs text-[#666D7A] mt-1">Reviewing based on student's submitted scope message and profile above.</p>
                  </div>
                )}
              </div>

              {/* Institutional Safeguards Note */}
              <div className="rounded-xl bg-[#F7F7F6] p-3.5 border border-[#E6E6E6] text-xs text-[#666D7A]">
                <p className="font-bold text-[#30343B]">Institutional Governance & Work Allocation Safeguards:</p>
                <p className="mt-0.5">Allocating this opportunity will verify student's tier requirement, academic CGPA status, and weekly hour quota automatically before granting assignment.</p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#E6E6E6] pt-4">
              <Button variant="secondary" onClick={() => setReviewingBid(null)}>
                Close
              </Button>
              {canAllocate && (
                <Button
                  variant="primary"
                  disabled={state === "loading" || reviewingBid.status === "ALLOCATED" || opportunity.status === "ALLOCATED"}
                  onClick={async () => {
                    await allocate(reviewingBid.studentId);
                    setReviewingBid(null);
                  }}
                >
                  <IconUserCheck size={16} />
                  <span>
                    {state === "loading" ? "Allocating…" : reviewingBid.status === "ALLOCATED" || opportunity.status === "ALLOCATED" ? "Already Allocated" : "Allocate Work to Student"}
                  </span>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
