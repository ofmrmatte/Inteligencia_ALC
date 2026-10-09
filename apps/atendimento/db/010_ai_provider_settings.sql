SELECT pg_advisory_xact_lock(hashtext('alc_atendimento_schema_v1'));
ALTER TABLE alc_atendimento.step_up_challenges
  DROP CONSTRAINT step_up_challenges_operation_check,
  DROP CONSTRAINT step_up_challenges_channel_check,
  ADD CONSTRAINT step_up_challenges_operation_check CHECK (operation IN
    ('reveal_token_verification','replace_access_token','replace_app_secret','change_webhook_critical','replace_ai_credential','remove_ai_credential')),
  ADD CONSTRAINT step_up_challenges_channel_check CHECK (channel IN ('driver','client','openai','gemini')),
  ADD CONSTRAINT step_up_challenges_destination_check CHECK
    ((operation IN ('replace_ai_credential','remove_ai_credential')) = (channel IN ('openai','gemini')));

CREATE TABLE alc_atendimento.ai_provider_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('catalog','test')),
  attempted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX atendimento_ai_provider_attempt_window ON alc_atendimento.ai_provider_attempts(user_id,kind,attempted_at);
ALTER TABLE alc_atendimento.ai_provider_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON alc_atendimento.ai_provider_attempts FROM PUBLIC;
REVOKE ALL ON SEQUENCE alc_atendimento.ai_provider_attempts_id_seq FROM PUBLIC;
DO $$
DECLARE client_role text;
BEGIN
  FOR client_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON alc_atendimento.ai_provider_attempts FROM %I', client_role);
    EXECUTE format('REVOKE ALL ON SEQUENCE alc_atendimento.ai_provider_attempts_id_seq FROM %I', client_role);
  END LOOP;
END;
$$;
