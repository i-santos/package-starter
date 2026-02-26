# package-starter

Starter para padronizar pacotes npm com release `beta`/`stable` usando uma CLI local compartilhada.

## Arquitetura

- `packages/release-cli`: CLI CommonJS com os comandos `beta`, `stable`, `publish` e `registry`.
- `templates/npm-package`: template base para novos pacotes.
- `scripts/create-package.js`: gerador de pacote a partir do template.
- `examples/`: área de exemplos gerados.

## Quickstart

1. `npm install`
2. `npm run create:package -- --name hello-package`
3. `cd examples/hello-package`
4. `npm run registry:start`
5. `npm run release:beta`

## Criar novo pacote

- Comando padrão (gera em `examples/`):
  - `npm run create:package -- --name meu-pacote`
- Para gerar direto em `packages/`:
  - `npm run create:package -- --name meu-pacote --dir packages`

## Release beta/stable (atômico)

- `npm run release:beta`
  - exige git limpo
  - bump prerelease beta
  - publica com `npm publish --tag beta`
  - só commita após publish bem-sucedido (`chore(release): vX.Y.Z-beta.N`)
  - se publish falhar, rollback automático da versão (sem commit)
- `npm run release:stable`
  - exige git limpo
  - se versão atual for beta, promove para `X.Y.Z`
  - se já for stable, faz bump patch
  - publica com `npm publish`
  - só commita após publish bem-sucedido (`chore(release): vX.Y.Z`)
  - se publish falhar, rollback automático da versão (sem commit)
- `npm run release:publish`
  - apenas publica versão atual
  - sem bump e sem commit

## Verdaccio / Registry local

- Definir registry local no pacote:
  - `npm run registry:start`
- Ou manualmente:
  - `npx release-cli registry http://127.0.0.1:4873`
- Isso grava/atualiza `registry=...` no `.npmrc` do pacote.
- Em workspace, o `release-cli` passa `--registry` explicitamente no `publish`.

## Validação

- `npm run check`
