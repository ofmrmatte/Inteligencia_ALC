> **Registro histórico de revisão de RH.** Os bloqueios e estados de migração descritos abaixo pertencem à antiga branch de desenvolvimento e não comprovam o status atual de produção. Para instruções operacionais vigentes, veja [arquitetura](../../../docs/arquitetura-plataforma-alc.md), [segurança](../../../docs/seguranca-plataforma-alc.md) e [runbooks](../../../docs/runbooks-plataforma-alc.md). Não aplique SQL em produção baseado apenas neste histórico.

# Recursos Humanos V1

## Estado e limites

Entrega para revisão remota na branch `codex/hr-v1-local`, baseada em `104043d`.
Somente commit, push da branch RH e PR draft estão autorizados nesta etapa.
Não fazer merge, deploy, alterações Railway/Supabase ou SQL remoto.

**DO NOT MERGE YET — Postgres-RH schema must be applied and validated before production deployment.**

Conforme informado pelo responsável, Postgres-RH, HR_DATABASE_URL de produção
e bucket privado hr-documents já existem. A migration RH ainda não foi aplicada.
Essas configurações remotas não foram acessadas nem alteradas nesta revisão.
`vercel.json` bloqueia deployments automáticos somente de `codex/hr-v1-local`,
sem mudar o comportamento da main ou de outras branches.
Auth, MFA, login, sessão e `/api/dashboard/overview` permanecem inalterados.

RH atende somente a matriz. Não há unidades, bases, CPF, filtros de admissão,
organograma, regime permanente de home office, banco de horas ou ATS.
Recrutamento aparece desabilitado como **Em preparação**.
Home office é uma ocorrência diária; horas extras são medidas do dia, sem saldo.

### Arquivos da entrega

Criados:

- `lib/hr/{db,repository,permissions,types,validators,audit,secullum-parser,documents}.ts`
- `app/api/hr/[...path]/route.ts`
- `components/views/hr-view.tsx` e `hr-view.module.css`
- `db/railway/hr/001_hr_initial_schema.sql`
- `scripts/hr-migrate-local.mjs`
- `tests/hr-{permissions,parser,db,repository,documents,api,ui}.test.ts`
- `docs/hr.md`

Artefatos Codex/Testagent, revisão visual sintética, screenshots, logs, caches
e `.env.local` permanecem locais e ignorados; não fazem parte da entrega Git.

Alterados: `.env.example` (documentação da variável, não ambiente real),
`.gitignore` (artefatos locais), `vercel.json` (bloqueio da branch de revisão),
`lib/navigation.ts`, `lib/access-control.ts`, `components/sidebar.tsx`,
`components/dashboard-app.tsx`, `components/topbar.tsx`,
`components/views/view-router.tsx`, `tests/access-control.test.ts`.

Auth/MFA/proxy, overview operacional, adapter Railway, dependências e relatórios
não apresentam alterações no diff final. A alteração local anterior nos relatórios
do checkout original permanece preservada.

## Arquitetura

- `/rh` usa a navegação existente e é standalone/no-global-data.
- `components/views/hr-view.tsx` consulta somente `/api/hr/**`; não hidrata dados operacionais.
- O dispatch em `app/api/hr/[...path]/route.ts` compartilha autenticação,
  autorização, validação, erros e `private, no-store` para todas as rotas RH.
- `lib/hr/repository.ts` pertence exclusivamente ao domínio RH.
- `lib/hr/db.ts` é server-only, usa **somente `HR_DATABASE_URL`**, pool independente
  de quatro conexões, timeout de conexão 5s e timeout SQL 15s.
- O pool é criado sob demanda. Importar módulos, typecheck ou build não conecta.
- Sem configuração, APIs autenticadas retornam 503 com
  `Banco de Recursos Humanos ainda não configurado.` Não há fallback ou criação automática.
- CORE (`DATABASE_URL`) e AUX (`PNR_DATABASE_URL`) não recebem dados RH nem novas tabelas.
- `railway-data-client.ts` não foi adaptado para RH.
- Supabase continua responsável por Auth, MFA, profiles e arquivos físicos.

