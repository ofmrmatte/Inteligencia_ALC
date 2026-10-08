-- TARGET DATABASE: Postgres-RH / HR_DATABASE_URL
-- DO NOT RUN AGAINST DATABASE_URL
-- DO NOT RUN AGAINST PNR_DATABASE_URL
-- Purpose: allow organogram-only employees to exist before matrícula/vínculo are known.

ALTER TABLE hr_employees
  ALTER COLUMN employee_code DROP NOT NULL,
  ALTER COLUMN employment_type DROP NOT NULL;

ALTER TABLE hr_employees
  DROP CONSTRAINT IF EXISTS hr_employees_employee_code_check;

ALTER TABLE hr_employees
  ADD CONSTRAINT hr_employees_employee_code_check
  CHECK (employee_code IS NULL OR length(trim(employee_code)) BETWEEN 1 AND 80);
