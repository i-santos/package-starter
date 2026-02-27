# __PACKAGE_NAME__

Pacote criado pelo `@i-santos/create-package-starter`.

## Comandos

- `npm run check`
- `npm run changeset`
- `npm run version-packages`
- `npm run release`

## Fluxo de release

1. Crie um changeset na PR: `npm run changeset`.
2. Faça merge na `main`.
3. O workflow `.github/workflows/release.yml` cria/atualiza a PR de release.
4. Ao merge da PR de release, o publish é executado no npm.
