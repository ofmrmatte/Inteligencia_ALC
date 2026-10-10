# Segurança — Inteligência ALC e ALC Atendimento

Revisão de código direcionada: 10/10/2026. Este documento é um **checklist de segurança, evidências no código e riscos residuais**; não é laudo de pentest nem prova de ausência de vulnerabilidades.

## Limites e ameaças

Ativos: PNRs, dados operacionais, compradores/motoristas, conversas, arquivos privados, informações de RH, chaves Supabase, Meta e provedores de IA. Vetores principais: roubo/reuso de sessão, CSRF, escalada de perfil, vazamento por escopo, webhook falsificado, importação maliciosa, duplicação de disparo, payload de IA adversarial, arquivos e exposição de segredos.

| Controle | Código relevante | Como validar |
| --- | --- | --- |
| Identidade Supabase/MFA | `apps/inteligencia/lib/auth-server.ts`, `apps/atendimento/lib/auth.ts` | Claims verificadas, perfil ativo, módulos, sessão e MFA |
| SSO de uso único | `packages/identity/transfer.ts`, rotas `/atendimento` e `/auth/transfer` | Ticket consumido uma vez, 60s, AES-256-GCM, revogação, cookie seguro |
| CSRF Inteligência | `apps/inteligencia/proxy.ts` | Mutação `/api/**` com `Origin` exato autorizado; sem Origin, host forjado ou `Sec-Fetch-Site: cross-site` devem falhar |
| CSRF Atendimento | `apps/atendimento/proxy.ts` e `lib/request-origin.ts` | Origem configurada obrigatória; endpoint do ticket separado por POST origem Inteligência |
| Permissão e escopo | `packages/identity/auth.ts`, `lib/access-control.ts`, `lib/hr/permissions.ts`, `apps/atendimento/lib/auth.ts` | Usuário limitado não lê/grava unidades externas nem dados RH sensíveis |
| Webhooks Meta | `apps/atendimento/app/webhooks/whatsapp/[channel]/route.ts` | HMAC do corpo bruto, limite de 1 MB, canal válido, replays idempotentes |
| PNR/importação | `apps/atendimento/app/api/[resource]/route.ts`, `lib/source.ts` | Contrato Zod, vínculo caseId/shipmentId, preservação de contatos e quarentena de dados inválidos |
| Ellie/IA | `apps/atendimento/lib/agent-ai.ts` | Saída estruturada limitada, sem recusa misturada, orçamento/timeout, fallback determinístico |
| Privacidade de anexos/RH | `apps/atendimento/lib/media-*.ts`, `apps/inteligencia/lib/hr/**` | Limite de arquivo, quarentena, assinatura temporária, escopo por rota e nenhuma resposta pública |
| Deploy e segredos | Railpack, Railway Settings e workflow de CI | Variáveis privadas server-only; `NEXT_PUBLIC_*` estritamente públicas; não imprimir secrets em CI/logs |

## Alterações de hardening propostas na revisão

1. **Inteligência / CSRF:** deixar de confiar em `X-Forwarded-Host` na autorização de origem; exigir `Origin` serializado e domínio público autorizado, rejeitar mutações de origem ausente. `POST /api/internal/pnr-enrichment` permanece exceção apenas por assinatura própria.
2. **Atendimento / Ellie:** aceitar no Responses API uma única mensagem de assistente concluída, com único `output_text`. Rejeitar resposta com `refusal` misturada, mensagens extras, tool calls ou status parcial; permitir apenas blocos de raciocínio não executáveis junto da mensagem.
3. **Coletor:** exigir progresso/total/erros monotônicos tanto na verificação lógica quanto no `UPDATE` SQL; evitar regressão por checkpoints atrasados ou concorrentes.

