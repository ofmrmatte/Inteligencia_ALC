# Atendimento: entrega por fases

## Limites desta entrega

O plano aprovado em `writing-block.md` sera executado em sete PRs dependentes.
Esta branch entrega as fases 1 e 2, em PRs dependentes. Nao autoriza merge, deploy, migracao remota,
ativacao de automacoes ou mensagens reais. Core, Aux e RH continuam separados;
o Supabase central permanece responsavel por identidade, MFA e revogacao.

| Fase | Escopo | Estado |
| --- | --- | --- |
| 1 | Atendentes, bases, atribuicoes, permissao e autoria | Implementada; revisao remota pendente |
| 2 | Disparos individual/global, nome do dono da PNR, lotes e dedupe | Implementada; revisao remota pendente |
| 3 | Midia privada duravel, upload e visualizadores seguros | Pendente; depende da fase 2 |
| 4 | Evidencias paginadas com midia, pasta por PNR e ZIP opcional | Pendente; depende da fase 3 |
| 5 | IA opcional OpenAI/Gemini, fallback deterministico e modelos Meta | Pendente; depende da fase 2 |
| 6 | Diferenciais de sync, enriquecimento versionado e indicadores/eventos | Pendente; depende das fases 1 e 2 |
| 7 | MFA recente, titularidade de telefone, hardening e E2E controlado | Pendente; depende das anteriores |

Templates legados sem responsabilidade auditavel nao sao enviados pelo novo
worker. Historico permanece acessivel; registros pendentes exigem revisao.

## Fase 1

1. Funcionalidades: cadastro operacional de identidades existentes, funcoes
   explicitas, bases principais/substitutas, suspensao, disponibilidade,
   recebimento e contagem de conversas. Fila de PNRs sem dono, atribuicao manual,
   distribuicao automatica opt-in (principal, depois menor fila) e historico.
   Retomar robo preserva o dono da PNR. Gestores nao se tornam atendentes ao
   reabrir uma conversa. Transferencias cancelam respostas pendentes anteriores.
2. Arquivos: `apps/atendimento/lib/operator-directory.ts`, `assignment-engine.ts`,
   `inbox.ts`, `auth.ts`, `worker.ts`, `source.ts`, API generica, componentes de
   gestao/caixa/menu, paginas `gestao/*`, scripts de migracao, testes e workflow CI.
3. Banco: `002_operators_and_assignments.sql` adiciona `operators`,
   `operator_bases`, `case_assignments`, `assignment_history`, prioridade e
   autoria em mensagens/outbox. Sem cadastro automatico, redistribuicao historica
   ou autoria retroativa inventada. O runner passa a registrar `schema_migrations`.
4. APIs: GET/POST `operators`, `assignments` e `assignment-policy`; GET
   `operational-units`. Gestao exige privilegio central; funcoes locais nao
   elevam privilegios centrais. Caixa aceita filtros de base, sigla, prioridade,
   classificacao e espera, aplicados antes da paginacao. Etiqueta operacional e
   derivada do catalogo, separada das etiquetas manuais.
5. Testes: suite existente acrescida de cadastro explicito, escopo central,
   isolamento horizontal, tipo versus sigla, concorrencia, transferencias,
   autoria, migracoes/checksum e pool de quatro conexoes. PostgreSQL 17 local:
   Core e Aux em bancos diferentes, identidade simulada e nenhum envio Meta.
6. Seguranca: schemas Zod estritos, nenhuma senha nova, nenhuma credencial
   cliente, intersecao com escopo central, locks transacionais, versao otimista
   e auditoria atomica. Suspender recebimento nao apaga historico nem
   redistribui silenciosamente. Evidencia/midia reutilizam o controle da caixa.
7. GitHub: PR em draft; CI inclui dois bancos PostgreSQL descartaveis. Nao
   dispensar a revisao nem substituir a homologacao por testes unitarios.
