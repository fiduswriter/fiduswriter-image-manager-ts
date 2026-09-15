import {
  Dialog,
  SelectionDataTable,
  addAlert,
  cancelPromise,
  ensureCSS,
  escapeText,
  gettext,
  staticUrl,
} from "fwtoolkit";
import type { DialogButtonSpec } from "fwtoolkit/basic";
import type { DataTable } from "simple-datatables";
import { E2EEEncryptor } from "fwtoolkit/e2ee/encryptor";

import type { ImageDB } from "../database.js";
import type {
  ImageManagerPage,
  ImagePicker,
  ImageSelectionItem,
  SaveImageRequest,
} from "../types.js";

export class ImageSelectionDialog {
  imageDB: ImageDB;

  userImageDB: ImageDB;

  page: ImageManagerPage;

  imgId: number | false;

  imgDb: "document" | "user" = "document";

  images: ImageSelectionItem[] = [];

  imageDialog!: Dialog;

  selectionTable!: SelectionDataTable;

  table: DataTable | null = null;

  /** Resolves the promise returned by the current init() call. */
  resolveSelection!: (value: unknown) => void;

  /** Whether an upload dialog opened from this dialog is open. */
  uploadInProgress = false;

  constructor(
    imageDB: ImageDB,
    userImageDB: ImageDB,
    imgId: number | false,
    page: ImageManagerPage,
  ) {
    this.imageDB = imageDB;
    this.userImageDB = userImageDB;
    this.page = page;
    this.imgId = imgId; // a preselected image
    // the preselection image will always come from the document
    this.images = []; // images from both databases
  }

  isE2EE(): boolean {
    return this.page.e2ee?.encrypted === true;
  }

  init(): Promise<unknown> {
    // Load the dialog styles in case the host page does not include them
    // (for example in the standalone editor demo).
    ensureCSS([staticUrl("css/dialog_usermedia.css")]);
    this.images = Object.values(this.imageDB.db).map((image) => ({
      image,
      db: "document" as const,
    }));
    Object.values(this.userImageDB.db).forEach((image) => {
      // The document and user image DBs use independent id namespaces
      // (per-document ids vs. session/server sequence), so an id collision
      // does not mean the entries are the same image — only skip when the
      // payload (the image URL/data URL identifying the file) matches too.
      const documentImage = this.imageDB.db[image.id];
      if (documentImage && documentImage.image === image.image) {
        return;
      }
      this.images.push({
        image,
        db: "user" as const,
      });
    });
    const buttons: DialogButtonSpec[] = [];
    const p = new Promise((resolve) => {
      this.resolveSelection = resolve;
      if (!this.page.app.isOffline()) {
        buttons.push({
          text: gettext("Add new image"),
          icon: "plus-circle",
          click: () => this.addNewImage(),
        });
      }

      buttons.push({
        text: gettext("Use image"),
        classes: "fw-dark",
        click: () => {
          this.imageDialog.close();
          this.resolveSelection({ id: this.imgId, db: this.imgDb });
        },
      });

      buttons.push({
        type: "cancel" as const,
        click: () => {
          this.imageDialog.close();
          this.resolveSelection(cancelPromise());
        },
      });
    });
    this.imageDialog = new Dialog({
      buttons,
      width: 560,
      body: '<div class="image-selection-table"></div>',
      title: gettext("Images"),
      id: "select-image-dialog",
    });
    this.imageDialog.open();
    this.initTable();
    this.imageDialog.centerDialog();
    return p;
  }

  addNewImage(): Promise<unknown> {
    if (this.uploadInProgress) {
      return Promise.resolve();
    }
    const picker = this.page.imagePicker;
    if (typeof picker === "function") {
      // The host page (for example a Nextcloud or WordPress integration)
      // provides its own file picker; use it instead of the built-in
      // upload dialog.
      return this.addHostPickedImage(picker);
    }
    return this.openUploadDialog();
  }

  /** Open the built-in upload dialog (the default "Add new image" flow). */
  private openUploadDialog(): Promise<unknown> {
    this.uploadInProgress = true;
    return import("../edit_dialog/index.js")
      .then(({ ImageEditDialog }) => {
        const targetDB = this.isE2EE() ? this.imageDB : this.userImageDB;
        const imageUpload = new ImageEditDialog(targetDB, false, this.page);
        // The upload dialog's promise always settles: it resolves with the
        // new image id on success and with undefined when the dialog is
        // cancelled or closed without uploading.
        return imageUpload.init().then((imageId) => {
          this.uploadInProgress = false;
          if (!imageId) {
            // The upload was cancelled. Keep showing the current selection
            // dialog unchanged.
            return;
          }
          this.finishAddNewImage(imageId);
        });
      })
      .catch((error) => {
        this.uploadInProgress = false;
        throw error;
      });
  }

