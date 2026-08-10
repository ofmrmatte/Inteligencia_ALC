# Phase 2 final modules and admin

Branch: `feat/phase-2-final-modules-admin`

## Objetivo

Esta etapa completa a fundacao Next.js da Fase 2 com os modulos finais e a area administrativa, sem recriar o monolito legado e sem alterar schema Supabase.

## Modulos entregues

### Pacotes Faltantes

Rota: `/pacotes-faltantes`

Fonte oficial:

- `public.gestao_desvios_pacotes_faltantes`

Arquivos:

- `features/pacotes-faltantes/domain/index.ts`
- `features/pacotes-faltantes/data/queries.ts`
- `features/pacotes-faltantes/components/pacotes-faltantes-workspace.tsx`
- `features/pacotes-faltantes/components/missing-package-status-control.tsx`
- `app/api/pacotes-faltantes/status/route.ts`
- `app/api/exports/pacotes-faltantes/route.ts`

Comportamento:

- Consulta server-side com filtros, ordenacao, metricas e paginacao.
- Estado vazio honesto quando a tabela persistida nao possui registros.
- Exportacao XLSX do recorte filtrado.
- Atualizacao de status de caso/MELI somente para admin.
- Atualizacoes gravam `audit_logs`.

### Perfil

Rota: `/perfil`

Fonte oficial:

- `public.profiles`
- bucket `avatars`

Arquivos:

- `features/perfil/components/profile-workspace.tsx`
- `app/api/perfil/route.ts`
- `app/api/perfil/avatar/route.ts`

Comportamento:

- Usuario autenticado edita o proprio nome.
- E-mail, cargo, setor e permissao sao exibidos como contexto.
- Avatar aceita JPG, PNG e WebP ate 5 MB, com validacao de assinatura basica.
- Perfil nao altera `role` nem `is_admin`.

### Configuracoes

Rota: `/configuracoes`

Fonte oficial:

- `public.profiles`
- `public.dashboard_settings`
- `public.processed_dashboard_files`
- `public.audit_logs`

Arquivos:

- `features/configuracoes/data/queries.ts`
- `features/configuracoes/components/configuracoes-workspace.tsx`
- `features/configuracoes/components/admin-user-control.tsx`
- `features/configuracoes/components/pnr-goal-form.tsx`
- `app/api/configuracoes/users/route.ts`
- `app/api/configuracoes/settings/route.ts`

Comportamento:

- Acesso protegido no Server Component.
- Lista usuarios de `profiles`; nao usa `auth.admin` nem `service_role`.
- Admin pode editar nome, setor, cargo e permissao.
- Promocao admin sempre grava `role = admin` e `is_admin = true`.
- Remocao admin sempre grava `role = user` e `is_admin = false`.
- Meta PNR mensal/anual e gravada em `dashboard_settings` na chave `pnr_goal`.
- Historico de arquivos e auditoria sao leitura server-side.

## Desvios PNR

Novas capacidades:

- Exportacao XLSX do recorte filtrado via `app/api/exports/desvios-pnr/route.ts`.
- Importacao PNR server-side via `app/api/desvios-pnr/validate/route.ts`.
- Atualizacao manual de status via `app/api/desvios-pnr/status/route.ts`, chamando `public.update_desvios_pnr_status`.

Permissao:

- Consulta e exportacao: usuario autenticado.
- Importacao e status manual: admin.

Regra de identidade:

- O importador preserva cada `id_envio`/`id_reclamacao`.
- A chave nao consolida apenas por rota ou valor.
- Linhas de total/subtotal/soma sao ignoradas.
- Linhas sem identidade PNR valida sao ignoradas.

## Exportacoes XLSX

Rotas:

- `/api/exports/pre-fatura`
- `/api/exports/gestao-pacotes`
- `/api/exports/desvios-pnr`
- `/api/exports/pacotes-faltantes`

Implementacao:

- `lib/export/xlsx.ts`
- `exceljs` fica restrito ao servidor.
- Exportacoes respeitam filtros recebidos por query string.
- Limite defensivo: ate 100.000 linhas por exportacao.

## Autorizacao

Helper unico:

- `lib/permissions/is-admin-profile.ts`

Regra:

```ts
profile.is_admin === true && profile.role === "admin"
```

As rotas mutaveis usam:

- `lib/server/authz.ts`
- `requireAuthenticated`
- `requireAdmin`

## Auditoria

Helper:

- `lib/server/audit.ts`

Acoes auditadas nesta etapa:

- `update_missing_package_status`
- `update_pnr_status`
- `import_desvios_pnr`
- `update_own_profile`
- `update_own_avatar`
- `update_user_permissions`
- `update_goal_settings`

## Validacao

Checks locais executados durante a implementacao:

- `npm run lint`
- `npm run typecheck`
- `npm run test:rules`
- `npm run build`

O `test:rules` cobre agora Pre-Fatura, Gestao, Desvios PNR, Pacotes Faltantes e a regra de admin.

## Riscos conhecidos

- O importador PNR novo e server-side e adequado para planilhas grandes, mas continua sujeito aos limites de timeout do provedor em uploads extremos.
- A tabela `gestao_desvios_pacotes_faltantes` estava vazia no snapshot consultado durante a fase; a tela real funciona sobre a fonte persistida, mas a validacao visual com dados reais depende de importacao existente.
- As quatro divergencias historicas de metadados PNR permanecem sem correcao nesta fase por decisao de escopo.

## Fora de escopo

- Nenhuma migracao de schema Supabase.
- Nenhuma limpeza destrutiva de dados.
- Nenhuma alteracao em `vercel.json`.
- Nenhuma exposicao de `service_role`.
- Nenhuma migracao para Railway no runtime normal.
