import "server-only";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.EMAIL_FROM ?? "Vouchline <onboarding@resend.dev>";

export type EmailResult = { ok: true } | { ok: false; reason: "not_configured" | "rejected"; detail?: string };

// Returns whether the email actually went out. Resend reports failures
// (unverified sender domain, invalid address...) in its response rather
// than by throwing, so check `error` -- ignoring it made failed sends
// look successful.
async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  cc?: string;
}): Promise<EmailResult> {
  if (!resend) {
    // Local/dev fallback per the Phase 6 acceptance criteria: emails are
    // logged to console instead of requiring a Resend key to test the flow.
    console.log("[email:dev]", { from: FROM, ...options });
    return { ok: false, reason: "not_configured" };
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      ...(options.cc ? { cc: options.cc } : {}),
    });
    if (error) {
      console.error("[email] send failed", { to: options.to, subject: options.subject, error });
      return { ok: false, reason: "rejected", detail: error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] send threw", err);
    return { ok: false, reason: "rejected", detail: err instanceof Error ? err.message : String(err) };
  }
}

function introLink(introId: string): string {
  return `${process.env.APP_URL}/app/intros/${introId}`;
}

function inviteLink(token: string): string {
  return `${process.env.APP_URL}/invite/${token}`;
}

export async function sendOrgInviteEmail(params: {
  toEmail: string;
  orgName: string;
  token: string;
}) {
  await sendEmail({
    to: params.toEmail,
    subject: `You're invited to join ${params.orgName} on Vouchline`,
    html: `
      <p>You've been invited to join ${params.orgName} on Vouchline.</p>
      <p><a href="${inviteLink(params.token)}">Accept the invite</a></p>
    `,
  });
}

export async function sendBrokerIntroEmail(params: {
  brokerEmail: string;
  requesterName: string;
  targetName: string;
  introId: string;
}) {
  await sendEmail({
    to: params.brokerEmail,
    subject: `${params.requesterName} asks you to introduce them to ${params.targetName}`,
    html: `
      <p>${params.requesterName} would like an introduction to ${params.targetName}.</p>
      <p><a href="${introLink(params.introId)}">Review the request</a></p>
    `,
  });
}

export async function sendTargetIntroEmail(params: {
  targetEmail: string;
  brokerName: string;
  requesterName: string;
  introId: string;
}) {
  await sendEmail({
    to: params.targetEmail,
    subject: `${params.brokerName} would like to introduce ${params.requesterName}`,
    html: `
      <p>${params.brokerName} would like to introduce you to ${params.requesterName}.</p>
      <p><a href="${introLink(params.introId)}">Review the request</a></p>
    `,
  });
}

export async function sendFollowupEmail(params: {
  toEmail: string;
  otherName: string;
  introId: string;
}) {
  await sendEmail({
    to: params.toEmail,
    subject: `Did you talk to ${params.otherName}?`,
    html: `
      <p>A week ago you were introduced to ${params.otherName}. Did you two talk?</p>
      <p><a href="${introLink(params.introId)}">Let us know</a></p>
    `,
  });
}

export async function sendWeeklyDigestEmail(params: {
  toEmail: string;
  pathCount: number;
}) {
  await sendEmail({
    to: params.toEmail,
    subject: `You have verified paths to ${params.pathCount} ${params.pathCount === 1 ? "person" : "people"}`,
    html: `
      <p>You have verified paths to ${params.pathCount} ${params.pathCount === 1 ? "person" : "people"} in your network.</p>
      <p><a href="${process.env.APP_URL}/app/find">Find someone to reach</a></p>
    `,
  });
}

export async function sendMutualIntroEmail(params: {
  requesterEmail: string;
  requesterName: string;
  targetEmail: string;
  targetName: string;
  brokerEmail?: string;
  ccBroker?: boolean;
}) {
  const cc = params.ccBroker ? params.brokerEmail : undefined;

  await sendEmail({
    to: params.requesterEmail,
    subject: `You're introduced to ${params.targetName}`,
    html: `<p>${params.targetName} (${params.targetEmail}) has accepted the introduction. Say hello!</p>`,
    cc,
  });

  await sendEmail({
    to: params.targetEmail,
    subject: `You're introduced to ${params.requesterName}`,
    html: `<p>${params.requesterName} (${params.requesterEmail}) has accepted the introduction. Say hello!</p>`,
    cc,
  });
}

export async function sendVerificationCodeEmail(params: {
  toEmail: string;
  code: string;
  kind: "school" | "work";
}): Promise<EmailResult> {
  return sendEmail({
    to: params.toEmail,
    subject: `Your Vouchline verification code: ${params.code}`,
    html: `
      <p>Here's your code to verify your ${params.kind === "school" ? "school" : "work"} email on Vouchline:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px">${params.code}</p>
      <p>It expires in 15 minutes. If you didn't ask for this, you can ignore this email.</p>
    `,
  });
}
