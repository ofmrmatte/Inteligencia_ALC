begin;

-- Organograma ALC atualizado em 31/08/2026.
-- Escopo desta migração: somente bases operacionais, coordenadores e supervisores.
-- Diretoria, gerências e demais estruturas corporativas não são alteradas.

update public.operational_units
set active = false,
    updated_at = now()
where active is distinct from false;

insert into public.operational_units
  (unit_key, sigla, base_name, base_key, xpt_code, coordinator_name, source, active, updated_at)
values
  ('SMR1|CUIABA', 'SMR1', 'Cuiabá', 'CUIABA', null, 'Thays Gonçalves', 'organograma_2026_08_31', true, now()),
  ('SMR2|SINOP', 'SMR2', 'Sinop', 'SINOP', null, 'Thays Gonçalves', 'organograma_2026_08_31', true, now()),
  ('SGO2|RIO VERDE', 'SGO2', 'Rio Verde', 'RIO VERDE', 'EGO17', 'Thays Gonçalves', 'organograma_2026_08_31', true, now()),
  ('SSP10|ARACATUBA', 'SSP10', 'Araçatuba', 'ARACATUBA', null, 'Thays Gonçalves', 'organograma_2026_08_31', true, now()),
  ('SSP11|PRESIDENTE PRUDENTE', 'SSP11', 'Presidente Prudente', 'PRESIDENTE PRUDENTE', null, 'Thays Gonçalves', 'organograma_2026_08_31', true, now()),
  ('SSP28|JALES', 'SSP28', 'Jales', 'JALES', null, 'Thays Gonçalves', 'organograma_2026_08_31', true, now()),
  ('SGO1|GOIANIA', 'SGO1', 'Goiânia', 'GOIANIA', 'EGO11', 'Thays Gonçalves', 'organograma_2026_08_31', true, now()),
  ('SGO3|HIDROLANDIA', 'SGO3', 'Hidrolândia', 'HIDROLANDIA', null, 'Thays Gonçalves', 'organograma_2026_08_31', true, now()),

  ('SMG1|BELO HORIZONTE', 'SMG1', 'Belo Horizonte', 'BELO HORIZONTE', null, 'Ithalo Diniz', 'organograma_2026_08_31', true, now()),
  ('SMG8|VESPASIANO', 'SMG8', 'Vespasiano', 'VESPASIANO', null, 'Ithalo Diniz', 'organograma_2026_08_31', true, now()),
  ('SMG14|NOVA LIMA', 'SMG14', 'Nova Lima', 'NOVA LIMA', null, 'Ithalo Diniz', 'organograma_2026_08_31', true, now()),
  ('AMAZON|AMAZON', 'AMAZON', 'AMAZON', 'AMAZON', null, 'Ithalo Diniz', 'organograma_2026_08_31', true, now()),

  ('SMG3|POUSO ALEGRE', 'SMG3', 'Pouso Alegre', 'POUSO ALEGRE', null, 'Bruno Hungria', 'organograma_2026_08_31', true, now()),
  ('SMG5|POCOS DE CALDAS', 'SMG5', 'Poços de Caldas', 'POCOS DE CALDAS', 'EMG7', 'Bruno Hungria', 'organograma_2026_08_31', true, now()),
  ('SMG6|UBERLANDIA', 'SMG6', 'Uberlândia', 'UBERLANDIA', null, 'Bruno Hungria', 'organograma_2026_08_31', true, now()),
  ('SMG12|UBERABA', 'SMG12', 'Uberaba', 'UBERABA', 'EMG34', 'Bruno Hungria', 'organograma_2026_08_31', true, now()),
  ('SMG4|IPATINGA', 'SMG4', 'Ipatinga', 'IPATINGA', null, 'Bruno Hungria', 'organograma_2026_08_31', true, now()),
  ('SMG11|PATOS DE MINAS', 'SMG11', 'Patos de Minas', 'PATOS DE MINAS', null, 'Bruno Hungria', 'organograma_2026_08_31', true, now()),
  ('SMG13|TEOFILO OTONI', 'SMG13', 'Teófilo Otoni', 'TEOFILO OTONI', null, 'Bruno Hungria', 'organograma_2026_08_31', true, now()),

  ('SSP4|CRAVINHOS', 'SSP4', 'Cravinhos', 'CRAVINHOS', null, 'Iara Roberta', 'organograma_2026_08_31', true, now()),
  ('SSP12|SAO JOSE DO RIO PRETO', 'SSP12', 'São José do Rio Preto', 'SAO JOSE DO RIO PRETO', null, 'Iara Roberta', 'organograma_2026_08_31', true, now()),
  ('SSP13|MARILIA', 'SSP13', 'Marília', 'MARILIA', 'EPR7', 'Iara Roberta', 'organograma_2026_08_31', true, now()),
  ('SSP14|BAURU', 'SSP14', 'Bauru', 'BAURU', null, 'Iara Roberta', 'organograma_2026_08_31', true, now()),
  ('SSP22|SAO CARLOS', 'SSP22', 'São Carlos', 'SAO CARLOS', null, 'Iara Roberta', 'organograma_2026_08_31', true, now()),
  ('SSP31|BARRETOS', 'SSP31', 'Barretos', 'BARRETOS', null, 'Iara Roberta', 'organograma_2026_08_31', true, now()),
  ('SSP55|RIBEIRAO PRETO', 'SSP55', 'Ribeirão Preto', 'RIBEIRAO PRETO', null, 'Iara Roberta', 'organograma_2026_08_31', true, now()),
  ('SSP79|MIRASSOL', 'SSP79', 'Mirassol', 'MIRASSOL', null, 'Iara Roberta', 'organograma_2026_08_31', true, now()),

  ('SSP5|BARUERI', 'SSP5', 'Barueri', 'BARUERI', null, 'Alex Coruja', 'organograma_2026_08_31', true, now()),
  ('SSP7|ZONA OESTE', 'SSP7', 'Zona Oeste', 'ZONA OESTE', null, 'Alex Coruja', 'organograma_2026_08_31', true, now()),
  ('SSP51|PORTO FELIZ', 'SSP51', 'Porto Feliz', 'PORTO FELIZ', null, 'Alex Coruja', 'organograma_2026_08_31', true, now()),

  ('SRJ1|CORDOVIL', 'SRJ1', 'Cordovil', 'CORDOVIL', null, 'Marcelo Ornellas', 'organograma_2026_08_31', true, now()),
  ('SRJ6|CAMPO GRANDE', 'SRJ6', 'Campo Grande', 'CAMPO GRANDE', null, 'Marcelo Ornellas', 'organograma_2026_08_31', true, now()),
  ('SRJ4|CAMPOS DOS GOYTACAZES', 'SRJ4', 'Campos dos Goytacazes', 'CAMPOS DOS GOYTACAZES', null, 'Marcelo Ornellas', 'organograma_2026_08_31', true, now()),
  ('SRJ8|ITABORAI', 'SRJ8', 'Itaboraí', 'ITABORAI', null, 'Marcelo Ornellas', 'organograma_2026_08_31', true, now()),
  ('SRJ2|QUEIMADOS', 'SRJ2', 'Queimados', 'QUEIMADOS', null, 'Marcelo Ornellas', 'organograma_2026_08_31', true, now()),
  ('SRJ3|VOLTA REDONDA', 'SRJ3', 'Volta Redonda', 'VOLTA REDONDA', null, 'Marcelo Ornellas', 'organograma_2026_08_31', true, now()),
  ('SRJ13|SAO JOAO DE MERITI', 'SRJ13', 'São João de Meriti', 'SAO JOAO DE MERITI', null, 'Marcelo Ornellas', 'organograma_2026_08_31', true, now())
