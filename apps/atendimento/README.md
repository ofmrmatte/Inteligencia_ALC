# ALC Atendimento

Aplicação própria de atendimento operacional, separada do Inteligência ALC. Next.js, Supabase Auth/MFA, PostgreSQL no Railway e WhatsApp Cloud API. Sem dependência do Chatwoot.

## Executar

Na raiz: `npm ci`, `npm run dev:atendimento`, `npm run build:atendimento` e `npm run start:atendimento`. Depois de confirmar o destino e aprovar a migração, aplique o schema dedicado com `npm run migrate --workspace=@alc/atendimento -- --apply` antes de iniciar. O runner executa os arquivos numerados de `db/` em transações, registra seus checksums e recusa alterações em migrações já registradas. O serviço executa web e processamento de eventos/fila no mesmo container; não exige outro worker pago.

## Funcionalidades

- Visão geral de PNRs na competência vigente e atendimentos humanos.
- Gestão operacional separada do acesso central: funções explícitas, bases principais/substitutas, disponibilidade, recebimento, atribuição única por PNR e histórico de redistribuições. Consulte [a entrega por fases](../../docs/atendimento-evolucao-fases.md) antes de ativar esta evolução.
- Caixa por canal, busca, histórico, anexos recebidos, notas internas, assumir, concluir e retomar robô.
- Anexos privados duráveis, upload humano com progresso, imagens, vídeo, documentos e quarentena antimalware. Áudio não é suportado: o cliente recebe orientação para enviar texto, sem download ou transcrição do áudio. O histórico existente não é apagado. Hash e permissões são conferidos antes do download/envio. Consulte a fase 3 antes de configurar bucket e scanner; sem configuração não há liberação de arquivos.
- Comprovantes paginados em prints 900 x 840, com texto integral, miniaturas e referencias verificadas aos originais privados. Pasta por PNR e ZIP opcional; captura bloqueada se historico, escopo ou hash mudar. Consulte a fase 4 para limites e retencao dos originais associados.
- PNRs com filtros, comprador, produtos, entrega, contato validado e histórico preservado.
- Consulta do motorista exige nome, base e vínculo de telefone/ID; ambiguidades vão para a equipe. Consultas anteriores são explícitas, incluindo casos encerrados.
- Tratativa determinística do cliente: recebimento, data, produto, confirmação no aplicativo; negativa, portaria/vizinhos e encaminhamento. O sistema registra o relato, sem afirmar que alterou o Mercado Livre.
- Ellie é a agente virtual. IA OpenAI/Gemini é opcional e começa desativada; propõe somente intenções permitidas na etapa atual, com fallback para o roteiro determinístico. Instruções, decisões e autoria são auditáveis, sem renomear autores históricos ou substituir o responsável humano no template.
- Disparos idempotentes por caso/canal/contato. Carga inicial não dispara histórico. Erro ambíguo de rede não é reenviado automaticamente.
- Administração interna para usuários já cadastrados, canais/credenciais, catálogo Meta, coleta, automações e auditoria. Credenciais editadas são cifradas; nenhum segredo é devolvido ao navegador.
- Acesso exclusivamente pelo Inteligência, com o mesmo Supabase Auth, perfis e MFA. O botão no menu lateral abre outra aba com transferência de sessão por ticket cifrado de uso único, válido por 60 segundos. Não há login ou cadastro próprios. A entrada exige um comprovante de passagem pelo painel vinculado à mesma sessão Supabase; ele não contém credenciais nem concede permissões. Abrir a URL diretamente encaminha ao Inteligência. Encerrar a conta permanece uma ação do painel central.

## Sessao central e aplicativo instalavel

O logout central e a troca de conta revogam os vinculos do Atendimento e tickets pendentes do usuario no Aux, antes de encerrar ou substituir a sessao Supabase. Cada requisicao verifica esse vinculo, alem de MFA, perfil e escopo. A aba aberta verifica o perfil a cada 5 segundos e ao recuperar foco; erros de verificacao removem o conteudo privado. Sessoes anteriores a esta correcao precisam entrar novamente pelo painel. Nao basta manter um JWT ainda nao expirado para continuar acessando.

O Atendimento possui manifest, icones 192/512 e metadados Apple para instalacao como aplicativo em navegadores compativeis. Continua online: nao foi adicionado service worker, cache offline de conversas, anexos ou dados privados. O menu recolhido usa o mesmo simbolo do Inteligencia; a marca expandida e os icones de instalacao usam os arquivos fornecidos.

## Dados e coleta

