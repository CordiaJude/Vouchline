// One outline icon set for the whole app. Pass `filled` for the
// selected state -- shapes that read well solid fill in, the rest get a
// heavier stroke (how Instagram marks the active tab, no pills or
// underlines).
export type IconName =
  | "home"
  | "search"
  | "send"
  | "user"
  | "users"
  | "add"
  | "heart"
  | "menu"
  | "gear"
  | "shield"
  | "logout"
  | "qr"
  | "scan"
  | "userPlus"
  | "share"
  | "target"
  | "building"
  | "map"
  | "chevronRight"
  | "check"
  | "close"
  | "expand"
  | "download"
  | "message"
  | "arrowLeft"
  | "more"
  | "flag"
  | "block"
  | "image"
  | "sparkle"
  | "school"
  | "pencil";

const ICONS: Record<IconName, { d: string; fillable?: boolean }> = {
  home: { d: "M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9.5z", fillable: true },
  search: { d: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" },
  send: { d: "M22 3L9.2 10.1M22 3l-6.5 18-3.8-8.4L3 9.5 22 3z", fillable: true },
  user: { d: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z", fillable: true },
  users: {
    d: "M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M10 11a4 4 0 100-8 4 4 0 000 8zM21 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  },
  add: { d: "M7 3h10a4 4 0 014 4v10a4 4 0 01-4 4H7a4 4 0 01-4-4V7a4 4 0 014-4zM12 8v8M8 12h8" },
  heart: {
    d: "M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 000-7.8z",
    fillable: true,
  },
  menu: { d: "M4 6h16M4 12h16M4 18h16" },
  gear: {
    d: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
  },
  shield: { d: "M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" },
  logout: { d: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" },
  qr: { d: "M4 4h6v6H4V4zM14 4h6v6h-6V4zM4 14h6v6H4v-6zM14 14h3M14 17h6M14 20h6M20 14v3" },
  scan: { d: "M3 8V5a2 2 0 012-2h3M16 3h3a2 2 0 012 2v3M21 16v3a2 2 0 01-2 2h-3M8 21H5a2 2 0 01-2-2v-3M7 12h10" },
  userPlus: { d: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6" },
  share: { d: "M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" },
  target: {
    d: "M12 12m-9 0a9 9 0 1018 0 9 9 0 10-18 0M12 12m-5 0a5 5 0 1010 0 5 5 0 10-10 0M12 12m-1 0a1 1 0 102 0 1 1 0 10-2 0",
  },
  building: { d: "M4 21V5a2 2 0 012-2h8a2 2 0 012 2v16M16 9h2a2 2 0 012 2v10M3 21h18M8 7h4M8 11h4M8 15h4" },
  // An orbit: you at the center, a ring, one planet on it.
  map: {
    d: "M12 12m-2.5 0a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0M15.5 3.7A9 9 0 1020.3 8.5M19 5m-1.6 0a1.6 1.6 0 103.2 0 1.6 1.6 0 10-3.2 0",
  },
  chevronRight: { d: "M9 18l6-6-6-6" },
  check: { d: "M20 6L9 17l-5-5" },
  close: { d: "M18 6L6 18M6 6l12 12" },
  expand: { d: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" },
  message: {
    d: "M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z",
    fillable: true,
  },
  arrowLeft: { d: "M19 12H5M12 19l-7-7 7-7" },
  more: { d: "M5 12h.01M12 12h.01M19 12h.01" },
  flag: { d: "M4 21V4M4 4h12l-2 4 2 4H4" },
  block: { d: "M12 21a9 9 0 100-18 9 9 0 000 18zM5.6 5.6l12.8 12.8" },
  image: { d: "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM21 15l-5-5L5 21" },
  school: { d: "M2 9l10-5 10 5-10 5L2 9zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6" },
  pencil: { d: "M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" },
  sparkle: { d: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" },
  download: { d: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" },
};

export function Icon({ name, className, filled = false }: { name: IconName; className?: string; filled?: boolean }) {
  const { d, fillable } = ICONS[name];
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled && fillable ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 2.5 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
