# Referência das APIs e contratos — Inteligência ALC / Atendimento

Revisão: 10/10/2026. Inventário **orientado às rotas existentes**; o TypeScript, os schemas Zod e testes são a fonte de verdade para payloads completos. Exemplos aqui são sintéticos e não contêm dados reais. As recomendações de confiança em JWT, proteção de API e reverse proxy foram contrastadas no [Context7](referencias-context7.md).

## Autenticação e requisitos gerais

- Inteligência: `getCurrentProfile()`, Supabase SSR, `auth.getClaims()`, perfil ativo, `canAccessSection`/`canManage*` e middleware `proxy.ts` para operações mutáveis em `/api/**`. O `Origin` deve ser uma origem HTTPS autorizada, com exceção estritamente assinada do enriquecimento interno.
- Atendimento: `currentProfile()` e `proxy.ts` exigem mesma sessão Supabase, recibo de entrada e grant de revogação; conta inativa/sem módulo é bloqueada. Rotas administrativas invocam `requireAdmin()`. O Atendimento não expõe cadastro/login alternativo.
- Os handlers verificam autorização **por recurso/objeto**. Visibilidade no menu ou desabilitar botões não concede nem limita acesso por si só.
- Não utilizar client Supabase com chave `service_role` no navegador: ignora RLS. Dados pessoais e informações de RH não devem ser anexados a registros de erro.
- Formato normal de falha: JSON `{ "error": "Mensagem genérica" }`; alguns endpoints retornam `fields`, `issues` ou `reason` conforme schema. Não acoplar interfaces a mensagens textuais como se fossem códigos estáveis.

## Inteligência ALC

| Rota | Métodos | Uso | Restrição adicional |
| --- | --- | --- | --- |
| `/atendimento` | GET | Registra sessão central e cria ticket criptografado/descartável para o outro aplicativo | Perfil com módulo Atendimento, sessão Supabase válida, grants e chaves SSO |
| `/api/users` | GET/POST/PATCH/DELETE | Gestão interna de usuários, cargos, permissões, módulos e acesso ao Atendimento | `canManageUsers`, `canManageRole`/`canManageUserTransition`, bloqueio de autoalteração; operações privilegiadas com cliente admin |
| `/api/hr/[...path]` | GET/POST/PATCH/DELETE | Departamento, cargo, colaboradores, jornada, contratos, férias, ocorrências, remuneração, documentos e auditoria | `canAccessHr`; escrita `canManageHr`; remuneração `canReadSensitiveHr` |
| `/api/hr/attendance/import` | POST multipart | Prévia e ingestão de arquivo Secullum | `canImportSecullum`, arquivo limitado a 11 MiB, validação de colunas e vínculos |
| `/api/hr/documents/[id]/download` | GET | Assina acesso temporário a documento privado | Escopo do colaborador/documento + limite de sensibilidade |
| `/api/pnr-case-center/import` | POST | Importa dados de páginas Case Center com competência e lote deduplicado | Módulo PNR + `canManageImports`, validação do lote; cliente Supabase admin apenas após checagem de papel |
| `/api/internal/pnr-enrichment` | POST | Intercâmbio serviço-a-serviço para enriquecimento de PNRs | Protocolo criptograficamente autenticado no handler; exceção de `Origin` somente nessa rota POST exata |

Outras rotas operacionais do painel (relatórios, reconciliação, importação de planilhas e pré-faturas) permanecem em `apps/inteligencia/app/api/**` com os seus próprios controles. Ao criar novo endpoint, adicionar matriz de autorização e teste positivo/negativo no respectivo arquivo de testes.

### Recursos RH na rota dinâmica

| Recurso | Comportamento disponível |
| --- | --- |
| `overview` | GET agregado, sensibilidade conforme papel |
| `employees` | GET lista e detalhe; POST criação; PATCH atualização por ID |
| `departments`, `positions` | GET lista; POST criação; PATCH por ID |
| `contracts`, `leave`, `compensation` | GET lista, POST criação, PATCH por ID; remuneração restrita |
| `occurrences` | GET lista, POST criação, PATCH e DELETE por ID |
| `attendance` | GET período; POST `attendance/import` com prévia/importação |
| `documents` | GET lista; POST multipart; GET `/:id/download`; DELETE por ID |
| `audit` | GET histórico; consulta geral somente para papéis sensíveis |

Regras: retorno privado `no-store`; `If-Match` em edição com versão conhecida evita perda de atualização; vínculos inválidos retornam 400/409; `HR_DATABASE_URL` não configurado ou schema ausente retorna 503. Esta rota usa o Postgres-RH, nunca o Core/Aux para persistir cadastros RH.

## ALC Atendimento

