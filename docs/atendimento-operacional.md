# Atendimento operacional

## Fronteiras preservadas

`apps/atendimento` continua sendo um processo Railway independente. `npm run build` / `npm start` pertencem ao Inteligencia; `npm run build:atendimento` / `npm run start:atendimento` pertencem ao Atendimento. A instalacao e o lockfile permanecem na raiz.

`packages/ui` possui consumidores reais nos dois aplicativos: Brand, componentes de indicadores/painel e tokens. O comportamento padrao continua sendo a marca do Inteligencia. O Atendimento usa os logos, icone, favicon SVG/ICO e Apple icon fornecidos em `ALC_Atendimento_Logos_Icones_Favicons.zip`; nao substitui os assets do painel. Os icones de comandos continuam sendo os mesmos componentes Lucide do pacote instalado, correspondente ao conjunto fornecido.

Core, RH, RLS, perfis e `packages/identity` nao foram alterados. O backend continua verificando a sessao, o comprovante de transferencia, MFA, perfil ativo e permissao independente do Atendimento em cada requisicao. A entrada direta encaminha ao fluxo central; nao existe login alternativo ou conta de demonstracao.

Tipografia igualada ao painel: Poppins global em 13px (pesos carregados 400/500/600), Montserrat nos titulos, titulo principal de 21px/700 e titulos de painel de 14px/650. As fontes sao carregadas por `next/font`, nao por CDN em tempo de execucao. A marca vetorizada fornecida permanece intacta.

## Caixa e persistencia

- `/` abre Conversas. Visao Geral agrega dados reais, sem limite silencioso de linhas nas contagens.
- A lista consulta no servidor busca, canal, status, responsavel, etiqueta, Todas/Minhas/Nao interagidas; paginas de 30 conversas. A busca trata caracteres de LIKE como texto e usa parametros.
- Detalhes verificam escopo antes de acessar mensagens, fila ou PNRs. Historico de mensagens tem paginas de 50 com cursor data/UUID. PNRs vinculadas exigem ID, telefone e unidade exatos; detalhe limitado a 20 PNRs e consulta completa pelo fluxo do motorista preservada.
- Assumir, atribuir, colocar pendente, resolver, reabrir, retomar robo, validar motorista, etiquetas, leitura e notas sao persistidos no Aux. Notas nao criam jobs WhatsApp. Respostas exigem o responsavel atual, modo humano e janela de 24h.
- Mudancas de estado/responsavel/identidade cancelam respostas de texto pendentes do robo e da equipe, nao modelos iniciais. Lock por conversa serializa a mudanca com o envio em andamento. A auditoria faz parte da mesma transacao das acoes.
- O provedor tem timeout. Uma resposta ausente/ambigua, erro de rede ou 5xx fica `uncertain`; nao se reenvia automaticamente. Rejeicao explicita 4xx fica `failed`. Mensagens brutas do provedor nao sao devolvidas pela API.
- Mensagens recebidas suportam anexos da integracao existente e download autenticado. Upload/envio de novos anexos pelo atendente nao faz parte do contrato existente e nao foi adicionado.
- No celular a navegacao e lista -> conversa -> detalhes. Menu e modais controlam foco; Escape fecha. No desktop o menu pode ser recolhido.

## Fluxos e coleta

Foram reutilizados os roteiros deterministas de cliente/motorista, classificacoes, aprovacao de modelos Meta, idempotencia, webhooks e carga historica sem disparos. A negativa de recebimento representa o encaminhamento ao Mercado Livre como pendente; nao afirma alteracao externa.

A extensao 1.2.0 ja coleta a competencia vigente a cada 30 minutos, mais recentes primeiro, e le os dados disponiveis do Case Center antes do complemento conservador em package-management. Nao foi alterada. A administracao mostra deteccao local/versionamento/aba ML, ultima coleta e agendamento armazenado. Uma aba presente nao prova sessao autenticada: a coleta verifica isso. O cadastro de agendamento nao prova que o computador esteja ligado. Conversas atualizam em 5s/8s; resumo da fonte em 30s.

## Migracao e rollback

O arquivo idempotente `apps/atendimento/db/001_atendimento.sql` adiciona etiquetas e indices e amplia a restricao de status para `pending`, exclusivamente em `alc_atendimento`. O pre-deploy existente aplica o arquivo no Aux. Nao apaga nem recria historico, mensagens, usuarios ou Core/RH. Nao houve execucao manual em banco remoto durante a implementacao.

Em rollback, mantenha a coluna/indices e a restricao ampliada: sao aditivos. Antes de usar uma versao antiga que desconheca `pending`, transfira esses atendimentos para `human` em operacao autorizada e auditada. Nao reduza a restricao com registros pendentes existentes.

## Referencia antiga e menus

O endereco do comunicador antigo foi informado, mas nao havia sessao autorizada disponivel para inspecao. Capturas historicas de PNR nao constituem prova dos seus menus. Nao afirmamos reproduzir menus que nao foram observados.

| Area essencial solicitada | Destino implementado |
| --- | --- |
| Caixas, atendentes, notas, status, detalhes | Conversas |
| Filas/pendencias e fonte | Visao Geral |
| Motoristas, PNRs e historico | Motoristas e PNRs |
| Contato inicial, resultados e falhas de envio | Clientes e envios + detalhe da conversa |
| Usuarios existentes/permissoes, canais, modelos, automacoes, auditoria | Administracao, nesta mesma aba |

Mapeamento exaustivo de outros menus depende de acesso ao comunicador antigo; nenhuma funcionalidade adicional desse sistema foi presumida ou declarada entregue.

## Evidencia e dependencias externas

Capturas locais de componentes reais, exclusivamente com dados sinteticos:

![Caixa desktop com marca e fontes fornecidas](atendimento/desktop-caixa.jpg)

![Navegacao progressiva mobile](atendimento/mobile-conversa.jpg)

Testes de fila, dominio, identidade e inbox usam mocks. A revisao visual usa componentes reais com dados sinteticos em fixture ignorada `.testagent/visual`, sem bypass dentro dos aplicativos, sem credenciais e sem envio real. Isso nao prova concorrencia PostgreSQL real nem um fluxo autenticado/MFA em producao.

O acesso inicial da CLI Railway pertence a outra conta, sem o projeto ALC listado. A publicacao deve seguir a integracao GitHub existente, sem duplicar deployments ou mudar servicos/credenciais. A rota publica `/health` inclui `RAILWAY_GIT_COMMIT_SHA` quando disponivel para confirmar a versao; status HTTP e SHA publicados devem ser verificados antes de declarar publicacao confirmada.

Homologacao externa pendente: abertura pelo Inteligencia com uma conta autorizada e MFA; revogacao em uma aba aberta; sessao/coleta ML real; autorizacao de package-management; entrega/leitura dos webhooks Meta e modelos aprovados. A validacao automatizada nao envia mensagens para contatos reais.
