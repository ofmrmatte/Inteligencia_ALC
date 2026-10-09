SELECT pg_advisory_xact_lock(hashtext('alc_atendimento_schema_v1'));
ALTER TABLE alc_atendimento.messages ADD COLUMN case_id text REFERENCES alc_atendimento.cases(case_id);
CREATE TABLE alc_atendimento.media (
 id uuid PRIMARY KEY,
 conversation_id uuid NOT NULL REFERENCES alc_atendimento.conversations(id),
 message_id uuid UNIQUE REFERENCES alc_atendimento.messages(id),
 case_id text REFERENCES alc_atendimento.cases(case_id),
 channel text NOT NULL CHECK(channel IN ('driver','client')),
 origin text NOT NULL CHECK(origin IN ('inbound','outbound')),
 filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 180),
 mime text NOT NULL DEFAULT '', type text NOT NULL DEFAULT '',
 size integer NOT NULL DEFAULT 0 CHECK(size BETWEEN 0 AND 26214400),
 sha256 text NOT NULL DEFAULT '', object_key text NOT NULL UNIQUE,
 provider_media_id text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','quarantined','ready','rejected','failed','deleted')),
 uploaded_by uuid,
 attempts integer NOT NULL DEFAULT 0,
 error text,
 retention_until timestamptz NOT NULL,
 legal_hold boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status<>'ready' OR (length(sha256)=64 AND size>0 AND mime<>'' AND type<>''))
);
CREATE INDEX atendimento_media_processing ON alc_atendimento.media(updated_at) WHERE status IN ('pending','quarantined');
CREATE INDEX atendimento_media_retention ON alc_atendimento.media(retention_until) WHERE NOT legal_hold AND status<>'deleted';
CREATE INDEX atendimento_media_uploads ON alc_atendimento.media(uploaded_by,created_at DESC);
ALTER TABLE alc_atendimento.outbox ADD COLUMN media_id uuid REFERENCES alc_atendimento.media(id);
