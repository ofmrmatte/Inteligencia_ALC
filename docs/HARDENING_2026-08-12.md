# Hardening antes da UI — 2026-08-12

Esta rodada fecha segurança, integridade, qualidade e performance de backend antes da próxima etapa visual.

## Aplicado

- RLS de Pacotes Faltantes: leitura para autenticados; escrita somente para administradores.
- Autorização administrativa movida para schema privado, fora da API pública do Supabase.
- RPC de status PNR convertida para `SECURITY INVOKER` e protegida por checagem administrativa interna.
- Funções PNR com `search_path` fixo.
- Funções internas de trigger sem permissão de execução direta por usuários da API.
- RLS otimizada para evitar avaliação de `auth.uid()` por linha e policies permissivas duplicadas.
- Índices adicionados para FKs operacionais sem cobertura; índice duplicado removido.
- Pré-Fatura ganhou unicidade concorrente por ID de envio no banco.
- Importações de Pré-Fatura, Gestão de Pacotes e Desvios PNR usam commits transacionais PostgreSQL com trava por hash para evitar estado parcial e corrida de arquivo duplicado.
- Dashboard principal usa agregação PostgreSQL em vez de transferir todos os registros de Pré-Fatura ao runtime Next.js.
- Dependência transitiva `uuid` foi fixada na linha corrigida compatível com o ExcelJS; `npm audit --audit-level=moderate` passou a reportar zero vulnerabilidades.
- CI atualizado para Actions v7, auditoria de dependências, encoding e falha explícita quando E2E autenticado/auditoria de banco não têm configuração.
- E2E autenticado ampliado para limites de autorização de API e RLS.
- Auditor de código morto passou a considerar referências dos testes; wrappers e marcadores de migração sem consumidor foram removidos.
- Central de Alertas Operacionais foi restaurada na topbar após ter sido desconectada pelo refresh anterior.

## Validação do banco

- Security Advisor: sem alertas de RLS, `SECURITY DEFINER` exposto ou `search_path` inseguro.
- Performance Advisor: sem WARNs de RLS/FKs; permanecem apenas INFOs de índices sem uso observado, que não foram removidos sem telemetria representativa.
- Simulação com sessão `authenticated` comum confirmou bloqueio de escrita direta em Pacotes Faltantes e da RPC de status PNR.
- Simulação administrativa confirmou permissão de escrita; os testes foram executados dentro de transações com rollback.

## Controles de plataforma ainda externos ao código

Estes controles não possuem ação de escrita disponível nas integrações usadas nesta rodada e precisam ser configurados no painel da plataforma:

- GitHub: proteger a branch `main`/Ruleset, exigindo PR e `Quality Gate` antes de merge e bloqueando force-push/exclusão.
- GitHub Actions: manter configurados `SUPABASE_DB_URL`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, `E2E_ADMIN_EMAIL` e `E2E_ADMIN_PASSWORD`; o workflow agora falha explicitamente se faltarem em execução de `main`.
- Supabase Auth: habilitar Leaked Password Protection.

## Não visual

Nenhum redesign faz parte desta rodada. A única alteração visual indireta foi restaurar o botão de Alertas Operacionais que já fazia parte da funcionalidade existente. O redesign/refino da UI fica para a próxima etapa.
