import type { Request, Response } from "express";
import { INTEREST_AREAS, type OnboardingSubmission, type PortfolioLink, type TierSuggestionStatus } from "@edurev/types";
import {
  completeOnboardingService,
  decideTierSuggestionService,
  listTierSuggestionsService,
  skipOnboardingService,
} from "../services/onboarding.service.js";

const errorResponse = (res: Response, message: string, status = 400) => res.status(status).json({ message });

const getParam = (param: string | string[] | undefined): string => (Array.isArray(param) ? param[0] : param || "");

const MAX_WEEKLY_HOURS = 20; // the institutional weekly cap

function cleanList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  return Array.from(new Set((value as string[]).map((item) => item.trim()).filter(Boolean)));
}

/** Only public http(s) links; anything carrying credentials or another scheme is rejected. */
function parseLink(value: any): PortfolioLink | null {
  if (!value || typeof value.label !== "string" || typeof value.url !== "string") return null;
  const label = value.label.trim();
  const raw = value.url.trim();
  if (!label || label.length > 40 || raw.length > 200) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return { label, url: url.toString() };
  } catch {
    return null;
  }
}

/**
 * Validates onboarding answers. Fields that are not part of onboarding (tier, cgpa, earnings, name…)
 * are ignored, so onboarding can never change official records.
 */
function parseSubmission(body: any): { error: string } | { submission: OnboardingSubmission } {
  const skills = cleanList(body?.skills);
  if (!skills || skills.length < 1 || skills.length > 20 || skills.some((s) => s.length > 40)) {
    return { error: "Add between 1 and 20 skills, each up to 40 characters." };
  }

  const interests = cleanList(body?.interests);
  if (!interests || interests.length < 1 || interests.some((i) => !(INTEREST_AREAS as readonly string[]).includes(i))) {
    return { error: `Choose at least one interest from: ${INTEREST_AREAS.join(", ")}.` };
  }

  const hours = body?.availabilityHours;
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_WEEKLY_HOURS) {
    return { error: `Weekly availability must be a whole number of hours from 1 to ${MAX_WEEKLY_HOURS}.` };
  }

  const submission: OnboardingSubmission = { skills, interests, availabilityHours: hours };

  if (body?.claimedCgpa !== undefined && body.claimedCgpa !== null) {
    if (typeof body.claimedCgpa !== "number" || !Number.isFinite(body.claimedCgpa) || body.claimedCgpa < 0 || body.claimedCgpa > 10) {
      return { error: "CGPA must be a number from 0 to 10." };
    }
    submission.claimedCgpa = Math.round(body.claimedCgpa * 100) / 100;
  }

  if (body?.goals !== undefined) {
    if (typeof body.goals !== "string" || body.goals.length > 300) return { error: "Goals must be text of at most 300 characters." };
    submission.goals = body.goals.trim();
  }

  if (body?.bio !== undefined) {
    if (typeof body.bio !== "string" || body.bio.length > 500) return { error: "Bio must be text of at most 500 characters." };
    submission.bio = body.bio.trim();
  }

  if (body?.portfolioLinks !== undefined) {
    if (!Array.isArray(body.portfolioLinks) || body.portfolioLinks.length > 5) return { error: "Add at most 5 portfolio links." };
    const links = body.portfolioLinks.map(parseLink);
    if (links.some((link: PortfolioLink | null) => link === null)) {
      return { error: "Each link needs a short label and a public http(s) web address (no passwords or logins in the link)." };
    }
    submission.portfolioLinks = links as PortfolioLink[];
  }

  return { submission };
}

export async function completeOnboardingHandler(req: Request, res: Response): Promise<void> {
  const parsed = parseSubmission(req.body);
  if ("error" in parsed) {
    errorResponse(res, parsed.error);
    return;
  }
  try {
    const { student, suggestion } = await completeOnboardingService(getParam(req.params.id), parsed.submission);
    // The student only learns that a review is pending, not an outcome
    res.json({ data: student, tierReview: suggestion ? { status: suggestion.status, suggestedTier: suggestion.suggestedTier } : null, message: "Onboarding complete." });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to save onboarding.", err.statusCode || 400);
  }
}

export async function skipOnboardingHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await skipOnboardingService(getParam(req.params.id));
    res.json({ data, message: "You can finish setting up your profile any time." });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to skip onboarding.", err.statusCode || 400);
  }
}

export async function listTierSuggestionsHandler(req: Request, res: Response): Promise<void> {
  const status = req.query.status as string | undefined;
  if (status && !["PENDING", "APPROVED", "DISMISSED"].includes(status)) {
    errorResponse(res, "status must be PENDING, APPROVED or DISMISSED.");
    return;
  }
  try {
    const data = await listTierSuggestionsService(status as TierSuggestionStatus | undefined);
    res.json({ data });
  } catch (err: any) {
    errorResponse(res, err.message || "Failed to fetch tier suggestions.", 500);
  }
}

function decide(decision: "APPROVED" | "DISMISSED") {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const decidedBy = `${req.user!.role}:${req.user!.id}`;
      const data = await decideTierSuggestionService(getParam(req.params.id), decision, decidedBy);
      res.json({ data, message: decision === "APPROVED" ? `Official tier updated to ${data.suggestedTier}.` : "Suggestion dismissed." });
    } catch (err: any) {
      errorResponse(res, err.message || "Failed to update the suggestion.", err.statusCode || 400);
    }
  };
}

export const approveTierSuggestionHandler = decide("APPROVED");
export const dismissTierSuggestionHandler = decide("DISMISSED");