  /**
   * "Add new image" via a host-provided picker. Resolves with the picked
   * image File, or with a falsy value when the user cancelled.
   */
  private async addHostPickedImage(picker: ImagePicker): Promise<void> {
    this.uploadInProgress = true;
    try {
      const file = await picker();
      if (!file) {
        // The pick was cancelled. Keep showing the current selection
        // dialog unchanged.
        return;
      }
      const imageId = await this.savePickedImage(file);
      this.finishAddNewImage(imageId);
    } catch (error) {
      addAlert("error", gettext("The image could not be added."));
      throw error;
    } finally {
      this.uploadInProgress = false;
    }
  }

  /**
   * Save an image File coming from a host-provided picker. Mirrors the
   * upload defaults of the edit dialog: title derived from the file name,
   * default copyright, no categories; encrypted for E2EE documents.
   */
  private async savePickedImage(file: File): Promise<number> {
    const targetDB = this.isE2EE() ? this.imageDB : this.userImageDB;
    const imageData: SaveImageRequest = {
      title:
        file.name
          .replace(/\.[^./]+$/, "")
          .replace(/[_-]+/g, " ")
          .trim() || gettext("Untitled"),
      copyright: {
        holder: false,
        year: false,
        freeToRead: true,
        licenses: [],
      },
      cats: [],
      image: file,
    };
    if (this.isE2EE() && imageData.image) {
      imageData.image = await E2EEEncryptor.encryptImage(
        imageData.image,
        this.page.e2ee!.key,
      );
      imageData.original_file_type = file.type || "image/png";
      // Encrypt copyright metadata so the server cannot read it
      imageData.copyright = await E2EEEncryptor.encryptObject(
        imageData.copyright,
        this.page.e2ee!.key,
      );
    }
    return targetDB.saveImage(imageData);
  }

  /**
   * Select a newly added image and reopen the dialog with an updated image
   * list. The reopened dialog gets its own promise; forward its eventual
   * outcome to the caller of the original init(). The previous resolver has
   * to be captured before calling init(), which replaces it.
   */
  private finishAddNewImage(imageId: number): void {
    this.imgId = imageId;
    // For E2EE docs the image goes straight
    // into the document DB, not the user's.
    this.imgDb = this.isE2EE() ? "document" : "user";
    this.imageDialog.close();
    const forwardTo = this.resolveSelection;
    void this.init().then((result) => forwardTo(result));
  }

  initTable(): void {
    /* Initialize the overview table */
    const tableEl = document.createElement("table");
    tableEl.classList.add("fw-data-table");
    tableEl.classList.add("fw-small");
    const host = this.imageDialog.dialogEl.querySelector(
      "div.image-selection-table",
    ) as HTMLElement | null;
    if (!host) {
      return;
    }
    host.innerHTML = "";
    host.appendChild(tableEl);

    const selectedIds =
      this.imgId === false ? [] : [`${this.imgDb}-${this.imgId}`];

    this.selectionTable = new SelectionDataTable({
      dom: host,
      classes: ["fw-data-table", "fw-small"],
      columns: [
        {
          select: 0,
          hidden: true,
          sortable: false,
        },
        {
          select: 1,
          name: gettext("Image"),
          sortable: false,
        },
        {
          select: 2,
          name: gettext("Title"),
          type: "string",
        },
      ],
      data: this.images.map((image) => this.createTableRow(image)),
      idColumn: 0,
      multiple: false,
      selectedIds,
      scrollY: "470px",
      labels: {
        noRows: gettext("No images available"), // Message shown when there are no images
        noResults: gettext("No images found"), // Message shown when no images are found after search
        placeholder: gettext("Search..."), // placeholder for search field
      },
      onChange: (selected) => {
        if (selected.length) {
          const [db, id] = String(selected[0]).split("-");
          this.imgId = Number.parseInt(id);
          this.imgDb = db as "document" | "user";
        } else {
          this.imgId = false;
        }
      },
    });
    this.selectionTable.init();
    this.table = this.selectionTable.table!;
    // Start out sorted by title so the sorting option is visible.
    this.table.columns.sort(2, "asc");
  }

  createTableRow(image: ImageSelectionItem): [string, string, string] {
    const img = image.image;
    const infoParts: string[] = [];
    // For SVG images the server stores no width/height and no thumbnail.
    const fileTypeParts = String(img.file_type || "").split("/");
    if (fileTypeParts.length > 1 && fileTypeParts[1]) {
      infoParts.push(fileTypeParts[1].toUpperCase());
    } else if (fileTypeParts[0]) {
      infoParts.push(fileTypeParts[0].toUpperCase());
    }
    if (img.width && img.height) {
      infoParts.push(`${img.width}×${img.height}`);
    }
    return [
      `${image.db}-${img.id}`,
      `<span class="fw-image-preview">
          <img src="${img.thumbnail ? img.thumbnail : img.image}" alt="">
          ${
            infoParts.length
              ? `<span class="fw-image-info">${infoParts.join(", ")}</span>`
              : ""
          }
      </span>`,
      escapeText(img.title.length ? img.title : gettext("Untitled")),
    ];
  }
}
