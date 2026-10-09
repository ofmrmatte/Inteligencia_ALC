# Atendimento: entrega por fases

## Limites desta entrega

O plano aprovado em `writing-block.md` sera executado em sete PRs dependentes.
Esta branch entrega as fases 1 a 6, em PRs dependentes. Nao autoriza merge, deploy, migracao remota,
ativacao de automacoes ou mensagens reais. Core, Aux e RH continuam separados;
o Supabase central permanece responsavel por identidade, MFA e revogacao.

| Fase | Escopo | Estado |
| --- | --- | --- |
| 1 | Atendentes, bases, atribuicoes, permissao e autoria | Implementada; revisao remota pendente |
| 2 | Disparos individual/global, nome do dono da PNR, lotes e dedupe | Implementada; revisao remota pendente |
| 3 | Midia privada duravel, upload e visualizadores seguros | Implementada; revisao remota pendente |
| 4 | Evidencias paginadas com midia, pasta por PNR e ZIP opcional | Implementada; revisao remota pendente |
| 5 | IA opcional OpenAI/Gemini, fallback deterministico e modelos Meta | Implementada localmente; revisao e homologacao externas pendentes |
| 6 | Diferenciais de sync, enriquecimento versionado e indicadores/eventos | Implementada localmente; revisao e homologacao externas pendentes |
| 7 | MFA recente, titularidade de telefone, hardening e E2E controlado | Pendente; depende das anteriores |

Depois da fase 7, executar a correcao de logout central solicitada em 09/10:
Inteligencia desconectado nao pode manter acesso no Atendimento. Diagnosticar
cookies/vinculos/tickets, expiracao e troca de conta; provar revogacao nas APIs,
limpeza de conteudo da aba/PWA e reentrada exclusivamente pelo Inteligencia.
As capturas mostram a divergencia visual, nao comprovam isoladamente a
autorizacao do backend. Nao considerar o incidente corrigido sem essa prova.

Templates legados sem responsabilidade auditavel nao sao enviados pelo novo
worker. Historico permanece acessivel; registros pendentes exigem revisao.

## Fase 1

1. Funcionalidades: cadastro operacional de identidades existentes, funcoes
   explicitas, bases principais/substitutas, suspensao, disponibilidade,
   recebimento e contagem de conversas. Fila de PNRs sem dono, atribuicao manual,
   distribuicao automatica opt-in (principal, depois menor fila) e historico.
   Retomar robo preserva o dono da PNR. Gestores nao se tornam atendentes ao
   reabrir uma conversa. Transferencias cancelam respostas pendentes anteriores.
2. Arquivos: `apps/atendimento/lib/operator-directory.ts`, `assignment-engine.ts`,
   `inbox.ts`, `auth.ts`, `worker.ts`, `source.ts`, API generica, componentes de
   gestao/caixa/menu, paginas `gestao/*`, scripts de migracao, testes e workflow CI.
3. Banco: `002_operators_and_assignments.sql` adiciona `operators`,
   `operator_bases`, `case_assignments`, `assignment_history`, prioridade e
   autoria em mensagens/outbox. Sem cadastro automatico, redistribuicao historica
   ou autoria retroativa inventada. O runner passa a registrar `schema_migrations`.
4. APIs: GET/POST `operators`, `assignments` e `assignment-policy`; GET
   `operational-units`. Gestao exige privilegio central; funcoes locais nao
   elevam privilegios centrais. Caixa aceita filtros de base, sigla, prioridade,
   classificacao e espera, aplicados antes da paginacao. Etiqueta operacional e
   derivada do catalogo, separada das etiquetas manuais.
5. Testes: suite existente acrescida de cadastro explicito, escopo central,
   isolamento horizontal, tipo versus sigla, concorrencia, transferencias,
   autoria, migracoes/checksum e pool de quatro conexoes. PostgreSQL 17 local:
   Core e Aux em bancos diferentes, identidade simulada e nenhum envio Meta.
