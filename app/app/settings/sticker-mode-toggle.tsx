"use client";

import { setStickerMode } from "./actions";

export function StickerModeToggle({ enabled }: { enabled: boolean }) {
  return (
    <form action={setStickerMode} className="flex flex-col gap-2">
      <label className="flex items-start gap-3 text-sm text-body">
        <input
          type="checkbox"
          name="sticker_mode"
          defaultChecked={enabled}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="mt-1 h-4 w-4"
        />
        <span>
          Enable sticker mode. A static NFC/QR sticker on your bag or laptop
          will let anyone in your chapter start a connection with you without
          a fresh code each time.
        </span>
      </label>
    </form>
  );
}