As três alterações deste hardening foram publicadas pela [PR #96](https://github.com/ofmrmatte/Inteligencia_ALC/pull/96) no commit `bee808a`, com deploy confirmado dos dois serviços. Este documento identifica o escopo de revisão, não atesta comportamento real de todos os cenários.

## Riscos residuais / decisões pendentes

- **CSP:** o Inteligência ainda utiliza `script-src 'unsafe-inline'` para compatibilidade com a aplicação. O Atendimento não possui uma CSP completa. Planejar CSP com nonce e testes de renderização/integrações antes de torná-la restritiva, evitando quebrar autenticação ou Next.js.
- **Privilégios Railway PostgreSQL:** conferir em cada banco, por DBA, quais roles de aplicação possuem `CONNECT`, `USAGE`, `SELECT`, `INSERT`, `UPDATE` e `DELETE`. A conexão server-side não substitui o princípio do menor privilégio.
- **Escopo nas listagens:** revisar consultas que carregam milhares de linhas para filtrar após a leitura em memória (`apps/atendimento/app/api/[resource]/route.ts`, rota de `cases`). Paginação/escopo no SQL diminuirão superfície e uso de recursos.
- **Revogação de sessões Supabase:** `getClaims()` valida o JWT, mas não detecta por si só a revogação remota de sessão no provedor antes da expiração; `getUser()` consulta o Auth Server. Grants internos do Atendimento cobrem o logout/troca realizados pelo painel central, não todas as revogações externas. Priorizar análise de `getUser()` em operações de maior sensibilidade (RH, administração, documentos), com testes de desempenho/indisponibilidade. Documentação do mantenedor recuperada via [Context7](referencias-context7.md).
- **Migrações/segredos:** revisar rotação das chaves Supabase/Meta/SSO e grants; não executar rotações sem procedimento coordenado e janela de manutenção.
- **Conector:** a permissão Chrome `scripting` e os hosts declarados permitem acesso a conteúdos sensíveis das páginas autorizadas. Distribuir ZIP somente por canal controlado, verificar hash/versão e nunca incluir domínio wildcard ou fontes arbitrárias.
- **Fluxos externos:** teste sintético de WhatsApp/Meta, payload ou sessão Mercado Livre não substitui homologação com dispositivos reais.
- **CI lint:** o workflow trata lint legado como advisory (`continue-on-error: true`); revisar debt e tornar bloqueante quando erros existentes forem zerados.
- **Não houve pentest externo, varredura de portas, DAST autenticado ou inspeção exaustiva de permissões SQL em produção** nesta revisão.

## Testes mínimos antes de aprovar

- POST/PATCH/DELETE no Inteligência: `Origin` ausente, HTTP, host falso, sufixo malicioso, origem válida atrás do proxy Railway.
- Atendimento: ticket expirado/reutilizado, revogação após logout, MFA insuficiente, usuário sem escopo, CSRF, extensão desconectada.
- Ellie: `incomplete`, `refusal`, `output_text+refusal`, múltiplas mensagens, function call, status não concluído e payload grande.
- Coletor: checkponits fora de ordem, PNR nova/status/inalterada, comprador divergente, erro parcial sem falso `completed`.
- Meta: assinatura inválida, corpo superior a 1 MB, reenvio idempotente, canal/telefone incorretos, envios incertos.
- RH: permissões por papel e falta de acesso a compensação/documentos, arquivo Secullum inválido, links de documentos expirados.

## Procedimento diante de suspeita de incidente

1. Suspender automações de disparo e/ou a credencial comprometida, **sem excluir evidências**; avaliar desligamento seletivo do canal.
2. Inspecionar logs de acesso/autorização, outbox, auditoria e últimos deploys. Não copiar payloads com dados pessoais para issues públicas.
3. Revogar sessões ou grants afetados e rotacionar chaves comprometidas na ordem correta; SSO requer alinhamento Inteligência/Atendimento.
4. Se houver necessidade de rollback, considerar contratos de banco, extensão e frontend simultaneamente; confirmar integridade e destinatários antes de retomar envios.
5. Documentar hora, impacto, medidas e validações sem expor PII ou credenciais.

## Documentação complementar

- [Referências oficiais recuperadas via Context7](referencias-context7.md)
- [Inventário das APIs e dos limites de autorização](api-contratos-alc.md)

## Fontes técnicas oficiais

[Supabase Auth SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client) ·
[PostgreSQL privileges](https://www.postgresql.org/docs/current/ddl-priv.html) ·
[Railway service configuration](https://docs.railway.com/services) ·
[Next.js headers e CSP](https://nextjs.org/docs/app/guides/content-security-policy)