8. Dependencias externas: confirmar conexoes efetivas do Core/Aux, comparar
   catalogo remoto com organograma e validar a sessao Supabase real. Variaveis
   necessarias, somente nomes: `CORE_DATABASE_URL`, `ATENDIMENTO_DATABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`. Nenhuma variavel remota foi alterada.
9. Pendencias: funcionalidades das fases 2-7, verificacao visual por imagem e
   homologacao real. Lint legado: `collector.tsx`, `privacy-consent.tsx`,
   `mfa-login-modal.tsx`, `mfa-security-panel.tsx` e `pnr-inbox-view.tsx` ja
   apresentam erros de `set-state-in-effect` na base desta branch.
10. Proxima fase: disparos com autorizacao individual/global e autoria do dono,
    sem reutilizar o nome generico configurado em `automation.operatorName`.

## Fase 2

1. Funcionalidades: disparo individual pelo dono autorizado; lote global por
   gestor com nome do dono de cada PNR, nunca do gestor. Selecao limitada a 100
   casos, resultado parcial explicito, nonce vinculado ao pedido e dedupe por
   PNR/canal, inclusive telefone alterado e chaves historicas. Nome e modelo
   ficam imutaveis no historico. Revogacao/transferencia/classificacao/contato
   sao relidos antes da chamada ao provedor. Entrega nao regride com webhooks.
2. Arquivos desta fase:
   `apps/atendimento/db/003_dispatch_ownership.sql`,
   `apps/atendimento/lib/dispatch-authorization.ts`,
   `apps/atendimento/lib/dispatch-batches.ts`,
   `apps/atendimento/lib/operator-directory.ts`,
   `apps/atendimento/lib/source.ts`, `apps/atendimento/lib/worker.ts`,
   `apps/atendimento/app/api/[resource]/route.ts`,
   `apps/atendimento/components/dispatches.tsx`,
   `apps/atendimento/tests/dispatch-api.test.ts`,
   `apps/atendimento/tests/dispatches.test.tsx`,
   `apps/atendimento/tests/source-regression.test.ts`,
   `apps/atendimento/tests/operator-postgres.test.ts` e este documento.
3. Banco: migracao aditiva 003, lotes e snapshots em outbox, indices por
   lote/caso/canal. Nenhum backfill de nome ou responsavel inventado. Mesma
   rotina de aplicacao explicitamente autorizada e rollback nao destrutivo.
4. APIs: POST `dispatch-batch`, schema estrito (batchId, channel, mode, caseIds).
   POST `dispatch` preservado como adaptador individual. GET `dispatch-preview`
   aplica escopo e dono antes de limitar. GET `outbox` inclui lote/autoria.
   POST `customer` exige gestor, schema estrito, escopo e transacao auditada
   sob o mesmo lock de caso usado no envio/importacao.
5. Testes: 316 Atendimento e 375 Inteligencia, total 691, incluindo 32 casos
   PostgreSQL local. Typecheck e build Atendimento/conector passaram. Lint
   dos arquivos alterados: zero erros, duas advertencias de imports legados.
   Lint global continua com os cinco erros legados descritos na fase 1.
   Navegador usa APIs sinteticas: selecao de lote e layouts estabilizados
   verificados em 320/391/768/1280 pixels CSS; tabela rola internamente.
6. Seguranca: sem nomes/IDs de autor aceitos do cliente. Bloqueios na ordem
   diretorio, caso, conversa; falha de identidade deixa a fila sem envio.
   Envios incertos nunca sao repetidos automaticamente. Troca de telefone
   nao cria outra chave inicial. Mensagem template e automatizada, nao uma
   fala pessoal do responsavel cujo nome preenche o contrato comercial.
