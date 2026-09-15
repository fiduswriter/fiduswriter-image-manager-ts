import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import { Dialog, SelectionDataTable, addAlert } from "fwtoolkit";

import { ImageSelectionDialog } from "../src/selection_dialog/index.js";
import type { ImageManagerPage } from "../src/types.js";

// The dialog reports picker failures by rethrowing from a fire-and-forget
// promise (same pattern as the built-in upload path); keep that from
// failing the node process as an unhandled rejection.
process.on("unhandledRejection", () => {});

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

interface FakeDB {
  db: Record<string, unknown>;
  cats: unknown[];
  saveImage: jest.Mock<() => Promise<number>>;
}

const makeDB = (id: number | null): FakeDB => ({
  db: {},
  cats: [],
  saveImage:
    id === null
      ? (jest.fn(() =>
          Promise.reject(new Error("save failed")),
        ) as FakeDB["saveImage"])
      : (jest.fn(() => Promise.resolve(id)) as FakeDB["saveImage"]),
});

const makePage = (
  overrides: Partial<ImageManagerPage> = {},
): ImageManagerPage =>
  ({
    app: { isOffline: () => false },
    ...overrides,
  }) as unknown as ImageManagerPage;

describe("ImageSelectionDialog host-provided image picker", () => {
  beforeEach(() => {
    Dialog.instances = [];
    SelectionDataTable.instances = [];
    addAlert.calls = [];
  });

  test("picker replaces the built-in upload dialog and the image gets selected", async () => {
    const file = new File(["img"], "my_photo.png", { type: "image/png" });
    const picker = jest.fn(() => Promise.resolve(file));
    const docDB = makeDB(null);
    const userDB = makeDB(42);
    const dialog = new ImageSelectionDialog(
      docDB as never,
      userDB as never,
      false,
      makePage({ imagePicker: picker }),
    );
    const initPromise = dialog.init();

    dialog.addNewImage();
    expect(picker).toHaveBeenCalledTimes(1);

    await flush();

    // Saved into the user DB with the edit dialog's upload defaults.
    expect(userDB.saveImage).toHaveBeenCalledTimes(1);
    const request = userDB.saveImage.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(request.title).toBe("my photo");
    expect(request.copyright).toEqual({
      holder: false,
      year: false,
      freeToRead: true,
      licenses: [],
    });
    expect(request.cats).toEqual([]);
    expect(request.image).toBe(file);
    expect(docDB.saveImage).not.toHaveBeenCalled();

    // Dialog was closed and reopened with the new image preselected.
    expect(Dialog.instances.length).toBe(2);
    expect(Dialog.instances[0].closed).toBe(true);

    // The reopened dialog forwards its outcome to init()'s promise.
    const reopened = Dialog.instances[1];
    const useButton = reopened.options.buttons.find(
      (button: { text?: string }) => button.text === "Use image",
    );
    useButton.click();
    await expect(initPromise).resolves.toEqual({ id: 42, db: "user" });
  });

  test("a cancelled pick keeps the selection dialog unchanged", async () => {
    const picker = jest.fn(() => Promise.resolve(null));
    const userDB = makeDB(42);
    const dialog = new ImageSelectionDialog(
      makeDB(null) as never,
      userDB as never,
      false,
      makePage({ imagePicker: picker }),
    );
    dialog.init();

    dialog.addNewImage();
    await flush();

    expect(userDB.saveImage).not.toHaveBeenCalled();
    expect(Dialog.instances.length).toBe(1);
    expect(Dialog.instances[0].closed).toBeUndefined();
  });

  test("a failing picker alerts and can be retried", async () => {
    let calls = 0;
    const picker = jest.fn(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("platform picker failed"))
        : Promise.resolve(null);
    });
    const userDB = makeDB(42);
    const dialog = new ImageSelectionDialog(
      makeDB(null) as never,
      userDB as never,
      false,
      makePage({ imagePicker: picker }),
    );
    dialog.init();

    await expect(dialog.addNewImage()).rejects.toThrow(
      "platform picker failed",
    );

    expect(addAlert.calls.some((call) => call[0] === "error")).toBe(true);
    expect(userDB.saveImage).not.toHaveBeenCalled();
    expect(Dialog.instances.length).toBe(1);

    // uploadInProgress was reset, so a retry reaches the picker again.
    await dialog.addNewImage();
    expect(picker).toHaveBeenCalledTimes(2);
  });

  test("a failing save alerts and keeps the selection dialog open", async () => {
    const file = new File(["img"], "my_photo.png", { type: "image/png" });
    const picker = jest.fn(() => Promise.resolve(file));
    const userDB = makeDB(null);
    const dialog = new ImageSelectionDialog(
      makeDB(null) as never,
      userDB as never,
      false,
      makePage({ imagePicker: picker }),
    );
    dialog.init();

    await expect(dialog.addNewImage()).rejects.toThrow("save failed");

    expect(userDB.saveImage).toHaveBeenCalledTimes(1);
    expect(addAlert.calls.some((call) => call[0] === "error")).toBe(true);
    expect(Dialog.instances.length).toBe(1);
    expect(Dialog.instances[0].closed).toBeUndefined();
  });

  test("a user-db image with a colliding id but different payload is listed too", () => {
    // The document DB (from the .fidus file's images.json) uses string
    // per-document ids; the user DB uses its own numeric sequence — an id
    // collision does not mean the entries are the same image.
    const docDB = makeDB(null);
    docDB.db["1"] = {
      id: 1,
      title: "Document image",
      file_type: "image/png",
      image: "images/1.png",
      width: 1,
      height: 1,
      added: 0,
      cats: [],
      copyright: { freeToRead: true, licenses: [] },
    };
    const userDB = makeDB(null);
    userDB.db["1"] = {
      id: 1,
      title: "Picked image",
      file_type: "image/png",
      image: "data:image/png;base64,AAAA",
      width: 1,
      height: 1,
      added: 0,
      cats: [],
      copyright: { freeToRead: true, licenses: [] },
    };
    const dialog = new ImageSelectionDialog(
      docDB as never,
      userDB as never,
      false,
      makePage(),
    );
    dialog.init();

    expect(dialog.images.length).toBe(2);
    const rows = SelectionDataTable.instances[0].options.data;
    expect(rows.length).toBe(2);
  });

  test("a true duplicate (same id and same payload) is deduplicated", () => {
    const docDB = makeDB(null);
    docDB.db["1"] = {
      id: 1,
      title: "Document image",
      file_type: "image/png",
      image: "images/1.png",
      width: 1,
      height: 1,
      added: 0,
      cats: [],
      copyright: { freeToRead: true, licenses: [] },
    };
    const userDB = makeDB(null);
    userDB.db["1"] = {
      id: 1,
      title: "Document image",
      file_type: "image/png",
      image: "images/1.png",
      width: 1,
      height: 1,
      added: 0,
      cats: [],
      copyright: { freeToRead: true, licenses: [] },
    };
    const dialog = new ImageSelectionDialog(
      docDB as never,
      userDB as never,
      false,
      makePage(),
    );
    dialog.init();

    expect(dialog.images.length).toBe(1);
    const rows = SelectionDataTable.instances[0].options.data;
    expect(rows.length).toBe(1);
  });

  test("without a picker the built-in upload dialog opens", async () => {
    const dialog = new ImageSelectionDialog(
      makeDB(null) as never,
      makeDB(null) as never,
      false,
      makePage(),
    );
    dialog.init();

    // The returned promise stays pending while the upload dialog is open;
    // the point here is that the built-in dialog gets opened.
    const pending = dialog.addNewImage();
    let rejection = null;
    void pending.catch((error) => {
      rejection = error;
    });
    for (let i = 0; i < 10; i++) {
      await flush();
    }

    // The built-in upload dialog was opened instead of the picker.
    if (
      !Dialog.instances.some((instance) => instance.options.id === "editimage")
    ) {
      throw new Error(`editimage dialog not opened; rejection=${rejection}`);
    }
  });
});
