# Escopo inicial do Comunicador ALC

Planejamento funcional para implementação posterior em `apps/comunicador`. Esta documentação não contém números, IDs de contas, tokens, segredos de webhook ou dados reais de clientes/motoristas.

## Acesso e Administração

O painel Inteligência terá um acesso ao Comunicador que abre em nova aba. A Administração pertence ao próprio Comunicador e permanece na mesma aba, configurando usuários, canais, integrações, modelos e automações conforme permissões.

## Canais e tratamento de PNR

Haverá um canal para motoristas e outro para clientes, com configurações e credenciais próprias da Meta. O contato inicial proativo usará modelos aprovados; os roteiros enviados pelo usuário são a referência para a tratativa, sem assumir aprovação do texto.

Para clientes, atender PNR com classificação aguardando comprovante ou com penalidade da competência vigente. Se o cliente confirmar recebimento, perguntar a data no formato dd/mm, confirmar o produto e orientar a confirmação no aplicativo do Mercado Livre. Se negar recebimento, perguntar se verificou com vizinhos ou portaria. Persistindo a negativa, agradecer, encerrar a tratativa e registrar o resultado para encaminhamento ao Mercado Livre. O robô não afirmará que uma ação externa foi concluída sem comprovação.

Para motoristas, identificar nome e base e verificar a identidade antes de retornar apenas as PNRs correspondentes. Homônimos e ambiguidades exigem confirmação. O motorista também receberá um aviso quando uma nova PNR for detectada. A primeira carga histórica e reimportações não devem gerar uma notificação repetida para cada caso já existente.

## Fonte de dados e atualização

Expandir a extensão atual de coleta do Mercado Livre. Case Center é a fonte das PNRs, classificações e dados disponíveis de cliente e motorista. Validar os campos efetivamente retornados pelo Case Center antes de ampliar o coletor para package-management, usado para detalhes adicionais do cliente.

A coleta automática ocorrerá a cada 30 minutos, somente para a competência vigente, começando pelos casos mais recentes. Nesta fase, o coletor depende do computador de testes do usuário e da sessão disponível; não opera 24 horas. O aviso será preparado após detectar, persistir e validar uma ocorrência nova, sem repetir o envio em cada consulta.

Competências anteriores entram na consulta solicitada pelo motorista. PNRs abertas desses períodos devem permanecer consultáveis; casos encerrados continuam armazenados para consulta de histórico. Exibir a data da última sincronização para distinguir informação recente de informação ainda não atualizada.

## Limites da primeira etapa

Esta reorganização não implementa agentes, telas, envios, webhooks ou migrations. A entrada do Comunicador na navegação do painel será feita quando existir um destino funcional. A aprovação dos modelos da Meta, os dados completos do cliente e os contratos entre coletor e Comunicador serão validados antes da implementação dos disparos.
