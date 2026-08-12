# Hardening antes da UI — 2026-08-12

Esta rodada fecha segurança, qualidade e performance de backend antes da próxima etapa visual.

## Aplicado

- RLS de Pacotes Faltantes: leitura para autenticados; escrita somente para administradores.
- Autorização administrativa movida para schema privado, fora da API pública do Supabase.
- RPC de status PNR convertida para `SECURITY INVOKER` e protegida por checagem administrativa interna.
- Funções PNR com `search_path` fixo.
- Funções internas de trigger sem permissão de execução direta por usuários da API.
- RLS otimizada para evitar avaliação de `auth.uid()` por linha e policies permissivas duplicadas.
- Índices adicionados para FKs operacionais sem cobertura; índice duplicado removido.
- Dashboard principal passa a usar agregação PostgreSQL em vez de transferir todos os registros de Pré-Fatura ao runtime Next.js.
- CI atualizado para Actions v7, auditoria de dependências, encoding e falha explícita quando E2E autenticado/auditoria de banco não têm configuração.
- E2E autenticado ampliado para limites de autorização de API e RLS.

## Não visual

Nenhuma alteração de UI faz parte desta rodada. Mudanças visuais ficam para a próxima etapa após o hardening ser integrado.
