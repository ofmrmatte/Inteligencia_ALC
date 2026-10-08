BEGIN;
SELECT pg_advisory_xact_lock(hashtext('alc_atendimento_schema_v1'));
CREATE SCHEMA IF NOT EXISTS alc_atendimento;
REVOKE ALL ON SCHEMA alc_atendimento FROM PUBLIC;
CREATE TABLE IF NOT EXISTS alc_atendimento.cases (
 case_id text PRIMARY KEY, competence text NOT NULL, base_key text NOT NULL DEFAULT '', sigla text NOT NULL DEFAULT '',
 driver_id text NOT NULL DEFAULT '', driver_phone text NOT NULL DEFAULT '', customer_phone text NOT NULL DEFAULT '',
 classification text NOT NULL, record jsonb NOT NULL, source_at timestamptz NOT NULL DEFAULT now(),
 first_seen_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atendimento_case_scope ON alc_atendimento.cases(competence,base_key,sigla);
CREATE INDEX IF NOT EXISTS atendimento_case_driver ON alc_atendimento.cases(driver_phone,driver_id);
CREATE TABLE IF NOT EXISTS alc_atendimento.conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel text NOT NULL CHECK(channel IN ('driver','client')),
 phone text NOT NULL, name text NOT NULL DEFAULT '', base_key text NOT NULL DEFAULT '', sigla text NOT NULL DEFAULT '',
 case_id text REFERENCES alc_atendimento.cases(case_id), driver_id text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'bot' CHECK(status IN ('bot','human','resolved')),
 assigned_to uuid, agent_state jsonb NOT NULL DEFAULT '{"step":"start"}', last_inbound_at timestamptz,
 identity_verified boolean NOT NULL DEFAULT false, unread integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(channel,phone)
);
CREATE INDEX IF NOT EXISTS atendimento_conversation_scope ON alc_atendimento.conversations(base_key,sigla,updated_at DESC);
ALTER TABLE alc_atendimento.conversations ADD COLUMN IF NOT EXISTS labels text[] NOT NULL DEFAULT '{}';
ALTER TABLE alc_atendimento.conversations DROP CONSTRAINT IF EXISTS conversations_status_check;
ALTER TABLE alc_atendimento.conversations ADD CONSTRAINT conversations_status_check CHECK(status IN ('bot','human','pending','resolved'));
CREATE INDEX IF NOT EXISTS atendimento_conversation_assignee ON alc_atendimento.conversations(assigned_to,updated_at DESC);
CREATE INDEX IF NOT EXISTS atendimento_conversation_labels ON alc_atendimento.conversations USING gin(labels);
CREATE TABLE IF NOT EXISTS alc_atendimento.messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES alc_atendimento.conversations(id),
 provider_id text UNIQUE, direction text NOT NULL CHECK(direction IN ('in','out','note')), body text NOT NULL,
 type text NOT NULL DEFAULT 'text', status text NOT NULL DEFAULT 'received', actor_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atendimento_message_conversation ON alc_atendimento.messages(conversation_id,created_at);
ALTER TABLE alc_atendimento.messages ADD COLUMN IF NOT EXISTS attachment jsonb;
CREATE TABLE IF NOT EXISTS alc_atendimento.outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dedupe_key text NOT NULL UNIQUE,
 conversation_id uuid REFERENCES alc_atendimento.conversations(id), case_id text REFERENCES alc_atendimento.cases(case_id),
 channel text NOT NULL CHECK(channel IN ('driver','client')), phone text NOT NULL,
 payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','uncertain','cancelled')),
 provider_id text, error text, attempts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atendimento_outbox_pending ON alc_atendimento.outbox(created_at) WHERE status = 'pending';
CREATE TABLE IF NOT EXISTS alc_atendimento.webhook_events (
 event_key text PRIMARY KEY, channel text NOT NULL, payload jsonb NOT NULL, processed_at timestamptz,
 error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS alc_atendimento.settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS alc_atendimento.login_tickets(ticket_hash text PRIMARY KEY, profile_id uuid NOT NULL, encrypted_session text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS alc_atendimento.audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid, action text NOT NULL, target text, data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO alc_atendimento.settings(key,value) VALUES('automation','{"driverNotifications":false,"clientOutreach":false,"bot":true,"operatorName":"Equipe Loss","intervalMinutes":30}') ON CONFLICT DO NOTHING;
INSERT INTO alc_atendimento.settings(key,value) VALUES('source','{"baselineComplete":false,"lastSync":null}') ON CONFLICT DO NOTHING;
COMMIT;
