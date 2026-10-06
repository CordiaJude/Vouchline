import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

// Deliberately narrow: only public profile fields, names, and the
// requester's one-line goal. Never pass connection types, years, or
// strength -- the model must not see or influence relationship data.
export async function draftIntroText(params: {
  requesterName: string;
  requesterHeadline?: string | null;
  targetName: string;
  targetHeadline?: string | null;
  brokerName: string;
  goal: string;
}): Promise<string> {
  if (!anthropic) {
    throw new Error("AI drafting is not configured (missing ANTHROPIC_API_KEY).");
  }

  const prompt = [
    `Requester: ${params.requesterName}${params.requesterHeadline ? ` (${params.requesterHeadline})` : ""}`,
    `Target: ${params.targetName}${params.targetHeadline ? ` (${params.targetHeadline})` : ""}`,
    `Broker (mutual connection being asked to make the intro): ${params.brokerName}`,
    `Requester's goal, in their own words: ${params.goal}`,
  ].join("\n");

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 400,
    output_config: { effort: "low" },
    system:
      "You draft short, warm, specific introduction requests for a college " +
      "fraternity alumni network. The requester is asking a mutual " +
      "connection (the broker) to introduce them to someone else (the " +
      "target). Write ONLY the message body the requester will send to " +
      "their broker -- no subject line, no salutation placeholders beyond " +
      "a natural greeting, no markdown, 2-4 sentences. Be specific about " +
      "the stated goal; don't invent details you weren't given.",
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  return textBlock?.text.trim() ?? "";
}
