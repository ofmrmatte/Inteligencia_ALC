# ALC Atendimento

Aplicação própria de atendimento operacional, separada do Inteligência ALC. Next.js, Supabase Auth/MFA, PostgreSQL no Railway e WhatsApp Cloud API. Sem dependência do Chatwoot.

## Executar

Na raiz: `npm ci`, `npm run dev:atendimento`, `npm run build:atendimento` e `npm run start:atendimento`. Aplique o schema dedicado com `npm run migrate --workspace=@alc/atendimento` antes de iniciar. O serviço executa web e processamento de eventos/fila no mesmo container; não exige outro worker pago.

## Funcionalidades

- Visão geral de PNRs na competência vigente e atendimentos humanos.
- Caixa por canal, busca, histórico, anexos recebidos, notas internas, assumir, concluir e retomar robô.
- PNRs com filtros, comprador, produtos, entrega, contato validado e histórico preservado.
- Consulta do motorista exige nome, base e vínculo de telefone/ID; ambiguidades vão para a equipe. Consultas anteriores são explícitas, incluindo casos encerrados.
- Tratativa determinística do cliente: recebimento, data, produto, confirmação no aplicativo; negativa, portaria/vizinhos e encaminhamento. O sistema registra o relato, sem afirmar que alterou o Mercado Livre.
- Disparos idempotentes por caso/canal/contato. Carga inicial não dispara histórico. Erro ambíguo de rede não é reenviado automaticamente.
- Administração interna para usuários já cadastrados, canais/credenciais, catálogo Meta, coleta, automações e auditoria. Credenciais editadas são cifradas; nenhum segredo é devolvido ao navegador.
- Acesso exclusivamente pelo Inteligência, com o mesmo Supabase Auth, perfis e MFA. O botão no menu lateral abre outra aba com transferência de sessão por ticket cifrado de uso único, válido por 60 segundos. Não há login ou cadastro próprios. A entrada exige um comprovante de passagem pelo painel vinculado à mesma sessão Supabase; ele não contém credenciais nem concede permissões. Abrir a URL diretamente encaminha ao Inteligência. Encerrar a conta permanece uma ação do painel central.

## Sessao central e aplicativo instalavel

O logout central e a troca de conta revogam os vinculos do Atendimento e tickets pendentes do usuario no Aux, antes de encerrar ou substituir a sessao Supabase. Cada requisicao verifica esse vinculo, alem de MFA, perfil e escopo. A aba aberta verifica o perfil a cada 5 segundos e ao recuperar foco; erros de verificacao removem o conteudo privado. Sessoes anteriores a esta correcao precisam entrar novamente pelo painel. Nao basta manter um JWT ainda nao expirado para continuar acessando.

O Atendimento possui manifest, icones 192/512 e metadados Apple para instalacao como aplicativo em navegadores compativeis. Continua online: nao foi adicionado service worker, cache offline de conversas, anexos ou dados privados. O menu recolhido usa o mesmo simbolo do Inteligencia; a marca expandida e os icones de instalacao usam os arquivos fornecidos.

## Dados e coleta

O Atendimento lê o Core para reutilizar casos existentes. Seus dados e fila ficam exclusivamente no schema `alc_atendimento` do Aux, sem alterar tabelas do painel ou RH. A extensão 1.2.0 coleta a competência vigente de 30 em 30 minutos, ordenada do mais recente. Necessita de navegador, aba autenticada do Mercado Livre e aba autenticada do Atendimento no computador de teste.

A extensão também lê campos explicitamente identificados como comprador em uma única página package-management já aberta. Exige que o envio corresponda à PNR e confirmação humana antes de salvar o telefone/documento/endereço. Esse adaptador é conservador e precisa ser validado no layout real com acesso restabelecido. Não inventa endpoint privado, nem usa documento/telefone de recebedor como comprador.

## Variáveis (somente nomes; configure no Railway)

`ATENDIMENTO_DATABASE_URL`, `CORE_DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ATENDIMENTO_ENCRYPTION_KEY` (32 bytes em hexadecimal), `ATENDIMENTO_PUBLIC_URL`, `INTELIGENCIA_PUBLIC_URL`, `HOSTNAME`, `PORT`.

Para cada prefixo `WHATSAPP_DRIVER` / `WHATSAPP_CLIENT`: `_NUMBER`, `_PHONE_ID`, `_WABA_ID`, `_TOKEN`, `_VERIFY_TOKEN`, `_APP_SECRET`. `_TOKEN`, `_VERIFY_TOKEN` e `_APP_SECRET` também podem ser substituídos com segurança na Administração. `META_GRAPH_VERSION` é opcional, padrão v24.0.

## Ativação externa

Configure `/webhooks/whatsapp/driver` e `/webhooks/whatsapp/client` na Meta com seus respectivos tokens de verificação e assine `messages`. App Secret é distinto do token de verificação. Sem App Secret o webhook POST responde 503 e a fila não envia. Disparos automáticos começam desativados e só podem ser ativados com os canais configurados. Confirme a entrega real dos eventos antes de ativar a operação.

Modelos iniciais: `cliente_loss` e `pnraberta`, consultados na Meta antes de enviar. O modelo de motorista menciona Aguardando comprovante; demais classificações podem ser notificadas por texto dentro da janela de 24h de um motorista validado, ou exigem outro modelo aprovado. Dados insuficientes geram registro de bloqueio, sem envio.

## Verificação

Contrato da caixa, marca, persistencia, rollback e limites da homologacao: [Atendimento operacional](../../docs/atendimento-operacional.md).

`npm run lint --workspace=@alc/atendimento`, `npm run typecheck`, `npm test`, `npm run build:atendimento` e `npm run build` (painel). Nenhum teste dispara WhatsApp para destinatários reais.
