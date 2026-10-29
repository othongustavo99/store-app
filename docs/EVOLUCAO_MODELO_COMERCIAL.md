# Evolução do modelo comercial

Objetivo: experiência confortável e confiável para compradores e lojistas de roupas do comércio local; demonstração replicável por marca.

Acordo de trabalho: entregas incrementais em ZIP, com arquivos completos, manifesto de adições/substituições/remoções, orientações no código e nos serviços externos. Ao solicitar uma nova etapa, o usuário considera a anterior aplicada.

Base inicial: https://github.com/othongustavo99/store-app, commit 747e7ed8a6f03f4f0714643d50fed223c829c2bb.

Etapa 01 entregue: correção dos testes Riverpod, limpeza dos apontamentos do analyze, RadioGroup no checkout, diagnóstico de banco e db:check somente leitura. Nenhuma mudança SQL; nenhuma remoção de arquivo. Instruções em LEIA_ETAPA_01.md.

Diagnóstico de ambiente desta sessão: .env local apontava para localhost:5432; TCP recusado em IPv4 e IPv6. Configurar banco/serviço correto é uma ação externa ao código.

Etapa 02 entregue, a partir do commit fca2116a46752e13bc2c46910f29e7b3618d914b: recuperação por IDs, nova tentativa após falha de rede, favoritos preservados, rateio/conferência da cobrança com cupom, retomada de preferências antigas e mensagens do pagamento local. Sem SQL novo. Backend deve ser publicado antes do APK. Instalação e limites em LEIA_ETAPA_02.md. Verificação: analyze limpo; 40 testes Flutter e 71 backend aprovados.

A conexão com o banco foi confirmada como resolvida pelo usuário antes da Etapa 02.

Próxima etapa prevista: polimento da vitrine e do produto — identidade consistente, navegação/filtros, apresentação das peças e ações de compra.

Pendências seguintes: vitrine/produto; checkout e entrega local; operação administrativa; provisionamento por lojista e demonstração comercial.

Cada etapa deve partir da versão cumulativa anterior. Se o repositório ainda não tiver recebido o ZIP anterior, preservar as alterações já entregues ao preparar o próximo pacote.
