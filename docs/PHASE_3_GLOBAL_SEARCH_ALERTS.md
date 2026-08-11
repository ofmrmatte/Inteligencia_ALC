# Fase 3B - Busca Global e Central de Alertas Operacionais

## Objetivo

Adicionar capacidade nova ao Inteligência ALC sem reintroduzir legado: busca global real, Command Palette, deep links para módulos e alertas operacionais calculados a partir de estados persistidos.

## Arquitetura

- `features/global-search/`: domínio, consultas server-side e componente da Command Palette.
- `features/operational-alerts/`: domínio, consultas server-side e painel de alertas.
- `app/api/search/route.ts`: endpoint autenticado de busca.
- `app/api/alerts/route.ts`: endpoint autenticado de alertas.
- `components/layout/app-topbar.tsx`: integra busca, alertas, tema e menu de usuário.

Os componentes client cuidam apenas de interação, teclado, debounce, abertura de painel e navegação. As consultas e cálculos de dados ficam no servidor.

## Busca Global

A busca consulta dados reais dos módulos:

- Pré-Fatura: `pre_fatura_records`.
- Gestão de Pacotes: `gestao_pacotes_records`.
- Desvios PNR: `desvios_pnr_records`.
- Pacotes Faltantes: `gestao_desvios_pacotes_faltantes`.

Campos usados foram mapeados contra o schema real antes da implementação. A busca usa `q` como parâmetro de deep link porque esse filtro já é consumido pelos módulos migrados.

## Performance

- Mínimo de 2 caracteres.
- Entrada limitada a 80 caracteres.
- Debounce de 300ms.
- Abort de request anterior ao continuar digitando.
- Limite de 5 resultados por módulo.
- Prioridade para comparação exata/prefixo em campos de identidade.
- Busca textual usa prefixo, evitando varredura ampla `%texto%`.
- Nenhum dataset grande é carregado no browser.

## Command Palette

- Abre pela topbar ou `Ctrl+K` / `Cmd+K`.
- Usa dialog central no desktop e largura responsiva no mobile.
- Suporta `ArrowUp`, `ArrowDown`, `Enter`, `Escape` e ciclo básico de foco por `Tab`.
- Exibe loading local, empty state, erro local e resultados agrupados por módulo.
- Não usa biblioteca pesada.

## Alertas Operacionais

Alertas são derivados de estados existentes, sem tabela nova e sem persistência de lido/não lido:

- Desvios PNR com `status_normalizado = 'Aguardando Comprovante'`.
- Pacotes Faltantes com `situacao_prazo = 'Vencido'`.
- Pacotes Faltantes com `situacao_prazo = 'Próximo do vencimento'`.
- Pacotes Faltantes com `status_caso = 'Pendente'`.
- Arquivos em `dashboard_files.status != 'processed'` apenas para admin.

O badge representa condições operacionais atuais. Quando a condição deixa de existir, o alerta desaparece naturalmente.

## Permissões

- `/api/search` exige usuário autenticado.
- `/api/alerts` exige usuário autenticado.
- Alertas administrativos usam a regra única `isAdminProfile(profile)`.
- Não há uso de `service_role`.
- A busca respeita o cliente Supabase server-side com sessão do usuário e RLS.

## Segurança

- Entrada da busca é sanitizada e limitada.
- Não há SQL raw concatenado com input do usuário.
- Não há logging de termos pesquisados.
- APIs privadas retornam 401 sem sessão.
- Sem novas migrations, RLS ou alteração de dados.

## Testes

Cobertura adicionada:

- Normalização e limite da busca.
- Mínimo de caracteres.
- Classificação de busca por identidade/texto.
- Limite de resultados por módulo.
- Agrupamento de resultados.
- Deep link por `q`.
- Alertas por status PNR.
- Priorização crítica de pacotes vencidos.
- Situação resolvida sem alerta.
- Alerta administrativo condicionado a admin.
- Smoke anônimo para `/api/search` e `/api/alerts` retornando 401.
- E2E autenticado para abrir/fechar Command Palette e painel de alertas quando credenciais existirem.

## Known Issues

- PRs Dependabot #9 e #10 estão prontas para merge manual, mas o conector GitHub não teve permissão para mergear.
- PR Dependabot #11 permanece pendente porque envolve major tooling updates e CI vermelho.
- Pacotes Faltantes não possui registros persistidos no ambiente validado, então alertas desse módulo ficam naturalmente vazios até existirem dados.
