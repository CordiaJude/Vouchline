// fetch wrapper for the Supabase clients: every failed database/API
// request is logged with its endpoint and the error body, on the server
// (Vercel logs) and in the browser console. Supabase returns errors as
// values, and code that only read `data` turned real failures into empty
// screens -- the search outage of 2026-10-07 hid behind "No one matches".
export const loggingFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (res.status >= 400) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let path = url;
    try {
      path = new URL(url).pathname;
    } catch {
      // keep the raw value
    }
    // Auth refreshes with an expired session are routine; skip them.
    if (!(path.startsWith("/auth/v1/") && (res.status === 400 || res.status === 401))) {
      let body = "";
      try {
        body = (await res.clone().text()).slice(0, 500);
      } catch {
        // body unavailable
      }
      console.error(`[supabase] ${init?.method ?? "GET"} ${path} -> ${res.status} ${body}`);
    }
  }
  return res;
};
