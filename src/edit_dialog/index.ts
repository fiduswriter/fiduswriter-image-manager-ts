import {
  CheckableList,
  ContentMenu,
  Dialog,
  addAlert,
  ensureCSS,
  gettext,
  interpolate,
  staticUrl,
} from "fwtoolkit";
import type { CheckableListOptions } from "fwtoolkit";
import type { ContentMenuInit } from "fwtoolkit/content_menu";
import { E2EEEncryptor } from "fwtoolkit/e2ee/encryptor";

import type Cropper from "cropperjs";

import { imageEditModel } from "./model.js";
import { imageEditTemplate } from "./templates.js";
import type { ImageDB } from "../database.js";
import type {
  Copyright,
  Image,
  ImageCategory,
  ImageManagerPage,
  SaveImageRequest,
} from "../types.js";

/**
 * Image MIME types the server accepts for upload.
 * Keep in sync with ALLOWED_FILETYPES in the usermedia app's models.py.
 */
export const SUPPORTED_IMAGE_TYPES = [
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
];

/**
 * Raster image types that can be edited in the browser (rotated/cropped via
 * canvas). SVG images are previewable but must not be run through canvas:
 * the canvas would rasterize them and canvas.toDataURL() silently falls back
 * to PNG while the file would keep its .svg name.
 */
export const EDITABLE_IMAGE_TYPES = [
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
];

/** File extensions for the image types that can be saved. */
const MIME_EXTENSIONS: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

export class ImageEditDialog {
  imageDB: ImageDB;

  page: ImageManagerPage;

  imageId: number | false;

  dialog: Dialog | false = false;

  copyright: Copyright;

  menu: ContentMenuInit;

  catsList: CheckableList | { value: (string | number)[] } = { value: [] };

  mediaPreviewerDiv?: HTMLElement;

  mediaPreviewer?: HTMLElement;

  /** Data URL of the image currently being previewed/edited. */
  mediaDataURL?: string;

  /** Whether the browser can decode and display the selected image. */
  mediaPreviewable = false;

  /**
   * Whether the selected image can be edited in the browser (rotated and
   * cropped). True for raster images; false for vector images such as SVG
   * that would be silently rasterized by canvas-based editing.
   */
  mediaEditable = false;

  rotation = 0;

  cropped = false;

  mediaInput?: File;

  /** Cropper instance while crop mode is active. */
  cropper?: Cropper;

  /** The <img> element that Cropper is attached to while crop mode is active. */
  cropperImg?: HTMLImageElement;

  /** Dialog buttons saved while crop mode replaces them. */
  savedButtons: Dialog["buttons"] | false = false;

  constructor(
    imageDB: ImageDB,
    imageId: number | false = false,
    page: ImageManagerPage,
  ) {
    this.imageDB = imageDB;
    this.page = page;
    this.imageId = imageId;
    this.copyright = this.imageId
      ? this.imageDB.db[this.imageId].copyright
      : {
          holder: false,
          year: false,
          freeToRead: true,
          licenses: [],
        };
    // Prefer a page-provided menu model, but only if it actually has content.
    // An empty model (for example a stub registered by a host application)
    // would render a menu without any entries.
    const pageMenu = (
      this.page.menu as { imageEditModel?: ContentMenuInit } | undefined
    )?.imageEditModel;
    this.menu =
      pageMenu && Array.isArray(pageMenu.content) && pageMenu.content.length
        ? pageMenu
        : imageEditModel();
  }

