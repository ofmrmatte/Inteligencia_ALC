SELECT pg_advisory_xact_lock(hashtext('alc_atendimento_agent_settings'));

ALTER TABLE alc_atendimento.outbox ADD COLUMN IF NOT EXISTS agent_policy text
  CHECK(agent_policy IS NULL OR agent_policy='unsupported_client_audio_v1');

INSERT INTO alc_atendimento.settings(key,value)
VALUES ('agent_ai_config_v1','{"revision":0,"enabled":false,"provider":"openai","model":"","dailyCallLimit":10,"timeoutMs":8000}')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS alc_atendimento.agent_ai_daily_usage (
  usage_day date PRIMARY KEY,
  calls integer NOT NULL CHECK(calls BETWEEN 1 AND 1000)
);
CREATE TABLE IF NOT EXISTS alc_atendimento.agent_ai_call_claims (
  inbound_key text PRIMARY KEY,
  usage_day date NOT NULL,
  config_revision integer NOT NULL CHECK(config_revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS alc_atendimento.agent_decisions (
  inbound_message_id uuid PRIMARY KEY REFERENCES alc_atendimento.messages(id),
  conversation_id uuid NOT NULL REFERENCES alc_atendimento.conversations(id),
  instruction_revision integer NOT NULL CHECK(instruction_revision >= 0),
  instruction_snapshot jsonb NOT NULL CHECK(jsonb_typeof(instruction_snapshot)='object'),
  config_snapshot jsonb NOT NULL CHECK(jsonb_typeof(config_snapshot)='object'),
  decision jsonb NOT NULL CHECK(jsonb_typeof(decision)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atendimento_agent_decision_conversation
  ON alc_atendimento.agent_decisions(conversation_id,created_at DESC);
CREATE OR REPLACE FUNCTION alc_atendimento.reject_agent_snapshot_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Agent snapshots and call claims are immutable';
END;
$$;
DROP TRIGGER IF EXISTS immutable_agent_decisions ON alc_atendimento.agent_decisions;
CREATE TRIGGER immutable_agent_decisions BEFORE UPDATE OR DELETE ON alc_atendimento.agent_decisions
FOR EACH ROW EXECUTE FUNCTION alc_atendimento.reject_agent_snapshot_mutation();
DROP TRIGGER IF EXISTS immutable_agent_ai_claims ON alc_atendimento.agent_ai_call_claims;
CREATE TRIGGER immutable_agent_ai_claims BEFORE UPDATE OR DELETE ON alc_atendimento.agent_ai_call_claims
FOR EACH ROW EXECUTE FUNCTION alc_atendimento.reject_agent_snapshot_mutation();
REVOKE ALL ON alc_atendimento.agent_ai_daily_usage, alc_atendimento.agent_ai_call_claims,
  alc_atendimento.agent_decisions FROM PUBLIC;
