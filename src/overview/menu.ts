import {gettext} from "fwtoolkit"
import type {ContentMenuInit} from "fwtoolkit/content_menu"
import type {OverviewMenuModel} from "fwtoolkit/overview_menu"

import type {ImageManagerPage} from "../types.js"
import type {ImageOverview} from "./index.js"

export const bulkMenuModel = (): ContentMenuInit => ({
    content: [
        {
            title: gettext("Delete selected"),
            tooltip: gettext("Delete selected images."),
            action: (overview: unknown) => {
                const ids = (overview as ImageOverview).getSelected()
                if (ids.length) {
                    ;(overview as ImageOverview).deleteImageDialog(ids)
                }
            },
            disabled: (overview: unknown) =>
                !(overview as ImageOverview).getSelected().length ||
                (overview as ImageOverview).app.isOffline()
        }
    ]
})

export const menuModel = (): OverviewMenuModel => ({
    content: [
        {
            type: "dropdown",
            id: "cat_selector",
            keys: "Alt-c",
            content: [
                {
                    title: gettext("All categories"),
                    action: (_overview: unknown) => {
                        const trs = document.querySelectorAll(
                            "#imagelist > tbody > tr"
                        )
                        trs.forEach(
                            tr => ((tr as HTMLElement).style.display = "")
                        )
                    }
                }
            ],
            order: 1
        },
        {
            type: "text",
            title: gettext("Edit categories"),
            keys: "Alt-e",
            action: (overview: unknown) =>
                (
                    overview as ImageOverview
                ).mod.categories!.editCategoryDialog(),
            order: 2,
            disabled: (overview: unknown) =>
                (overview as ImageOverview).app.isOffline()
        },
        {
            type: "text",
            title: gettext("Upload new image"),
            keys: "Alt-u",
            action: (overview: unknown) => {
                import("../edit_dialog/index.js").then(({ImageEditDialog}) => {
                    const imageUpload = new ImageEditDialog(
                        (overview as ImageOverview).app.imageDB,
                        false,
                        overview as ImageManagerPage
                    )
                    imageUpload.init().then(imageId => {
                        if (imageId) {
                            ;(overview as ImageOverview).updateTable([imageId])
                        }
                    })
                })
            },
            order: 3,
            disabled: (overview: unknown) =>
                (overview as ImageOverview).app.isOffline()
        },
        {
            type: "search",
            icon: "search",
            title: gettext("Search images"),
            keys: "Alt-s",
            input: (overview: unknown, text: string) =>
                (overview as ImageOverview).table!.search(text),
            order: 4
        }
    ]
})