### Tabelas no Postgres-RH

Migration: `db/railway/hr/001_hr_initial_schema.sql`.

| Tabela | Responsabilidade |
| --- | --- |
| hr_departments | Setores; inativação preserva histórico |
| hr_positions | Cargos vinculados a setor |
| hr_employees | Cadastro e matrícula; sem salário ou home office permanente |
| hr_contracts | Contratos e carga semanal; um contrato ativo por colaborador |
| hr_compensation_history | Remuneração segregada e acesso sensível |
| hr_occurrences | Ocorrências pontuais e home office diário |
| hr_leave | Férias, afastamentos e licenças |
| hr_time_import_batches | Hash, totais, responsável e rejeições por importação |
| hr_time_entries_raw | Dados brutos e resultado de validação por linha |
| hr_attendance_daily | Espelho diário único por colaborador/data |
| hr_documents | Somente metadados de arquivos privados |
| hr_audit_log | Histórico RH, independente dos logs operacionais |

FKs relacionam apenas tabelas RH. IDs de usuários do Supabase são UUIDs sem FK
cross-database. Constraints validam datas, enumerações, tamanhos e compatibilidade
cargo/setor. Não existem grants para roles de browser.

Mutações SQL e auditoria são transacionais. Remuneração, observações, descrições,
raw_payload e caminhos de Storage não entram nos snapshots de auditoria.
Não há logging de payloads, salário, arquivos, tokens ou URLs assinadas.
Edições usam bloqueio de linha e versão UTC com precisão PostgreSQL; a UI envia
`If-Match` para detectar formulários desatualizados. Conflitos retornam 409.

## Permissões

| Perfil | RH |
| --- | --- |
| developer / super_admin / administration_supervisor / admin | Administração completa, remuneração, documentos e importação |
| director | Overview, colaboradores, contratos, jornada, férias/ocorrências e documentos não sensíveis; somente leitura |
| loss_supervisor / loss_admin / coordinator / supervisor / driver | Sem acesso, inclusive com global_access ou module_scope RH |

A matriz explícita está em `lib/hr/permissions.ts`. O acesso operacional não
concede RH. Administração recebe RH sem adquirir acesso operacional.
Salário só sai por `/api/hr/compensation`; nunca junto com colaboradores.
Diretoria não recebe detalhes sensíveis do histórico ou metadados de documentos
sensíveis. API verifica sessão e permissão antes de ler payloads ou acessar dados.
O proxy CSRF e os headers de segurança existentes não foram alterados.

## APIs

| Recurso em /api/hr | Métodos |
| --- | --- |
| overview | GET |
| employees / employees/:id | GET, POST / GET, PATCH |
| departments / departments/:id | GET, POST / PATCH |
| positions / positions/:id | GET, POST / PATCH |
| attendance / attendance/import | GET / POST multipart |
| leave / leave/:id | GET, POST / PATCH |
| occurrences / occurrences/:id | GET, POST / PATCH, DELETE |
| contracts / contracts/:id | GET, POST / PATCH |
| compensation / compensation/:id | GET, POST / PATCH, acesso sensível |
| documents / documents/:id | GET, POST multipart / DELETE |
| documents/:id/download | GET, URL assinada temporária |
| audit | GET |

Listagens retornam `rows`, `total`, `limit=100`; `offset` pagina sem baixar tudo.
Colaboradores: `search`, `status`, `department_id`, `position_id`, `employment_type`.
Jornada/ausências: `start`, `end`, `employee_id`. Sem período informado, a jornada
consulta o dia atual em America/Sao_Paulo; não mistura datas arbitrariamente.
As datas de negócio são devolvidas como YYYY-MM-DD, sem deslocamento de timezone.
Erros 400/401/403/404/405/409/413/500/503 não expõem SQL, stack ou credenciais.

## Secullum

Não existe integração com API externa nesta versão.

1. Selecionar CSV ou XLSX com uma única aba de espelho diário, até 5 MB/10.000 linhas.
2. Detectar cabeçalhos; aliases reconhecem matrícula, data, trabalhadas, previstas,
   primeira entrada, última saída, atraso, extras, falta e divergência.
