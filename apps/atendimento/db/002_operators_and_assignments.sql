CREATE TABLE IF NOT EXISTS alc_atendimento.operators (
  user_id uuid PRIMARY KEY,
  roles text[] NOT NULL CHECK (cardinality(roles)>0 AND roles <@ ARRAY['agent','supervisor','coordinator','manager','director','admin']::text[]),
  active boolean NOT NULL DEFAULT true,
  available boolean NOT NULL DEFAULT false,
  receiving boolean NOT NULL DEFAULT false,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS alc_atendimento.operator_bases (
  user_id uuid NOT NULL REFERENCES alc_atendimento.operators(user_id),
  unit_key text NOT NULL,
  base_key text NOT NULL,
  sigla text NOT NULL CHECK (length(trim(sigla))>0 AND upper(trim(sigla)) NOT IN ('SVC','XPT')),
  responsibility text NOT NULL CHECK (responsibility IN ('primary','substitute')),
  PRIMARY KEY(user_id,unit_key)
);
CREATE INDEX IF NOT EXISTS atendimento_operator_base ON alc_atendimento.operator_bases(base_key,sigla);
CREATE TABLE IF NOT EXISTS alc_atendimento.case_assignments (
  case_id text PRIMARY KEY REFERENCES alc_atendimento.cases(case_id),
  assigned_to uuid REFERENCES alc_atendimento.operators(user_id),
  base_key text NOT NULL,
  sigla text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  assigned_by uuid,
  reason text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atendimento_assignment_owner ON alc_atendimento.case_assignments(assigned_to);
CREATE TABLE IF NOT EXISTS alc_atendimento.assignment_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id text NOT NULL REFERENCES alc_atendimento.cases(case_id),
  previous_owner uuid,
  assigned_to uuid,
  actor_id uuid,
  base_key text NOT NULL,
  sigla text NOT NULL,
  reason text NOT NULL,
  version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(case_id,version)
);
CREATE INDEX IF NOT EXISTS atendimento_assignment_history_case ON alc_atendimento.assignment_history(case_id,created_at DESC);
INSERT INTO alc_atendimento.settings(key,value) VALUES ('assignment_policy','{"mode":"manual"}') ON CONFLICT DO NOTHING;
ALTER TABLE alc_atendimento.messages ADD COLUMN IF NOT EXISTS sender_kind text NOT NULL DEFAULT 'system' CHECK(sender_kind IN ('ai','human','system','contact'));
ALTER TABLE alc_atendimento.messages ADD COLUMN IF NOT EXISTS sender_user_id uuid;
ALTER TABLE alc_atendimento.messages ADD COLUMN IF NOT EXISTS sender_display_name_snapshot text NOT NULL DEFAULT '';
ALTER TABLE alc_atendimento.outbox ADD COLUMN IF NOT EXISTS sender_kind text NOT NULL DEFAULT 'system' CHECK(sender_kind IN ('ai','human','system','contact'));
ALTER TABLE alc_atendimento.outbox ADD COLUMN IF NOT EXISTS sender_user_id uuid;
ALTER TABLE alc_atendimento.outbox ADD COLUMN IF NOT EXISTS sender_display_name_snapshot text NOT NULL DEFAULT '';
-- No automatic operator enrollment, legacy reassignment or invented message author.
ALTER TABLE alc_atendimento.conversations ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high','urgent'));
