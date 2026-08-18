# AGENTS.md — @fiduswriter/image-manager

## Project overview

`@fiduswriter/image-manager` is a TypeScript library that manages images and
other media for Fidus Writer. It provides a client-side image database
connector, an overview table for browsing images, an edit dialog for metadata
and cropping, and a selection dialog for inserting images into documents.

- Package name: `@fiduswriter/image-manager`
- License: `AGPL-3.0`
- Repository: `https://git.fiduswriter.org/fiduswriter/fiduswriter-image-manager-ts.git`
- Author: Johannes Wilm

## Scope

Code in this repository should be limited to:

- Image database client connector (`src/database.ts`).
- Image overview component (`src/overview/`).
- Image edit dialog (`src/edit_dialog/`).
- Image selection dialog (`src/selection_dialog/`).
- Copyright/attribution dialog (`src/copyright_dialog/`).
- Image-related types (`src/types.ts`).

Do **not** put in this repository:

- Generic UI primitives (those belong in `fwtoolkit`).
- Document model code (use `@fiduswriter/document`).
- Citation/bibliography logic.

## Technology stack

- **Language:** TypeScript 6.0+.
- **Module system:** ESM (`"type": "module"`).
- **Build tool:** `tsc` only; no bundler is used.
- **Test runner:** Jest with `ts-jest` and `--experimental-vm-modules`.

## Directory layout

```
.
├── src/                  # TypeScript source files
│   ├── index.ts          # Public barrel export
│   ├── database.ts       # Client-side image database connector
│   ├── overview/         # Image overview component
│   ├── edit_dialog/      # Image edit dialog
│   ├── selection_dialog/ # Image selection dialog
│   ├── copyright_dialog/ # Copyright/attribution dialog
│   └── types.ts          # Image-related type definitions
├── dist/                 # Compiled JS, .d.ts and source maps (generated)
├── test/                 # Jest tests
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

## Build and test commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run typecheck    # Check types without emitting
npm test             # Run test suite
npm run lint         # Lint with ESLint
npm run format:check # Check formatting with Prettier
```

## Consumers

- `fiduswriter/` (the main Fidus Writer Django app).
- `@fiduswriter/editor` for the document editor.
- `@fiduswriter/common` for shared page chrome.