6. Seguranca: schemas Zod estritos, nenhuma senha nova, nenhuma credencial
   cliente, intersecao com escopo central, locks transacionais, versao otimista
   e auditoria atomica. Suspender recebimento nao apaga historico nem
   redistribui silenciosamente. Evidencia/midia reutilizam o controle da caixa.
7. GitHub: PR em draft; CI inclui dois bancos PostgreSQL descartaveis. Nao
   dispensar a revisao nem substituir a homologacao por testes unitarios.
8. Dependencias externas: confirmar conexoes efetivas do Core/Aux, comparar
   catalogo remoto com organograma e validar a sessao Supabase real. Variaveis
   necessarias, somente nomes: `CORE_DATABASE_URL`, `ATENDIMENTO_DATABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`. Nenhuma variavel remota foi alterada.
9. Pendencias: funcionalidades das fases 2-7, verificacao visual por imagem e
   homologacao real. Lint legado: `collector.tsx`, `privacy-consent.tsx`,
   `mfa-login-modal.tsx`, `mfa-security-panel.tsx` e `pnr-inbox-view.tsx` ja
   apresentam erros de `set-state-in-effect` na base desta branch.
10. Proxima fase: disparos com autorizacao individual/global e autoria do dono,
    sem reutilizar o nome generico configurado em `automation.operatorName`.

## Fase 2

1. Funcionalidades: disparo individual pelo dono autorizado; lote global por
   gestor com nome do dono de cada PNR, nunca do gestor. Selecao limitada a 100
   casos, resultado parcial explicito, nonce vinculado ao pedido e dedupe por
   PNR/canal, inclusive telefone alterado e chaves historicas. Nome e modelo
   ficam imutaveis no historico. Revogacao/transferencia/classificacao/contato
   sao relidos antes da chamada ao provedor. Entrega nao regride com webhooks.
2. Arquivos desta fase:
   `apps/atendimento/db/003_dispatch_ownership.sql`,
   `apps/atendimento/lib/dispatch-authorization.ts`,
   `apps/atendimento/lib/dispatch-batches.ts`,
   `apps/atendimento/lib/operator-directory.ts`,
   `apps/atendimento/lib/source.ts`, `apps/atendimento/lib/worker.ts`,
   `apps/atendimento/app/api/[resource]/route.ts`,
   `apps/atendimento/components/dispatches.tsx`,
   `apps/atendimento/tests/dispatch-api.test.ts`,
   `apps/atendimento/tests/dispatches.test.tsx`,
   `apps/atendimento/tests/source-regression.test.ts`,
   `apps/atendimento/tests/operator-postgres.test.ts` e este documento.
3. Banco: migracao aditiva 003, lotes e snapshots em outbox, indices por
   lote/caso/canal. Nenhum backfill de nome ou responsavel inventado. Mesma
   rotina de aplicacao explicitamente autorizada e rollback nao destrutivo.
4. APIs: POST `dispatch-batch`, schema estrito (batchId, channel, mode, caseIds).
   POST `dispatch` preservado como adaptador individual. GET `dispatch-preview`
   aplica escopo e dono antes de limitar. GET `outbox` inclui lote/autoria.
   POST `customer` exige gestor, schema estrito, escopo e transacao auditada
   sob o mesmo lock de caso usado no envio/importacao.
5. Testes: 316 Atendimento e 375 Inteligencia, total 691, incluindo 32 casos
   PostgreSQL local. Typecheck e build Atendimento/conector passaram. Lint
   dos arquivos alterados: zero erros, duas advertencias de imports legados.
   Lint global continua com os cinco erros legados descritos na fase 1.
   Navegador usa APIs sinteticas: selecao de lote e layouts estabilizados
   verificados em 320/391/768/1280 pixels CSS; tabela rola internamente.
