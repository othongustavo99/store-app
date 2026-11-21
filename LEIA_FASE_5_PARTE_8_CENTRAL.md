# Frequência40 Store App — Fase 5.8: Central de Integrações (Flutter)

## Objetivo

Adicionar ao painel administrativo do Store App (modo Railway) uma tela para o **proprietário** visualizar e gerenciar a camada de integração de ERPs/PDVs implementada nas Fases 1–5.7.

Este patch altera **somente Flutter**. Não muda backend, endpoints, permissões do servidor, tabelas, payments, checkout ou os conectores existentes. **Não cria migrations e não exige novas variáveis de ambiente.**

## Conteúdo do patch

Arquivos novos:

- `lib/data/repositories/railway_integrations_repository.dart` — acesso às rotas administrativas existentes; não usa token do ERP no cliente.
- `lib/features/admin/integrations/railway_integrations_screen.dart` — interface administrativa, criação de credencial, leitura da fila, revogação e recuperação assistida.
- `test/phase58_integrations_screen_test.dart` — cenários de interface com repositório falso; sem rede real.
- `docs/INTEGRACOES_FASE_5_PARTE_8.md` — documentação técnica e limitações.

Arquivos a substituir:

- `lib/router/app_router.dart` — nova rota `/admin/integrations` no modo Railway.
- `lib/features/admin/remote_admin_home.dart` — botão `Central de Integrações ERP/PDV`, exibido apenas ao proprietário.

## Como aplicar

1. Faça backup do código e um commit da Fase 5.7.
2. Extraia o conteúdo do ZIP na **raiz** do projeto `loja_roupas`, preservando a estrutura das pastas.
3. Os caminhos acima são completos. Não copie a pasta inteira por cima sem inspecionar mudanças locais feitas após o ZIP de base.
4. No PowerShell do VS Code, a partir da raiz do projeto, rode:

```powershell
flutter pub get
flutter analyze
flutter test test/phase58_integrations_screen_test.dart
flutter test
```

5. Para testar as APIs existentes, na pasta `backend`:

```powershell
cd backend
npm ci
npm run build
npm test
```

6. Abra o aplicativo configurado para `LOJA_BACKEND=railway`, autentique-se como **OWNER**, entre em **Administração da loja > Central de Integrações ERP/PDV**.

## Antes de ativar em Railway

A opção `ENABLE_EXTERNAL_INTEGRATIONS` do backend controla a disponibilidade dessas rotas. Com `false`, a tela informa que o serviço está desativado; **não é erro no Flutter**. Continue em `false` até validar as migrations 019–022 e as APIs em banco de homologação. Somente depois habilite na implantação do cliente com os conectores configurados e autorizados.

Nenhuma nova variável nesta fase. Não precisamos configurar Omie, Bling ou Olist/Tiny até haver um cliente real para homologação.

## O que aparece na tela

- Integrações existentes, fornecedor, nome e prefixo da credencial, nunca token integral;
- Escopos de leitura/escrita e condição ativa/revogada;
- Modo de entrega `POLL` (legado) ou `LEASED` (com fila e detalhamento);
- No modo `LEASED`: eventos não enfileirados, pendentes, em execução, confirmados e falhas definitivas, além de códigos de erro recentes;
- Criação de credencial com permissões desligadas por padrão e exibição **uma única vez** da chave;
- Revogação da integração, com confirmação;
- Reenvio assistido de eventos da fila `DEAD`, com confirmação, **exceto eventos de pedidos**, cujo fluxo requer conciliação prévia.

**Atenção:** criar uma credencial não cria uma conexão viva com o fornecedor. É preciso executar/configurar o conector na infraestrutura da loja. A tela não substitui relatórios JSON locais nem verifica token OAuth do ERP; apresenta somente o que a API do Store App conhece.

## Segurança

- API exige sessão autenticada e papel OWNER em cada ação; ocultar o botão no Flutter é apenas conveniência.
- Segredos de terceiros não são incluídos no aplicativo nem salvos no repositório.
- Chaves recém-criadas aparecem em uma janela única; copiá-las à área de transferência pode expô-las a outros aplicativos.
- Ações críticas de criação, revogação e reprocessamento pedem confirmação.
- A UI desabilita reprocessamento automático de eventos `order.changed` e `EXTERNAL_ORDER_SYNCED` para evitar duplicar vendas sem conciliação. O backend permanece inalterado nesta fase; procedimentos operacionais devem continuar restringindo reprocessamento de pedidos via API.

## Validação e limitações

- Neste ambiente foi executado `npm test` do backend anterior: **187 testes passaram**, com variáveis de teste. Nenhuma alteração TypeScript nesta fase.
- **Não foi possível executar `flutter analyze` nem `flutter test` aqui porque o SDK Flutter não está instalado neste ambiente.** Os novos testes foram adicionados ao pacote para execução no seu computador.
- Não houve teste com PostgreSQL real nem com credenciais dos ERPs.
- Sem painel unificado de logs locais dos conectores; isso requer telemetria segura dos workers para o backend em uma etapa posterior.
- Sem renovação/registro de OAuth nesta tela, sem alteração do modo de entrega `LEASED` e sem sincronização fiscal.

Conclua a análise Flutter e os testes locais antes do commit/deploy.