7. GitHub: branch `codex/atendimento-dispatch-ownership`, base explicita
   `codex/atendimento-operational-management` (PR #77). PR draft dependente;
   nao fazer merge desta branch antes da dependencia aprovada.
8. Dependencias: nenhuma variavel nova. Credenciais/canais/templates reais
   e migracao remota nao utilizados. As chamadas Meta foram simuladas.
9. Pendencias: fases 3-7. A validacao textual completa do template pertence
   a fase 5; vinculo de autorizacao recente a sessao pertence a fase 7.
   A revalidacao atual verifica identidade/permissao, nao prova logout real.
   Sem homologacao de WhatsApp, catalogo remoto, SSO ou screenshot.
10. Proxima fase: anexos privados duraveis, validacao binaria, upload humano
    autorizado e players seguros, sem depender do disco efemero Railway.

## Catalogo e organograma

SVC e XPT identificam tipos, nunca siglas de unidades. O atendimento nao cria
unidades a partir desses valores e nao deduz SVC apenas pela ausencia de XPT.
O Core e a fonte canonicamente consultada; unidades inativas ou ambiguas nao
recebem novas atribuicoes. A tela de bases mostra sigla, cidade/base, coordenador,
supervisores e vinculo XPT, sem alterar o catalogo.

A configuracao local consultada nao possui `CORE_DATABASE_URL` nem
`ATENDIMENTO_DATABASE_URL`. Portanto o catalogo efetivo remoto NAO foi comparado
com a imagem. A migracao historica do organograma nao prova o estado atual.
Antes de qualquer ajuste cadastral, registrar as divergencias confirmadas,
aliases e vigencia; nunca sobrescrever a historia a partir de uma imagem.

## Migracao e rollback

Confirmar conexao Aux, backup e aprovacao explicita antes de executar:

```sh
npm run migrate --workspace=@alc/atendimento -- --apply
```

O comando sem `--apply` se recusa a executar. Cada arquivo e aplicado em uma
transacao com lock e checksum. O schema legado 001 pode ser adotado pelo runner
sem excluir registros. Nao modificar um arquivo depois de registrado: criar
uma proxima migracao. A politica inicial e manual e nao habilita WhatsApp.

Aplicar a migracao aditiva antes de trocar a versao web. Para rollback, voltar
a versao anterior da aplicacao e manter as novas tabelas/colunas e auditoria;
nao executar DROP, excluir identidades nem fabricar donos para registros antigos.
Nao mudar o comando pre-deploy remoto sem aprovacao.

## Prova local e homologacao

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build:inteligencia
npm run build:atendimento
npm run extension:build
npm audit --omit=dev --audit-level=high
```

Os testes PostgreSQL somente executam com `ATENDIMENTO_TEST_DATABASE_URL` e
`ATENDIMENTO_TEST_CORE_URL`, em loopback, com nomes `alc_atendimento_test` e
`alc_core_test`. Nunca apontar esses nomes para producao. Sem essas variaveis,
a suite de integracao e explicitamente pulada. Node 25 local requer
`NODE_OPTIONS=--no-experimental-webstorage` para a suite jsdom do Inteligencia;
o CI usa Node 22. Isso nao altera auth nem armazenamento da aplicacao.

Revisao de interface usa componentes reais com API sintetica, sem SSO ou
WhatsApp; prova geometrica nao substitui captura visual nem teste end-to-end.
Foram executados: instalacao limpa, typecheck, 671 testes (296 Atendimento e
375 Inteligencia, incluindo 15 casos PostgreSQL reais), builds dos dois apps,
build do conector 1.2.3, auditoria de performance e auditoria de dependencias
de producao (zero vulnerabilidades). Lint dos arquivos alterados passou; lint
global continua com os cinco erros legados listados acima. Nao foram ocultados.
As tres telas de gestao foram verificadas em 320, 391, 768 e 1280 pixels CSS:
sem overflow da pagina ou sobreposicao do cabecalho. A captura por imagem
falhou por timeout da ferramenta; nao ha comprovacao visual por screenshot.
Homologar depois: gestor sem funcao nao recebe PNR, atendente de outra base nao
acessa conversa/anexo, dono unico sob concorrencia, transferencia com motivo,
pausa de recebimento, revogacao central e autoria humana/virtual distinta.
