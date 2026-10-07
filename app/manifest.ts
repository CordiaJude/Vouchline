import type { MetadataRoute } from "next";

// Makes Vouchline installable ("Add to Home Screen" / "Install app"):
// opens full screen on black with its own icon, straight into the app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vouchline",
    short_name: "Vouchline",
    description: "Warm intros through people who actually know you.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["social", "business", "networking"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable-192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/pwa-icon/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
