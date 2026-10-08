import { ImageResponse } from "next/og";
import { getPublicCard, usernameFromHandle } from "./card";

// The preview card shown when a /@username link is shared (iMessage,
// Instagram bio, Slack, X...). ImageResponse renders on the server to a
// PNG, so its inline styles never reach the page's CSP.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Vouchline profile";

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const username = usernameFromHandle((await params).handle);
  const card = username ? await getPublicCard(username) : null;
  const name = card?.full_name ?? "Vouchline";
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#000", color: "#f5f5f5", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                background: "linear-gradient(45deg, #f6d88b, #eebb62, #e8a44a)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                fontWeight: 800,
              }}
            >
              V
            </div>
            <div style={{ fontSize: 34, fontWeight: 800 }}>Vouchline</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
            <div
              style={{
                width: 220,
                height: 220,
                borderRadius: 999,
                padding: 7,
                background: "linear-gradient(45deg, #f6d88b, #eebb62, #e8a44a)",
                display: "flex",
              }}
            >
              <div style={{ width: "100%", height: "100%", borderRadius: 999, padding: 7, background: "#000", display: "flex" }}>
                {card?.avatar_url ? (
                   
                  <img src={card.avatar_url} width={192} height={192} style={{ borderRadius: 999, objectFit: "cover" }} alt="" />
                ) : (
                  <div style={{ width: "100%", height: "100%", borderRadius: 999, background: "#2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 72, fontWeight: 800, color: "#e0e0e0" }}>
                    {initials || "V"}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
              <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05 }}>{name}</div>
              {card && <div style={{ fontSize: 34, color: "#a8a8a8", marginTop: 8 }}>@{card.username}</div>}
              {card?.headline && <div style={{ fontSize: 36, marginTop: 24, color: "#dbdbdb" }}>{card.headline}</div>}
            </div>
          </div>

          <div style={{ fontSize: 28, color: "#a8a8a8" }}>
            {card && card.connections_count > 0
              ? `${card.connections_count} verified connections · warm intros through people who actually know you`
              : "Warm intros through people who actually know you"}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
