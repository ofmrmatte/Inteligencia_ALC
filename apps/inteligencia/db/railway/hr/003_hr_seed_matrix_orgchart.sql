-- TARGET DATABASE: Postgres-RH / HR_DATABASE_URL
-- DO NOT RUN AGAINST DATABASE_URL
-- DO NOT RUN AGAINST PNR_DATABASE_URL
-- Source: "Organograma ALC & Pereira Filho Transportes.pdf" supplied 2026-10-08.
-- Only the Matriz branches explicitly authorized for RH were loaded:
-- Frotas (Tales Gonzaga) and Administrativo (Vinicius Paes Landim).
-- No matrícula, vínculo, admission date, salary, or unshown job title is invented.

BEGIN;

INSERT INTO hr_departments(name, description, active)
SELECT 'Frotas', 'Estrutura da matriz conforme organograma corporativo.', true
WHERE NOT EXISTS (SELECT 1 FROM hr_departments WHERE lower(name)=lower('Frotas'));

UPDATE hr_departments
SET active=true, updated_at=now()
WHERE lower(name)=lower('Frotas');

INSERT INTO hr_departments(name, description, active)
SELECT 'Administrativo', 'Estrutura da matriz conforme organograma corporativo.', true
WHERE NOT EXISTS (SELECT 1 FROM hr_departments WHERE lower(name)=lower('Administrativo'));

UPDATE hr_departments
SET active=true, updated_at=now()
WHERE lower(name)=lower('Administrativo');

WITH d AS (
  SELECT id FROM hr_departments WHERE lower(name)=lower('Frotas') LIMIT 1
)
INSERT INTO hr_positions(department_id, title, description, active)
SELECT d.id, 'Coordenador de Frotas', 'Cargo exibido no organograma corporativo.', true
FROM d
WHERE NOT EXISTS (
  SELECT 1 FROM hr_positions p
  WHERE p.department_id=d.id AND lower(p.title)=lower('Coordenador de Frotas')
);

WITH d AS (
  SELECT id FROM hr_departments WHERE lower(name)=lower('Administrativo') LIMIT 1
)
INSERT INTO hr_positions(department_id, title, description, active)
SELECT d.id, 'Líder Administrativo', 'Cargo exibido no organograma corporativo.', true
FROM d
WHERE NOT EXISTS (
  SELECT 1 FROM hr_positions p
  WHERE p.department_id=d.id AND lower(p.title)=lower('Líder Administrativo')
);

WITH d AS (
  SELECT id FROM hr_departments WHERE lower(name)=lower('Frotas') LIMIT 1
),
p AS (
  SELECT id FROM hr_positions WHERE department_id=(SELECT id FROM d) AND lower(title)=lower('Coordenador de Frotas') LIMIT 1
)
INSERT INTO hr_employees(full_name,status,department_id,position_id,employment_type,notes)
SELECT 'Tales Gonzaga','ACTIVE',d.id,p.id,NULL,'Importado do organograma da matriz; matrícula, vínculo e demais dados cadastrais pendentes de homologação.'
FROM d,p
WHERE NOT EXISTS (SELECT 1 FROM hr_employees WHERE lower(full_name)=lower('Tales Gonzaga'));

WITH d AS (
  SELECT id FROM hr_departments WHERE lower(name)=lower('Administrativo') LIMIT 1
),
p AS (
  SELECT id FROM hr_positions WHERE department_id=(SELECT id FROM d) AND lower(title)=lower('Líder Administrativo') LIMIT 1
)
INSERT INTO hr_employees(full_name,status,department_id,position_id,employment_type,notes)
SELECT 'Vinicius Paes Landim','ACTIVE',d.id,p.id,NULL,'Importado do organograma da matriz; matrícula, vínculo e demais dados cadastrais pendentes de homologação.'
FROM d,p
WHERE NOT EXISTS (SELECT 1 FROM hr_employees WHERE lower(full_name)=lower('Vinicius Paes Landim'));

WITH d AS (SELECT id FROM hr_departments WHERE lower(name)=lower('Frotas') LIMIT 1),
m AS (SELECT id FROM hr_employees WHERE lower(full_name)=lower('Tales Gonzaga') LIMIT 1),
names(full_name) AS (VALUES
  ('Vinicius Paiva'),
  ('Renan Rodrigues'),
  ('Augusto Cesar'),
  ('Eduardo Augusto'),
  ('Leticia Silva')
)
INSERT INTO hr_employees(full_name,status,department_id,manager_employee_id,employment_type,notes)
SELECT n.full_name,'ACTIVE',d.id,m.id,NULL,'Importado do organograma da matriz; cargo, matrícula, vínculo e demais dados cadastrais pendentes de homologação.'
FROM names n CROSS JOIN d CROSS JOIN m
WHERE NOT EXISTS (SELECT 1 FROM hr_employees e WHERE lower(e.full_name)=lower(n.full_name));

