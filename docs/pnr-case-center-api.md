# Mapeamento da API do Case Center PNR

Levantamento read-only realizado em 17/09/2026 nas abas autenticadas do Case Center. Nenhum cookie, token, cabecalho de autenticacao, dado pessoal ou conteudo de evidencia foi registrado.

## 1. Autenticacao observada

- A aplicacao e a API usam a mesma origem: `https://envios.adminml.com`.
- O frontend chama a API com a sessao ja autenticada do navegador e obtem o CSRF pelo runtime da pagina.
- Nao foi encontrada credencial de servico, OAuth ou API publica que permita reproduzir essa sessao em um backend Vercel.
- Cookies, CSRF e demais cabecalhos de sessao nao devem ser copiados para codigo, logs, banco ou variaveis de ambiente do Inteligencia ALC.

## 2. Listagem PNR

### Endpoint

```http
POST /logistics/case-center/api/feed/search-feed-cases-dec
Content-Type: application/json
```

Corpo produzido pelo bundle `feed-v3`:

```json
{
  "data": {
    "searchParams": "{...JSON serializado...}",
    "userType": "3PL",
    "application": "LOGISTICS_PNR"
  }
}
```

Para o recorte observado, o JSON interno de `searchParams` continha:

```json
{
  "date_from": "2026-08-01T00:00:00.000Z",
  "date_to": "2026-08-15T23:59:59.999Z",
  "order": "asc",
  "sort": "date_created",
  "carrier": "<id da transportadora da sessao>",
  "period": "202608Q1",
  "billingPeriod": {},
  "size": 30,
  "page": 1,
  "searchFieldOption": "SHIPMENT_ID"
}
```

O frontend remove parametros vazios antes da chamada. `carrier` e dinamico e vem do operador autenticado.

### Resposta

```ts
type SearchFeedResponse = {
  casesList: Array<{
    case_id: number;
    priority: string;
    cells: Array<{
      lines: Array<Array<{
        key: string;
        value: unknown;
      }>>;
    }>;
  }>;
  paging: {
    totalPages: number;
    totalElements: number;
  };
  metrics: unknown;
  feedVersion: string;
};
```

O Redux do frontend renomeia `casesList` para `cases`, `paging.totalPages` para `pageQuantity` e preserva `totalElements`.

### Campos confirmados

| Chave | Tipo observado | Destino sugerido |
| --- | --- | --- |
| envelope `case_id` / `case.id` | numero/string | ID do caso |
| `case.date_created` | string de data | `PnrRecord.caseDate` |
| `case.route_code` | string | novo `routeCode` |
| `case.route_id` | string | `PnrRecord.routeId` |
| `case.svc_name` | string | `originStation`, `baseKey` e `sigla` apos normalizacao |
| `case.driver_name` | string | novo `driverName`; nao substitui `driverId` |
| `case.shipment_id` | string | `PnrRecord.shipmentId` |
| `case.shipment_amount` | `{ amount: string, currency: string }` | `purchaseValue` e novo `currency` |
| `case.state` | `{ status, sub_status }` | campos brutos separados e status derivado |
| `case.reviewed_status` | string | novo `reviewedStatus` |
| `case.type` | string | novo `caseType` |
| `case.route_status` | string | novo `routeStatus` |
| envelope `priority` | string | novo `priority` |

Enums confirmados no retorno real:

- `case.type`: `PNR_CLAIM`
- `case.state.status`: `CLOSED`
- `case.state.sub_status`: `BILLED`, `NOT_BILLED`
- `case.reviewed_status`: `reviewed`, `not_reviewed`
- `case.route_status`: `FINISHED_ROUTE`
- `priority`: `MID`
- `case.shipment_amount.currency`: `BRL`

Correspondencia visual confirmada pela propria tela:

- `BILLED` -> `Enviado para faturamento`
- `NOT_BILLED` -> `Anulado` no caso inspecionado
- `reviewed` -> `Revisado`
- `not_reviewed` -> `Sem revisao`