3. Mostrar colunas e mapear explicitamente campos desconhecidos.
4. Pré-visualizar até 50 linhas; totais e validações consideram o arquivo completo.
5. Validar vínculo por `hr_employees.secullum_employee_code`, nunca por nome ou ID operacional.
6. Confirmar importação parcial quando houver rejeições.
7. Arquivar todas as linhas brutas/rejeições e atualizar o espelho dos dias válidos.

Matrícula, data e trabalhadas são obrigatórios. Duração aceita minutos inteiros ou
HH:MM; formatos decimais ambíguos não são estimados. Datas aceitam DD/MM/AAAA,
YYYY-MM-DD e serial Excel. Entrada/saída não substituem automaticamente horas
trabalhadas: faltariam intervalos. Matrícula/data repetidas são rejeitadas, sem soma.
Arquivo idêntico já importado retorna 409; corrija o arquivo para novo lote.
Não executa macros e não inventa API Secullum.

Importações atualizam por colaborador/data, não apagam outros dias. Um lock
transacional serializa importações raras da matriz. Ocorrências manuais continuam
separadas, sobrevivem ao reimport e aparecem mesmo sem batidas. Para atraso/extras
conflitantes, o consolidado usa o maior valor registrado, sem somar duas fontes.

## Documentos

Bucket esperado: **hr-documents**, obrigatoriamente privado. Nenhum bucket é criado
automaticamente. Ausência ou bucket público bloqueiam a operação com mensagem clara.

- Upload server-side; PDF/PNG/JPEG com MIME e assinatura compatíveis, até 10 MB.
- Caminho: `hr/{employeeId}/{uuid}-{sanitizedFilename}`.
- Metadados no Postgres-RH; conteúdo somente no Supabase Storage.
- Documentos são sensíveis por padrão.
- Download usa signed URL de 60s, nunca `getPublicUrl`.
- Falha SQL após upload tenta limpar o arquivo não registrado.
- Remoção audita tombstone antes de limpar Storage, bloqueando novos downloads.
  Se a limpeza física falhar, DELETE pode ser repetido pelo ID e retorna aviso.
- URLs já emitidas expiram em até 60s; não são armazenadas nem registradas em logs.

## Revisão local

Não copie credenciais de produção para testes. `.env.example` documenta
`HR_DATABASE_URL` vazia. A aplicação compila sem banco RH configurado.
Para persistência real local, prepare PostgreSQL local **independente** chamado
`alc_hr_local`, sem túnel para bancos remotos, e configure HR_DATABASE_URL apenas
no processo local. Use identidades/Storage de ambiente de revisão, nunca dados pessoais reais.

Runner opcional, exclusivamente loopback e banco `alc_hr_local`:

```powershell
node scripts/hr-migrate-local.mjs --confirm-hr-local
```

O runner recusa URL ausente, host remoto, nome de banco diferente e falta de confirmação.
Nunca lê Core/Aux como fallback. O arquivo SQL é transacional e não é reaplicável
automaticamente: uma segunda aplicação falha sem apagar dados.

### Provas isoladas

- Vitest padrão: `npm test`; testes RH em `tests/hr-*.test.ts`.
- Provas complementares locais usaram PostgreSQL em memória e revisão visual
  sintética em nove resoluções. Seus runtimes e artefatos não são entregues no Git.
- Os testes de permissão, isolamento, API, parser, documentos, repository e UI
  podem ser executados normalmente com `npm test` no checkout da PR.

Mocks/componentes e PostgreSQL em memória não comprovam Supabase real, sessão/MFA,
export real Secullum, rede Railway, driver pg em servidor ou quotas em produção.

## Ativação futura em produção — não executada

