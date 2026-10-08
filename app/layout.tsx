import type { Metadata, Viewport } from "next";
import { NoZoom } from "@/app/components/no-zoom";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme, PALETTE_COOKIE, parsePalette } from "@/lib/ui-cookies";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// One rounded geometric family for everything -- headings, labels and
// body. The --font-display/--font-label/--font-body tokens in
// globals.css all point here, so existing class names keep working.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Vouchline",
  description: "Warm intros through people who actually know you.",
  applicationName: "Vouchline",
  // Installed on iPhone: full screen, black status bar, "Vouchline" label.
  appleWebApp: { capable: true, title: "Vouchline", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return {
    themeColor:
      theme === "system"
        ? [
            { media: "(prefers-color-scheme: light)", color: "#fafafa" },
            { media: "(prefers-color-scheme: dark)", color: "#000000" },
          ]
        : theme === "light"
          ? "#fafafa"
          : "#000000",
    colorScheme: theme === "system" ? "light dark" : theme,
    width: "device-width",
    initialScale: 1,
    // Feel like an app: no pinch or double-tap zoom.
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme={parseTheme((await cookies()).get(THEME_COOKIE)?.value)}
      data-palette={parsePalette((await cookies()).get(PALETTE_COOKIE)?.value)}
      className={`${jakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-body">
        <NoZoom />
        {children}
      </body>
    </html>
  );
}
