"use client";

import { useEffect } from "react";

// iPhone Safari ignores user-scalable=no in a normal tab, so block its
// pinch gesture directly. In-page pinch (like the network map) uses touch
// events, which this doesn't touch.
export function NoZoom() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", stop, { passive: false });
    document.addEventListener("gesturechange", stop, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
    };
  }, []);
  return null;
}
