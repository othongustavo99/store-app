# Etapa 04 — checkout, recebimento e acompanhamento

Base: https://github.com/othongustavo99/store-app, commit 8a599a8a4e68682e5b62837ac011906b5ec4cb29.
Pré-requisito: Etapas 01, 02 e 03 aplicadas. Os arquivos da Etapa 03 foram conferidos contra esta base.
As melhorias desta etapa atendem ao caminho Railway do aplicativo.

## 1. O que muda

### Compra em três etapas

1. Recebimento, contato e observação opcional para a loja.
2. Escolha de uma forma de pagamento compatível com o recebimento.
3. Revisão de nome, telefone, endereço/retirada, prazo, pagamento, itens e valores antes de confirmar.

O botão principal e o total estimado ficam acessíveis na parte inferior. Na revisão, o cliente pode voltar diretamente ao recebimento ou ao pagamento para corrigir os dados. Falha na consulta inicial permite tentar novamente.

Depois de registrar, a tela mostra o número do pedido e a próxima ação. Pagamento combinado continua pendente; simulação informa ausência de cobrança; pagamento online oferece “Abrir pagamento seguro”. Se o aplicativo externo não abrir, o pedido permanece registrado e a tentativa de abrir o pagamento não cria outra compra.

### Retirada e entrega local

- Endereço e horário de retirada cadastrados pelo lojista aparecem no checkout e são copiados para o pedido. O cliente é orientado a aguardar o aviso de que está pronto.
- Entrega local pode ser habilitada pelo proprietário ou gerente, com taxa fixa, prazo e até 30 faixas de CEP.
- A taxa pode ser zero. CEP fora da área não recebe cotação local. Não são necessários token de transportadora, peso ou dimensões para essa modalidade.
- O servidor calcula e salva a cotação, confere preço/quantidade dos produtos e revalida taxa, área, prazo e validade ao registrar o pedido. O aplicativo não escolhe o valor a cobrar.
- Entrega local aceita pagamento online quando já habilitado, Pix combinado e WhatsApp quando autorizados pela loja. “Pagar na retirada” aparece somente para retirada.
- Transporte por transportadora conserva a integração e as restrições anteriores. A equipe registra o rastreio real nessa modalidade; entrega local usa as ações do próprio pedido.

### Correções de confiabilidade

- Cotação fica vinculada ao CEP, carrinho e modalidade usados na solicitação. Resposta antiga não é associada a um CEP novo.
- Validade usa o horário de expiração retornado pelo servidor. Alterações no carrinho ou vencimento exigem nova consulta antes do registro.
- Cupom removido/editado durante uma consulta não reaparece com uma resposta atrasada. Mudanças no carrinho exigem nova validação.
- Após falha de conexão ao registrar, repetir sem alterar os dados reutiliza a mesma chave de checkout. Confira Meus pedidos se houver dúvida sobre a resposta; não altere os dados para repetir a mesma compra.
- Carrinho é preservado quando o registro falha. Após resposta confirmada, ele é limpo somente se ainda corresponde aos itens enviados.

### Acompanhamento

- Estados distintos para retirada pronta, saída para entrega local e postagem por transportadora.
- Pedidos mostram data, endereço/orientações, observação e cor/tamanho das peças.
- Histórico tem datas legíveis, nova tentativa após falha e atualização manual. A consulta não é reiniciada a cada reconstrução do diálogo.
- A lista de pedidos é atualizada ao retornar ao aplicativo, além dos eventos do servidor e atualização manual.
- O histórico representa fatos registrados pelo sistema/loja. Não há GPS do entregador nem rastreio automático de transportadora.

## 2. Aplicar o ZIP

1. Faça backup do projeto atual e do banco que receberá a migration, pelo seu fluxo habitual.
2. Extraia o ZIP em uma pasta temporária.
3. Copie seu CONTEÚDO para `C:\Users\othon\Documents\store\loja_roupas`, onde está `pubspec.yaml`.
4. Mescle as pastas e substitua os arquivos dos mesmos caminhos. O pacote é incremental; preserve os arquivos que não aparecem nele.
5. Confira `MANIFESTO_ETAPA_04.json`, com operações e hashes SHA-256.

Nenhum arquivo precisa ser removido. O pacote não contém `.env`, credenciais, dependências instaladas ou builds. Não há mudança de dependências.

**Esta etapa adiciona `backend/migrations/017_local_fulfillment.sql`. Não altere os SQL 001–016 que já foram aplicados.**

Ordem de atualização: **banco → backend → aplicativo**.

