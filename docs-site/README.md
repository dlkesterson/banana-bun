# Banana Bun Documentation Site

This documentation site is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

## Installation

```bash
cd docs-site
npm install
```

## Local Development

```bash
npm run start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

## Build

```bash
npm run build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Deployment

The site is automatically deployed to GitHub Pages when changes are pushed to the main branch.

For manual deployment:

```bash
GIT_USER=dlkesterson npm run deploy
```
