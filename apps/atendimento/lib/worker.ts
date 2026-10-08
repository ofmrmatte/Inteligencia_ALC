import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { db, setting, audit } from "./db";
import {
  phone,
  normalize,
  clientReply,
  driverNotificationEligible,
  type CaseRecord,
  type AgentState,
} from "./domain";
import { channelConfig, graph, type Channel } from "./meta";
import { syncCore, type Automation } from "./source";
import { DRIVER_STEPS } from "./agent-playbook";
type Conversation = {
  id: string;
  channel: Channel;
  phone: string;
  status: string;
  identity_verified: boolean;
  driver_id: string;
  name?: string;
  agent_state: AgentState & { name?: string };
  last_inbound_at: string;
  case_id: string;
  base_key: string;
  sigla: string;
  assigned_to?: string | null;
};
export function botReplyAllowed(conversation: {
  status: string;
  assigned_to?: string | null;
  agent_state: { step: string };
}) {
  return (
    conversation.status === "bot" ||
    (!conversation.assigned_to &&
      ((conversation.status === "human" &&
        conversation.agent_state.step === "human") ||
        (conversation.status === "resolved" &&
          conversation.agent_state.step === "done")))
  );
}
export async function queueText(
  conversation: Conversation,
  text: string,
  key: string,
  actor: string | null = null,
  transaction?: PoolClient,
) {
  if (
    !conversation.last_inbound_at ||
    Date.now() - new Date(conversation.last_inbound_at).getTime() >
      24 * 60 * 60 * 1000
  )
    throw new Error("Janela de atendimento encerrada. Use um modelo aprovado.");
  const payload = {
    messaging_product: "whatsapp",
    to: conversation.phone,
    type: "text",
    text: { body: text },
  };
  await (transaction || db()).query(
    `INSERT INTO alc_atendimento.outbox(dedupe_key,conversation_id,channel,phone,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(dedupe_key) DO NOTHING`,
    [key, conversation.id, conversation.channel, conversation.phone, payload],
  );
  if (actor)
    await audit(actor, "reply_queued", conversation.id, {}, transaction);
}
async function driverAnswer(
  conversation: Conversation,
  text: string,
  transaction: PoolClient,
) {
  const n = normalize(text),
    state = conversation.agent_state;
  if (/EQUIPE|LOSS|ATENDENTE|HUMANO/.test(n))
    return {
      state: { step: "human" },
      reply: "Vou encaminhar seu atendimento à equipe Loss.",
      handoff: true,
    };
  if (!conversation.identity_verified) {
    if (state.step !== "driver_base")
      return {
        state: { step: "driver_base", name: text.trim() },
        reply: "Qual é sua base operacional?",
      };
    const rows = (
      await transaction.query(
        "SELECT record FROM alc_atendimento.cases WHERE driver_phone=$1",
        [conversation.phone],
      )
    ).rows;
    const matches = rows
      .map((r) => r.record as CaseRecord)
      .filter(
        (r) =>
          normalize(r.driverName) === normalize(state.name) &&
          [normalize(r.baseKey), normalize(r.sigla)].includes(n),
      );
    const ids = new Set(matches.map((r) => r.driverId).filter(Boolean));
    if (ids.size !== 1)
      return {
        state: { step: "human" },
        reply:
          "Não consegui confirmar seu cadastro com nome, base e telefone. A equipe vai validar sua identidade antes de mostrar as PNRs.",
        handoff: true,
      };
    const record = matches[0];
    await transaction.query(
      `UPDATE alc_atendimento.conversations SET identity_verified=true,driver_id=$2,name=$3,base_key=$4,sigla=$5 WHERE id=$1`,
      [
        conversation.id,
        record.driverId,
        record.driverName,
        record.baseKey,
        record.sigla,
      ],
    );
    conversation.identity_verified = true;
    conversation.driver_id = record.driverId;
    conversation.name = record.driverName;
    conversation.base_key = record.baseKey;
    conversation.sigla = record.sigla;
  }
  // M11 applies only to a verified driver. Acareação is delivered physically
  // to the responsible dispatcher; the bot never accepts photo/upload as proof.
  if (/ACAREACAO|TENHO (UM )?COMPROVANTE|TENHO EVIDENCIA|COMO (ENVIAR|ENTREGAR) (O )?COMPROVANTE|COMO (FAZER|RESOLVER) (A )?PNR/.test(n)) {
    const text = DRIVER_STEPS.find((step) => step.id === "evidence")!.example;
    return {
      state: { step: "driver_verified" },
      reply: text.replace("[Nome do Motorista]", conversation.name || "motorista"),
    };
  }
  if (/CLIENTE (NAO|NUNCA) RECEBEU|DESTINATARIO (NAO|NUNCA) RECEBEU/.test(n))
    return {
      state: { step: "human" }, handoff: true,
      reply: "Vou encaminhar sua solicitação ao setor de Loss para análise do relato do destinatário.",
    };
  const historical = /ANTERIOR|HISTOR|ENCERRAD/.test(n);
  if (historical) await syncCore(true);
  const records = (
    await transaction.query(
      `SELECT record FROM alc_atendimento.cases WHERE driver_id=$1 AND driver_phone=$2 AND base_key=$3 AND sigla=$4 ORDER BY competence DESC,source_at DESC`,
      [
        conversation.driver_id,
        conversation.phone,
        conversation.base_key,
        conversation.sigla,
      ],
    )
  ).rows.map((r) => r.record as CaseRecord);
  const closed = /ENCERRAD/.test(n);
  const selected = records.filter((r) =>
    closed
      ? r.classification === "encerrada"
      : r.classification !== "encerrada",
  );
  const labels: Record<string, string> = {
    penalidade: "Com penalidade",
    aguardando_comprovante: "Aguardando comprovante",
    encerrada: "Encerrada",
    aberta: "Em aberto / revisão",
  };
  const lines = selected
    .slice(0, 20)
    .map(
      (r) =>
        `• Envio ${r.shipmentId} | ${labels[r.classification] || r.classification} | ${r.competence}`,
    );
  return {
    state: { step: "driver_verified" },
    reply: selected.length
      ? `${selected.length} PNR(s) ${closed ? "encerrada(s)" : "em aberto"} em seu cadastro:\n${lines.join("\n")}${selected.length > 20 ? "\nA equipe pode enviar o restante." : ""}\nPara consultar o histórico, envie “PNRs encerradas”. Para atendimento, envie “Falar com equipe Loss”.`
      : `Não localizei PNRs ${closed ? "encerradas" : "em aberto"} no seu cadastro com os dados disponíveis. Envie “PNRs anteriores” para atualizar competências anteriores ou “Falar com equipe Loss”.`,
  };
}
async function incoming(
  channel: Channel,
  value: Record<string, unknown>,
  transaction: PoolClient,
) {
  const id = String(value.id || ""),
    from = phone(value.from);
  if (!id || !from) return;
  const text = String(
    (value.text as { body?: string })?.body ||
      (value.button as { text?: string })?.text ||
      (value.interactive as { button_reply?: { title?: string } })?.button_reply
        ?.title ||
      "",
  );
  const result = await transaction.query(
    `INSERT INTO alc_atendimento.conversations(channel,phone,agent_state) VALUES($1,$2,$3) ON CONFLICT(channel,phone) DO UPDATE SET updated_at=now() RETURNING *`,
    [
      channel,
      from,
      channel === "driver" ? { step: "driver_name" } : { step: "human" },
    ],
  );
  const conversation = result.rows[0] as Conversation;
  const type = String(value.type || "text");
  const media = ["image", "document", "audio", "video", "sticker"].includes(
    type,
  )
    ? (value[type] as {
        id?: string;
        mime_type?: string;
        filename?: string;
        caption?: string;
      })
    : undefined;
  const attachment = media?.id
    ? {
        id: media.id,
        mime: media.mime_type || "",
        filename: media.filename || "",
        caption: media.caption || "",
      }
    : null;
  const inserted = await transaction.query(
    `INSERT INTO alc_atendimento.messages(conversation_id,provider_id,direction,body,type,attachment) VALUES($1,$2,'in',$3,$4,$5) ON CONFLICT(provider_id) DO NOTHING RETURNING id`,
    [
      conversation.id,
      id,
      text || media?.caption || `[${type} recebido]`,
      type,
      attachment,
    ],
  );
  if (!inserted.rowCount) return;
  const timestamp = Number(value.timestamp);
  const inboundAt =
    Number.isFinite(timestamp) && timestamp > 0
      ? new Date(Math.min(timestamp * 1000, Date.now())).toISOString()
      : new Date().toISOString();
  await transaction.query(
    "UPDATE alc_atendimento.conversations SET last_inbound_at=GREATEST(last_inbound_at,$2::timestamptz),unread=unread+1,updated_at=now() WHERE id=$1",
    [conversation.id, inboundAt],
  );
  conversation.last_inbound_at = inboundAt;
  if (Date.now() - new Date(inboundAt).getTime() > 86_400_000) return;
  if (conversation.status !== "bot") return;
  const automation = await setting<Automation>("automation");
  if (!automation.bot) {
    await transaction.query(
      "UPDATE alc_atendimento.conversations SET status='human' WHERE id=$1",
      [conversation.id],
    );
    return;
  }
  let answer;
  if (!text)
    answer = {
      state: { step: "human" },
      reply: "Recebemos seu anexo. Vou encaminhar à equipe para análise.",
      handoff: true,
    };
  else if (channel === "driver") {
    if (
      conversation.agent_state.step === "driver_name" &&
      /VERIFICAR|PNR|^OI$|^OLA$/.test(normalize(text))
    )
      answer = {
        state: { step: "driver_name" },
        reply:
          "Para consultar suas PNRs, informe seu nome completo. Em seguida pedirei sua base.",
      };
    else answer = await driverAnswer(conversation, text, transaction);
  } else if (!conversation.case_id || !conversation.identity_verified)
    answer = {
      state: { step: "human" },
      reply:
        "A equipe Loss vai identificar o envio relacionado ao seu atendimento.",
      handoff: true,
    };
  else answer = clientReply(conversation.agent_state, text, conversation.name);
  const updated = await transaction.query(
    "UPDATE alc_atendimento.conversations SET agent_state=$2,status=$3 WHERE id=$1 AND status='bot' AND agent_state=$4 RETURNING id",
    [
      conversation.id,
      answer.state,
      answer.handoff
        ? "human"
        : answer.state.step === "done"
          ? "resolved"
          : "bot",
      conversation.agent_state,
    ],
  );
  if (!updated.rowCount) return;
  await queueText(conversation, answer.reply, `reply:${id}`, null, transaction);
  if ("result" in answer.state)
    await transaction.query(
      "INSERT INTO alc_atendimento.audit(action,target,data) VALUES('treatment_recorded',$1,$2)",
      [conversation.id, { result: answer.state.result }],
    );
}
export async function processEvents() {
  const events = await db().query(
    "SELECT * FROM alc_atendimento.webhook_events WHERE processed_at IS NULL ORDER BY created_at LIMIT 30",
  );
  for (const event of events.rows) {
    try {
      const config = await channelConfig(event.channel);
      for (const entry of event.payload.entry || [])
        for (const change of entry.changes || []) {
          const value = change.value;
          if (value?.metadata?.phone_number_id !== config.phoneId) continue;
          for (const status of value.statuses || []) {
            await db().query(
              "UPDATE alc_atendimento.messages SET status=$2 WHERE provider_id=$1",
              [status.id, String(status.status)],
            );
          }
          for (const message of value.messages || []) {
            const transaction = await db().connect();
            try {
              await transaction.query("BEGIN");
              await incoming(event.channel, message, transaction);
              await transaction.query("COMMIT");
            } catch (error) {
              await transaction.query("ROLLBACK");
              throw error;
            } finally {
              transaction.release();
            }
          }
        }
      await db().query(
        "UPDATE alc_atendimento.webhook_events SET processed_at=now(),error=NULL WHERE event_key=$1",
        [event.event_key],
      );
    } catch {
      await db().query(
        "UPDATE alc_atendimento.webhook_events SET error='Falha no processamento; verificar conexão e cadastro.' WHERE event_key=$1",
        [event.event_key],
      );
    }
  }
}
export function eventKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}
export async function processOutbox() {
  // A process crash during a network request is ambiguous; never resend automatically.
  await db().query(
    "UPDATE alc_atendimento.outbox SET status='uncertain',error='Envio interrompido; conferir na Meta antes de reenviar.' WHERE status='sending' AND updated_at<now()-interval '2 minutes'",
  );
  const jobs = await db().query(
    "SELECT * FROM alc_atendimento.outbox WHERE status='pending' ORDER BY created_at LIMIT 10",
  );
  for (const job of jobs.rows) {
    const config = await channelConfig(job.channel);
    if (!config.token || !config.appSecret) continue;
    if (job.case_id) {
      const current = (
        await db().query(
          "SELECT record FROM alc_atendimento.cases WHERE case_id=$1",
          [job.case_id],
        )
      ).rows[0]?.record as CaseRecord | undefined;
      const recipient =
        job.channel === "driver"
          ? current?.driverPhone
          : current?.customerPhone;
      const invalid =
        !current ||
        current.classification === "encerrada" ||
        recipient !== job.phone ||
        (job.channel === "client" && !current.customerVerified) ||
        (job.channel === "driver" &&
          !driverNotificationEligible(current.classification));
      if (invalid) {
        await db().query(
          "UPDATE alc_atendimento.outbox SET status='cancelled',error='Caso ou contato mudou após entrar na fila.' WHERE id=$1",
          [job.id],
        );
        continue;
      }
    }
    // Serialize takeover and sends for this conversation, including the bounded provider request.
    const sending = job.conversation_id ? await db().connect() : null;
    try {
      if (sending)
        await sending.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [
          job.conversation_id,
        ]);
      const connection = sending || db();
      const claimed = await connection.query(
        "UPDATE alc_atendimento.outbox SET status='sending',attempts=attempts+1,updated_at=now() WHERE id=$1 AND status='pending' RETURNING id",
        [job.id],
      );
      if (!claimed.rowCount) continue;
      // Recheck the service window and human takeover immediately before a bot reply.
      if (job.payload.type === "text") {
        const c = (
          await connection.query(
            "SELECT * FROM alc_atendimento.conversations WHERE id=$1",
            [job.conversation_id],
          )
        ).rows[0];
        if (
          !c?.last_inbound_at ||
          Date.now() - new Date(c.last_inbound_at).getTime() > 86_400_000 ||
          (job.dedupe_key.startsWith("reply:") && !botReplyAllowed(c))
        ) {
          await connection.query(
            "UPDATE alc_atendimento.outbox SET status='cancelled',error='Janela encerrada ou atendimento assumido.' WHERE id=$1",
            [job.id],
          );
          continue;
        }
      }
      try {
        const sent = await graph(
          config,
          `${config.phoneId}/messages`,
          job.payload,
        );
        const provider = sent.messages?.[0]?.id;
        if (!provider)
          throw new Error("Meta não confirmou o identificador de envio.");
        await connection.query(
          "UPDATE alc_atendimento.outbox SET status='sent',provider_id=$2,updated_at=now() WHERE id=$1",
          [job.id, provider],
        );
        if (job.conversation_id)
          await connection.query(
            `INSERT INTO alc_atendimento.messages(conversation_id,provider_id,direction,body,status,type) VALUES($1,$2,'out',$3,'sent',$4) ON CONFLICT(provider_id) DO NOTHING`,
            [
              job.conversation_id,
              provider,
              job.payload.text?.body ||
                `[Modelo: ${job.payload.template?.name}]`,
              job.payload.type,
            ],
          );
      } catch (error) {
        const uncertain = !(
          error instanceof Error && /^Meta 4\d\d \(/.test(error.message)
        );
        await connection.query(
          "UPDATE alc_atendimento.outbox SET status=$2,error=$3,updated_at=now() WHERE id=$1",
          [
            job.id,
            uncertain ? "uncertain" : "failed",
            uncertain
              ? "Resposta do provedor não confirmada. Revisão manual necessária."
              : (error as Error).message,
          ],
        );
      }
    } finally {
      if (sending) {
        try {
          await sending.query(
            "SELECT pg_advisory_unlock(hashtextextended($1,0))",
            [job.conversation_id],
          );
          sending.release();
        } catch (error) {
          sending.release(
            error instanceof Error ? error : new Error("Lock release failed"),
          );
          throw error;
        }
      }
    }
  }
}
