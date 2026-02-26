# __PACKAGE_NAME__

Pacote criado pelo starter com fluxo de release padronizado.

## Comandos

- `npm run check`
- `npm run registry:start` (usa `http://127.0.0.1:4873`)
- `npm run release:beta` (gera `X.Y.Z-beta.N` e publica com tag `beta`)
- `npm run release:stable` (promove `beta` para `X.Y.Z` ou faz bump patch)

## Fluxo rápido

1. Garanta git limpo.
2. Aponte o registry local: `npm run registry:start`.
3. Faça release beta: `npm run release:beta`.
4. Quando validar, faça stable: `npm run release:stable`.
