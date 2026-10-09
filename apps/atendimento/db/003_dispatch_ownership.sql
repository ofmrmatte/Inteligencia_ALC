CREATE TABLE IF NOT EXISTS alc_atendimento.dispatch_batches (
  id uuid PRIMARY KEY,
  triggered_by uuid,
  mode text NOT NULL CHECK (mode IN ('individual','global','automatic')),
  channel text NOT NULL CHECK (channel IN ('driver','client')),
  request_hash text NOT NULL CHECK (length(request_hash)=64),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE alc_atendimento.outbox ADD COLUMN IF NOT EXISTS triggered_by uuid;
ALTER TABLE alc_atendimento.outbox ADD COLUMN IF NOT EXISTS assigned_to uuid;
ALTER TABLE alc_atendimento.outbox ADD COLUMN IF NOT EXISTS assignment_version integer;
ALTER TABLE alc_atendimento.outbox ADD COLUMN IF NOT EXISTS operator_name_snapshot text;
ALTER TABLE alc_atendimento.outbox ADD COLUMN IF NOT EXISTS base_key text;
ALTER TABLE alc_atendimento.outbox ADD COLUMN IF NOT EXISTS sigla text;
ALTER TABLE alc_atendimento.outbox ADD COLUMN IF NOT EXISTS dispatch_batch_id uuid REFERENCES alc_atendimento.dispatch_batches(id);
ALTER TABLE alc_atendimento.outbox ADD COLUMN IF NOT EXISTS template_name text;
ALTER TABLE alc_atendimento.outbox ADD COLUMN IF NOT EXISTS template_version text;
ALTER TABLE alc_atendimento.outbox ADD COLUMN IF NOT EXISTS delivery_status text;
CREATE INDEX IF NOT EXISTS atendimento_dispatch_batch ON alc_atendimento.outbox(dispatch_batch_id,created_at);
CREATE INDEX IF NOT EXISTS atendimento_dispatch_case_channel ON alc_atendimento.outbox(case_id,channel);
-- Legacy jobs retain their actual history; never invent an owner or sender snapshot.
