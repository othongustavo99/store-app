# Evolução do modelo comercial

Objetivo: experiência confortável e confiável para compradores e lojistas de roupas do comércio local; demonstração replicável por marca.

Acordo de trabalho: entregas incrementais em ZIP, com arquivos completos, manifesto de adições/substituições/remoções, orientações no código e nos serviços externos. Ao solicitar uma nova etapa, o usuário considera a anterior aplicada.

Base inicial: https://github.com/othongustavo99/store-app, commit 747e7ed8a6f03f4f0714643d50fed223c829c2bb.

Etapa 01 entregue: correção dos testes Riverpod, limpeza dos apontamentos do analyze, RadioGroup no checkout, diagnóstico de banco e db:check somente leitura. Nenhuma mudança SQL; nenhuma remoção de arquivo. Instruções em LEIA_ETAPA_01.md.

Diagnóstico de ambiente desta sessão: .env local apontava para localhost:5432; TCP recusado em IPv4 e IPv6. Configurar banco/serviço correto é uma ação externa ao código.

Etapa 02 entregue, a partir do commit fca2116a46752e13bc2c46910f29e7b3618d914b: recuperação por IDs, nova tentativa após falha de rede, favoritos preservados, rateio/conferência da cobrança com cupom, retomada de preferências antigas e mensagens do pagamento local. Sem SQL novo. Backend deve ser publicado antes do APK. Instalação e limites em LEIA_ETAPA_02.md. Verificação: analyze limpo; 40 testes Flutter e 71 backend aprovados.

A conexão com o banco foi confirmada como resolvida pelo usuário antes da Etapa 02.

Etapa 03 entregue, a partir do commit 4fa14a4d2a0c876530d9136f5a0d3232b788e2d7: vitrine com identidade compartilhada, seções sem repetição, busca com opções reais e ordenação paginada, navegação por categoria/oferta integrada aos filtros, fotos por variante, barra fixa de compra e contraste do tema. Limite de quantidade alinhado ao servidor: 20 por combinação. Sem SQL ou dependências novas. Backend antes do aplicativo. Instalação, configuração de marca e verificações em LEIA_ETAPA_03.md.

Etapa 04 entregue, a partir do commit 8a599a8a4e68682e5b62837ac011906b5ec4cb29: revisão completa de contato/recebimento/pagamento, confirmação persistente na tela após registro, proteção contra respostas antigas de CEP/cotação/cupom, retirada com endereço/horário, entrega local por faixas de CEP e taxa fixa revalidada no servidor, saída/conclusão local sem rastreio artificial e histórico legível com nova tentativa. Inclui migration 017_local_fulfillment.sql. Ordem: migration, backend e aplicativo. Instruções em LEIA_ETAPA_04.md.

Próxima etapa prevista: operação administrativa — cadastro, estoque, pedidos e clareza das ações do lojista.

Pendências seguintes: operação administrativa; provisionamento por lojista e demonstração comercial; validação de integrações e revisão de dependências antes da operação comercial.

Cada etapa deve partir da versão cumulativa anterior. Se o repositório ainda não tiver recebido o ZIP anterior, preservar as alterações já entregues ao preparar o próximo pacote.
