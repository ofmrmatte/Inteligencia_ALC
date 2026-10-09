export type AiProvider = "openai" | "gemini";

// Models with a long-established JSON-schema adapter. Keep legacy selections
// backward-compatible; newly discovered IDs must pass a live structured probe.
export function documentedAiModel(provider: AiProvider, model: string) {
  return provider === "openai"
    ? ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"].includes(model)
    : ["gemini-2.5-flash", "gemini-2.5-flash-lite"].includes(model);
}

export function validAiModelId(model: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(model);
}

// The provider list is authoritative for availability, not compatibility.
// Do not whitelist only fixed versions: future text model versions appear in
// the picker but cannot be enabled before a structured, credential-bound test.
export function candidateAiTextModel(provider: AiProvider, model: string) {
  if (!validAiModelId(model)) return false;
  if (provider === "openai") {
    if (!/^gpt-(?:4|5|6|7|8|9)[a-z0-9.-]*$/i.test(model)) return false;
    return !/(?:^|[-.])(?:audio|realtime|live|tts|transcribe|whisper|image|vision|search|codex|research|embedding|moderation|pro|oss|computer|sora)(?:[-.]|$)/i.test(model)
      && !/chatgpt|instruct|chat-latest/i.test(model);
  }
  if (!/^gemini-(?:2\.5|[3-9](?:\.\d+)?)-/i.test(model)) return false;
  return !/(?:^|[-.])(?:image|tts|live|transcribe|embedding|robotics|audio|video|translate|computer|native|vision|speech)(?:[-.]|$)/i.test(model);
}

// Reasoning models use Responses; legacy GPT-4.x keeps the existing adapter.
export function openAiUsesResponses(model: string) {
  return /^gpt-[5-9](?:\.|-|$)/i.test(model);
}
export function geminiUsesResponseFormat(model: string) {
  return /^gemini-[3-9](?:\.|-)/i.test(model);
}
