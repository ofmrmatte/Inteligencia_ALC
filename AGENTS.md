<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Inteligência ALC — regras do projeto

Este repositório representa uma aplicação operacional real. Antes de editar, entenda o caminho dos dados e preserve as regras de negócio já existentes.

## Antes de implementar

- Leia o `README.md` e os arquivos próximos da área que será alterada.
- Para bugs, reproduza o comportamento antes de mudar código quando houver caminho local seguro.
- Identifique se a regra pertence à interface, API, serviço, processamento de arquivos ou persistência antes de escolher onde corrigir.
- Não trate um problema de dados como problema visual só porque aparece em um componente.

## Dados e segurança

- Nunca versione dados reais de motoristas, documentos, IDs operacionais, credenciais ou `.env.local`.
- `SUPABASE_SERVICE_ROLE_KEY` e qualquer credencial privilegiada devem permanecer server-side.
- Não enfraqueça RLS, validações ou filtros de escopo para fazer um fluxo funcionar.
- Importações devem continuar auditáveis: não somar duplicidades silenciosamente nem inferir chaves quando existe regra explícita.
- Macros VBA não são executadas; reproduza apenas regras tabulares conhecidas e verificáveis.

## Regras de domínio

- Preserve a semântica de mês e quinzena usada no pré-faturamento.
- Filtros sem mês não devem assumir um mês arbitrário.
- IDs repetidos devem passar pela conciliação prevista pelo domínio.
- Escopo por perfil, base, sigla, coordenador e supervisor não pode vazar dados entre usuários.
- Mudanças na integração com o Portal do Motorista precisam considerar os dois lados do contrato.

## UI

- Não aprove uma alteração visual olhando apenas JSX/CSS.
- Revise responsividade real quando a mudança afetar layout, tabela, filtros ou navegação.
- Preserve os padrões visuais existentes salvo solicitação explícita de redesign.

## Quality gates

Para alterações de aplicação, rode o subconjunto aplicável e informe exatamente o que foi executado:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run build` pode depender de configuração de ambiente. Se não puder ser executado com segurança, não invente resultado; reporte a limitação.

## Entrega

Uma tarefa não termina apenas porque o código foi escrito. Antes de encerrar:

- revise o diff;
- valide o comportamento alterado;
- verifique regressões próximas;
- rode os gates aplicáveis;
- registre qualquer limitação de ambiente ou teste não executado.