`NOT_BILLED` nao deve ser generalizado para todo motivo de cancelamento sem preservar o valor bruto e sem validar outros casos.

### Paginacao

- A pagina e baseada em 1. O valor inicial do bundle e `pageSelected = 1`.
- Tamanho observado: 30 casos.
- Periodo observado: `202608Q1`.
- Total observado: 3.604 elementos e 121 paginas.
- A repeticao controlada da pagina 1 retornou os mesmos 30 IDs na mesma ordem, confirmando idempotencia para o mesmo estado de dados e ordenacao.
- `size = 50` e `size = 100` nao foram enviados. O ambiente de inspecao read-only nao permite criar um POST arbitrario na sessao sem contornar as protecoes do navegador ou extrair credenciais. Portanto, o maior tamanho comprovado nesta analise e 30; nao existe evidencia para declarar 50 ou 100 aceitos.

## 3. Detalhe e timeline

### Origem dos dados

```http
GET /logistics/case-center/cases/:caseId
```

Na recarga do detalhe, nao houve endpoint Fetch/XHR separado para a timeline. O servidor entrega o estado inicial no HTML, em:

```text
appProps.pageProps.preloadedStore.CaseDetail
```

Blocos relevantes:

- `caseDetail`: identificacao, status, periodo de faturamento, prioridade, referencias e cartoes PNR.
- `events`: timeline completa.
- `notes`: pedido de revisao, mensagem e metadados de arquivos.
- `pnrClaim`: `claimId` e mensagens carregadas sob demanda.
- `files`: estado do visualizador de anexos.

Contrato observado para a timeline:

```ts
type CaseEvent = {
  id: number;
  event_type: string;
  date_created: string;
  created_by?: {
    user_id: number;
    name: string;
  };
  note?: {
    id: number;
    message: string;
    date_created: string;
    last_updated: string;
    files: unknown[];
  };
};
```

Eventos confirmados no caso analisado:

- `CREATE_CASE_BY_CONSUMER`
- `UPDATE_STATUS_TO_BILL`
- `UPDATE_STATUS_TO_IN_PROGRESS_ON_REVIEW`
- `UPDATE_STATUS_TO_CLOSED_NOT_BILLED`

### Dados adicionais no SSR

Campos diretos de `caseDetail` incluem `id`, `dateCreated`, `status`, `type`, `priority`, `billingPeriod`, `preInvoiceNumber`, `claimId`, `origin`, `attribute` e `references`.

Tipos de referencia confirmados:

- `BUYER_USER_ID`
- `CARRIER_ID`
- `CLAIM_ID`
- `DRIVER_ID`
- `FACILITY_ID`
- `NODE_ID`
- `ROUTE_ID`
- `SHIPMENT_ID`
- `VEHICLE_ID`

Os cartoes PNR expõem:

- reclamacao: ID de envio, data, valor da compra, reclamante, designado para receber, ID de seguimento e mensagem;
- recebedor: data da entrega, quem recebeu, nome completo e documento;
- rota: rota, transportadora, motorista, ID do motorista e telefone;
- produto: `id`, `title` e `payment { amount, currency }`.

## 4. Endpoints auxiliares do detalhe

Base comum:

```text
/logistics/case-center/api/case-detail
```

Consultas read-only ou carregadas sob demanda, confirmadas no bundle:

| Metodo e caminho | Parametros | Funcao / resposta |
| --- | --- | --- |
| `GET /claim/messages` | `operatorId`, `claimId` | mensagens da reclamacao |
| `GET /files` | IDs de arquivos separados por virgula | conteudo de anexos para o visualizador |
| `POST /incident-file` | `fileName`, `incidentId` | evidencia binaria; nao executado |
| `GET /get-pod` | `shipmentId` | comprovante PDF; nao executado |
| `GET /get-shipment-checkpoints` | `shipmentId` | `{ characteristics, steps }` |
| `GET /get-delivery-order` | contexto da entrega | ordem/detalhes de entrega |
| `GET /get-carriers` | contexto da aplicacao | transportadoras disponiveis |
| `GET /get-drivers` | contexto da aplicacao | motoristas disponiveis |
| `GET /get-vehicles` | contexto da aplicacao | veiculos disponiveis |
| `GET /get-suggested-routes` | contexto da rota | rotas sugeridas |
| `GET /get-users-to-assign` | contexto do caso | usuarios para atribuicao |