## 3. Backend e migration

Compile e valide primeiro:

~~~powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas\backend'
npm ci
npm run build
npm test
npm run db:check
~~~

Com a base anterior instalada, o diagnóstico deve mostrar 16 migrations aplicadas, a 017 pendente e nenhuma divergência. Se o histórico tiver outra pendência ou checksum divergente, confira a versão dos arquivos antes de executar migrations. Não edite checksums ou o histórico para contornar a divergência.

Use a conexão que você já configurou. Antes do próximo comando, confirme que `DATABASE_URL` aponta para o banco da loja/ambiente que você pretende atualizar, sem divulgar seu conteúdo. Para executar pelo Windows contra Railway, preserve a conexão pública que resolveu nas etapas anteriores.

~~~powershell
npm run db:migrate:prod
npm run db:check
~~~

Esperado: 017 aplicada, 17 migrations aplicadas, nenhuma pendente ou divergente. A migration cria a tabela de configurações de recebimento e identifica o provedor das cotações. Entrega local começa desativada para todas as lojas. As cotações existentes permanecem classificadas como transportadora.

Os comandos de testes não aplicam essa migration. Não execute `db:migrate:prod` apontando para um banco diferente daquele que o servidor usa.

Envie ao repositório/ramo do deploy todos os arquivos backend do pacote, incluindo a migration. Publique o backend após atualizar o banco. Preserve as variáveis e credenciais atuais; não é necessário habilitar pagamento real para usar entrega local com pagamento combinado.

Confira o deploy com seus valores reais:

~~~powershell
$apiDaLoja = 'https://SUA-API.up.railway.app'
$slugDaLoja = 'SEU-SLUG'
Invoke-RestMethod -Uri "$apiDaLoja/health/ready"
Invoke-RestMethod -Uri "$apiDaLoja/v1/shops/$slugDaLoja/shipping/availability"
~~~

Preencha os exemplos antes de executar. A disponibilidade passa a incluir `pickupAddress`, `pickupHours`, `localDelivery`, `localFeeCents` e `localEstimate`. `delivery` continua se referindo à transportadora; `localDelivery` identifica a modalidade local.

Erro de tabela/coluna inexistente indica que a migration ainda não foi aplicada no banco usado pelo servidor. Aplicar o SQL localmente em outro banco não atualiza a Railway.

## 4. Aplicativo

~~~powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas'
flutter pub get
flutter analyze
flutter test --dart-define=LOJA_BACKEND=railway
~~~

Gere o APK com os mesmos parâmetros de API e loja usados atualmente. Exemplo a preencher:

~~~powershell
flutter build apk --release --dart-define=LOJA_BACKEND=railway --dart-define=LOJA_API_BASE_URL=https://SUA-API.up.railway.app --dart-define=LOJA_STORE_SLUG=SEU-SLUG
~~~

Preserve outros parâmetros que você já utiliza. Nenhum parâmetro novo de build é obrigatório nesta etapa. Distribua o aplicativo depois de confirmar migration e backend.

## 5. Configurar retirada e entrega local no painel

Entre como proprietário ou gerente e abra **Frete e embalagens** no administrador. A nova seção é **Retirada e entrega local**.

1. Informe o endereço completo de retirada, incluindo número e referência útil.
2. Cadastre os horários reais e as orientações para buscar o pedido.
3. Se oferecer entrega própria, ative **Oferecer entrega local**.
4. Informe a taxa fixa em reais, com até duas casas decimais: por exemplo, `7,00`. `0,00` significa entrega gratuita na área cadastrada.
5. Cadastre prazo e condições reais, como “Até dois dias úteis após confirmação do pagamento”. O aplicativo não calcula deslocamento ou capacidade da equipe.
6. Informe uma faixa de CEP por linha, no formato `01000000-01000999`. Esses números são apenas um exemplo de formato: substitua pelas faixas realmente atendidas pela sua loja. Use oito números em cada CEP, preservando os zeros iniciais.
7. Salve. Reabra a tela para conferir que a configuração foi mantida.

O intervalo inclui os CEPs inicial e final. Não há área por bairro, raio no mapa ou taxa diferente por bairro nesta etapa. Se sua área for descontínua, cadastre várias faixas; não amplie o intervalo para incluir regiões que a equipe não atende. Limite atual: 30 faixas e taxa de até R$ 1.000,00.

Se entrega local estiver desativada, a retirada continua disponível. Salvar essas configurações não habilita automaticamente nenhuma forma de pagamento.

