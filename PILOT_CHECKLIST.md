# Pilot launch checklist

Everything below is **unchecked by default**. None of these are things I
(the agent) can complete or verify on your behalf -- they're organizational
and legal steps that need a real person and a real chapter. Check each box
off only once it's actually true, and keep this file as the record.

## Before launch

- [ ] **Written OK from the alumni board.** A real sign-off (email or
      board minutes), not just a verbal "sounds good." File it somewhere
      durable -- attach it to this checklist's PR, or link it here.
- [ ] **ATO national no-objection email on file.** Confirmation from
      national leadership that they're aware of and don't object to the
      pilot. Keep the email.
- [ ] **Roster CSV received from the org, not scraped.** The chapter (an
      officer or admin) hands you a CSV export of members to seed invites
      from -- see `app/app/admin/[org]/csv-import-form.tsx`. Roster data
      should never come from scraping a roster site, social media, or any
      source the chapter didn't directly provide.
- [ ] **10 brokers onboarded before general launch.** Get at least 10
      well-connected members through onboarding and confirming their
      connections first, so early users searching for paths actually find
      something instead of hitting "no verified path yet."
- [ ] **Launch-meeting script written.** A short script/agenda for
      whoever presents this to the chapter at a meeting -- what it is, why
      it's opt-in, how to sign up, what data is collected (link to
      `/privacy`).
- [ ] **Incident contact named.** One specific person (not "the team") who
      gets pinged if something goes wrong during the pilot -- a bad report,
      a security concern, a member complaint. Name and contact method here:
      `_______________`

## During the pilot

- [ ] **Day 7 metric review.** Pull `/app/admin/[org]/metrics` and compare
      against the pilot thresholds. Note anything surprising.
- [ ] **Day 14 metric review.** Same as above. Trend, don't just snapshot.
- [ ] **Day 30 metric review.** Final read before the renew/end decision.
      This is also the natural point to revisit whether the thresholds in
      `app/app/admin/[org]/metrics/page.tsx` (my own MVP guesses, not
      chapter-specific targets) still make sense.

## At pilot end

- [ ] **Renew/end decision made and documented.**
- [ ] **If not renewed: data deletion executed.** Delete the production
      Supabase project (or at minimum, truncate every table under RLS in
      `public` and `private`) and confirm with the alumni board that it's
      done. This is a real, destructive, hard-to-reverse action -- get
      explicit sign-off before running it, and don't do it silently.
- [ ] **If renewed: this checklist re-run for the next pilot period**, with
      day-7/14/30 review dates reset.
