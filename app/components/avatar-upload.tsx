"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./avatar";
import { btnSecondarySmall } from "@/app/components/ui/styles";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const OUTPUT_SIZE = 480;

// Crops to a centered square and downsizes before upload, client-side --
// the storage bucket still enforces size/type server-side, this just
// keeps typical phone-camera photos (several MB, non-square) from being
// uploaded as-is.
function cropToSquare(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas unavailable"));
        return;
      }
      ctx.drawImage(img, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("crop failed"))),
        "image/jpeg",
        0.9,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("could not read image"));
    };
    img.src = url;
  });
}

export function AvatarUpload({
  userId,
  fullName,
  avatarUrl,
  onUploaded,
}: {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  onUploaded?: (url: string) => void;
}) {
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Please choose a JPEG, PNG, or WEBP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That image is too large -- please choose one under 5MB.");
      return;
    }

    setBusy(true);
    try {
      const cropped = await cropToSquare(file);
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(userId, cropped, { contentType: "image/jpeg", upsert: true });
      if (uploadError) {
        setError("Upload failed. Please try again.");
        return;
      }

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(userId);
      const bustedUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: bustedUrl })
        .eq("id", userId);
      if (updateError) {
        setError("Saved the photo but couldn't update your profile. Please try again.");
        return;
      }

      setPreview(bustedUrl);
      onUploaded?.(bustedUrl);
    } catch {
      setError("Something went wrong reading that image. Please try another.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar id={userId} name={fullName} src={preview} size={96} />
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className={btnSecondarySmall}
        >
          {busy ? "Uploading…" : preview ? "Change photo" : "Add a photo"}
        </button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}