Para aceitar Pix combinado ou WhatsApp, habilite os métodos correspondentes nas configurações da loja que você já utiliza. O app não gera uma chave Pix nova nem confirma recebimento por comprovante: o responsável deve conferir os dados e o dinheiro recebido antes da confirmação manual.

Uma loja marcada como demonstração continua usando somente retirada e pagamentos simulados. Para conferir entrega local, use uma loja de homologação com pagamento combinado habilitado, sem precisar ativar o gateway real. Pedidos com pagamento combinado reservam estoque e ficam pendentes; a simulação não foi ampliada para entrega local.

## 6. Operar os pedidos

### Retirada

O cliente registra o pedido e consulta Meus pedidos. Depois da confirmação efetiva do pagamento, a equipe inicia a preparação, marca pronto para retirada e conclui quando a retirada ocorrer.

A regra atual continua exigindo pagamento confirmado para avançar a preparação no sistema, inclusive no método “Pagar na retirada”. Se o pagamento ocorrer no balcão, confirme somente depois de recebê-lo; não marque como pago para antecipar a preparação. A separação operacional de preparo antes do pagamento fica para a revisão administrativa da próxima etapa.

### Entrega local

Após o pagamento confirmado: **Iniciar preparação → Saiu para entrega local → Concluir pedido**. Use essas ações quando os fatos ocorrerem. O sistema registra os eventos no histórico e não solicita um rastreio de transportadora.

Confira o endereço, complemento, bairro, telefone e observação no pedido antes de organizar a entrega. Prazo e taxa ficam associados ao pedido; uma nova configuração vale para novas compras. Uma cotação ainda não usada será revalidada e poderá precisar ser refeita se a configuração mudar.

### Transportadora

O fluxo de expedição anterior permanece: dimensões e integração próprias, cotação válida fora do sandbox para cobrança, registro de postagem com código real e confirmação da entrega pela expedição. Não use código fictício para representar entrega local.

Solicitações de cancelamento/devolução em análise continuam impedindo avanço operacional. As regras de reserva de estoque, cupom, confirmação financeira e reembolso das etapas anteriores são preservadas.

## 7. Conferência manual após instalar

- Confira endereço e horário no checkout de retirada e depois no pedido registrado.
- Configure uma faixa de homologação e teste CEP dentro, na borda e fora dela.
- Confira uma taxa positiva e taxa zero; compare resumo e total registrado pelo servidor.
- Troque o CEP durante uma consulta. A resposta anterior não deve permitir concluir para o novo CEP.
- Altere a quantidade no carrinho ou aguarde a cotação vencer: o registro deve exigir nova consulta.
- Na revisão, confira nome, telefone, endereço, observação, pagamento, cor/tamanho, quantidade e valores.
- Registre um pedido com pagamento combinado: ele deve continuar pendente até a conferência do responsável.
- Confira a confirmação e Meus pedidos; voltar do pagamento externo deve atualizar a lista.
- Depois de confirmar recebimento na loja de homologação, avance uma entrega local e confira cada atualização no cliente.
- Verifique no celular com texto ampliado e no tamanho de tela usado para sua demonstração.

## 8. Validação e limites desta entrega

Resultado local: **Flutter analyze sem apontamentos, 74 testes Flutter e 96 testes backend aprovados.**

Os testes automatizados desta etapa usam banco, gateway e consulta de CEP simulados. As prévias são capturas de widgets com dados fictícios, sem compras ou cobrança real. A instalação em aparelho físico, a aplicação da migration no seu banco e o deploy não foram executados nesta entrega.

As verificações incluem checkout completo, repetição após falha de conexão, CEP/cupom com respostas atrasadas, mudança de carrinho, taxa zero, CEP fora da área, revalidação do servidor, permissões de gestão, estados de entrega e histórico com nova tentativa. Há cenários em 320 pixels com texto ampliado e painel em 1200 pixels.

Consulte o manifesto para os resultados finais dos testes e a relação exata de arquivos.

## 9. Reversão e próxima etapa

Para desativar a novidade, desligue entrega local no painel. Para reverter código, use o backup anterior dos arquivos SUBSTITUIR. Preserve a migration 017 e seu arquivo depois de aplicada; não apague a tabela ou o histórico para reverter o aplicativo. O schema adicionado pode permanecer no banco. Pedidos locais já criados precisam continuar sendo atendidos e acompanhados.

Próxima etapa: operação administrativa — cadastro, estoque, pedidos e clareza das ações do lojista. Depois, preparação repetível do modelo por marca e validação da demonstração comercial.
