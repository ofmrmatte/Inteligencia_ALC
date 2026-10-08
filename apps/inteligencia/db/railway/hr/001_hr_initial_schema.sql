-- TARGET DATABASE: Postgres-RH / HR_DATABASE_URL
-- DO NOT RUN AGAINST DATABASE_URL
-- DO NOT RUN AGAINST PNR_DATABASE_URL
-- Relational RH data only. Auth identities are UUID references, not cross-database FKs.
-- Local execution: scripts/hr-migrate-local.mjs requires a loopback host and alc_hr_local database.
BEGIN;
CREATE TABLE hr_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
  description text, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX hr_departments_name ON hr_departments(lower(name));
CREATE TABLE hr_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department_id uuid NOT NULL REFERENCES hr_departments(id),
  title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160), description text,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,department_id)
);
CREATE UNIQUE INDEX hr_positions_title ON hr_positions(department_id,lower(title));
CREATE TABLE hr_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_code text NOT NULL UNIQUE CHECK(length(trim(employee_code)) BETWEEN 1 AND 80),
  full_name text NOT NULL CHECK(length(trim(full_name)) BETWEEN 1 AND 160), preferred_name text, corporate_email text, phone text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','LEAVE','TERMINATED')),
  department_id uuid REFERENCES hr_departments(id), position_id uuid,
  manager_employee_id uuid REFERENCES hr_employees(id), admission_date date, termination_date date,
  employment_type text NOT NULL CHECK(employment_type IN ('CLT','PJ','ESTAGIO','APRENDIZ','OUTRO')),
  secullum_employee_code text UNIQUE CHECK(secullum_employee_code IS NULL OR length(trim(secullum_employee_code)) BETWEEN 1 AND 80), notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(position_id,department_id) REFERENCES hr_positions(id,department_id),
  CHECK(position_id IS NULL OR department_id IS NOT NULL), CHECK(manager_employee_id IS DISTINCT FROM id),
  CHECK(termination_date IS NULL OR admission_date IS NULL OR termination_date >= admission_date),
  CHECK(termination_date IS NULL OR status = 'TERMINATED')
);
CREATE INDEX hr_employees_department ON hr_employees(department_id,status);
CREATE INDEX hr_employees_position ON hr_employees(position_id);
CREATE INDEX hr_employees_manager ON hr_employees(manager_employee_id);
CREATE TABLE hr_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid NOT NULL REFERENCES hr_employees(id),
  contract_type text NOT NULL CHECK(contract_type IN ('CLT','PJ','ESTAGIO','APRENDIZ','OUTRO')),
  start_date date NOT NULL, end_date date, weekly_hours numeric(5,2) CHECK(weekly_hours BETWEEN 0 AND 168),
  status text NOT NULL CHECK(status IN ('ACTIVE','FINISHED','CANCELED')), notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK(end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX hr_contracts_employee ON hr_contracts(employee_id,start_date DESC);
CREATE UNIQUE INDEX hr_contracts_active ON hr_contracts(employee_id) WHERE status = 'ACTIVE';
CREATE TABLE hr_compensation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid NOT NULL REFERENCES hr_employees(id),
  effective_from date NOT NULL, effective_to date, salary_amount numeric(12,2) CHECK(salary_amount >= 0),
  salary_type text NOT NULL CHECK(salary_type IN ('MONTHLY','HOURLY','OTHER')), notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, CHECK(effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX hr_compensation_employee ON hr_compensation_history(employee_id,effective_from DESC);
CREATE TABLE hr_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid NOT NULL REFERENCES hr_employees(id), occurrence_date date NOT NULL,
  type text NOT NULL CHECK(type IN ('HOME_OFFICE','ABSENCE','MEDICAL_LEAVE','LATE','EXTRA_HOURS','DAY_OFF','OTHER')),
  minutes integer CHECK(minutes BETWEEN 0 AND 1440), description text,
  source text NOT NULL DEFAULT 'MANUAL' CHECK(source IN ('MANUAL','SECULLUM')), created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_occurrences_date ON hr_occurrences(occurrence_date,employee_id);
CREATE INDEX hr_occurrences_employee ON hr_occurrences(employee_id,occurrence_date DESC);
CREATE UNIQUE INDEX hr_home_office_daily ON hr_occurrences(employee_id,occurrence_date) WHERE type = 'HOME_OFFICE';
CREATE TABLE hr_leave (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid NOT NULL REFERENCES hr_employees(id),
  type text NOT NULL CHECK(type IN ('VACATION','MEDICAL','LICENSE','OTHER')), start_date date NOT NULL, end_date date NOT NULL,
  status text NOT NULL CHECK(status IN ('PLANNED','APPROVED','ACTIVE','FINISHED','CANCELED')), notes text, created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK(end_date >= start_date)
);
CREATE INDEX hr_leave_dates ON hr_leave(start_date,end_date,status);
CREATE INDEX hr_leave_employee ON hr_leave(employee_id,start_date DESC);
CREATE TABLE hr_time_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text NOT NULL DEFAULT 'SECULLUM' CHECK(source = 'SECULLUM'),
  original_filename text NOT NULL, file_hash text NOT NULL UNIQUE, imported_by uuid NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK(status IN ('COMPLETED','PARTIAL','REJECTED')), total_rows integer NOT NULL CHECK(total_rows > 0),
  accepted_rows integer NOT NULL CHECK(accepted_rows >= 0), rejected_rows integer NOT NULL CHECK(rejected_rows >= 0),
  error_summary jsonb NOT NULL DEFAULT '[]', CHECK(total_rows = accepted_rows + rejected_rows)
);
CREATE INDEX hr_batches_time ON hr_time_import_batches(imported_at DESC);
CREATE TABLE hr_time_entries_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES hr_time_import_batches(id), row_number integer NOT NULL CHECK(row_number > 0),
  employee_code text, raw_payload jsonb NOT NULL, normalized boolean NOT NULL DEFAULT false, error_message text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(batch_id,row_number), CHECK(NOT normalized OR error_message IS NULL)
);
CREATE TABLE hr_attendance_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid NOT NULL REFERENCES hr_employees(id), attendance_date date NOT NULL,
  first_entry time, last_exit time, worked_minutes integer CHECK(worked_minutes BETWEEN 0 AND 1440),
  expected_minutes integer CHECK(expected_minutes BETWEEN 0 AND 1440), late_minutes integer CHECK(late_minutes BETWEEN 0 AND 1440),
  extra_minutes integer CHECK(extra_minutes BETWEEN 0 AND 1440), absence boolean NOT NULL DEFAULT false, divergence boolean NOT NULL DEFAULT false,
  source_batch_id uuid REFERENCES hr_time_import_batches(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id,attendance_date)
);
CREATE INDEX hr_attendance_date ON hr_attendance_daily(attendance_date);
CREATE INDEX hr_attendance_batch ON hr_attendance_daily(source_batch_id);
CREATE TABLE hr_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid NOT NULL REFERENCES hr_employees(id), category text NOT NULL, title text NOT NULL,
  storage_path text NOT NULL UNIQUE CHECK(storage_path LIKE 'hr/%'), mime_type text NOT NULL,
  file_size bigint NOT NULL CHECK(file_size > 0 AND file_size <= 10485760), expires_at date,
  is_sensitive boolean NOT NULL DEFAULT true, uploaded_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX hr_documents_employee ON hr_documents(employee_id,created_at DESC);
CREATE INDEX hr_documents_expiry ON hr_documents(expires_at) WHERE expires_at IS NOT NULL;
CREATE TABLE hr_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id uuid NOT NULL, action text NOT NULL, entity_type text NOT NULL,
  entity_id uuid, employee_id uuid REFERENCES hr_employees(id), before_data jsonb, after_data jsonb, ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_audit_time ON hr_audit_log(created_at DESC);
CREATE INDEX hr_audit_employee ON hr_audit_log(employee_id,created_at DESC);
-- No grants to browser roles. Queries and authorization belong to /api/hr only.
COMMIT;
