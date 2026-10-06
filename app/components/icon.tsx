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
  | "close";

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
  map: {
    d: "M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0M5 6m-2 0a2 2 0 104 0 2 2 0 10-4 0M19 6m-2 0a2 2 0 104 0 2 2 0 10-4 0M19 18m-2 0a2 2 0 104 0 2 2 0 10-4 0M6.5 7.5l4 3M17.5 7.5l-4 3M17.5 16.5l-4-3",
  },
  chevronRight: { d: "M9 18l6-6-6-6" },
  check: { d: "M20 6L9 17l-5-5" },
  close: { d: "M18 6L6 18M6 6l12 12" },
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
