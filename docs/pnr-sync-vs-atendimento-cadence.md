# Cadências independentes: Sync PNR e ALC Atendimento

## Inteligência ALC → Sync PNR
- A importação da lista de PNRs do Case Center é solicitada pelo botão **Trazer Dados para Inteligência ALC**. Não é governada pelo agendamento do Atendimento.
- A **sincronização de detalhes** executa lotes de até 50 PNRs, com concorrência máxima 2, persistindo em grupos de 10.
- Enquanto houver pendências e a página `/bandeja-pnr` estiver ativa no navegador autenticado, o próximo lote começa aproximadamente **2 segundos** depois do anterior (além da duração real da consulta/gravação). Não há espera fixa de 30 minutos entre lotes.
- Quando não houver PNRs elegíveis no momento, a verificação da fila usa recuo progressivo de 1, 2 e 5 minutos; não reenvia detalhes já concluídos sem estarem novamente elegíveis.
- Para revalidar a mesma PNR já concluída, a data de vencimento do registro é distinta da frequência dos lotes: em geral 1 hora para casos abertos e 6 horas para fechados; alterações importadas podem tornar a PNR novamente pendente.
- Em bloqueio 429 do Mercado Livre, aguarda 5 minutos e reduz concorrência; falhas permanentes, sessão expirada ou erros de persistência bloqueiam processamento até intervenção/retomada explícita.
- Os controles **Sincronizar todos**, **Pausar** e **Retomar** afetam apenas os detalhes do Inteligência ALC. Ao ocultar/sair da página, o worker de interface suspende e volta quando a página estiver ativa.
- Este processo não dispara mensagens WhatsApp nem altera a frequência de coleta do Atendimento.

## ALC Atendimento → Coleta Mercado Livre
- O único agendamento periódico de **30 minutos** pertence ao alarme `alc-atendimento-collect` da extensão de navegador.
- A coleta é independente da fila de detalhes do Inteligência ALC. É ativada/pausada em **Conector & dados**, exige navegador e sessão Mercado Livre disponíveis e não dispara WhatsApp por si só.
- Pausar Sync PNR não pausa a coleta do Atendimento; desativar a coleta do Atendimento não bloqueia o Sync PNR.

## Homologação
- Confirmar 2 lotes sucessivos do Inteligência ALC em menos de 30 minutos, acompanhando os campos **Pendentes** e **Processados nesta sessão**.
- Conferir a coleta do ALC Atendimento separadamente em sua aba de configurações. Não é necessário iniciar nenhuma conversa real.
