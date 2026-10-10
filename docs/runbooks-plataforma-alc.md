# Runbooks operacionais — plataforma ALC

Versão documental: 10/10/2026. Nunca colar senhas, números reais ou chaves em issues, PRs, logs e exemplos.

## Preparar ambiente local

A partir da raiz do monorepo (Node 22 ou superior):

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build:inteligencia
npm run build:atendimento
npm run extension:build
npm audit --omit=dev --audit-level=high
```

Configure `apps/inteligencia/.env.local` e `apps/atendimento/.env.local` exclusivamente com credenciais de desenvolvimento. Leia os `.env.example` dos workspaces. Os testes devem usar bancos de teste e mocks; nunca usar credenciais de produção para testes automatizados.

## Diagnosticar Railway

1. Verifique os serviços `Inteligencia_ALC`, `ALC-Atendimento`, `Postgres-Core`, `Postgres-Aux` e `Postgres-RH`. Confirme deployment SHA e status.
2. Confira build vs deploy vs HTTP logs separadamente, filtrando por timestamp e serviço.
3. Cheque healthcheck do Atendimento em `GET /health` (status 200 somente se o schema do Aux responde). Considere que isso não testa Supabase, Mercado Livre ou Meta.
4. `429` em `registry-1.docker.io` na etapa de build é problema de registro de imagem, não de compilação. Antes de alterar builder, verificar a disponibilidade do registro e reproduzir em serviço isolado.
5. Os dois serviços de produção utilizam **Railpack**, sem configuração `Dockerfile Path`. A [PR #93](https://github.com/ofmrmatte/Inteligencia_ALC/pull/93) removeu os Dockerfiles e a etapa Docker do CI. Preserve o comando de build `npm run build:atendimento` no Atendimento e `npm run build` no Inteligência, além dos respectivos start/pre-deploy e healthchecks.
6. Depois de mudar builder, acompanhar build de ambos, inicialização, erros HTTP 5xx e último commit efetivo. Manter rollback disponível.

## Diagnosticar coleta Mercado Livre

1. Recarregue o Atendimento e confirme em **Ajustes → Conector & dados** a versão mínima exigida pela aplicação. O código analisado usa conector **1.2.7**.
2. Verifique `chrome://extensions`: extensão carregada, permissões, sessão em `envios.adminml.com` e aba autenticada do Atendimento. A extensão precisa estar atualizada separadamente do deploy.
3. Em **Visão Geral**, inicie **Coletar geral**. Ela nunca deve enfileirar mensagens. Pode navegar entre páginas/abas do Atendimento e voltar: a barra usa status persistido em `collector_run`.
4. Se a coleta falhar, verificar no HTTP log o último `POST /api/collector-lookup`, `POST /api/import` e `POST /api/collector-progress`. Erro `400` sinaliza validação; `409`, concorrência/identidade; `401/403`, sessão/permissão/origem; `5xx`, infraestrutura.
5. Campo complementar de comprador inválido deve ficar **sem verificação** e não apagar contato previamente validado. Casos-base inválidos devem contar como pendências, nunca ser anunciados como sincronização plena.
6. Coleta incremental classifica `full/status/skip`. PNRs com status igual não terão detalhes recapturados; não apague dados para forçar o fluxo.
7. Fechar o Chrome, desativar extensão ou perder sessão Mercado Livre interrompe a coleta real. Progresso persistido **não** transforma a extensão em job de servidor independente.
8. Ao reiniciar, novas leituras devem aproveitar registros já importados. Validar no relatório de sincronização as contagens de novas, atualizadas, inalteradas e com erro.

## Diagnosticar acesso e MFA

- Login e MFA acontecem no Inteligência; o Atendimento não tem cadastro/login independentes.
- Se uma sessão válida recebe erro no Atendimento: conferir permissões da função, módulo, `access_<profileId>`, ticket de 60 segundos e grant revogável `sso_session_<session_id>`.
- `auth.getClaims()` não detecta sessão revogada remotamente no Supabase antes do vencimento do JWT. Para investigação de revogação externa, revalidar com `auth.getUser()` no fluxo autorizado e inspecionar os grants de sessão do Aux. Consulte a [matriz Context7](referencias-context7.md). Não registrar tokens.
- Inspecionar apenas a presença/validade de configurações, sem revelar chaves. `ATENDIMENTO_SSO_KEY` e `ATENDIMENTO_ENCRYPTION_KEY` devem formar um par compatível.
- Se houver 403 em API do Inteligência depois de mudança de domínio: conferir `INTELIGENCIA_PUBLIC_URL` / `RAILWAY_PUBLIC_DOMAIN` e cabeçalho `Origin` HTTPS, não permitir domínios arbitrários.

## Diagnosticar WhatsApp e Ellie

- Verificar credenciais por canal, número/WABA/phoneId corretos, webhook e App Secret sem registrar o segredo.
- Conferir assinatura do webhook, outbox, tipo de mensagem, janela de 24h, contrato Meta aprovado e idempotência.
- Nunca reprocessar automaticamente um envio `uncertain` sem auditoria: pode duplicar mensagem.
- Ellie usa fallback determinístico quando a IA não responde, recusa ou é incompatível. A cota diária representa chamadas ao modelo, não quantidade máxima de conversas.
- Não ajustar prompts nem enviar mensagem real como estratégia de diagnóstico sem aprovação.

## Atualização de migrations / RH

- Atendimento: `npm run migrate --workspace=@alc/atendimento -- --apply` somente com destino confirmado e autorização.
- RH: migration específica `apps/inteligencia/db/railway/hr/001_hr_initial_schema.sql`; usar fluxo administrativo previsto e `HR_DATABASE_URL`, sem executar SQL RH em Aux/Core.
- Supabase migrations são distintas das migrations Railway; não trocar credenciais nem destinos por conveniência.
- Validar backup e plano de rollback antes de qualquer alteração de schema.

## Referências técnicas

- [Matriz validada com Context7](referencias-context7.md)
- [Inventário de APIs e contratos](api-contratos-alc.md)

## Publicação / rollback

1. Abra PR com descrição de escopo, testes e riscos.
2. Aguarde CI completa e revisão de arquivos e diff; nenhuma aprovação presumida porque lint é advisory.
3. Faça merge só se seguro. Observe autodeploys de **ambos** os serviços: arquivo compartilhado ou extensão pode causar deploy duplo.
4. Confirme saúde e SHA real, não apenas status da PR.
5. Em falha, identifique qual componente não migrou antes de considerar rollback; contratos SSO e conector/backend exigem compatibilidade.
6. Registre no histórico do incidente quais verificações foram reais/sintéticas, e deixe pendências externas explicitadas.

Referências oficiais: [Railway deployments](https://docs.railway.com/deployments), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side), [Next.js](https://nextjs.org/docs) e [PostgreSQL privileges](https://www.postgresql.org/docs/current/ddl-priv.html).