6. Seguranca: sem nomes/IDs de autor aceitos do cliente. Bloqueios na ordem
   diretorio, caso, conversa; falha de identidade deixa a fila sem envio.
   Envios incertos nunca sao repetidos automaticamente. Troca de telefone
   nao cria outra chave inicial. Mensagem template e automatizada, nao uma
   fala pessoal do responsavel cujo nome preenche o contrato comercial.
7. GitHub: branch `codex/atendimento-dispatch-ownership`, base explicita
   `codex/atendimento-operational-management` (PR #77). PR draft dependente;
   nao fazer merge desta branch antes da dependencia aprovada.
8. Dependencias: nenhuma variavel nova. Credenciais/canais/templates reais
   e migracao remota nao utilizados. As chamadas Meta foram simuladas.
9. Pendencias: fases 3-7. A validacao textual completa do template pertence
   a fase 5; vinculo de autorizacao recente a sessao pertence a fase 7.
   A revalidacao atual verifica identidade/permissao, nao prova logout real.
   Sem homologacao de WhatsApp, catalogo remoto, SSO ou screenshot.
10. Proxima fase: anexos privados duraveis, validacao binaria, upload humano
    autorizado e players seguros, sem depender do disco efemero Railway.

## Fase 3

1. Funcionalidades: imagens/figurinhas com ampliacao, audio com duracao e
   velocidade, video nativo com erro de incompatibilidade, documentos e PDF
   em visualizador sandbox. Compositor com selecao, previa local, legenda,
   progresso e verificacao do upload. Envio e upload sao passos distintos.
2. Arquivos: migracao `004_private_media.sql`, `lib/media-service.ts`,
   `media-validation.ts`, `media-response.ts`, APIs `media/upload` e `media/[id]`,
   `media-composer.tsx`, `media-viewer.tsx`, caixa, inbox, Meta e worker,
   `scripts/media-retention.ts`, testes focados/PG e READMEs.
3. Banco: metadados privados de origem, canal, hash/tamanho, objeto, retencao,
   quarentena e autor. Vinculos message/outbox/media e PNR capturada na chegada
   da mensagem. Sem atribuir retrospectivamente uma PNR atual a anexos legados.
   Arquivos ficam no Storage privado, nunca no disco Railway.
4. APIs: POST `media/upload` binario, reserva autorizada antes do corpo e limite
   real de stream; GET `media/[id]` com bytes/ranges autenticados ou `status=true`;
   POST `media/[id]` pede nova verificacao de quarentena; acao `attachment` no
   POST `conversation` com mediaId, legenda e retry explicito somente para falha
   confirmada. GET `media?id=messageId` legado usa o mesmo acervo, sem bypass Meta.
5. Testes: 374 Atendimento + 375 Inteligencia, 749 no total, incluindo 44 casos
   PostgreSQL local. Typecheck do monorepo, builds dos dois apps/conector e audit
   de producao passaram (zero vulnerabilidades). Lint escopado: zero erros e
   tres advertencias legadas; lint global tem cinco erros legados. Navegador
   sintetico em 320/391/768/1280 CSS, sem overflow; imagem ampliada, audio de 1s
   e velocidade 1,5x verificados. Captura visual desta fase funcionou.
6. Seguranca: autorizacao atual da conversa e da PNR do anexo, hash antes do
   envio/download, objetos UUID imutaveis, bucket privado, sem URL assinada no
   cliente. Validacao de assinatura/extensao/MIME, pixels e Office legado;
   macros/cifrados/executaveis rejeitados. ClamAV inacessivel ou resposta
   desconhecida deixa quarentena. SSRF bloqueado por allowlist HTTPS e sem
   redirects. Limites por usuario e no maximo quatro uploads reservados.
7. GitHub: branch `codex/atendimento-private-media`, base
   `codex/atendimento-dispatch-ownership` (PR #78). Entrega draft dependente;
   sem merge ou deploy. A migracao remota permanece pendente de aprovacao.
8. Dependencias: Storage server-side do Supabase existente; adicionados
   file-type (detector binario com limites de arquivo compactado), sharp
   (decodificacao/dimensoes) e cfb (streams Office legado, sem macros).
   Variaveis novas: `ATENDIMENTO_MEDIA_BUCKET`, `ATENDIMENTO_CLAMAV_HOST`,
   `ATENDIMENTO_MEDIA_RETENTION_DAYS`. Nao provisionados bucket/scanner remoto.
9. Pendencias: fase 4 inclui esses anexos nos comprovantes. OpenAI/transcricao
   opcional nao ativados. Falhas de leitura inbound podem ser tentadas cinco
   vezes com intervalo de 5 min, nunca repetindo um envio WhatsApp incerto.
   Media upload sem confirmacao exige consultar status; nao sobrescreve objeto.
   Nao houve prova de Storage/ClamAV real, codecs MP4/PDF ou Meta/SSO remotos.
10. Proxima fase: evidencias multimidia sem omissoes, PNG paginado, manifesto
    e hashes na pasta por PNR, preservando exportacao ZIP opcional.

### Preparacao externa dos anexos (nao executada)

Reutilizar o projeto Supabase central e escolher um bucket exclusivamente
privado, sem politicas anon/authenticated de listagem, leitura ou gravacao
direta. Somente a API server-side usa a credencial privilegiada. Conferir
politicas efetivas antes de ativar; `public=false` nao substitui essa revisao.

ClamAV usa INSTREAM em TCP/3310, apenas em rede privada confiavel. Nao publicar
a porta; protocolo nao possui autenticacao/TLS. Exigir assinaturas atualizadas,
`StreamMaxLength`, `MaxFileSize` e `MaxScanSize` >= 25 MB e
`AlertExceedsMax=true`/alerta para arquivo cifrado. Nunca desligar quarentena
para contornar falta do scanner. Avaliar custo/infra e aprovar antes de instalar.

Limites locais: imagem JPEG/PNG 5 MB, audio/video 16 MB, WebP 500 KB e documento
25 MB (deliberadamente abaixo do limite maior do provedor). A Meta ainda pode
recusar codecs/containeres; o erro e visivel, sem declarar sucesso falso.
PDF e servido sandbox/nosniff; nao executamos macros ou scripts de documentos.

Retencao inicial 180 dias, ajustavel de 1 a 3650 para NOVOS arquivos. Excluir
objetos exige politica/backup aprovados e comando explicito. `legal_hold`
preserva evidencias; a proxima fase vincula essa protecao a pasta persistente.
Jobs pending/sending/uncertain nao sao purgados. O metadata/hash/auditoria
permanecem depois da remocao; anexos expirados sem hold nao sao servidos.

```sh
npm run media:retention --workspace=@alc/atendimento
# Somente depois de aprovar politica e confirmar o destino:
npm run media:retention --workspace=@alc/atendimento -- --apply
```

O primeiro comando simula, o segundo remove ate 100 objetos expirados por
execucao. Nao ha exclusao automatica e nenhum comando de retencao foi usado
em dados reais. Rollback mantem metadados, arquivos privados e auditoria;
nao voltar ao download direto da Meta sem a verificacao de seguranca.

## Fase 4

1. Funcionalidades: prints reais de 900 x 840, paginacao por altura medida,
   texto integral e Unicode preservados, autoria, horario do registro ALC e
   miniatura de imagem/figurinha. Audio, video e documento ficam referenciados
   com nome, MIME, tamanho e hash; nao ha transcricao ou thumbnail inventada.
   Pasta por PNR, originais privados, downloads individuais e ZIP opcional.
2. Arquivos: `evidence.ts`, `evidence-render.tsx`, `evidence-store.tsx`, APIs
   `evidence/*`, lista de comprovantes, CSS de anexos, tracing da fonte local,
   retencao de midia e testes de integridade, corrida, render e PostgreSQL.
3. Banco: `005_evidence_media.sql` associa originais a pastas com hash. A captura
   protege esses originais de expurgo. Sem backfill, migracao remota ou acao
   destrutiva de liberacao; a politica de retencao depende de aprovacao.
4. Seguranca: fontes revalidadas depois de ler Storage e renderizar, sob locks
   de diretorio/caso/conversa/mensagem/midia. Historico alterado, PNR misturada,
   original ausente, hash divergente e quarentena bloqueiam sem gravacao parcial.
   Listagem, bytes e ZIP cruzam escopo historico, PNR atual e dono atual.
5. Limites explicitos: 500 mensagens, 160 mil caracteres, 80 prints e 25 MB
   de originais/prints por captura. Exceder bloqueia, nunca corta o relato.
   Miniatura usa o primeiro frame; o original permanece intacto. Os prints sao
   derivados dos registros ALC, nao uma captura nativa do WhatsApp.
6. Prova local: 389 testes Atendimento e 375 Inteligencia passaram, incluindo
   51 cenarios PostgreSQL. Typecheck e builds dos dois apps/conector passaram.
   Lint global permanece nos cinco erros legados; nenhum foi ocultado. PNGs reais com
   dimensoes/hash/pixels e ausencia de chamadas externas foram verificados.
   Navegador com API sintetica: 320/391/768/1280 pixels CSS, imagens carregadas,
   sem overflow; capturas visuais em 320/1280. ZIP e concorrencia testados localmente.
7. Entrega: PR draft dependente da fase 3 (#79). Nao autoriza main, merge,
   deploy, bucket/scanner novo ou coleta de conversa real.
8. Homologacao pendente: Supabase Storage/AV reais, codecs PDF/video/audio,
   SSO/MFA e politicas externas. Proxima fase: propostas IA estruturadas,
   instrucoes versionadas e contrato textual aprovado da Meta.
9. Correcao adicional pedida nesta fase: baloes estilo WhatsApp com autoria
   preservada, datas por dia, hora curta e icones acessiveis apenas para envio
   confirmado. Notas internas e envio incerto continuam explicitos. Mídia nao
   e recortada; audio tem largura estavel. Chat sintetico revisado em
   320/391/768/1280 sem elementos fora do balao; imagem/audio reais da fixture
   carregaram. Barra de scroll do menu lateral oculta, overflow auto e acesso
   por teclado aos ultimos itens verificados. Outras barras nao foram ocultadas.
   Suite final Atendimento: 394 testes passaram; typecheck, lint do chat e
   build Atendimento/conector passaram depois dos ajustes visuais.

## Fase 5

1. Ellie e o nome oficial da agente virtual, conforme a atualizacao do usuario.
   Novos envios usam esse snapshot; autores historicos permanecem inalterados.
   O nome do atendente atribuido continua no parametro humano do template.
2. IA opcional OpenAI/Gemini, inicialmente desligada. As respostas do provedor
   selecionam apenas intencoes permitidas na etapa atual; o motor deterministico
   decide a transicao e o texto. Identidade, opt-out, transferencias e status
   oficiais nao podem ser modificados pelo modelo. Contexto minimo com redacao
   de identificadores conhecidos, limites de corpo/tokens e timeout de 8 segundos.
   Nao houve chamada a provedor nem credencial configurada.
3. Migracao aditiva `006_agent_decisions.sql`: snapshots imutaveis de instrucoes,
   configuracao e decisao; admissao de chamadas e quota diaria atomicas e duraveis.
   Falha ou rollback do inbound nao devolve uma tentativa ja admitida. Configuracao
   administrativa usa revisao otimista e permissao central vigente.
4. Contratos `cliente_loss_v2` e `pnraberta` devem ser comparados e revisados por
   gestor em Ajustes > Contratos Meta. Migracao `007_meta_contracts.sql` mantem
   revisoes e evidencia imutaveis. Texto, categoria, idioma, parametros, botoes,
   remetente, hash e revisao sao relidos antes da fila e antes do envio. Sem
   contrato revisado, envio bloqueado. Filas legadas nao recebem evidencia ficticia.
   Catalogo Meta real ainda nao inspecionado; nenhum contrato real foi aprovado.
5. Atualizacao do usuario substitui o suporte a audio da fase 3. Nao ha player,
   upload, arquivamento novo ou transcricao. Audio de cliente recebe somente o
   aviso fixo para enviar texto, inclusive sob atendimento humano/pending ou robo
   desligado. Opt-out, encerramento, troca de telefone e janela de 24h continuam
   bloqueando o aviso. Deduplicacao e politica explicita impedem bypass por chave.
   Historico existente nao foi apagado. Comprovantes registram a recusa explicita,
   sem alegar preservacao do conteudo nao armazenado; outras midias mantem os gates.
6. Chat com cabecalho compacto, baloes claros/verdes, hora e entrega confirmada,
   compositor inferior, notas internas e painel de detalhes progressivo. Sidebar
   continua rolavel sem barra visivel. Testes de componentes nao equivalem a uma
   nova homologacao visual; a ferramenta de navegador falhou nesta rodada.
7. Prova de integracao usa PostgreSQL 17 descartavel em loopback e mocks de
   Supabase/Meta, nunca dados ou mensagens reais. Quota/CAS/imutabilidade e aviso
   de audio sao executados tambem no CI com o banco de teste compartilhado, em
   arquivos serializados. Preparacao da fixture e atomica para evitar resets parciais.
8. Entrega: branch `codex/atendimento-agent-contracts`, PR draft dependente do
   PR #80. Sem merge, deploy, migracao remota, buckets, scanner ou automacao ativada.
   Fase 6 foi integrada na etapa seguinte descrita abaixo. Fase 7 e logout
   ainda precisam de integracao/revisao; commits de subagentes nao bastam.

Validacao final desta etapa: 46 arquivos e 635 testes passaram, sem skips,
incluindo 64 testes reais no PostgreSQL local descartavel. Build de producao
do Atendimento, incluindo TypeScript, passou. ESLint dos arquivos alterados:
zero erros e tres warnings existentes. `git diff --check` passou. Sem nova
captura visual, Meta real, IA real, migracao remota ou deploy nesta rodada.

## Fase 6

1. Fingerprints versionados distinguem novas, atualizadas, inalteradas, antigas,
   mudanca de classificacao, telefone verificado e base. Contadores por unidade
   preservam o escopo das consultas; lotes consecutivos consolidam os totais da
   coleta. Datas de origem mantem TIMESTAMPTZ e valores desconhecidos ficam null,
   nunca zero confirmado. Conflitos de contato com a mesma captura sao auditados.
2. Indicadores SQL respeitam competencia, base e dono, incluem subtotais BRL
   confirmados de abertas/penalidade/comprovante, quantidade sem valor, autoria,
   fila e distribuicao. Detalhes de fila nao sao reutilizados de cache apos
   transferencia. SSE autenticado envia somente invalidacoes e revalida acesso;
   polling com backoff e ultima sincronizacao concluida continuam disponiveis.
3. Migracao Aux `008_sync_enrichment.sql` e outbox duravel, claim exclusivo,
   ACK vinculado a tentativa/lease vigente, retries limitados e dead letter.
   Worker processa enriquecimento apenas com configuracao explicitamente valida.
4. Contrato HMAC v2 minimizado com hash, nonce, escopo explicito e recibo assinado.
   Core recebe apenas contato complementar verificado, nunca conversa/documento,
   status ou valor financeiro. A migracao Core aditiva
   `20261009090422_pnr_verified_contact_enrichment.sql` e obrigatoria antes do
   novo reader; nenhuma migracao remota foi aplicada. Drawer apresenta origem
   e captura sem substituir comprador/recebedor oficial. Listagem geral omite
   esse contato. Conflito/tempo igual diverge e bloqueia; dado antigo e superado.
5. Configuracao permanece desligada: `PNR_ENRICHMENT_HMAC_KEY`,
   `PNR_ENRICHMENT_CORE_URL` no Aux e `PNR_ENRICHMENT_ALLOWED_SCOPES` no Core
   exigem revisao e aprovacao antes de qualquer ativacao. Sem chamadas reais.
6. Prova: 697 testes Atendimento e 59 focados Core passaram, incluindo 70 testes
   PostgreSQL local (66 Aux/identidade simulada e 4 Core). Builds dos dois apps
   com TypeScript e lint alterado passaram. A prova Core inclui idempotencia,
   replay concorrente, contato antigo/conflitante e acesso privado negado.
   A fase 7 e o logout final ainda nao estao integrados nesta branch.

## Fase 7

1. Credenciais Meta passam somente pela API dedicada, com origem exata,
   corpo limitado durante a leitura e respostas privadas/no-store. O endpoint
   administrativo generico nao pode revelar ou alterar essas credenciais.
2. TOTP verificado e atual e exigido para a operacao exata, canal, usuario,
   sessao e payload. Desafios expiram, tentativas sao duraveis e limitadas;
   prova de uso unico, escrita e auditoria sao consumidas na mesma transacao.
   Substituicao conjunta de credenciais/webhook e atomica, sem salvamento parcial.
3. Tokens de acesso e App Secrets nunca sao revelados. Apenas o token de
   verificacao pode ser mostrado apos step-up; valores nao entram na auditoria.
4. Telefones usam a validacao compartilhada com o contrato de enriquecimento.
   Formato, associacao ao cadastro e confirmacao WhatsApp sao sinais distintos;
   numero formatado nao prova identidade nem autoriza disparo.
5. Prova local: 831 testes Atendimento passaram, incluindo PostgreSQL descartavel,
   typecheck, build Atendimento/conector e lint alterado (zero erros, um warning
   legado). Dialogo nativo revisado em 320/1280 com screenshots, sem overflow,
   foco TOTP e isolamento modal. APIs visuais eram sinteticas, sem segredo real.
6. Logout central e publicacao sao a etapa seguinte, nao prova automatica desta
   fase. MFA/Supabase e Meta reais ainda exigem homologacao com conta autorizada.

## Integracao final e publicacao

As sete fases, o logout central e os tres commits de correcao do timeout PNR
foram consolidados em `codex/atendimento-production-release` para uma unica
publicacao por servico. A revogacao central e verificada no servidor e por
SSE/polling; erros operacionais de MFA nao encerram uma sessao central valida.
O webhook autentica os bytes originais e limita a leitura antes de persistir.

Prova da integracao: 864 testes Atendimento e 451 testes Core passaram com
PostgreSQL local; os dois builds, typecheck e lint dos arquivos alterados
passaram. Os testes incluem revogacao, sincronizacao e o runner especifico
de enriquecimento. O runner exige `--apply`, conexoes Core/Aux distintas,
checksum, transacao e schema compativel. Nao cria roles Supabase no Railway;
RLS permanece ativa e PUBLIC/roles de clientes existentes nao recebem acesso.
Os testes de PostgreSQL Core sao seriais e aceitam o loopback local e do CI.

Comandos pre-deploy aprovados, para executar antes da troca de versao web:

```sh
node apps/inteligencia/scripts/migrate-pnr-enrichment-core.mjs --apply
npm run migrate --workspace=@alc/atendimento -- --apply
```

Em 09/10/2026, o usuario autorizou migracoes, merge e publicacao, mas pediu
explicitamente para pular novos backups e NAO publicar o antivirus de anexos.
Nenhum scanner, bucket ou volume de midia foi provisionado. Sem scanner,
arquivos novos continuam bloqueados/quarentenados; arquivos historicos nao
sao apagados. O RH permanece fora da operacao. Novos disparos, contratos Meta
e enriquecimento HMAC nao sao ativados pela publicacao.

SSO/MFA com conta real e envio/recebimento Meta ainda precisam de homologacao
operacional. Testes locais nao constituem essa prova. A publicacao depende dos
checks do PR e do resultado dos dois deployments; nao antecipar sucesso.

## Catalogo e organograma

SVC e XPT identificam tipos, nunca siglas de unidades. O atendimento nao cria
unidades a partir desses valores e nao deduz SVC apenas pela ausencia de XPT.
O Core e a fonte canonicamente consultada; unidades inativas ou ambiguas nao
recebem novas atribuicoes. A tela de bases mostra sigla, cidade/base, coordenador,
supervisores e vinculo XPT, sem alterar o catalogo.

A configuracao local consultada nao possui `CORE_DATABASE_URL` nem
`ATENDIMENTO_DATABASE_URL`. Portanto o catalogo efetivo remoto NAO foi comparado
com a imagem. A migracao historica do organograma nao prova o estado atual.
Antes de qualquer ajuste cadastral, registrar as divergencias confirmadas,
aliases e vigencia; nunca sobrescrever a historia a partir de uma imagem.

## Migracao e rollback

Confirmar conexao Aux, backup e aprovacao explicita antes de executar:

```sh
npm run migrate --workspace=@alc/atendimento -- --apply
```

O comando sem `--apply` se recusa a executar. Cada arquivo e aplicado em uma
transacao com lock e checksum. O schema legado 001 pode ser adotado pelo runner
sem excluir registros. Nao modificar um arquivo depois de registrado: criar
uma proxima migracao. A politica inicial e manual e nao habilita WhatsApp.

Aplicar a migracao aditiva antes de trocar a versao web. Para rollback, voltar
a versao anterior da aplicacao e manter as novas tabelas/colunas e auditoria;
nao executar DROP, excluir identidades nem fabricar donos para registros antigos.
Nao mudar o comando pre-deploy remoto sem aprovacao.

## Prova local e homologacao

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build:inteligencia
npm run build:atendimento
npm run extension:build
npm audit --omit=dev --audit-level=high
```

Os testes PostgreSQL somente executam com `ATENDIMENTO_TEST_DATABASE_URL` e
`ATENDIMENTO_TEST_CORE_URL`, em loopback, com nomes `alc_atendimento_test` e
`alc_core_test`. Nunca apontar esses nomes para producao. Sem essas variaveis,
a suite de integracao e explicitamente pulada. Node 25 local requer
`NODE_OPTIONS=--no-experimental-webstorage` para a suite jsdom do Inteligencia;
o CI usa Node 22. Isso nao altera auth nem armazenamento da aplicacao.

Revisao de interface usa componentes reais com API sintetica, sem SSO ou
WhatsApp; prova geometrica nao substitui captura visual nem teste end-to-end.
Foram executados: instalacao limpa, typecheck, 671 testes (296 Atendimento e
375 Inteligencia, incluindo 15 casos PostgreSQL reais), builds dos dois apps,
build do conector 1.2.3, auditoria de performance e auditoria de dependencias
de producao (zero vulnerabilidades). Lint dos arquivos alterados passou; lint
global continua com os cinco erros legados listados acima. Nao foram ocultados.
As tres telas de gestao foram verificadas em 320, 391, 768 e 1280 pixels CSS:
sem overflow da pagina ou sobreposicao do cabecalho. A captura por imagem
falhou por timeout da ferramenta; nao ha comprovacao visual por screenshot.
Homologar depois: gestor sem funcao nao recebe PNR, atendente de outra base nao
acessa conversa/anexo, dono unico sob concorrencia, transferencia com motivo,
pausa de recebimento, revogacao central e autoria humana/virtual distinta.
