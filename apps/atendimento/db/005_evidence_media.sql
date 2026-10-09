SELECT pg_advisory_xact_lock(hashtext('alc_atendimento_schema_v1'));
CREATE TABLE alc_atendimento.evidence_media (
 case_id text NOT NULL REFERENCES alc_atendimento.evidence_folders(case_id),
 media_id uuid NOT NULL REFERENCES alc_atendimento.media(id),
 message_id uuid NOT NULL REFERENCES alc_atendimento.messages(id),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(case_id,media_id)
);
CREATE INDEX atendimento_evidence_media_hold ON alc_atendimento.evidence_media(media_id);
