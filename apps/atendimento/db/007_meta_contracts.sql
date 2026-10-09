SELECT pg_advisory_xact_lock(hashtext('alc_atendimento_schema_v1'));
CREATE TABLE alc_atendimento.meta_template_contracts (
  channel text NOT NULL CHECK (channel IN ('driver','client')),
  revision integer NOT NULL CHECK (revision > 0),
  baseline jsonb NOT NULL CHECK (jsonb_typeof(baseline)='object' AND octet_length(baseline::text)<=65536),
  reviewed_by uuid NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel,revision),
  CHECK (coalesce(baseline ?& ARRAY['channel','contentVersion'] AND baseline->>'channel'=channel AND baseline->>'contentVersion' ~ '^[a-f0-9]{64}$',false))
);
REVOKE ALL ON alc_atendimento.meta_template_contracts FROM PUBLIC;
ALTER TABLE alc_atendimento.outbox
  ADD COLUMN template_contract_revision integer,
  ADD COLUMN template_evidence jsonb,
  ADD COLUMN rendered_template_text text,
  ADD FOREIGN KEY (channel,template_contract_revision) REFERENCES alc_atendimento.meta_template_contracts(channel,revision),
  ADD CHECK (template_evidence IS NULL OR coalesce((
    jsonb_typeof(template_evidence)='object' AND template_evidence ?& ARRAY['contentVersion','renderedText']
    AND template_contract_revision IS NOT NULL AND template_version IS NOT NULL AND rendered_template_text IS NOT NULL
    AND template_version ~ '^[a-f0-9]{64}$'
    AND template_evidence->>'contentVersion'=template_version
    AND template_evidence->>'renderedText'=rendered_template_text
    AND length(rendered_template_text) BETWEEN 1 AND 8192
  ),false));
ALTER TABLE alc_atendimento.messages
  ADD COLUMN template_version text,
  ADD COLUMN template_contract_revision integer,
  ADD COLUMN template_evidence jsonb,
  ADD CHECK (template_evidence IS NULL OR coalesce((
    jsonb_typeof(template_evidence)='object' AND template_evidence ?& ARRAY['contentVersion','renderedText']
    AND template_version IS NOT NULL AND template_contract_revision IS NOT NULL
    AND template_version ~ '^[a-f0-9]{64}$'
    AND template_evidence->>'contentVersion'=template_version
    AND template_evidence->>'renderedText'=body
  ),false));
CREATE FUNCTION alc_atendimento.meta_contract_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Reviewed Meta contract history is immutable';
END;
$$;
CREATE TRIGGER meta_contract_history_immutable BEFORE UPDATE OR DELETE ON alc_atendimento.meta_template_contracts
FOR EACH ROW EXECUTE FUNCTION alc_atendimento.meta_contract_history_immutable();

CREATE FUNCTION alc_atendimento.meta_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.template_evidence IS NOT NULL OR to_jsonb(OLD)->'payload'->>'type'='template' OR to_jsonb(OLD)->>'type'='template' THEN
      RAISE EXCEPTION 'Meta evidence history is immutable';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.template_evidence IS DISTINCT FROM OLD.template_evidence THEN
    RAISE EXCEPTION 'Meta evidence cannot be replaced or backfilled';
  END IF;
  IF OLD.template_evidence IS NOT NULL OR to_jsonb(OLD)->'payload'->>'type'='template' OR to_jsonb(OLD)->>'type'='template' THEN
    IF NEW.template_version IS DISTINCT FROM OLD.template_version
       OR NEW.template_contract_revision IS DISTINCT FROM OLD.template_contract_revision THEN
      RAISE EXCEPTION 'Meta evidence history is immutable';
    END IF;
    IF (NEW.sender_kind,NEW.sender_display_name_snapshot,to_jsonb(NEW)->'sender_user_id',to_jsonb(NEW)->'case_id',to_jsonb(NEW)->'conversation_id')
       IS DISTINCT FROM
       (OLD.sender_kind,OLD.sender_display_name_snapshot,to_jsonb(OLD)->'sender_user_id',to_jsonb(OLD)->'case_id',to_jsonb(OLD)->'conversation_id') THEN
      RAISE EXCEPTION 'Meta author and case snapshots are immutable';
    END IF;
    IF TG_TABLE_NAME='outbox' THEN
      IF to_jsonb(NEW)-ARRAY['status','attempts','error','provider_id','delivery_status','updated_at']
         IS DISTINCT FROM
         to_jsonb(OLD)-ARRAY['status','attempts','error','provider_id','delivery_status','updated_at'] THEN
        RAISE EXCEPTION 'Meta queued snapshot is immutable';
      END IF;
      IF OLD.status IN ('sending','uncertain','sent') AND NEW.status='pending' THEN
        RAISE EXCEPTION 'Requested Meta messages cannot be blindly retried';
      END IF;
    ELSIF (NEW.body,NEW.type,NEW.direction,NEW.actor_id,NEW.attachment) IS DISTINCT FROM
          (OLD.body,OLD.type,OLD.direction,OLD.actor_id,OLD.attachment) THEN
      RAISE EXCEPTION 'Meta rendered message and provenance are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meta_outbox_evidence_immutable BEFORE UPDATE OR DELETE ON alc_atendimento.outbox
FOR EACH ROW EXECUTE FUNCTION alc_atendimento.meta_evidence_immutable();
CREATE TRIGGER meta_message_evidence_immutable BEFORE UPDATE OR DELETE ON alc_atendimento.messages
FOR EACH ROW EXECUTE FUNCTION alc_atendimento.meta_evidence_immutable();
CREATE FUNCTION alc_atendimento.meta_outbox_snapshot_required() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payload->>'type'='template' AND (NEW.template_evidence IS NULL OR NEW.rendered_template_text IS NULL OR NEW.template_contract_revision IS NULL) THEN
    RAISE EXCEPTION 'New Meta templates require reviewed evidence';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meta_outbox_snapshot_required BEFORE INSERT ON alc_atendimento.outbox
FOR EACH ROW EXECUTE FUNCTION alc_atendimento.meta_outbox_snapshot_required();
-- Historical rows stay unchanged. Legacy queued templates are blocked by processOutbox.