O pedido de revisao ja aparece em `notes` e `events` no SSR. Nao foi observada uma consulta read-only exclusiva para esse cartao durante a recarga.

Endpoints mutaveis identificados e deliberadamente nao executados:

- `PUT /review-case`
- `PUT /aswer-request-review` (grafia usada pelo sistema)
- `PUT /close-case`
- `PUT /typify-case`
- `PUT /read-case`
- `POST /add-note`
- `PUT /edit-note`
- `DELETE /delete-note`
- demais endpoints de atribuicao, endereco, rota, contato e suporte.

## 5. Impacto no modelo do Inteligencia ALC

Campos atuais de `PnrRecord` que podem ser preenchidos:

- listagem: `caseDate`, `status`, `shipmentId`, `purchaseValue`, `originStation`, `baseKey`, `sigla` e `routeId`;
- detalhe: `billingPeriod`, `products`, `carrier` e `driverId`;
- `custom`, `billingType`, `cancellationType` e `classificationColumnsPresent` continuam regras internas do ALC, nao campos equivalentes diretos da listagem.

Campos novos com valor operacional:

- `caseId`
- `routeCode`
- `driverName`
- `currency`
- `mainStatus`
- `subStatus`
- `reviewedStatus`
- `caseType`
- `routeStatus`
- `priority`
- `claimId`
- `preInvoiceNumber`
- `events` ou uma tabela historica de eventos
- metadados de anexos/evidencias, sem armazenar o binario por padrao

O modelo deve manter os enums brutos. A traducao visual e o status consolidado devem ser derivados, evitando perder a diferenca entre status principal, fechamento e revisao.

## 6. Opcoes de arquitetura

| Opcao | Funciona com a autenticacao atual? | Avaliacao |
| --- | --- | --- |
| A. Backend Vercel direto | Nao, no estado atual | O backend nao recebe os cookies HttpOnly do dominio `adminml.com`. Copiar cookies/CSRF seria inseguro e fragil. So se torna viavel com API oficial ou credencial de servico suportada pelo Mercado Livre. |
| B. Bridge local Windows | Parcialmente | Funciona se vier acompanhado de um componente no navegador que execute a chamada na origem autenticada. Uma bridge isolada nao deve ler nem copiar cookies do perfil. |
| C. Automacao via navegador | Sim | Pode reutilizar a aba autenticada, mas e sensivel a mudancas de UI, sessao e versao do navegador. Adequada para prototipo controlado, nao como integracao silenciosa de servidor. |
| D. Extensao Chrome dedicada + API de ingestao ALC | Sim, recomendada | A extensao executa a consulta dentro de `envios.adminml.com`, usa a sessao sem expor cookies, valida e envia apenas o JSON necessario para um endpoint autenticado do ALC. |

### Recomendacao

Usar a opcao D para o botao **Trazer Dados para Inteligencia ALC**:

1. o painel solicita a operacao a uma extensao instalada e explicitamente autorizada;
2. a extensao localiza a aba autenticada do Case Center e faz as consultas paginadas na propria origem;
3. a extensao remove dados nao utilizados, valida o contrato e envia lotes limitados ao backend ALC;
4. o backend autentica o usuario ALC, aplica autorizacao, idempotencia por `caseId`/competencia e registra auditoria;
5. nenhum cookie, CSRF ou token do Mercado Livre sai do navegador.

A implementacao deve comecar somente apos validar `size = 50/100` no DevTools ou aceitar oficialmente 30 como tamanho de pagina, e apos definir quais dados pessoais do detalhe realmente precisam ser persistidos.
