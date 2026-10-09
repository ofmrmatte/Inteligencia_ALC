ALTER TABLE alc_atendimento.cases
  ADD COLUMN IF NOT EXISTS comparison_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fingerprint text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS alc_atendimento.pnr_enrichment_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  case_id text NOT NULL REFERENCES alc_atendimento.cases(case_id) ON DELETE RESTRICT,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'delivered', 'dead_letter')),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 8),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'processing' AND lease_until IS NOT NULL)
    OR (status <> 'processing' AND lease_until IS NULL)
  ),
  CHECK ((status = 'delivered') = (delivered_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS atendimento_enrichment_claim
  ON alc_atendimento.pnr_enrichment_outbox(next_attempt_at, created_at)
  WHERE status IN ('pending', 'processing') AND attempts < 8;

REVOKE ALL ON TABLE alc_atendimento.pnr_enrichment_outbox FROM PUBLIC;
