import { expect, it } from "vitest";
import { CLIENT_AUDIO_NOTICE_POLICY, clientAudioNoticeAllowed, clientAudioNoticeText } from "../lib/domain";
const now = new Date("2026-10-09T12:00:00Z").getTime();
function fixture(status = "human") {
  const conversation = { id: "synthetic-conversation", channel: "client", phone: "5511999990000", status, assigned_to: "human-owner", case_id: "synthetic-case", agent_state: { step: "human", optOut: false }, last_inbound_at: new Date(now).toISOString() };
  const inbound = { conversation_id: conversation.id, provider_id: "synthetic-audio", direction: "in", type: "audio", created_at: new Date(now).toISOString() };
  const job = { conversation_id: conversation.id, channel: "client", phone: conversation.phone, dedupe_key: `reply:audio:${inbound.provider_id}`, sender_kind: "ai", sender_user_id: null, sender_display_name_snapshot: "Ellie", agent_policy: CLIENT_AUDIO_NOTICE_POLICY, payload: { messaging_product: "whatsapp", to: conversation.phone, type: "text", text: { body: clientAudioNoticeText() } } };
  return { conversation, inbound, job };
}
it.each(["human", "bot", "pending"])("explicit audio notice policy allows only the fixed notice in an open %s conversation without taking ownership", status => {
  const { conversation, job, inbound } = fixture(status), prior = structuredClone(conversation);
  expect(clientAudioNoticeAllowed(conversation, job, inbound, "", now)).toBe(true);
  expect(conversation).toEqual(prior);
});
it.each(["resolved", "done", "optout", "phone", "expired", "future"])("cancels queued notices after current conversation becomes %s", condition => {
  const { conversation, job, inbound } = fixture();
  if (["resolved", "pending"].includes(condition)) conversation.status = condition;
  if (condition === "done") conversation.agent_state.step = "done";
  if (condition === "optout") conversation.agent_state.optOut = true;
  if (condition === "phone") conversation.phone = "5511888880000";
  if (condition === "expired") conversation.last_inbound_at = new Date(now-86400001).toISOString();
  if (condition === "future") conversation.last_inbound_at = new Date(now+86400000).toISOString();
  expect(clientAudioNoticeAllowed(conversation, job, inbound, "", now)).toBe(false);
});
it("rechecks legacy or newly recorded opt-out text at send time", () => {
  const { conversation, job, inbound } = fixture();
  expect(clientAudioNoticeAllowed(conversation, job, inbound, "Não quero contato", now)).toBe(false);
});
it.each(["marker", "key", "body", "author", "name", "extra", "origin", "driver", "old_origin"])("does not allow a blind key bypass or forged %s", condition => {
  const { conversation, job, inbound } = fixture();
  if (condition === "marker") job.agent_policy = "";
  if (condition === "key") job.dedupe_key = "reply:audio:another-message";
  if (condition === "body") job.payload.text.body = "An arbitrary bot reply";
  if (condition === "author") job.sender_kind = "human";
  if (condition === "name") job.sender_display_name_snapshot = "Another agent";
  if (condition === "extra") Object.assign(job.payload, { caption: "unapproved text" });
  if (condition === "origin") inbound.type = "text";
  if (condition === "driver") job.channel = "driver";
  if (condition === "old_origin") inbound.created_at = new Date(now-86400001).toISOString();
  expect(clientAudioNoticeAllowed(conversation, job, inbound, "", now)).toBe(false);
});
