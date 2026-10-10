# Referências Context7 — validação cruzada da plataforma ALC

**Conferência:** 10/10/2026. **Tipo:** documentação de engenharia (sem migração, credencial ou alteração de ambiente). Esta revisão complementa a [arquitetura](arquitetura-plataforma-alc.md), a [auditoria de segurança](seguranca-plataforma-alc.md) e os [runbooks](runbooks-plataforma-alc.md).

O Context7 recupera trechos de documentação e exemplos dos mantenedores. **Não inspeciona o repositório da ALC, não executa testes, não valida configurações da Railway e não é um scanner de vulnerabilidades.** As correspondências abaixo foram verificadas separadamente no código do monorepo.

## Biblioteca, versão e origem

| Biblioteca consultada no Context7 | ID da documentação | Motivo da consulta | Evidência oficial |
| --- | --- | --- | --- |
| Next.js 16 | `/vercel/next.js/v16.2.9` | Proxy, requisições mutáveis e fronteiras de confiança em reverse proxy | [Proxy (Next 16.2.9)](https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/03-api-reference/03-file-conventions/proxy.mdx) e [Data Security](https://github.com/vercel/next.js/blob/v16.2.9/docs/01-app/02-guides/data-security.mdx) |
| Supabase Auth | `/supabase/supabase` | Validação de JWT, revogação e uso de chave administrativa | [Server-side advanced guide](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/server-side/advanced-guide.mdx) e [JWT signing keys](https://github.com/supabase/supabase/blob/master/apps/www/_blog/2025-07-14-jwt-signing-keys.mdx) |
| Railway | `/railwayapp/docs` | Dockerfile Path, Railpack e deploy de monorepo | [Dockerfile](https://github.com/railwayapp/docs/blob/main/content/docs/builds/dockerfiles.md), [Config-as-code](https://github.com/railwayapp/docs/blob/main/content/docs/config-as-code/reference.md) e [Monorepo](https://github.com/railwayapp/docs/blob/main/content/docs/deployments/monorepo.md) |

**Compatibilidade:** a documentação Next consultada é 16.2.9, enquanto o log de deploy observado anteriormente usou Next.js 16.4.0. As APIs descritas são da mesma versão principal, mas uma alteração de versão menor ainda deve ser validada na CI antes da publicação.

## Matriz de conformidade da implementação

| Controle / recomendação dos mantenedores | Inteligência ALC | Atendimento ALC | Situação |
| --- | --- | --- | --- |
| Aplicar política de `Origin` explícita para APIs que modificam estado | `apps/inteligencia/proxy.ts` | `apps/atendimento/proxy.ts`, `lib/request-origin.ts` | Implementado; manter testes de proxy e HTTPS |
| Não derivar origens **autorizadas** apenas de `X-Forwarded-Host` fornecido pelo cliente | `proxy.ts` contém allowlist de domínio público e variáveis de ambiente | Validação da origem pública no proxy e rotas sensíveis | Implementado no hardening PR #96 |
| `serverActions.allowedOrigins` para Server Actions por trás de proxy | Configuração somente se Server Actions forem introduzidas/afetadas | Mesmo princípio | **Não substitui** a autorização de `/api/**` |
| Verificar JWT no servidor com `auth.getClaims()` | `lib/auth-server.ts` | `lib/auth.ts` e `proxy.ts` | Implementado; `getSession()` isoladamente não é autorização |
| Detectar sessão encerrada remotamente no provedor usando `auth.getUser()` | Não é uma verificação obrigatória para cada leitura atualmente | Há grant revogável interno para logout/troca central | **Risco residual:** `getClaims()` não detecta revogação remota imediata; decidir política de revalidação |
| Restringir `service_role` ou chaves Supabase secret ao servidor e filtrar por usuário autorizado | `app/api/users/route.ts` e adaptadores administrativos | API administrativa e credenciais privadas | Exige revisão contínua; service role **ignora RLS** |
| Isolar Core, Aux e RH com usuários/permissões mínimas | Módulos de banco próprios | Pool Aux separado, Core somente para consultas necessárias | Segregação lógica no código; **GRANTs reais não auditados** |
| Configurar builder e Dockerfile Path explicitamente para cada serviço de monorepo | Dockerfile específico | Dockerfile específico | Publicado; PR #93 Railpack ainda **draft** |
| Testar healthcheck e SHA real depois de cada deploy | Serviço Railway `Inteligencia_ALC` | Serviço Railway `ALC-Atendimento` | Procedimento operacional; CI por si só não confirma produção |

## Notas de segurança de integração

### 1. Next.js Proxy não substitui autorização nas APIs

O Next 16 usa `proxy.ts` em vez de `middleware.ts`. A documentação mostra `Origin` e lista explícita de origens para CORS. CORS, por si só, **não protege APIs contra CSRF** nem autoriza usuários. O proxy da ALC rejeita métodos mutáveis com origem não confiável, e cada route handler precisa continuar exigindo autenticação, permissão e escopo no servidor.

A proteção nativa das **Server Actions** compara `Origin`/host e oferece `serverActions.allowedOrigins` para cenários específicos de reverse proxy. **Essa configuração não é um passe livre para chamadas `/api/**`.** A exceção `POST /api/internal/pnr-enrichment` do Inteligência exige validação criptográfica própria no endpoint; não criar outras exceções gerais.

### 2. Supabase: assinatura versus estado da sessão

- `auth.getSession()` lê a sessão e recupera tokens: útil para transferi-los de forma cifrada, **não** para definir permissão sozinho.
- `auth.getClaims()` valida assinatura/expiração do JWT e permite extrair `sub`/claims confiáveis, mas **não garante que a sessão ainda esteja ativa no Auth Server**.
- `auth.getUser()` consulta o servidor Auth e pode detectar sessão revogada remotamente. Pode ser apropriado em operações de risco elevado, mediante avaliação de latência, indisponibilidade e testes.
- O Atendimento adicionou grants `sso_session_<session_id>` para revogação **central**. Esse mecanismo ajuda a fechar a janela do logout efetuado pelo Inteligência; não implica invalidar automaticamente revogações externas feitas diretamente no Supabase.
- Um cliente com `SUPABASE_SERVICE_ROLE_KEY` **contorna políticas RLS** para operações privilegiadas. Toda rota que o usa precisa validar identidade e permissão antes de executar o acesso. Não passar essa chave em `NEXT_PUBLIC_*`, cookies, respostas ou logs.

**Decisão pendente:** especificar onde `getUser()` é obrigatório (por exemplo, gestão de usuários, remuneração/RH, downloads privados ou rotas críticas), critérios de cache/limite, testes com logout remoto e resposta fail-closed. Não habilitar indiscriminadamente uma chamada de rede em toda requisição sem dimensionar custo, latência e disponibilidade.

### 3. Railway: Railpack e Dockerfile não são intercambiáveis

Railway suporta `RAILWAY_DOCKERFILE_PATH`, a configuração **Dockerfile Path** e configuração por código do builder. A documentação oficial registra que a presença/seleção de Dockerfile tem precedência na construção. **Antes de integrar a PR #93** para Railpack, conferir em **cada** serviço qual builder está realmente configurado, eliminar apontamentos para Dockerfiles descontinuados e provar o build isoladamente. Não presumir que declarar `"builder": "RAILPACK"` basta quando permanece um Dockerfile/Path aplicável.

No monorepo, o contexto do build inclui a raiz com `package-lock.json`, `packages/**` e `extensions/pnr-connector/**`. Preservar os comandos corretos de cada processo e os filtros de deploy; após publicar, observar saúde dos dois serviços e os cinco componentes da Railway (dois apps, três bancos).

## Critérios de revalidação

1. Sempre que Next.js, `@supabase/ssr`, `@supabase/supabase-js` ou o builder Railway mudar, consultar novamente o Context7 e registrar versão/documento e diff.
2. Auditar `/api/**` autenticadas com testes de 401/403/CSRF, inclusive no domínio real e atrás do proxy.
3. Validar cenário de token assinado porém sessão revogada remotamente, sem confundir esse caso com o logout central já protegido por grant.
4. Garantir que nenhuma biblioteca/classe de exemplo do Context7 seja copiada para a aplicação sem compatibilidade com as dependências efetivamente instaladas.
5. A documentação não deve conter tokens, dados de PNR, telefones, CPF, exemplos operacionais reais nem URLs de objetos privados.

**Fora do escopo desta revisão documental:** pentest, DAST autenticado, consulta de privilégios SQL na produção, rotação de credenciais, mudanças em Supabase Auth, migrações e deploys manuais.