O Atendimento lê o Core para reutilizar casos existentes. Seus dados e fila ficam exclusivamente no schema `alc_atendimento` do Aux, sem alterar tabelas do painel ou RH. A extensão **1.2.7** coleta a competência vigente, mais recentes primeiro; o agendamento opcional é de 30 minutos e depende de o navegador, a extensão e a sessão autenticada permanecerem disponíveis. A Visão Geral possui **Coletar geral** com barra de progresso persistida em `collector_run`, sem disparos. A coleta classifica PNRs novas, status alterado e inalteradas. Registros auxiliares inválidos são contabilizados sem bloquear as demais PNRs válidas, e uma sincronização com pendências não é marcada como concluída sem erros. Necessita de navegador, aba autenticada do Mercado Livre e aba autenticada do Atendimento no computador de teste.

O conector consulta páginas individuais do `package-management` usando a sessão já autenticada no Mercado Livre e valida a correspondência exata do envio. Nome/telefone de comprador podem ser considerados verificados **somente se** a resposta passar no contrato estrito do backend; valores inválidos não verificam contato. Dados do recebedor não são tratados como dados do comprador. Revisões reais exigem sessão autorizada e extensão atualizada.

## Variáveis (somente nomes; configure no Railway)

`ATENDIMENTO_DATABASE_URL`, `CORE_DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ATENDIMENTO_ENCRYPTION_KEY` (32 bytes em hexadecimal), `ATENDIMENTO_PUBLIC_URL`, `INTELIGENCIA_PUBLIC_URL`, `HOSTNAME`, `PORT`.

Para cada prefixo `WHATSAPP_DRIVER` / `WHATSAPP_CLIENT`: `_NUMBER`, `_PHONE_ID`, `_WABA_ID`, `_TOKEN`, `_VERIFY_TOKEN`, `_APP_SECRET`. `_TOKEN`, `_VERIFY_TOKEN` e `_APP_SECRET` também podem ser substituídos com segurança na Administração. `META_GRAPH_VERSION` é opcional, padrão v24.0.

Anexos: `ATENDIMENTO_MEDIA_BUCKET` (bucket privado no Supabase central, sem acesso direto por anon/authenticated), `ATENDIMENTO_CLAMAV_HOST` (scanner INSTREAM TCP/3310 apenas em rede privada), `ATENDIMENTO_MEDIA_RETENTION_DAYS` (180 por padrão, aplicável aos novos arquivos). Não são criados serviços, buckets ou permissões automaticamente. Scanner ausente deixa quarentena. `npm run media:retention --workspace=@alc/atendimento` simula; `-- --apply` exclui até 100 expirados sem legal hold ou envio pendente/incerto, somente após aprovação da política.

IA opcional, apenas server-side: `OPENAI_API_KEY`, `GEMINI_API_KEY` ou `GOOGLE_API_KEY`. Provedor, modelo, limite diário e timeout são salvos em Ajustes. Padrão desativado, limite inicial de 10 chamadas/dia e timeout máximo de 8 segundos. Não há retry pago nem ativação automática. Nenhuma credencial foi configurada nesta entrega local.

## Ativação externa

Configure `/webhooks/whatsapp/driver` e `/webhooks/whatsapp/client` na Meta com seus respectivos tokens de verificação e assine `messages`. App Secret é distinto do token de verificação. Sem App Secret o webhook POST responde 503 e a fila não envia. Disparos automáticos começam desativados e só podem ser ativados com os canais configurados. Confirme a entrega real dos eventos antes de ativar a operação.

Modelos iniciais: `cliente_loss_v2` e `pnraberta`. Após a migração 007, um gestor deve comparar e salvar explicitamente o contrato em Ajustes > Contratos Meta. Idioma, categoria, texto completo, botões, parâmetros, revisão e remetente são conferidos antes da fila e novamente antes do envio. Sem contrato revisado ou com divergência, o disparo é bloqueado; não há modelo alternativo automático. Filas legadas sem evidência de contrato não são reenviadas. Dados insuficientes geram registro de bloqueio, sem envio. O catálogo real da Meta e o logout central permanecem pendentes de homologação externa.

## Documentação atual

- [Arquitetura da plataforma](../../docs/arquitetura-plataforma-alc.md)
- [Contratos de APIs e autorização](../../docs/api-contratos-alc.md)
- [Referências de bibliotecas verificadas com Context7](../../docs/referencias-context7.md)
- [Controles e riscos de segurança](../../docs/seguranca-plataforma-alc.md)
- [Runbooks de coleta, Ellie, WhatsApp e Railway](../../docs/runbooks-plataforma-alc.md)

## Verificação

Contrato da caixa, marca, persistencia, rollback e limites da homologacao: [Atendimento operacional](../../docs/atendimento-operacional.md).

`npm run lint --workspace=@alc/atendimento`, `npm run typecheck`, `npm test`, `npm run build:atendimento` e `npm run build` (painel). Nenhum teste dispara WhatsApp para destinatários reais.
