import type { DataTable } from "simple-datatables";
import type { ImageDB } from "./database.js";

/** A single license under which an image is available. */
export interface License {
  url: string;
  title: string;
  start?: string | false;
}

/** Copyright and licensing information for an image. */
export interface Copyright {
  holder?: string | false;
  year?: number | false;
  freeToRead: boolean;
  licenses: License[];
}

/** A category used to group images. */
export interface ImageCategory {
  id: number;
  category_title: string;
}

/** A single image as stored in the client-side image database. */
export interface Image {
  id: number;
  title: string;
  file_type: string;
  image: string;
  thumbnail?: string;
  width: number;
  height: number;
  added: number;
  cats: number[];
  copyright: Copyright;
  [key: string]: unknown;
}

/** End-to-end encryption context passed to dialogs that handle images. */
export interface E2EEContext {
  encrypted: boolean;
  key: CryptoKey;
}

/**
 * Host-provided image picker (for platform file pickers). When set on the
 * page object, the selection dialog invokes it instead of the built-in
 * upload dialog when the user activates "Add new image". It must resolve
 * with the picked image File, or with null/undefined when the user
 * cancelled the pick.
 */
export type ImagePicker = () => Promise<File | null | undefined>;

/** API connector for image server operations. */
export interface ImageApi {
  getImages(): Promise<ImagesResponse>;
  saveImage(
    data: SaveImageRequest,
    files?: Record<string, unknown>,
  ): Promise<SaveImageResponse>;
  saveCategories(cats: SaveCategoriesRequest): Promise<SaveCategoriesResponse>;
  deleteImages(ids: number[]): Promise<unknown>;
}

/** Subset of the main Fidus Writer app object used by image-manager code. */
export interface ImageManagerApp {
  imageDB: ImageDB;
  isOffline: () => boolean;
  settings: {
    APPS: string[];
    MEDIA_MAX_SIZE?: number;
    [key: string]: unknown;
  };
  name: string;
  apiConnectors: {
    image: ImageApi;
  };
  [key: string]: unknown;
}

/** Page object passed to image dialogs. */
export interface ImageManagerPage {
  app: ImageManagerApp;
  e2ee?: E2EEContext;
  menu?: unknown;
  /** Optional host-provided image picker (see {@link ImagePicker}). */
  imagePicker?: ImagePicker;
  [key: string]: unknown;
}

/** Plugin instance created by the overview's plugin activation. */
export interface ImageOverviewPlugin {
  init?: () => Promise<unknown> | unknown;
  [key: string]: unknown;
}

/** Constructor for an image-overview plugin. */
export interface ImageOverviewPluginConstructor {
  new (overview: unknown): ImageOverviewPlugin;
}

/** Row displayed in the image overview data table. */
export type ImageTableRow = [
  id: number,
  selected: boolean,
  file: string,
  size: string,
  added: string,
  actions: string,
];

/** An image selection item coming from either the document or user DB. */
export interface ImageSelectionItem {
  image: Image;
  db: "document" | "user";
}

/** Response body from `POST /api/usermedia/images/`. */
export interface ImagesResponse {
  imageCategories: ImageCategory[];
  images: Image[];
}

/** Response body from `POST /api/usermedia/save/`. */
export interface SaveImageResponse {
  errormsg: Record<string, string> & { error?: string };
  values: Image;
}

/** Request body for `POST /api/usermedia/save/`. */
export interface SaveImageRequest {
  id?: number;
  title: string;
  copyright: Copyright | string;
  cats: (string | number)[];
  image?: File | Blob;
  original_file_type?: string;
  [key: string]: unknown;
}

/** Request body for `POST /api/usermedia/save_category/`. */
export interface SaveCategoriesRequest {
  ids: (string | number)[];
  titles: string[];
}

/** Response body from `POST /api/usermedia/save_category/`. */
export interface SaveCategoriesResponse {
  entries: ImageCategory[];
}

/** Request body for `POST /api/usermedia/delete/`. */
export interface DeleteImagesRequest {
  ids: (string | number)[];
}

export type { DataTable };
