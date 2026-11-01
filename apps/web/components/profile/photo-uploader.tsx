"use client";

import { useRef, useState } from "react";
import type { Student } from "@edurev/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { IconX } from "@/components/ui/icons";
import { useApi } from "@/lib/api";
import { useToast } from "@/lib/toast";

const OUTPUT_SIZE = 320; // px, square
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

/** Centre-crops an image file to a square and re-encodes it small (WebP, or JPEG where WebP isn't supported). */
async function toSquareDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That file could not be read as an image."));
      img.src = url;
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser could not process the image.");
    ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    const webp = canvas.toDataURL("image/webp", 0.85);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Modal for choosing, previewing, saving or removing the signed-in student's profile photo. */
export function PhotoUploader({ student, onClose, onSaved }: { student: Student; onClose: () => void; onSaved: (student: Student) => void }) {
  const { apiFetch } = useApi();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError("Please choose a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError("That image is larger than 10 MB. Please choose a smaller one.");
      return;
    }
    try {
      setPreview(await toSquareDataUrl(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare the image.");
    }
  };

  const save = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/students/${student.id}/photo`, { method: "PUT", body: JSON.stringify({ photoDataUrl: preview }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not save your photo.");
      onSaved(json.data);
      toast("Profile photo updated.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your photo.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/students/${student.id}/photo`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not remove your photo.");
      onSaved(json.data);
      toast("Profile photo removed.", "info");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove your photo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 !mt-0 flex items-center justify-center bg-[#30343B]/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        aria-label="Change profile photo"
        aria-modal="true"
        className="rise-in w-full max-w-md rounded-2xl border border-[#E6E6E6] bg-white p-6 shadow-dropdown"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#30343B]">Profile photo</h2>
          <button aria-label="Close" className="rounded-lg p-1.5 text-[#666D7A] hover:bg-[#F7F7F6]" onClick={onClose} type="button">
            <IconX size={18} />
          </button>
        </div>

        <div className="mt-6 flex flex-col items-center">
          <Avatar name={student.name} photoUrl={preview ?? student.photoUrl} ring size={140} />
          <p className="mt-3 text-xs text-[#666D7A]">{preview ? "Preview: cropped to a square" : "PNG, JPEG or WebP · we crop it to a square for you"}</p>
        </div>

        <input
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = "";
          }}
          ref={inputRef}
          type="file"
        />

        <div
          className="mt-5 cursor-pointer rounded-xl border-2 border-dashed border-[#E6E6E6] bg-[#F7F7F6]/60 p-4 text-center text-sm font-semibold text-[#666D7A] transition hover:border-[#F2A65A] hover:bg-[#FEF6EE]"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            choose(e.dataTransfer.files?.[0]);
          }}
          role="button"
          tabIndex={0}
        >
          Click to choose a photo, or drop one here
        </div>

        {error && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-700">{error}</p>}

        <div className="mt-6 flex items-center justify-between gap-2">
          {student.photoUrl ? (
            <Button disabled={busy} onClick={remove} variant="destructive">
              Remove photo
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button disabled={busy} onClick={onClose} variant="secondary">
              Cancel
            </Button>
            <Button disabled={busy || !preview} onClick={save} variant="primary">
              {busy ? "Saving…" : "Save photo"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
