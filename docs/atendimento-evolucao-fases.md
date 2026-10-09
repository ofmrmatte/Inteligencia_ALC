# Atendimento: entrega por fases

## Limites desta entrega

O plano aprovado em `writing-block.md` sera executado em sete PRs dependentes.
Esta branch entrega apenas a fase 1. Nao autoriza merge, deploy, migracao remota,
ativacao de automacoes ou mensagens reais. Core, Aux e RH continuam separados;
o Supabase central permanece responsavel por identidade, MFA e revogacao.

| Fase | Escopo | Estado |
| --- | --- | --- |
| 1 | Atendentes, bases, atribuicoes, permissao e autoria | Implementada; revisao remota pendente |
| 2 | Disparos individual/global, nome do dono da PNR, lotes e dedupe | Pendente; depende da fase 1 |
| 3 | Midia privada duravel, upload e visualizadores seguros | Pendente; depende da fase 2 |
| 4 | Evidencias paginadas com midia, pasta por PNR e ZIP opcional | Pendente; depende da fase 3 |
| 5 | IA opcional OpenAI/Gemini, fallback deterministico e modelos Meta | Pendente; depende da fase 2 |
| 6 | Diferenciais de sync, enriquecimento versionado e indicadores/eventos | Pendente; depende das fases 1 e 2 |
| 7 | MFA recente, titularidade de telefone, hardening e E2E controlado | Pendente; depende das anteriores |

Nao interpretar esta fase como autorizacao para usar os disparos antigos com a
nova distribuicao. A fase 2 deve vincular todo disparo ao dono valido da PNR,
revalidar acesso antes do envio e registrar lote, modelo e nome historico.

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
