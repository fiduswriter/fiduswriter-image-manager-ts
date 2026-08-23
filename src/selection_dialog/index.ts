import {
  Dialog,
  SelectionDataTable,
  cancelPromise,
  ensureCSS,
  escapeText,
  gettext,
  staticUrl,
} from "fwtoolkit";
import type { DialogButtonSpec } from "fwtoolkit/basic";
import type { DataTable } from "simple-datatables";

import type { ImageDB } from "../database.js";
import type { ImageManagerPage, ImageSelectionItem } from "../types.js";

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
      if (this.imageDB.db[image.id]) {
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

  addNewImage(): void {
    if (this.uploadInProgress) {
      return;
    }
    this.uploadInProgress = true;
    import("../edit_dialog/index.js")
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
          this.imgId = imageId;
          // For E2EE docs the image goes straight
          // into the document DB, not the user's.
          this.imgDb = this.isE2EE() ? "document" : "user";
          this.imageDialog.close();
          // Reopen with an updated image list. The reopened dialog gets its
          // own promise; forward its eventual outcome to the caller of the
          // original init(). The previous resolver has to be captured before
          // calling init(), which replaces it.
          const forwardTo = this.resolveSelection;
          void this.init().then((result) => forwardTo(result));
        });
      })
      .catch((error) => {
        this.uploadInProgress = false;
        throw error;
      });
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
