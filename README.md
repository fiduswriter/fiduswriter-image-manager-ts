<p align="center">
  <img src="https://codeberg.org/fiduswriter/fiduswriter-image-manager-ts/raw/branch/main/logo.svg" alt="@fiduswriter/image-manager" width="100" height="100">
</p>

<h1 align="center">@fiduswriter/image-manager</h1>

<p align="center">Image and media manager for Fidus Writer</p>

---

## What it does

Manages images and other media for Fidus Writer. Provides a client-side image
database, an overview table for browsing images, an edit dialog for cropping
and metadata, and a selection dialog for inserting images into documents.

## Exports

| Export                 | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| `ImageDB`              | Client-side connector to the server's image database        |
| `ImageOverview`        | Overview component for browsing all images in the library   |
| `ImageEditDialog`      | Dialog for editing image properties, cropping, and metadata |
| `ImageSelectionDialog` | Dialog for selecting images to insert into documents        |

## Installation

```bash
npm install @fiduswriter/image-manager
```

## Usage

```ts
import {
  ImageDB,
  ImageOverview,
  ImageEditDialog,
  ImageSelectionDialog,
} from "@fiduswriter/image-manager";
```

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run typecheck    # Check types without emitting
npm run lint         # Lint with ESLint
npm run format:check # Check formatting with Prettier
```

## License

AGPL-3.0 — see [LICENSE](LICENSE) for details.
