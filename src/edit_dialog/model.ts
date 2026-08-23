import Cropper from "cropperjs";

import { gettext } from "fwtoolkit";
import type { ContentMenuInit } from "fwtoolkit/content_menu";

import { CopyrightDialog } from "../copyright_dialog/index.js";
import type { ImageEditDialog } from "./index.js";

export const imageEditModel = (): ContentMenuInit => ({
  content: [
    {
      title: gettext("Rotate Left"),
      type: "action",
      tooltip: gettext("Rotate-left"),
      order: 0,
      action: (dialog: unknown) => {
        const d = dialog as ImageEditDialog;
        if (!d.mediaPreviewer || !d.mediaDataURL || !d.mediaInput) {
          return;
        }
        const currentDataUrl = d.mediaDataURL;
        rotateBase64Image(currentDataUrl, d.mediaInput.type, "left").then(
          (response) => {
            if (d.mediaDataURL !== currentDataUrl) {
              // Another edit happened in the meantime.
              return;
            }
            d.mediaDataURL = response;
            d.mediaPreviewer!.setAttribute(
              "style",
              `background-image: url(${response});`,
            );
          },
        );
        if (d.rotation === 0) {
          d.rotation = 270;
        } else {
          d.rotation -= 90;
        }
      },
      disabled: (dialog: unknown) => {
        const d = dialog as ImageEditDialog;
        return !!d.imageId || !d.mediaPreviewable || !d.mediaEditable;
      },
      icon: "redo fa-rotate-180",
    },
    {
      title: gettext("Rotate Right"),
      type: "action",
      tooltip: gettext("Rotate-right"),
      order: 1,
      action: (dialog: unknown) => {
        const d = dialog as ImageEditDialog;
        if (!d.mediaPreviewer || !d.mediaDataURL || !d.mediaInput) {
          return;
        }
        const currentDataUrl = d.mediaDataURL;
        rotateBase64Image(currentDataUrl, d.mediaInput.type, "right").then(
          (response) => {
            if (d.mediaDataURL !== currentDataUrl) {
              return;
            }
            d.mediaDataURL = response;
            d.mediaPreviewer!.setAttribute(
              "style",
              `background-image: url(${response});`,
            );
          },
        );
        if (d.rotation === 270) {
          d.rotation = 0;
        } else {
          d.rotation += 90;
        }
      },
      disabled: (dialog: unknown) => {
        const d = dialog as ImageEditDialog;
        return !!d.imageId || !d.mediaPreviewable || !d.mediaEditable;
      },
      icon: "undo",
    },
    {
      title: gettext("Crop"),
      type: "action",
      tooltip: gettext("Crop image"),
      order: 2,
      action: (dialog: unknown) => {
        const d = dialog as ImageEditDialog;
        if (!d.mediaPreviewer || !d.mediaDataURL) {
          return;
        }
        const cropperImg = document.createElement("img");
        cropperImg.src = d.mediaDataURL;
        d.cropperImg = cropperImg;
        d.mediaPreviewer.parentElement!.replaceChild(
          cropperImg,
          d.mediaPreviewer,
        );
        const cropper = new Cropper(cropperImg, {
          viewMode: 1,
          responsive: true,
        });
        d.cropper = cropper;
        toggleCropMode(true, d);
      },
      disabled: (dialog: unknown) => {
        const d = dialog as ImageEditDialog;
        return !!d.imageId || !d.mediaPreviewable || !d.mediaEditable;
      },
      icon: "crop",
    },
    {
      title: gettext("Set Copyright"),
      type: "action",
      tooltip: gettext("Specify copyright information"),
      order: 3,
      action: (dialog: unknown) => {
        const d = dialog as ImageEditDialog;
        const crDialog = new CopyrightDialog(d.copyright);
        crDialog.init().then((copyright) => {
          if (copyright) {
            d.copyright = copyright;
          }
        });
      },
    },
  ],
});

const toggleCropMode = (val: boolean, dialog: ImageEditDialog) => {
  if (!dialog.dialog) {
    return;
  }
  const dialogEl = dialog.dialog;
  if (val && !dialog.savedButtons) {
    dialog.mediaPreviewerDiv?.classList.add("crop-mode");
    dialog.savedButtons = dialogEl.buttons;
    dialogEl.setButtons([
      {
        text: gettext("Crop"),
        click: () => {
          const cropper = dialog.cropper;
          if (!cropper) {
            return;
          }
          const dataUrl = cropper
            .getCroppedCanvas()
            .toDataURL(dialog.mediaInput?.type);
          dialog.mediaDataURL = dataUrl;
          dialog.mediaPreviewer!.setAttribute(
            "style",
            `background-image: url(${dataUrl});`,
          );
          dialog.cropped = true;
          cropper.destroy();
          dialog.cropper = undefined;
          toggleCropMode(false, dialog);
        },
        classes: "fw-dark",
      },
      {
        type: "cancel",
        classes: "fw-orange",
        click: () => {
          dialog.cropper?.destroy();
          dialog.cropper = undefined;
          toggleCropMode(false, dialog);
        },
      },
    ]);
  } else {
    dialog.mediaPreviewerDiv?.classList.remove("crop-mode");
    if (dialog.cropperImg && dialog.mediaPreviewer) {
      dialog.cropperImg.parentElement?.replaceChild(
        dialog.mediaPreviewer,
        dialog.cropperImg,
      );
      dialog.cropperImg = undefined;
    }
    if (dialog.savedButtons) {
      dialogEl.buttons = dialog.savedButtons;
      dialog.savedButtons = false;
    }
  }
  dialogEl.refreshButtons();
  dialogEl.centerDialog();
};

const rotateBase64Image = (
  base64data: string,
  type: string,
  direction: "left" | "right",
): Promise<string> => {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const image = new Image();
    image.onerror = () => resolve(base64data);
    image.src = base64data;
    image.onload = () => {
      canvas.height = image.width;
      canvas.width = image.height;
      if (direction == "left") {
        ctx.rotate((90 * Math.PI) / 180);
        ctx.translate(0, -canvas.width);
      } else {
        ctx.rotate((-90 * Math.PI) / 180);
        ctx.translate(-canvas.height, 0);
      }
      ctx.drawImage(image, 0, 0);
      resolve(canvas.toDataURL(type));
    };
  });
};