A rota principal está em `apps/atendimento/app/api/[resource]/route.ts`. O segmento `[resource]` é **um seletor de recurso** e não autorização implícita. Todas as operações começam exigindo `currentProfile()`.

| Caminho `/api/<resource>` | Métodos | Função | Segurança e limites |
| --- | --- | --- | --- |
| `profile` | GET | Dados do perfil e capacidade de administração | Somente o usuário autenticado |
| `cases` | GET | PNRs da competência, filtro textual | Escopo operacional; consulta atual faz parte da filtragem na aplicação (ver risco residual de volume) |
| `conversations`, `messages` | GET | Lista e detalhe de conversas | Escopo do atendente, vínculo por conversa, limites de paginação |
| `conversation` | POST | Mutação de tratativa e/ou resposta humana | Regras da caixa, responsável atual e permissões |
| `operators`, `agents`, `assignments`, `coverage` | GET/POST conforme recurso | Atendentes, distribuição e atribuições | Escopo operacional, papéis gerenciais e regras de conflito |
| `dispatch-preview`, `dispatch-batch`, `dispatch`, `outbox` | GET/POST conforme recurso | Visualização, autorização de disparo e histórico da fila | Checagens de canal, PNR, destinatário, responsável, contrato Meta e idempotência |
| `overview`, `sync-summary` | GET | Indicadores do ciclo atual | Perfil e escopo |
| `collector-lookup`, `import` | POST | Deduplicação e sincronização PNR | Administrador, origem autorizada, competência vigente, Zod, até 50 entradas no lookup e até 300 na importação |
| `collector-progress` | GET/POST | Checkpoint visível após atualização da tela | Administrador, controle de job simultâneo, contadores monotônicos e origem autorizada no POST |
| `collector`, `collector-state` | GET/POST | Configuração do conector | Administrador |
| `agent-instructions`, `ai-config`, `ai-models`, `ai-test` | GET/POST conforme recurso | Ellie, provedores, catálogo e validação de configuração | Administrador; origem protegida nas mutações; segredos nunca no JSON de resposta |
| `template-contracts`, `templates`, `automation` | GET/POST conforme recurso | Contratos Meta, templates e automações | Administrador; revisão de contratos para central manager |
| `admin`, `users`, `audit`, `sync` | GET/POST conforme recurso | Administração, usuários, auditoria e sincronização Core | Administrador e capacidade específica conforme ação |

**Outros handlers próprios:** `/api/media/**` e `/api/evidence/**` exigem identidade, escopo e integridade de arquivos; `POST /api/evidence/export` limita até 10 pastas, 30 MiB e 90 imagens; `/api/channel-credentials` e `/api/ai-credentials` executam fluxo de desafio/reautenticação, não uma simples edição de segredo. `GET /health` testa a disponibilidade do schema Aux, não a saúde de todas as integrações.

### Meta WhatsApp, autenticação e worker

- `GET /webhooks/whatsapp/[channel]` é a verificação de webhook da Meta e exige token de verificação correspondente.
- `POST /webhooks/whatsapp/[channel]` verifica o `x-hub-signature-256` contra o corpo bruto com App Secret do canal, impõe **1.000.000 bytes** e persiste eventos idempotentes no Aux.
- `POST /auth/transfer` aceita somente formulário originado pelo Inteligência e ticket de uso único. A sessão fica em cookie com política segura e recibo assinado vinculado às claims.
- O worker usa tabelas de eventos/outbox e condições de envio; mensagem com entrega incerta não deve ser reenviada automaticamente.
- Ellie propõe apenas intenção e rationale delimitadas; o parser `apps/atendimento/lib/agent-ai.ts` rejeita envelopes inconsistentes e cai no roteiro determinístico. Propostas de IA não autorizam, sozinhas, envios reais.

## Erros, cache e auditoria

| Código | Interpretação geral | Próxima verificação |
| --- | --- | --- |
| 400 | JSON ou contrato de campos inválido | Verificar versão da extensão e schema da rota sem expor valores pessoais |
| 401 | Sessão expirada/ausente ou webhook com assinatura inválida | Reautenticar pela rota central ou validar assinatura |
| 403 | Perfil, escopo, MFA ou `Origin` não autorizado | Inspecionar grants, cargo/módulo, domínio público e políticas de origem |
| 409 | Conflito de versão, vínculo, job concorrente ou contrato | Refazer leitura e conferir identidade/sincronização |
| 413 | Limite de arquivo ou corpo excedido | Reduzir lote/payload |
| 503 | Banco/integração indisponível ou serviço não configurado | Checar Railway e variáveis **sem mostrar valores** |

Todos os exemplos de teste devem usar contas sintéticas, IDs fictícios e bancos isolados. Alterações de API devem manter os contratos de escopo e no-store, documentar novos recursos nesta matriz e introduzir testes que tentem acesso indevido.
