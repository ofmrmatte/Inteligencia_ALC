# Arquitetura da plataforma ALC

Última revisão documental: 10/10/2026. Fonte: código versionado no monorepo e configuração conhecida da Railway. Não contém dados nem credenciais reais.

## Inventário

| Componente | Localização | Função | Deploy |
| --- | --- | --- | --- |
| Inteligência ALC | `apps/inteligencia` | PNR/Case Center, análise operacional, pré-faturas, importações, RH e gestão de usuários | Serviço `Inteligencia_ALC` na Railway |
| ALC Atendimento | `apps/atendimento` | Conversas, tratativas, disparos, templates Meta, Ellie, comprovantes, atendentes e coleta | Serviço `ALC-Atendimento` na Railway |
| Conector | `extensions/pnr-connector` | Obtém páginas e detalhes do Mercado Livre pela sessão autenticada do navegador | Extensão MV3 distribuída pelos aplicativos |
| Identidade | `packages/identity` | Papéis, escopos, cifragem de tickets e recibo de SSO | Biblioteca compartilhada, sem servidor próprio |
| UI | `packages/ui` | Componentes/identidade visual | Biblioteca compartilhada |

Os dois frontends Next.js 16 usam React 19 e TypeScript. O Node.js mínimo é 22. Dependências e lockfile são centralizados na raiz (`npm workspaces`).

## Fronteiras entre bancos e autenticação

- **Supabase**: autenticação, MFA, perfis e Storage privado quando configurado. `auth.getClaims()` verifica assinatura/expiração do token e `getSession()` recupera tokens, mas este último não serve sozinho para autorizar acesso. **Revogação remota no Auth Server não é imediatamente detectada por `getClaims()`; para esse requisito use `getUser()` conforme a política de risco/latência.** O Atendimento mantém grants próprios para revogação central. Consulte a [verificação Context7](referencias-context7.md).
- **Postgres-Core (Railway)**: dados operacionais comuns e bases. O Inteligência mantém seus adaptadores e rotinas para fontes operacionais.
- **Postgres-Aux (Railway)**: schema `alc_atendimento` (PNRs, conversas, mensagens, outbox, configurações, tickets de transferência, audit e progresso do coletor).
- **Postgres-RH (Railway)**: apenas matriz, setores, colaboradores, ponto Secullum, jornada, ocorrências, contratos, remuneração segregada e documentos privados. Não é uma unidade/base.
- **RLS**: políticas configuradas em tabelas Supabase aplicam-se às chamadas mediadas pelo Supabase; PostgreSQL Railway não recebe RLS automaticamente. Os serviços usam usuários de banco de servidor e exigem autenticação/autorização na API e privilégios SQL mínimos. Não exponha credenciais Postgres em bundles de navegador.

## Fluxos principais

### Entrada e transferência de sessão
1. O usuário autentica no Inteligência via Supabase Auth/MFA e é validado por perfil/escopo.
2. `GET /atendimento` registra vínculo revogável `sso_session_<session_id>` no Aux e um ticket aleatório de uso único válido por 60 segundos.
3. O ticket é enviado via formulário POST para `/auth/transfer` do Atendimento. A sessão é cifrada com AES-256-GCM; não é inserida em query string.
4. O Atendimento consome o ticket atomicamente, verifica assinatura/claims, grava recibo assinado em cookie HttpOnly/Secure e valida o vínculo da sessão em cada requisição.
5. Logout e troca de usuário devem revogar grants e tickets; acesso direto ao Atendimento não fornece login independente.

**Segredos de pareamento:** `ATENDIMENTO_SSO_KEY` (Inteligência) deve corresponder à chave `ATENDIMENTO_ENCRYPTION_KEY` (Atendimento) usada para abrir tickets. Ambas exigem 32 bytes hexadecimais. Nunca documente os valores reais.

