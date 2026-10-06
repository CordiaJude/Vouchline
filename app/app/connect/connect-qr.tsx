"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";

const REFRESH_INTERVAL_MS = 9 * 60 * 1000;

export function ConnectQr({ initialToken }: { initialToken: string }) {
  const [token, setToken] = useState(initialToken);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = `${window.location.origin}/c/${token}`;
    QRCode.toDataURL(url, { width: 320, margin: 1 }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const supabase = createClient();
    const interval = setInterval(async () => {
      const { data, error } = await supabase.rpc("create_connect_token");
      if (!error && data) setToken(data);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-6 flex flex-col items-center gap-4">
      <div className="flex h-80 w-80 items-center justify-center rounded-card bg-fill p-4 shadow-sm">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="Connect QR code" width={320} height={320} />
        ) : (
          <div className="h-full w-full animate-pulse rounded-card bg-fill" />
        )}
      </div>
      <p className="text-xs text-muted">
        This code refreshes automatically and expires 10 minutes after each
        scan.
      </p>
    </div>
  );
}