on conflict (unit_key) do update set
  sigla = excluded.sigla,
  base_name = excluded.base_name,
  base_key = excluded.base_key,
  xpt_code = excluded.xpt_code,
  coordinator_name = excluded.coordinator_name,
  source = excluded.source,
  active = true,
  updated_at = now();

-- Mantém os registros antigos apenas como histórico inativo e publica somente
-- os supervisores que constam no organograma vigente.
update public.operational_unit_supervisors
set active = false,
    updated_at = now()
where active is distinct from false;

insert into public.operational_unit_supervisors (unit_key, supervisor_name, active, updated_at)
values
  ('SMR1|CUIABA', 'Thainá dos Santos', true, now()),
  ('SMR2|SINOP', 'Thainá dos Santos', true, now()),
  ('SGO2|RIO VERDE', 'Thainá dos Santos', true, now()),
  ('SSP10|ARACATUBA', 'Thainá dos Santos', true, now()),
  ('SSP11|PRESIDENTE PRUDENTE', 'Thainá dos Santos', true, now()),
  ('SSP28|JALES', 'Thainá dos Santos', true, now()),
  ('SGO1|GOIANIA', 'Thainá dos Santos', true, now()),
  ('SGO3|HIDROLANDIA', 'Thainá dos Santos', true, now()),

  ('SMG1|BELO HORIZONTE', 'Rodrigo Gama', true, now()),
  ('SMG8|VESPASIANO', 'Rodrigo Gama', true, now()),
  ('SMG14|NOVA LIMA', 'Rodrigo Gama', true, now()),
  ('AMAZON|AMAZON', 'Rodrigo Gama', true, now()),

  ('SMG3|POUSO ALEGRE', 'Rosalina Silva', true, now()),
  ('SMG5|POCOS DE CALDAS', 'Rosalina Silva', true, now()),
  ('SMG6|UBERLANDIA', 'Rosalina Silva', true, now()),
  ('SMG12|UBERABA', 'Rosalina Silva', true, now()),
  ('SMG4|IPATINGA', 'Danilo Paixão', true, now()),
  ('SMG11|PATOS DE MINAS', 'Danilo Paixão', true, now()),
  ('SMG13|TEOFILO OTONI', 'Danilo Paixão', true, now()),

  ('SSP4|CRAVINHOS', 'Mariana Gabriel', true, now()),
  ('SSP12|SAO JOSE DO RIO PRETO', 'Mariana Gabriel', true, now()),
  ('SSP13|MARILIA', 'Mariana Gabriel', true, now()),
  ('SSP14|BAURU', 'Mariana Gabriel', true, now()),
  ('SSP22|SAO CARLOS', 'Mariana Gabriel', true, now()),
  ('SSP31|BARRETOS', 'Mariana Gabriel', true, now()),
  ('SSP55|RIBEIRAO PRETO', 'Mariana Gabriel', true, now()),
  ('SSP79|MIRASSOL', 'Mariana Gabriel', true, now()),

  ('SRJ1|CORDOVIL', 'Mauro Ferreira', true, now()),
  ('SRJ6|CAMPO GRANDE', 'Mauro Ferreira', true, now()),
  ('SRJ4|CAMPOS DOS GOYTACAZES', 'Mauro Ferreira', true, now()),
  ('SRJ8|ITABORAI', 'Mauro Ferreira', true, now()),
  ('SRJ2|QUEIMADOS', 'Allan Silva Monteiro', true, now()),
  ('SRJ3|VOLTA REDONDA', 'Allan Silva Monteiro', true, now()),
  ('SRJ13|SAO JOAO DE MERITI', 'Allan Silva Monteiro', true, now())