WITH d AS (SELECT id FROM hr_departments WHERE lower(name)=lower('Administrativo') LIMIT 1),
m AS (SELECT id FROM hr_employees WHERE lower(full_name)=lower('Vinicius Paes Landim') LIMIT 1),
names(full_name) AS (VALUES
  ('Amanda Francisco'),
  ('Larissa Sabrina'),
  ('Isabela Oliveira'),
  ('Eder Nogueira'),
  ('Marcos Vinicius'),
  ('João Marcelo'),
  ('Iago Moreira'),
  ('Sebastian Andrade')
)
INSERT INTO hr_employees(full_name,status,department_id,manager_employee_id,employment_type,notes)
SELECT n.full_name,'ACTIVE',d.id,m.id,NULL,'Importado do organograma da matriz; cargo, matrícula, vínculo e demais dados cadastrais pendentes de homologação.'
FROM names n CROSS JOIN d CROSS JOIN m
WHERE NOT EXISTS (SELECT 1 FROM hr_employees e WHERE lower(e.full_name)=lower(n.full_name));

UPDATE hr_employees e
SET department_id=d.id,
    position_id=p.id,
    status='ACTIVE',
    manager_employee_id=NULL,
    updated_at=now()
FROM hr_departments d
JOIN hr_positions p ON p.department_id=d.id AND lower(p.title)=lower('Coordenador de Frotas')
WHERE lower(d.name)=lower('Frotas') AND lower(e.full_name)=lower('Tales Gonzaga');

UPDATE hr_employees e
SET department_id=d.id,
    position_id=p.id,
    status='ACTIVE',
    manager_employee_id=NULL,
    updated_at=now()
FROM hr_departments d
JOIN hr_positions p ON p.department_id=d.id AND lower(p.title)=lower('Líder Administrativo')
WHERE lower(d.name)=lower('Administrativo') AND lower(e.full_name)=lower('Vinicius Paes Landim');

UPDATE hr_employees e
SET department_id=d.id,
    position_id=NULL,
    manager_employee_id=m.id,
    status='ACTIVE',
    updated_at=now()
FROM hr_departments d
CROSS JOIN hr_employees m
WHERE lower(d.name)=lower('Frotas')
  AND lower(m.full_name)=lower('Tales Gonzaga')
  AND lower(e.full_name) IN (
    lower('Vinicius Paiva'), lower('Renan Rodrigues'), lower('Augusto Cesar'),
    lower('Eduardo Augusto'), lower('Leticia Silva')
  );

UPDATE hr_employees e
SET department_id=d.id,
    position_id=NULL,
    manager_employee_id=m.id,
    status='ACTIVE',
    updated_at=now()
FROM hr_departments d
CROSS JOIN hr_employees m
WHERE lower(d.name)=lower('Administrativo')
  AND lower(m.full_name)=lower('Vinicius Paes Landim')
  AND lower(e.full_name) IN (
    lower('Amanda Francisco'), lower('Larissa Sabrina'), lower('Isabela Oliveira'),
    lower('Eder Nogueira'), lower('Marcos Vinicius'), lower('João Marcelo'),
    lower('Iago Moreira'), lower('Sebastian Andrade')
  );

-- O organograma exibe "Matheus Ferreira". Se o cadastro completo já existir,
-- preservamos matrícula/vínculo e apenas vinculamos à estrutura administrativa.
WITH d AS (SELECT id FROM hr_departments WHERE lower(name)=lower('Administrativo') LIMIT 1),
m AS (SELECT id FROM hr_employees WHERE lower(full_name)=lower('Vinicius Paes Landim') LIMIT 1)
UPDATE hr_employees e
SET department_id=d.id,
    position_id=NULL,
    manager_employee_id=m.id,
    status='ACTIVE',
    updated_at=now()
FROM d,m
WHERE lower(e.full_name)=lower('MATHEUS FERREIRA FOLGADO');

WITH d AS (SELECT id FROM hr_departments WHERE lower(name)=lower('Administrativo') LIMIT 1),
m AS (SELECT id FROM hr_employees WHERE lower(full_name)=lower('Vinicius Paes Landim') LIMIT 1)
INSERT INTO hr_employees(full_name,status,department_id,manager_employee_id,employment_type,notes)
SELECT 'Matheus Ferreira','ACTIVE',d.id,m.id,NULL,'Importado do organograma da matriz; cargo, matrícula, vínculo e demais dados cadastrais pendentes de homologação.'
FROM d,m
WHERE NOT EXISTS (
  SELECT 1 FROM hr_employees
  WHERE lower(full_name) IN (lower('Matheus Ferreira'),lower('MATHEUS FERREIRA FOLGADO'))
);

COMMIT;
