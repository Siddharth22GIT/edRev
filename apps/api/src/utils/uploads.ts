// Server-side checks for files sent as data URLs (S3, S10). The browser checks too, but only the
// server's check counts: anyone can call the API directly with any bytes and any declared type.

export const MAX_PROPOSAL_BYTES = 10 * 1024 * 1024;
export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

export interface ParsedDataUrl {
  mimeType: string;
  bytes: Buffer;
}

/** Parses `data:<type>;base64,<data>`. Returns null for anything else (plain URLs, `javascript:`, junk). */
export function parseBase64DataUrl(value: unknown): ParsedDataUrl | null {
  if (typeof value !== "string") return null;
  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]*)$/i.exec(value);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0) return null;
  return { mimeType: match[1].toLowerCase(), bytes };
}

/** A real PDF starts with "%PDF-". Checking the bytes catches HTML or SVG renamed to .pdf. */
export function isPdfBytes(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

export type ImageKind = "png" | "jpeg" | "webp" | "gif";

/** Detects the image type from its first bytes (file signature), ignoring what the sender claims. */
export function detectImageKind(bytes: Buffer): ImageKind | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  const head = bytes.subarray(0, 6).toString("latin1");
  if (head === "GIF87a" || head === "GIF89a") return "gif";
  return null;
}

/** S3: validates an optional proposal PDF. Returns an error message, or null when it is fine (or absent). */
export function proposalPdfProblem(dataUrl: unknown): string | null {
  if (dataUrl === undefined || dataUrl === null || dataUrl === "") return null;
  const parsed = parseBase64DataUrl(dataUrl);
  if (!parsed) return "The proposal must be uploaded as a PDF file.";
  if (parsed.bytes.length > MAX_PROPOSAL_BYTES) return "The proposal PDF must be 10 MB or smaller.";
  if (!isPdfBytes(parsed.bytes)) return "The proposal file is not a valid PDF.";
  return null;
}

/** S10: validates an optional earnings screenshot (PNG, JPEG, WebP or GIF, checked by its bytes). */
export function screenshotProblem(dataUrl: unknown): string | null {
  if (dataUrl === undefined || dataUrl === null || dataUrl === "") return null;
  const parsed = parseBase64DataUrl(dataUrl);
  if (!parsed || !parsed.mimeType.startsWith("image/")) return "The screenshot must be an uploaded image (PNG, JPEG, WebP or GIF).";
  if (parsed.bytes.length > MAX_SCREENSHOT_BYTES) return "The screenshot must be 10 MB or smaller.";
  if (!detectImageKind(parsed.bytes)) return "The screenshot is not a valid PNG, JPEG, WebP or GIF image.";
  return null;
}