on conflict (unit_key, supervisor_name) do update set
  active = true,
  updated_at = now();

-- Cadastro paralelo de XPT conforme o mesmo organograma.
update public.operational_xpts
set active = false,
    updated_at = now()
where active is distinct from false;

insert into public.operational_xpts
  (xpt_code, base_name, base_key, coordinator_name, supervisors, active, updated_at)
values
  ('EMG7', 'Guaxupé', 'GUAXUPE', 'Bruno Hungria', array['Rosalina Silva']::text[], true, now()),
  ('EMG34', 'Araxá', 'ARAXA', 'Bruno Hungria', array['Rosalina Silva']::text[], true, now()),
  ('EMR6', 'Cáceres', 'CACERES', 'Felipe Borges', array[]::text[], true, now()),
  ('EMR14', 'Araputanga', 'ARAPUTANGA', 'Felipe Borges', array[]::text[], true, now()),
  ('EMR16', 'Pontes e Lacerda', 'PONTES E LACERDA', 'Felipe Borges', array[]::text[], true, now()),
  ('EMG26', 'Conceição do Mato Dentro', 'CONCEICAO DO MATO DENTRO', 'Felipe Borges', array[]::text[], true, now()),
  ('EMG37', 'Guanhães', 'GUANHAES', 'Felipe Borges', array[]::text[], true, now()),
  ('EGO11', 'Mozarlândia', 'MOZARLANDIA', 'Felipe Borges', array[]::text[], true, now()),
  ('EGO17', 'Chapadão do Sul', 'CHAPADAO DO SUL', 'Felipe Borges', array[]::text[], true, now()),
  ('EDF10', 'Minaçu', 'MINACU', 'Felipe Borges', array[]::text[], true, now()),
  ('EPR7', 'Sto. Antonio da Platina', 'SANTO ANTONIO DA PLATINA', 'Felipe Borges', array['Mayra Cristina']::text[], true, now())
on conflict (xpt_code) do update set
  base_name = excluded.base_name,
  base_key = excluded.base_key,
  coordinator_name = excluded.coordinator_name,
  supervisors = excluded.supervisors,
  active = true,
  updated_at = now();

commit;
