export class Dialog {
  static instances = [];
  constructor(options = {}) {
    this.options = options;
    this.dialogEl = globalThis.document.createElement("div");
    // The selection dialog mounts its table into this host element.
    const tableHost = globalThis.document.createElement("div");
    tableHost.classList.add("image-selection-table");
    this.dialogEl.appendChild(tableHost);
    Dialog.instances.push(this);
  }
  open() {
    this.opened = true;
  }
  close() {
    this.closed = true;
  }
  centerDialog() {}
}
export class Datatable {}
export class SelectionDataTable {
  static instances = [];
  constructor(options) {
    this.options = options;
    this.table = null;
    SelectionDataTable.instances.push(this);
  }
  init() {
    this.table = { columns: { sort: () => {} } };
  }
}
export const addAlert = (...args) => {
  addAlert.calls.push(args);
};
addAlert.calls = [];
export const ensureCSS = () => {};
export const staticUrl = (path) => path;
export const cancelPromise = () => ({ cancelled: true });
export const interpolate = (fmt) => fmt;
export const dropdownSelect = () => ({
  setValue: () => {},
  disable: () => {},
  enable: () => {},
});
export class CheckableList {
  constructor(options) {
    this.value = options?.initialValue ?? [];
  }
}
export class ContentMenu {
  open() {}
}
export class InfoRow {}
export class InputList {}
export class TypeSwitch {}
export const E2EEEncryptor = {
  encryptImage: async (file) => file,
  encryptObject: async (obj) => obj,
};
export const get = () => {};
export const post = () => {};
export const baseBodyTemplate = () => "";
export const FeedbackTab = class {};
export const SiteMenu = class {};
export const escapeText = (s) => s;
export const shortFileTitle = (s) => s;
export const gettext = (s) => s;
export const localizeDate = () => "";
export const addDropdown = () => {};
export const whenReady = () => Promise.resolve();
