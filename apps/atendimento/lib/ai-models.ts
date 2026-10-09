export type AiProvider = "openai" | "gemini";
// Only documented text models matching this adapter; other IDs require a structured probe.
export function documentedAiModel(provider: AiProvider, model: string) {
  return provider === "openai"
    ? [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4.1",
        "gpt-4.1-mini",
        "gpt-4.1-nano",
      ].includes(model)
    : ["gemini-2.5-flash", "gemini-2.5-flash-lite"].includes(model);
}
export function validAiModelId(model: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(model);
}
