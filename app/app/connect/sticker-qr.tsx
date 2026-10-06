"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Unlike ConnectQr's rotating per-scan token, this URL never expires or
// changes -- it's meant to be written once to a physical NFC tag/sticker
// and never touched again. create_sticker_token() (called at scan time
// by /c/u/[userId]) is what actually rate-limits and expires the
// short-lived token a scan produces; this QR is just a stable pointer to
// that route.
export function StickerQr({ url }: { url: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 240, margin: 1 }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex h-60 w-60 items-center justify-center rounded-card bg-fill p-4 shadow-sm">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="Sticker connect QR code" width={240} height={240} />
        ) : (
          <div className="h-full w-full animate-pulse rounded-card bg-fill" />
        )}
      </div>
      <p className="break-all rounded-card bg-fill px-3 py-2 font-mono text-xs text-body select-all">
        {url}
      </p>
    </div>
  );
}