  //open a dialog for uploading an image
  init(): Promise<number | void> {
    // Load the dialog styles in case the host page does not include them
    // (for example in the standalone editor demo).
    ensureCSS([staticUrl("css/dialog_usermedia.css")]);
    if (this.page.app.isOffline()) {
      this.showOffline();
      return Promise.resolve();
    }
    const returnPromise = new Promise<number | void>((resolve) => {
      // Settles the init() promise exactly once, no matter how the dialog is
      // closed: with the new image id after a successful upload, or without
      // a value when the dialog is cancelled/closed without uploading.
      let finished = false;
      const finish = (value?: number) => {
        if (finished) {
          return;
        }
        finished = true;
        resolve(value);
      };
      let dialog: Dialog;
      dialog = new Dialog({
        title: this.imageId
          ? gettext("Update Image Information")
          : gettext("Upload Image"),
        id: "editimage",
        classes: "fw-media-uploader",
        body: imageEditTemplate({
          image: this.imageId ? this.imageDB.db[this.imageId] : false,
          cats: this.imageDB.cats,
        }),
        buttons: [
          {
            text: this.imageId ? gettext("Update") : gettext("Upload"),
            click: () => {
              void this.saveImage().then((result) => {
                if (result !== false) {
                  finish(result);
                  dialog.close();
                }
                // On validation errors the dialog stays open so the user
                // can correct the form and retry.
              });
            },
            classes: "fw-dark",
          },
          {
            type: "cancel",
            classes: "fw-orange",
            click: () => {
              finish();
              dialog.close();
            },
          },
        ],
        onClose: () => {
          finish();
          this.handleDialogClose();
        },
      });
      this.dialog = dialog;
      dialog.open();
    });

    const image: Image | false = this.imageId
      ? this.imageDB.db[this.imageId]
      : false;
    const catsEl = document.getElementById("image-edit-categories");
    if (catsEl) {
      const checkableOptions: CheckableListOptions = {
        dom: catsEl,
        options: this.imageDB.cats.map((cat: ImageCategory) => ({
          id: cat.id,
          label: cat.category_title,
        })),
        initialValue: image ? image.cats : [],
        multiple: true,
      };
      this.catsList = new CheckableList(checkableOptions);
    } else {
      this.catsList = { value: [] };
    }

    if (!this.imageId) {
      this.bindMediaUploadEvents();
    } else {
      this.mediaDataURL = image ? String(image.image) : undefined;
      // Existing images are not re-processed, so we treat them as
      // previewable if the template could render them.
      this.mediaPreviewable = true;
      this.mediaPreviewer =
        (document.querySelector(
          "#editimage .figure-preview .img",
        ) as HTMLElement | null) || undefined;
      this.mediaPreviewerDiv =
        (document.querySelector(
          "#editimage .figure-preview > div",
        ) as HTMLElement | null) || undefined;
    }

    const figureEditMenu = document.querySelector(
      "#editimage .figure-edit-menu",
    );
    if (figureEditMenu) {
      figureEditMenu.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const contentMenu = new ContentMenu({
          menu: this.menu,
          width: 220,
          page: this,
          menuPos: {
            X: (event as MouseEvent).pageX - 50,
            Y: (event as MouseEvent).pageY + 50,
          },
        });
        contentMenu.open();
      });
    }

    return returnPromise;
  }

  //add image upload events
  bindMediaUploadEvents(): void {
    const selectButton = document.querySelector(
        "#editimage .fw-media-select-button",
      ) as HTMLButtonElement | null,
      mediaInputSelector = document.querySelector(
        "#editimage .fw-media-file-input",
      ) as HTMLInputElement | null;
    this.mediaPreviewerDiv =
      (document.querySelector(
        "#editimage .figure-preview > div",
      ) as HTMLElement | null) || undefined;
    this.rotation = 0;
    this.cropped = false;
    this.mediaDataURL = undefined;
    this.mediaPreviewable = false;
    this.mediaPreviewer = undefined;
    this.mediaInput = undefined;

    if (!mediaInputSelector) {
      return;
    }

    if (selectButton) {
      selectButton.addEventListener("click", () => {
        mediaInputSelector.click();
      });
    }

    const dialog = this.dialog;
    if (!dialog) {
      return;
    }

    // No image has been selected yet, so uploading makes no sense.
    this.setUploadButtonEnabled(false);

    mediaInputSelector.addEventListener("change", () => {
      const file = mediaInputSelector.files?.[0];
      if (!file) {
        return;
      }
      this.mediaInput = file;
      this.mediaDataURL = undefined;
      this.mediaPreviewable = false;
      this.mediaEditable = false;
      this.mediaPreviewer = undefined;

      // Suggest a title based on the file name as long as the user has not
      // entered one.
      const titleInput = document.querySelector(
        "#editimage .fw-media-title",
      ) as HTMLInputElement | null;
      if (titleInput && !titleInput.value.trim()) {
        const baseName = file.name
          .replace(/\.[^./]+$/, "")
          .replace(/[_-]+/g, " ")
          .trim();
        titleInput.value = baseName || gettext("Untitled");
      }

      if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        // The server rejects this file type anyway. Tell the user now
        // instead of only after a failed upload.
        const previewerDiv = this.mediaPreviewerDiv;
        if (previewerDiv) {
          previewerDiv.classList.remove("crop-mode");
          previewerDiv.innerHTML = `<div class="fw-media-preview-missing">${interpolate(
            gettext(
              "The file type %s is not supported. Supported types are JPEG, PNG, WebP, AVIF and SVG.",
            ),
            [file.type ? file.type : file.name],
          )}</div>`;
        }
        this.setUploadButtonEnabled(false);
        return;
      }
      this.setUploadButtonEnabled(true);

      const fr = new window.FileReader();
      fr.onload = () => {
        const previewerDiv = this.mediaPreviewerDiv;
        const dataUrl = String(fr.result);
        if (!previewerDiv || this.mediaInput !== file) {
          return;
        }
        this.mediaDataURL = dataUrl;
        previewerDiv.innerHTML = `<div class="img" style="background-image: url(${dataUrl});" />`;
        previewerDiv.classList.remove("crop-mode");
        // Probe whether the browser can actually decode this image type.
        // Some formats are valid image files that the browser nevertheless
        // cannot display.
        const probe = new window.Image();
        probe.onload = () => {
          if (this.mediaDataURL !== dataUrl) {
            // The user has selected a different file in the meantime.
            return;
          }
          this.mediaPreviewable = true;
          this.mediaEditable = EDITABLE_IMAGE_TYPES.includes(file.type);
          this.mediaPreviewer = previewerDiv.querySelector(".img") || undefined;
          dialog.centerDialog();
        };
        probe.onerror = () => {
          if (this.mediaDataURL !== dataUrl) {
            return;
          }
          this.mediaPreviewable = false;
          this.mediaEditable = false;
          this.mediaPreviewer = undefined;
          previewerDiv.innerHTML = `<div class="fw-media-preview-missing">${gettext("No preview is available for this file type. The file will be uploaded unchanged.")}</div>`;
          dialog.centerDialog();
        };
        probe.src = dataUrl;
      };
      fr.readAsDataURL(file);
    });
  }

  /** Enable or disable the dialog's Upload/Update button. */
  setUploadButtonEnabled(enabled: boolean): void {
    if (!this.dialog) {
      return;
    }
    const wanted = this.imageId ? gettext("Update") : gettext("Upload");
    const button = Array.from(
      this.dialog.dialogEl.querySelectorAll(".fw-dialog-buttonpane button"),
    ).find((el) => el.textContent?.trim() === wanted);
    if (button) {
      (button as HTMLButtonElement).disabled = !enabled;
    }
  }

  /** Clean up crop mode state when the dialog is closed. */
  handleDialogClose(): void {
    if (this.cropper) {
      try {
        this.cropper.destroy();
      } catch {
        // The cropper may already be destroyed.
      }
      this.cropper = undefined;
    }
    this.cropperImg = undefined;
    this.savedButtons = false;
    this.mediaPreviewerDiv?.classList.remove("crop-mode");
  }

  displayCreateImageError(errors: Record<string, string>): void {
    Object.keys(errors).forEach((eKey) => {
      const eMsg = `<div class="fw-warning">${errors[eKey]}</div>`;
      if ("error" == eKey) {
        document
          .getElementById("editimage")!
          .insertAdjacentHTML("afterbegin", eMsg);
      } else {
        const fieldEl = document.getElementById(`id_${eKey}`);
        if (fieldEl) {
          fieldEl.insertAdjacentHTML("afterend", eMsg);
        }
      }
    });
  }

  /**
   * Convert a data URL into a File. The MIME type and the file name
   * extension are taken from the data URL: canvas-based processing may have
   * changed the format (browsers fall back to PNG encoding for types they
   * cannot encode), and a mismatch between content and file extension would
   * make the browser serve the stored file with the wrong type later.
   */
  dataURLtoFile(dataUrl: string, original: File): File {
    const bstr = atob(dataUrl.split(",")[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const mimeMatch = dataUrl.match(/^data:([^;,]+)/);
    const type = mimeMatch ? mimeMatch[1] : original.type;
    const newExt = MIME_EXTENSIONS[type];
    let name = original.name;
    if (newExt) {
      // Replace or append the extension so it matches the actual content.
      const lastDot = name.lastIndexOf(".");
      if (lastDot > 0) {
        name = `${name.slice(0, lastDot)}.${newExt}`;
      } else {
        name = `${name}.${newExt}`;
      }
    }
    return new File([u8arr], name, { type });
  }

  /**
   * Upload the image. Always settles: resolves with the new image id on
   * success and with `false` when the upload failed (validation errors,
   * network problems, being offline). The caller is responsible for closing
   * the dialog.
   */
  async saveImage(): Promise<number | false> {
    const titleInput = document.querySelector(
      "#editimage .fw-media-title",
    ) as HTMLInputElement | null;
    const imageData: SaveImageRequest = {
      title: titleInput ? titleInput.value : "",
      copyright: this.copyright,
      cats: this.catsList.value,
    };
    if (this.imageId) {
      imageData.id = this.imageId;
    } else if (this.mediaInput) {
      if (
        (!this.rotation && !this.cropped) ||
        !this.mediaDataURL ||
        !this.mediaPreviewable
      ) {
        // The image has not been edited (or cannot be edited in the
        // browser): upload the original file.
        imageData.image = this.mediaInput;
      } else {
        imageData.image = this.dataURLtoFile(
          this.mediaDataURL,
          this.mediaInput,
        );
      }
    }

    // For E2EE documents, encrypt the image and copyright before uploading
    const isE2EE = this.page.e2ee?.encrypted === true;
    if (isE2EE && imageData.image) {
      imageData.image = await E2EEEncryptor.encryptImage(
        imageData.image as File | Blob,
        this.page.e2ee!.key,
      );
      imageData.original_file_type = this.mediaInput?.type || "image/png";
      // Encrypt copyright metadata so the server cannot read it
      imageData.copyright = await E2EEEncryptor.encryptObject(
        imageData.copyright,
        this.page.e2ee!.key,
      );
    }

    // Remove old warning messages
    document
      .querySelectorAll("#editimage .fw-warning")
      .forEach((el) => el.parentElement!.removeChild(el));
    try {
      const imageId = await this.imageDB.saveImage(imageData);
      addAlert("success", gettext("The image has been updated."));
      this.imageId = imageId;
      return imageId;
    } catch (error) {
      if (this.page.app.isOffline()) {
        this.showOffline();
        return false;
      }
      // ImageDB.saveImage rejects either with an Error carrying the server
      // message (for example "Filetype not supported") or with a field/error
      // mapping. Normalize both so the message becomes visible in the form.
      let errors: Record<string, string>;
      if (error instanceof Error) {
        errors = { error: error.message };
      } else {
        errors = (error as Record<string, string>) || {};
      }
      this.displayCreateImageError(errors);
      addAlert(
        "error",
        gettext("Some errors were found. Please examine the form."),
      );
      return false;
    }
  }

  showOffline(): void {
    addAlert(
      "info",
      gettext(
        "You are currently offline. Please try again after going online.",
      ),
    );
  }
}