1. Confirmar o serviço dedicado **Postgres-RH** já existente.
2. Confirmar volume próprio, backup e destino antes de qualquer SQL.
3. Confirmar que `HR_DATABASE_URL` aponta exclusivamente para Postgres-RH.
4. Não copiar credenciais para código, logs, PR ou testes.
5. Não modificar `DATABASE_URL`, `PNR_DATABASE_URL` ou configurações de produção nesta revisão.
6. Aplicar `db/railway/hr/001_hr_initial_schema.sql` **somente** no Postgres-RH, após verificar o destino.
7. Validar as 12 tabelas, constraints e índices.
8. Preparar/verificar bucket privado hr-documents no Supabase Storage.
9. Realizar backup/snapshot apropriado.
10. Fazer **um único** deploy da aplicação.
11. Testar `/api/hr/overview`.
12. Testar permissões de cada perfil, incluindo negação Loss e leitura limitada da Diretoria.
13. Testar colaboradores, contratos, salário segregado, edição simultânea e histórico.
14. Testar importação Secullum real, preview, mapping, raw, rejeições e reimportação de dias.
15. Testar upload/download/remoção, MIME, bucket privado e bloqueio de sensíveis.
16. Somente então liberar RH aos usuários autorizados.

Upgrade do Postgres-Core é separado e não é dependência do RH.

### Checklist antes de liberar

- Confirmar diff limitado a RH/navegação e zero mudança em Auth/MFA/proxy/overview/adapter.
- Conferir destino dedicado de HR_DATABASE_URL e zero referências RH a Core/Aux.
- Revisar grants do usuário de conexão RH, backup, capacidade e isolamento de rede.
- Reexecutar lint/typecheck/test/build/audit e resolver bloqueios históricos em tarefa separada.
- Homologar CSV/XLSX real Secullum sem versionar dados pessoais.
- Revisar todos os perfis e tentativas diretas por API, sem depender da Sidebar.
- Verificar que vencimentos e ausências usam datas corretas e a matriz não vê filtros operacionais.
- Conferir contraste claro/escuro, mobile, drawer, erro, confirmação e paginação.
- Confirmar que nenhuma tabela, arquivo ou log guarda credenciais ou URLs temporárias.
- Executar a sequência de ativação apenas após autorização específica.

## Revisão da entrega — 2026-10-07

- Escopo: TypeScript/React/Next e SQL RH. Fronteiras revisadas: sessão/perfil,
  HTTP/JSON/multipart, filtros e IDs, CSV/XLSX, pool Postgres-RH e Storage privado.
  Controles relevantes: autorização, validação de entrada, queries parametrizadas,
  proteção de dados sensíveis, auditoria e limites de upload.
- APIs validam sessão e matriz RH antes de qualquer leitura, payload ou mutação;
  remuneração é segregada, documentos sensíveis são negados à Diretoria e
  respostas usam `private, no-store`. Auth/MFA e proxy CSRF não foram alterados.
- Pool RH lazy e dedicado; nenhuma leitura de Core/Aux no domínio RH.
  Migration transacional cria apenas 12 tabelas hr_* e seus índices/FKs internos.
- Navegação e interface preservam o shell global: RH em Administração,
  Configurações/Perfil em Ajustes, uma topbar e nenhum shell escuro interno.
- `npm run lint`: 4 erros históricos e 4 warnings, fora das alterações RH.
  Erros em privacy-consent.tsx, mfa-login-modal.tsx, mfa-security-panel.tsx e
  pnr-inbox-view.tsx; arquivos inalterados. Lint de todos os fontes/testes RH
  e arquivos de integração alterados passou. Não houve supressão de regras.
- `npm run typecheck`: passou.
- `npm test`: 39 arquivos e 323 testes passaram.
- `npm run build`: passou sem HR_DATABASE_URL, DATABASE_URL ou PNR_DATABASE_URL
  no ambiente local. Nenhuma conexão RH foi iniciada no import/build.
- `npm audit --omit=dev`: zero vulnerabilidades.
- Busca por segredos e revisão de arquivos: nenhum segredo ou URL de conexão
  real na entrega. URLs de testes são sintéticas, sem credenciais; o template
  `.env.example` tem HR_DATABASE_URL vazia. Artefatos e capturas não são publicados.
- Limite: não houve homologação de persistência/Storage reais, CSV Secullum real,
  schema remoto, grants ou configuração de serviços. A PR deve permanecer draft
  até aplicar e validar o schema exclusivamente no Postgres-RH, com autorização.
