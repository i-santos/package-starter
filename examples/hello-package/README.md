# hello-package

Pacote criado pelo starter com fluxo de release padronizado.

## Comandos

- `npm run check`
- `npm run registry:start` (usa `http://127.0.0.1:4873`)
- `npm run release:beta` (atômico: bump beta + publish + commit)
- `npm run release:stable` (atômico: promove/patch + publish + commit)
- `npm run release:publish` (só publish, sem bump/commit)

## Fluxo rápido

1. Garanta git limpo.
2. Aponte o registry local: `npm run registry:start`.
3. Faça release beta: `npm run release:beta`.
4. Quando validar, faça stable: `npm run release:stable`.
