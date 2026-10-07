export type NextStep = { headline: string; detail: string; href: string; cta: string };

// A single, prioritized "what should I do next" recommendation -- the
// live audit's finding was that the dashboard was just stats and lists
// that could all be empty at once, with nothing orienting a new or
// idle user toward an actual next action. Ordered by what unblocks the
// most value first: an incomplete profile makes everything else (intro
// requests, being found in Search) worse, a zero-connection account has
// nothing else useful to show, then pending confirmations and stalled
// intro-seeking are just prompts back to work already surfaced lower
// on the page.
export function nextStep(params: {
  completenessPercent: number;
  nextMissingLabel: string;
  connectionsCount: number;
  pendingCount: number;
  openIntrosCount: number;
  // The member dismissed the "profile X% complete" prompt.
  skipProfile?: boolean;
}): NextStep {
  const { completenessPercent, nextMissingLabel, connectionsCount, pendingCount, openIntrosCount } =
    params;

  if (completenessPercent < 100 && !params.skipProfile) {
    return {
      headline: `Your profile is ${completenessPercent}% complete`,
      detail: `Add your ${nextMissingLabel} so people can find and recognize you.`,
      href: "/app/settings",
      cta: "Finish your profile",
    };
  }
  if (connectionsCount === 0) {
    return {
      headline: "You haven't connected with anyone yet",
      detail: "Scan a QR code or send a direct request to start your network.",
      href: "/app/connect",
      cta: "Connect with someone",
    };
  }
  if (pendingCount > 0) {
    return {
      headline: `${pendingCount} connection${pendingCount === 1 ? "" : "s"} waiting on you`,
      detail: "Confirm these to make them count toward your reachable network.",
      href: "/app/connections/pending",
      cta: "Confirm now",
    };
  }
  if (openIntrosCount === 0) {
    return {
      headline: "Looking to meet someone specific?",
      detail: "Search your network and we'll show you who can introduce you.",
      href: "/app/search",
      cta: "Search",
    };
  }
  return {
    headline: "You're all caught up",
    detail: "Browse your network or check in on your open intros.",
    href: "/app/network",
    cta: "View your network",
  };
}
