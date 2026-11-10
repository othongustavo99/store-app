# Atualização do catálogo no Railway

Extraia o ZIP na raiz de `loja_roupas`, onde está `pubspec.yaml`. Preserve a estrutura das pastas e aceite a substituição dos arquivos já existentes. Nenhum arquivo do projeto precisa ser removido.

1. Publique o backend atualizado no Railway pelo fluxo habitual do projeto. A atualização usa o esquema de banco existente.
2. Gere e instale um novo build do Flutter com a configuração Railway que você já usa. Para o APK de homologação, o projeto inclui o comando abaixo. Ajuste o nome do arquivo de configuração se for diferente.

   ```powershell
   .\tools\build-client.ps1 -Config '.\config\minha-loja.local.json' -Build -Mode debug
   ```

3. Entre com uma conta de proprietário ou gerente. Abra **Admin → Produtos e categorias → Gerenciar categorias**. Ali você pode criar, editar o nome, o ícone e a imagem, ou remover uma categoria da vitrine. A inicial do nome fica maiúscula.

## Remover a categoria digitada como `camisetas`

Pelo painel, use a opção **Remover** na linha de `camisetas`. Se houver produtos vinculados, abra cada produto e selecione outra categoria antes de remover.

Se preferir aplicar a limpeza pelo terminal, execute o comando abaixo no ambiente do serviço do backend, após o deploy. Substitua `SLUG_DA_LOJA` pelo slug da loja correta, o mesmo configurado no app. O comando procura especificamente o nome em minúsculas.

```sh
node dist/scripts/update_presentation_catalog.js --slug=SLUG_DA_LOJA --remove-camisetas
```

## Adicionar as peças de apresentação

No mesmo ambiente, execute a carga para o slug escolhido.

```sh
node dist/scripts/update_presentation_catalog.js --slug=SLUG_DA_LOJA --seed
```

A carga adiciona duas peças por categoria em **Camisas, Calças, Vestidos, Fitness e Acessórios**, com preços, cores, tamanhos e imagens ilustrativas com o nome do produto. Em uma loja já marcada como demonstração, as peças são publicadas com estoque simulado. Em uma loja comercial, entram em **Rascunho** com estoque zero. As categorias usadas na carga são reutilizadas quando já existem com o mesmo nome. Rodar o comando novamente não duplica as peças.

Para apresentar as peças em uma vitrine separada, use o provisionamento descrito em `LEIA_ETAPA_06.md` com `store.mode` igual a `DEMO` e execute a carga usando o slug dessa loja.

Para executar localmente, rode `npm ci` e `npm run build` em `backend` e use os mesmos comandos `node` com as variáveis de ambiente do backend e uma conexão ao banco correto.
