# Evolução do modelo comercial

Objetivo: experiência confortável e confiável para compradores e lojistas de roupas do comércio local; demonstração replicável por marca.

Acordo de trabalho: entregas incrementais em ZIP, com arquivos completos, manifesto de adições/substituições/remoções, orientações no código e nos serviços externos. Ao solicitar uma nova etapa, o usuário considera a anterior aplicada.

Base inicial: https://github.com/othongustavo99/store-app, commit 747e7ed8a6f03f4f0714643d50fed223c829c2bb.

Etapa 01 entregue: correção dos testes Riverpod, limpeza dos apontamentos do analyze, RadioGroup no checkout, diagnóstico de banco e db:check somente leitura. Nenhuma mudança SQL; nenhuma remoção de arquivo. Instruções em LEIA_ETAPA_01.md.

Diagnóstico de ambiente desta sessão: .env local apontava para localhost:5432; TCP recusado em IPv4 e IPv6. Configurar banco/serviço correto é uma ação externa ao código.

Próxima etapa prevista: resolver recuperação de carrinho e favoritos fora dos primeiros 50 produtos, divergência de total com cupom no gateway e mensagens após confirmação manual. Testar os cenários antes de ampliar o polimento visual.

Pendências seguintes: vitrine/produto; checkout e entrega local; operação administrativa; provisionamento por lojista e demonstração comercial.

Cada etapa deve partir da versão cumulativa anterior. Se o repositório ainda não tiver recebido o ZIP anterior, preservar as alterações já entregues ao preparar o próximo pacote.
