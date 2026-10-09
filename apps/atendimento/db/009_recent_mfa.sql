SELECT pg_advisory_xact_lock(hashtext('alc_atendimento_schema_v1'));
CREATE TABLE alc_atendimento.step_up_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX atendimento_step_up_attempt_window
  ON alc_atendimento.step_up_attempts(user_id, attempted_at);
CREATE TABLE alc_atendimento.step_up_challenges (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('reveal_token_verification','replace_access_token','replace_app_secret','change_webhook_critical')),
  channel text NOT NULL CHECK (channel IN ('driver','client')),
  intent_hash text NOT NULL CHECK (intent_hash ~ '^[a-f0-9]{64}$'),
  factor_id uuid NOT NULL,
  provider_challenge_hash text NOT NULL UNIQUE CHECK (provider_challenge_hash ~ '^[a-f0-9]{64}$'),
  nonce_sealed text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  verified_at timestamptz,
  proof_expires_at timestamptz,
  consumed_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '3 minutes'),
  CHECK (claimed_at IS NULL OR claimed_at >= created_at),
  CHECK ((verified_at IS NULL) = (proof_expires_at IS NULL)),
  CHECK (verified_at IS NULL OR (claimed_at IS NOT NULL AND verified_at >= claimed_at
    AND proof_expires_at > verified_at AND proof_expires_at <= claimed_at + interval '3 minutes')),
  CHECK (consumed_at IS NULL OR (verified_at IS NOT NULL AND consumed_at >= verified_at))
);
ALTER TABLE alc_atendimento.step_up_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alc_atendimento.step_up_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON alc_atendimento.step_up_attempts, alc_atendimento.step_up_challenges FROM PUBLIC;
REVOKE ALL ON SEQUENCE alc_atendimento.step_up_attempts_id_seq FROM PUBLIC;
-- Aux is plain PostgreSQL; Supabase client roles may not exist here.
DO $$
DECLARE client_role text;
BEGIN
  FOR client_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON alc_atendimento.step_up_attempts, alc_atendimento.step_up_challenges FROM %I', client_role);
    EXECUTE format('REVOKE ALL ON SEQUENCE alc_atendimento.step_up_attempts_id_seq FROM %I', client_role);
  END LOOP;
END;
$$;