### Coleta e PNRs
1. O Conector 1.2.7 (Chrome MV3) usa a aba autenticada `envios.adminml.com`. Um navegador e as abas autenticadas precisam permanecer disponíveis.
2. A Visão Geral solicita a coleta via `ATENDIMENTO_COLLECT`, sem canal específico e com `collectOnly: true`; isso **não envia mensagens**.
3. Cada página da competência vigente é lida no Case Center; `POST /api/collector-lookup` classifica cada ID como `full`, `status` ou `skip`.
4. **Nova**: timeline e compradores, respeitando a confirmação/vínculo do envio. **Existente com status alterado**: atualiza status e classificação sem substituir contatos/detalhes. **Inalterada**: dispensa detalhes e consulta de comprador.
5. `POST /api/import` valida os itens do lote. Dados auxiliares inválidos ficam sem verificação; casos-base inválidos são contabilizados para revisão. Identidade de comprador divergente do envio bloqueia a operação.
6. `POST /api/collector-progress` persiste o checkpoint em `alc_atendimento.settings`; `GET /api/collector-progress` permite retomar a visualização da barra. Um job ativo é protegido por exclusão no banco. A coleta real depende da extensão/sessão, **não** do componente React.

Se uma PNR mantiver o mesmo status, mudanças em outros campos não são redetectadas por esse modo incremental. Use processo de enriquecimento/revisão específica quando a atualização desses campos for necessária.

### WhatsApp e Ellie
- Webhooks por `client`/`driver` exigem assinatura HMAC SHA-256 do Meta App Secret e payload limitado antes da gravação; worker processa eventos e outbox.
- Envio é condicionado a vínculo exato PNR/telefone/canal, consentimento, templates aprovados, escopo, janela de 24h e idempotência. Eventos incertos não são reenviados automaticamente.
- Ellie possui regras determinísticas obrigatórias. OpenAI/Gemini são opcionais, devolvem somente proposta de intenção entre ações permitidas; falhas, recusa, timeout ou texto malformado devem cair no fallback. A IA não envia WhatsApp ou atualiza PNR diretamente.
- A cota diária da IA é **número de chamadas ao provedor**, não limite de atendimentos. O controle e custo devem ser monitorados em Ajustes.

### RH
- `GET/POST/PATCH/DELETE /api/hr/[...path]` passa por `getCurrentProfile()`, `canAccessHr`, `canManageHr` e, quando cabível, `canReadSensitiveHr`. O banco RH é conectado exclusivamente no servidor pelo `HR_DATABASE_URL`.
- Upload Secullum e documentos possuem limite de bytes, validação de formato e escopo; documentação RH histórica: `apps/inteligencia/docs/hr.md` (alguns estados de revisão antigos precisam ser lidos como histórico, não como status atual).

## Contratos de mudança
- Uma PR deve ter CI com lint, typecheck, testes, builds dos dois aplicativos, build do conector, auditoria de dependências e auditoria estática.
- Qualquer alteração no contrato de transferência de sessão precisa ser publicada de modo coordenado nos dois serviços.
- Migrations são aplicadas somente no banco/schema correto, com autorização e rollback documentado; não executar contra produção por efeito colateral de documentação.
- O Conector deve ser atualizado manualmente no Chrome para novos fluxos mesmo quando o backend já está implantado.
- Deploy concluído não substitui homologação com sessão Mercado Livre e canais Meta reais.

## Referências de bibliotecas e operações

- [Matriz das bibliotecas validada com Context7](referencias-context7.md)
- [Inventário das APIs de ambos os aplicativos](api-contratos-alc.md)


- [Next.js — documentação](https://nextjs.org/docs)
- [Supabase — SSR e criação de cliente](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase — verificação de claims](https://supabase.com/docs/reference/javascript/auth-getclaims)
- [PostgreSQL — privilégios](https://www.postgresql.org/docs/current/ddl-priv.html)
- [Railway — builds](https://docs.railway.com/builds) e [Railpack](https://docs.railway.com/builds/railpack)
- [Chrome Extensions — Manifest V3](https://developer.chrome.com/docs/extensions/develop)
