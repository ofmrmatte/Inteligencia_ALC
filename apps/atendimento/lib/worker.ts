import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { db, setting, audit } from "./db";
import {
  phone,
  normalize,
  clientReply,
  contactOptedOut,
  CLIENT_AUDIO_NOTICE_POLICY,
  UNSUPPORTED_AUDIO_RECORD,
  clientAudioNoticeText,
  clientAudioNoticeAllowed,
  driverNotificationEligible,
  type CaseRecord,
  type AgentState,
} from "./domain";
import { channelConfig, graph, type Channel } from "./meta";
import { syncCore, type Automation } from "./source";
import { fillScript, scriptText } from "./agent-playbook";
import { instructionSnapshotFor, loadInstructions, runtimeScripts } from "./agent-instructions";
import { resolveInboundAgentDecision } from "./agent-ai";
import { AGENT_DISPLAY_NAME } from "./agent-brand";
import { validateQueuedAuthor } from "./dispatch-authorization";
import { HttpError } from "./auth";
import { outboundMedia } from "./media-service";
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
  displayName = "",
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
    `INSERT INTO alc_atendimento.outbox(dedupe_key,conversation_id,channel,phone,payload,sender_kind,sender_user_id,sender_display_name_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(dedupe_key) DO NOTHING`,
    [
      key,
      conversation.id,
      conversation.channel,
      conversation.phone,
      payload,
      actor ? "human" : "ai",
      actor,
      actor ? displayName : AGENT_DISPLAY_NAME,
    ],
  );
  if (actor)
    await audit(actor, "reply_queued", conversation.id, {}, transaction);
}
async function driverAnswer(
  conversation: Conversation,
  text: string,
  transaction: PoolClient,
  overrides?: Record<string, string>,
) {
  const n = normalize(text);
  const state = conversation.agent_state;
  const title = (code: string, values: Record<string, string> = {}) =>
    fillScript(overrides?.[code] || scriptText("driver", code), {
      "Nome do Motorista": conversation.name || state.name || "Motorista",
      Base: conversation.base_key || "sua base",
      ...values,
    });
  if (
    /LOSS|ATENDENTE|HUMANO|FALAR COM (A )?EQUIPE/.test(n) ||
    (state.step === "driver_continue" && n === "3") ||
    (state.step === "driver_name" && n === "2")
  ) {
    return {
      state: { step: "human" },
      reply: title("M13", { ID: conversation.case_id || "em análise" }),
      handoff: true,
    };
  }
  if (
    /^(ENCERRAR|SAIR|FINALIZAR|FIM)$/.test(n) ||
    (state.step === "driver_select" && n === "6") ||
    (state.step === "driver_continue" && n === "4") ||
    (state.step === "driver_name" && n === "3")
  ) {
    return { state: { step: "done" }, reply: title("M15") };
  }
  let justVerified = false;
  if (!conversation.identity_verified) {
    if (state.step !== "driver_base") {
      if (/^(OI|OLA|BOM DIA|BOA TARDE|BOA NOITE|MENU|INICIO|0)$/.test(n))
        return { state: { step: "driver_name" }, reply: title("M01") };
      if (
        /^(1|VERIFICAR PNR|CONSULTAR PNR|MINHAS PNRS|VERIFICAR|CONSULTAR)$/.test(
          n,
        )
      )
        return { state: { step: "driver_name" }, reply: title("M02") };
      // Do not use supplied names to grant permissions; require database verification.
      if (text.trim().split(/\s+/).length < 2)
        return { state: { step: "driver_name" }, reply: title("M02") };
      return {
        state: { step: "driver_base", name: text.trim() },
        reply:
          "Obrigado! Para confirmar sua identificação, informe sua base operacional.",
      };
    }
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
    if (ids.size !== 1 || !matches.length)
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
    justVerified = true;
  }
  if (/NAO RECEBEU|NAO FOI ENTREGUE|DESTINATARIO NAO|CLIENTE NAO/.test(n))
    return {
      state: { step: "human" },
      reply: title("M13", { ID: conversation.case_id || "em análise" }),
      handoff: true,
    };
  // Historical imports remain subject to the existing authenticated query constraints.
  if (/ANTERIOR|HISTOR/.test(n)) await syncCore(true);
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
  if (justVerified)
    return {
      state: { step: "driver_select" },
      reply: `${title("M03")}\n\n${title("M04", { Quantidade: String(records.length) })}`,
    };
  const exactCase = records.find(
    (r) => normalize(r.caseId) === n || normalize(r.shipmentId) === n,
  );
  if (exactCase)
    return {
      state: { step: "driver_continue", selectedCaseId: exactCase.caseId },
      reply: `Envio ${exactCase.shipmentId} | Caso ${exactCase.caseId} | Status: ${exactCase.classification === "aberta" ? "Em revisão" : exactCase.classification === "penalidade" ? "Com penalidade" : exactCase.classification === "aguardando_comprovante" ? "Aguardando comprovante" : "Encerrada"}.\n\n${title("M14")}`,
    };
  const selected = records.find(
    (r) =>
      r.caseId === state.selectedCaseId ||
      r.shipmentId === state.selectedShipmentId,
  );
  const related = selected || (records.length === 1 ? records[0] : null);
  const evidenceText = () => {
    if (related)
      return title("M11", {
        ID: related.shipmentId,
        Caso: related.caseId,
        Base: related.baseKey,
      });
    return title("M11", {
      ID: "identifique o envio",
      Caso: "identifique o caso",
      Base: conversation.base_key || "sua base",
    });
  };
  if (
    /ACAREACAO|TENHO (UM )?COMPROVANTE|TENHO EVIDENCIA|COMO (ENVIAR|ENTREGAR) (O )?COMPROVANTE/.test(
      n,
    )
  )
    return {
      state: { ...state, step: "driver_continue" },
      reply: evidenceText(),
    };
  if (/COMO (RESOLVER|TRATAR|FAZER)|COMO PROCEDER/.test(n))
    return {
      state: { ...state, step: "driver_continue" },
      reply: title("M10"),
    };
  if (/NAO FATURAD/.test(n) || (state.step === "driver_select" && n === "2"))
    return { state: { step: "human" }, reply: title("M08"), handoff: true };
  if (
    /OUTRA (PNR|CONSULTA)|CONSULTAR OUTR|OUTRO STATUS|VERIFICAR PNR/.test(n) ||
    (state.step === "driver_continue" && (n === "1" || n === "2"))
  ) {
    return {
      state: { step: "driver_select" },
      reply: title("M04", { Quantidade: String(records.length) }),
    };
  }
  const closed = /ENCERRAD/.test(n);
  const status =
    /AGUARDANDO|COMPROVANTE/.test(n) ||
    (state.step === "driver_select" && n === "1")
      ? "aguardando_comprovante"
      : /PENALIDADE/.test(n) || (state.step === "driver_select" && n === "3")
        ? "penalidade"
        : /REVISAO|EM REVISAO/.test(n) ||
            (state.step === "driver_select" && n === "4")
          ? "aberta"
          : closed
            ? "encerrada"
            : "all";
  if (!conversation.identity_verified)
    throw new Error("Consulta sem identidade validada.");
  const filtered = records.filter(
    (r) => status === "all" || r.classification === status,
  );
  const labels: Record<string, string> = {
    aguardando_comprovante: "Aguardando comprovante",
    penalidade: "Com penalidade",
    aberta: "Em aberto / revisão",
    encerrada: "Encerrada",
  };
  const list =
    filtered
      .slice(0, 20)
      .map(
        (r) =>
          `• Envio ${r.shipmentId} | Caso ${r.caseId} | ${labels[r.classification] || "Em revisão"} | ${r.competence}`,
      )
      .join("\n") +
    (filtered.length > 20
      ? "\nHá mais ocorrências; solicite apoio ao Loss para a lista completa."
      : "");
  const c =
    filtered.length === 0
      ? "M09"
      : status === "aguardando_comprovante"
        ? "M05"
        : status === "penalidade"
          ? "M06"
          : status === "aberta"
            ? "M07"
            : "";
  const response =
    c === "M09"
      ? title(c, { Competência: records[0]?.competence || "vigente" })
      : c
        ? title(c, { Quantidade: String(filtered.length), Ocorrências: list })
        : `PNRs localizadas: ${filtered.length}.\n${list}`;
  return {
    state: { step: "driver_continue" },
    reply: `${response}\n\n${title("M14")}`,
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
  // A voluntary new consultation may restart a previously finished driver chat.
  // Never override a human-owned conversation or auto-reopen resolved customer contacts.
  if (
    channel === "driver" &&
    conversation.status === "resolved" &&
    !conversation.assigned_to &&
    /^(VERIFICAR PNR|CONSULTAR PNR|OI|OLA)$/.test(normalize(text))
  ) {
    await transaction.query(
      "UPDATE alc_atendimento.conversations SET status='bot',identity_verified=false,agent_state=$2,updated_at=now() WHERE id=$1 AND status='resolved' AND assigned_to IS NULL",
      [conversation.id, { step: "driver_name" }],
    );
    conversation.status = "bot";
    conversation.identity_verified = false;
    conversation.agent_state = { step: "driver_name" };
  }
  const type = String(value.type || "text");
  const media = ["image", "document", "audio", "video", "sticker"].includes(
    type,
  )
    ? (value[type] as {
        id?: string;
        mime_type?: string;
        filename?: string;
        caption?: string;
        voice?: boolean;
      })
    : undefined;
  const attachment = media?.id
    ? {
        id: media.id,
        mime: media.mime_type || "",
        filename: media.filename || "",
        caption: media.caption || "",
        voice: media.voice === true,
        ...(channel === "client" && type === "audio"
          ? { unsupported: true, policy: CLIENT_AUDIO_NOTICE_POLICY }
          : {}),
      }
    : null;
  const inserted = await transaction.query(
    `INSERT INTO alc_atendimento.messages(conversation_id,provider_id,direction,body,type,attachment,sender_kind,case_id) VALUES($1,$2,'in',$3,$4,$5,'contact',$6) ON CONFLICT(provider_id) DO NOTHING RETURNING id`,
    [
      conversation.id,
      id,
      channel === "client" && type === "audio"
        ? UNSUPPORTED_AUDIO_RECORD
        : text || media?.caption || `[${type} recebido]`,
      type,
      attachment,
      conversation.case_id || null,
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
  if (channel === "client" && contactOptedOut(text) && !conversation.agent_state.optOut) {
    await transaction.query("UPDATE alc_atendimento.conversations SET agent_state=jsonb_set(agent_state,'{optOut}','true'::jsonb) WHERE id=$1", [conversation.id]);
    conversation.agent_state = { ...conversation.agent_state, optOut: true };
  }
  if (Date.now() - new Date(inboundAt).getTime() > 86_400_000) return;
  if (channel === "client" && type === "audio") {
    // Retain only provider metadata. Audio cannot change treatment, human ownership or opt-out.
    if (!["bot", "human", "pending"].includes(conversation.status) || conversation.agent_state.step === "done" || conversation.agent_state.optOut || contactOptedOut(text)) return;
    const priorText = (await transaction.query(
      "SELECT body FROM alc_atendimento.messages WHERE conversation_id=$1 AND direction='in' AND type IN ('text','button','interactive') ORDER BY created_at DESC,id DESC LIMIT 1",
      [conversation.id],
    )).rows[0]?.body;
    if (priorText && contactOptedOut(priorText)) return;
    const payload = { messaging_product: "whatsapp", to: conversation.phone, type: "text", text: { body: clientAudioNoticeText() } };
    await transaction.query(
      `INSERT INTO alc_atendimento.outbox(dedupe_key,conversation_id,channel,phone,payload,sender_kind,sender_user_id,sender_display_name_snapshot,agent_policy)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(dedupe_key) DO NOTHING`,
      [`reply:audio:${id}`, conversation.id, channel, conversation.phone, payload, "ai", null, AGENT_DISPLAY_NAME, CLIENT_AUDIO_NOTICE_POLICY],
    );
    await audit(null, "agent_audio_notice_queued", conversation.id, { reason: "unsupported_client_audio" }, transaction);
    return;
  }
  if (conversation.agent_state.optOut && !contactOptedOut(text)) return;
  if (conversation.status !== "bot") return;
  const automation = await setting<Automation>("automation");
  if (!automation.bot) {
    await transaction.query(
      "UPDATE alc_atendimento.conversations SET status='human' WHERE id=$1",
      [conversation.id],
    );
    return;
  }
  const savedInstructions = await loadInstructions(transaction);
  let answer;
  if (!text)
    answer = {
      state: { step: "human" },
      reply:
        channel === "driver"
          ? "Para tratar a PNR, a evidência é a acareação manual entregue ao dispatcher responsável. Não é necessário enviar arquivos por este canal. Vou direcionar sua mensagem ao setor de Loss."
          : "Recebemos seu anexo. Vou encaminhar à equipe para análise.",
      handoff: true,
    };
  else if (channel === "driver") {
    answer = await driverAnswer(
      conversation,
      text,
      transaction,
      runtimeScripts(savedInstructions, "driver"),
    );
  } else if (!conversation.case_id || !conversation.identity_verified)
    answer = {
      state: { step: "human" },
      reply:
        "A equipe Loss vai identificar o envio relacionado ao seu atendimento.",
      handoff: true,
    };
  else
    answer = clientReply(conversation.agent_state, text, conversation.name, {
      shipmentId: conversation.case_id || "",
      overrides: runtimeScripts(savedInstructions, "client"),
    });
  const agentDecision = await resolveInboundAgentDecision({
    channel, state: conversation.agent_state, text, baseline: answer,
    identityVerified: conversation.identity_verified,
    instructions: savedInstructions, inboundKey: id,
    customerName: conversation.name, shipmentId: conversation.case_id,
    sensitiveValues: [conversation.phone, conversation.driver_id, conversation.agent_state.name ?? ""],
  }, { transaction });
  answer = agentDecision.answer;
  if (channel === "client" && contactOptedOut(text)) answer.state = { ...answer.state, optOut: true };
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
  await transaction.query(
    `INSERT INTO alc_atendimento.agent_decisions(inbound_message_id,conversation_id,instruction_revision,instruction_snapshot,config_snapshot,decision)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [inserted.rows[0].id, conversation.id, savedInstructions.revision,
      instructionSnapshotFor(channel, savedInstructions), agentDecision.configSnapshot, agentDecision.decision],
  );
  await audit(null, "agent_decision", conversation.id, agentDecision.decision, transaction);
  if (answer.reply)
    await queueText(
      conversation,
      answer.reply,
      `reply:${id}`,
      null,
      transaction,
    );
  if ("result" in answer.state)
    await transaction.query(
      "INSERT INTO alc_atendimento.audit(action,target,data) VALUES('treatment_recorded',$1,$2)",
      [
        conversation.id,
        {
          result: answer.state.result,
          caseCenterStatus: "unchanged",
          complaintClosure: "not_verified",
          // Resolve the conversation, never mutate the Mercado Livre PNR.
        },
      ],
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
            if (
              !["sent", "delivered", "read", "failed"].includes(status.status)
            )
              continue;
            await db().query(
              `WITH updated_messages AS (
                 UPDATE alc_atendimento.messages SET status=$2 WHERE provider_id=$1 AND
                   coalesce(array_position(ARRAY['sent','failed','delivered','read'],status),0)<=array_position(ARRAY['sent','failed','delivered','read'],$2)
               ) UPDATE alc_atendimento.outbox SET delivery_status=$2,updated_at=now() WHERE provider_id=$1 AND
                   coalesce(array_position(ARRAY['sent','failed','delivered','read'],delivery_status),0)<=array_position(ARRAY['sent','failed','delivered','read'],$2)`,
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
          "UPDATE alc_atendimento.outbox SET status='cancelled',error='Caso ou contato mudou após entrar na fila.' WHERE id=$1 AND status='pending'",
          [job.id],
        );
        continue;
      }
    }
    // Read the provider outside DB locks; reread the reviewed baseline inside them.
    let providerCatalog: unknown, catalogError: unknown;
    if (job.payload.type === "template") {
      try {
        const { readTemplateContract } = await import("./template-contract-config");
        const { templates } = await import("./meta");
        await readTemplateContract(job.channel);
        providerCatalog = await templates(job.channel, config);
      } catch (error) {
        catalogError = error;
      }
    }
    // Serialize takeover and sends for this conversation, including the bounded provider request.
    const authorizationRequired = Boolean(
      job.dispatch_batch_id ||
      job.sender_kind === "human" ||
      job.payload.type === "template",
    );
    const sending =
      job.conversation_id || authorizationRequired
        ? await db().connect()
        : null;
    let directoryLocked = false,
      caseLocked = false,
      contractLocked = false;
    try {
      if (sending && authorizationRequired) {
        await sending.query(
          "SELECT pg_advisory_lock(hashtext('atendimento_operator_directory'))",
        );
        directoryLocked = true;
        if (job.case_id) {
          await sending.query("SELECT pg_advisory_lock(hashtext($1))", [
            `atendimento_case:${job.case_id}`,
          ]);
          caseLocked = true;
        }
      }
      if (sending)
        await sending.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [
          job.conversation_id,
        ]);
      const connection = sending || db();
      if (sending && authorizationRequired) {
        try {
          await validateQueuedAuthor(job, sending);
        } catch (error) {
          if (
            !(error instanceof HttpError) ||
            ![403, 409].includes(error.status)
          )
            throw error;
          await connection.query(
            "UPDATE alc_atendimento.outbox SET status='cancelled',error=$2,updated_at=now() WHERE id=$1 AND status='pending'",
            [job.id, error.message],
          );
          await audit(
            null,
            "dispatch_authorization_blocked",
            job.id,
            { reason: error.message },
            sending,
          );
          continue;
        }
      }
      if (job.payload.type === "template") {
        try {
          const { readTemplateContract } = await import("./template-contract-config");
          const { isDeepStrictEqual } = await import("node:util");
          const { assertTemplateSender, reviewTemplateContract, parseTemplateCatalog, parseTemplatePayload, validateTemplateContract, semanticTemplateValues, TemplateContractError } = await import("./template-contract");
          if (catalogError) throw catalogError;
          await connection.query("SELECT pg_advisory_lock(hashtext($1))", [`atendimento_meta_contract:${job.channel}`]);
          contractLocked = true;
          const { revision, contract } = await readTemplateContract(job.channel, connection);
          assertTemplateSender(contract, config);
          const payload = parseTemplatePayload(job.payload, contract, job.phone);
          if (job.media_id || typeof job.operator_name_snapshot !== "string")
            throw new TemplateContractError("snapshot do responsável ou tipo de envio inválido");
          const record = (await connection.query(
            "SELECT record FROM alc_atendimento.cases WHERE case_id=$1", [job.case_id],
          )).rows[0]?.record as CaseRecord | undefined;
          if (!record) throw new TemplateContractError("caso da fila ausente");
          const catalog = parseTemplateCatalog(providerCatalog);
          reviewTemplateContract(contract, catalog);
          const approved = catalog.find((entry) => entry.name === contract.name && entry.language === contract.language);
          const evidence = validateTemplateContract(approved, contract, payload.template.components,
            semanticTemplateValues(job.channel, record, job.operator_name_snapshot));
          if (
            job.template_contract_revision !== revision ||
            job.template_name !== contract.name || job.template_version !== evidence.contentVersion ||
            job.rendered_template_text !== evidence.renderedText ||
            !isDeepStrictEqual(job.template_evidence, evidence)
          ) throw new TemplateContractError("snapshot ou revisão mudou desde o enfileiramento");
        } catch (error) {
          const { TemplateContractError } = await import("./template-contract");
          const reason = error instanceof TemplateContractError || error instanceof HttpError
            ? error.message : "Catálogo ou baseline Meta indisponível; envio bloqueado antes da solicitação.";
          await connection.query(
            "UPDATE alc_atendimento.outbox SET status='cancelled',error=$2,updated_at=now() WHERE id=$1 AND status='pending'",
            [job.id, reason],
          );
          await audit(null, "meta_contract_send_blocked", job.id, { reason }, sending || undefined);
          continue;
        }
      }
      const claimed = await connection.query(
        "UPDATE alc_atendimento.outbox SET status='sending',attempts=attempts+1,updated_at=now() WHERE id=$1 AND status='pending' RETURNING id",
        [job.id],
      );
      if (!claimed.rowCount) continue;
      // The fixed audio notice is the only marked exception to normal bot takeover policy.
      if (job.payload.type !== "template" || job.agent_policy != null) {
        const markedNotice = job.agent_policy != null;
        const inbound = markedNotice ? (await connection.query(
          "SELECT conversation_id,provider_id,direction,type,created_at FROM alc_atendimento.messages WHERE conversation_id=$1 AND provider_id=$2",
          [job.conversation_id, job.dedupe_key.slice("reply:audio:".length)],
        )).rows[0] : undefined;
        const recentText = markedNotice ? (await connection.query(
          "SELECT body FROM alc_atendimento.messages WHERE conversation_id=$1 AND direction='in' AND type IN ('text','button','interactive') ORDER BY created_at DESC,id DESC LIMIT 1",
          [job.conversation_id],
        )).rows[0]?.body ?? "" : "";
        const c = (
          await connection.query(
            markedNotice
              ? "SELECT c.*,k.classification AS audio_case_classification FROM alc_atendimento.conversations c LEFT JOIN alc_atendimento.cases k ON k.case_id=c.case_id WHERE c.id=$1"
              : "SELECT * FROM alc_atendimento.conversations WHERE id=$1",
            [job.conversation_id],
          )
        ).rows[0];
        const noticeAllowed = markedNotice && c && !job.media_id &&
          c.audio_case_classification !== "encerrada" &&
          clientAudioNoticeAllowed(c, job, inbound, recentText);
        if (
          (markedNotice && !noticeAllowed) ||
          !c?.last_inbound_at ||
          c.phone !== job.phone ||
          Date.now() - new Date(c.last_inbound_at).getTime() > 86_400_000 ||
          (job.dedupe_key.startsWith("reply:") && !botReplyAllowed(c) && !noticeAllowed)
        ) {
          await connection.query(
            "UPDATE alc_atendimento.outbox SET status='cancelled',error='Janela encerrada ou atendimento assumido.' WHERE id=$1",
            [job.id],
          );
          if (markedNotice) await audit(null, "agent_audio_notice_cancelled", job.id,
            { reason: "audio_notice_policy_rejected" }, sending ?? undefined);
          continue;
        }
      }
      let messageRequested = false;
      try {
        let payload = job.payload;
        if (job.media_id) {
          const { row, bytes } = await outboundMedia(job.media_id, sending!);
          let providerMedia = row.provider_media_id;
          if (!providerMedia) {
            const multipart = new FormData();
            multipart.set("messaging_product", "whatsapp");
            multipart.set(
              "file",
              new Blob([new Uint8Array(bytes)], { type: row.mime }),
              row.filename,
            );
            const uploaded = await graph(
              config,
              `${config.phoneId}/media`,
              multipart,
            );
            if (
              typeof uploaded.id !== "string" ||
              !/^[0-9]{1,100}$/.test(uploaded.id)
            )
              throw new Error("Meta não confirmou o anexo.");
            providerMedia = uploaded.id;
            await connection.query(
              "UPDATE alc_atendimento.media SET provider_media_id=$2 WHERE id=$1",
              [row.id, providerMedia],
            );
          }
          payload = {
            messaging_product: "whatsapp",
            to: job.phone,
            type: row.type,
            [row.type]: {
              id: providerMedia,
              ...(job.payload.caption ? { caption: job.payload.caption } : {}),
              ...(row.type === "document" ? { filename: row.filename } : {}),
            },
          };
        }
        messageRequested = true;
        const sent = await graph(config, `${config.phoneId}/messages`, payload);
        const provider = sent.messages?.[0]?.id;
        if (!provider)
          throw new Error("Meta não confirmou o identificador de envio.");
        if (job.conversation_id) {
          await connection.query(
            `WITH inserted AS (
              INSERT INTO alc_atendimento.messages(conversation_id,provider_id,direction,body,status,type,sender_kind,sender_user_id,sender_display_name_snapshot,actor_id,attachment,case_id,template_version,template_contract_revision,template_evidence)
              VALUES($1,$2,'out',$3,'sent',$4,$5,$6,$7,$6,CASE WHEN $8::uuid IS NULL THEN NULL ELSE jsonb_build_object('internalId',$8::uuid) END,(SELECT coalesce(o.case_id,c.case_id) FROM alc_atendimento.outbox o LEFT JOIN alc_atendimento.conversations c ON c.id=o.conversation_id WHERE o.id=$9),
                (SELECT template_version FROM alc_atendimento.outbox WHERE id=$9),
                (SELECT template_contract_revision FROM alc_atendimento.outbox WHERE id=$9),
                (SELECT template_evidence FROM alc_atendimento.outbox WHERE id=$9))
              ON CONFLICT(provider_id) DO NOTHING RETURNING id
            ), linked AS (UPDATE alc_atendimento.media SET message_id=inserted.id FROM inserted WHERE alc_atendimento.media.id=$8::uuid)
            UPDATE alc_atendimento.outbox SET status='sent',provider_id=$2,delivery_status='sent',updated_at=now() WHERE id=$9`,
            [
              job.conversation_id,
              provider,
              job.media_id
                ? job.payload.caption || ""
                : job.payload.type === "template"
                  ? job.rendered_template_text
                  : job.payload.text?.body || "",
              job.payload.type,
              job.sender_kind || "system",
              job.sender_user_id || null,
              job.sender_display_name_snapshot || "",
              job.media_id || null,
              job.id,
            ],
          );
        } else
          await connection.query(
            "UPDATE alc_atendimento.outbox SET status='sent',provider_id=$2,delivery_status='sent',updated_at=now() WHERE id=$1",
            [job.id, provider],
          );
      } catch (error) {
        const uncertain =
          messageRequested &&
          !(error instanceof Error && /^Meta 4\d\d \(/.test(error.message));
        await connection.query(
          "UPDATE alc_atendimento.outbox SET status=$2,error=$3,updated_at=now() WHERE id=$1",
          [
            job.id,
            uncertain ? "uncertain" : "failed",
            uncertain
              ? "Resposta do provedor não confirmada. Revisão manual necessária."
              : error instanceof HttpError
                ? error.message
                : !messageRequested
                  ? "Anexo não enviado. Tente novamente após conferir o acervo."
                  : (error as Error).message,
          ],
        );
      }
    } finally {
      if (sending) {
        try {
          if (contractLocked)
            await sending.query("SELECT pg_advisory_unlock(hashtext($1))", [`atendimento_meta_contract:${job.channel}`]);
          await sending.query(
            "SELECT pg_advisory_unlock(hashtextextended($1,0))",
            [job.conversation_id],
          );
          if (caseLocked)
            await sending.query("SELECT pg_advisory_unlock(hashtext($1))", [
              `atendimento_case:${job.case_id}`,
            ]);
          if (directoryLocked)
            await sending.query(
              "SELECT pg_advisory_unlock(hashtext('atendimento_operator_directory'))",
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
