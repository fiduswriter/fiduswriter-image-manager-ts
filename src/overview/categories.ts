import {
    Dialog,
    activateWait,
    addAlert,
    deactivateWait,
    gettext
} from "fwtoolkit"
import type { OverviewMenuDropdownItem } from "fwtoolkit/overview_menu"

import { usermediaEditcategoriesTemplate } from "./templates.js"
import type { ImageOverview } from "./index.js"
import type { ImageCategory, SaveCategoriesRequest } from "../types.js"

export class ImageOverviewCategories {
    imageOverview: ImageOverview

    constructor(imageOverview: ImageOverview) {
        this.imageOverview = imageOverview
        imageOverview.mod.categories = this
    }

    //save changes or create a new category
    saveCategories(cats: SaveCategoriesRequest): void {
        activateWait()

        this.imageOverview.app.apiConnectors.image
            .saveCategories(cats)
            .catch(error => {
                addAlert("error", gettext("Could not update categories"))
                deactivateWait()
                throw error
            })
            .then(response => {
                this.imageOverview.app.imageDB.cats = response.entries
                this.setImageCategoryList(response.entries)
                addAlert("success", gettext("The categories have been updated"))
                deactivateWait()
            })
    }

    setImageCategoryList(imageCategories: ImageCategory[]): void {
        const catSelector = this.imageOverview.menu.model.content.find(
            (menuItem): menuItem is OverviewMenuDropdownItem =>
                menuItem.id === "cat_selector"
        )
        if (!catSelector) {
            return
        }
        catSelector.content = catSelector.content.filter(
            cat => cat.type !== "category"
        )
        catSelector.content = catSelector.content.concat(
            imageCategories.map(cat => ({
                type: "category",
                title: cat.category_title,
                action: (_overview: unknown) => {
                    const trs = document.querySelectorAll(
                        "#imagelist > tbody > tr"
                    )
                    trs.forEach(tr => {
                        const imageCell = tr.querySelector(
                            ".fw-usermedia-image"
                        )
                        if (
                            imageCell &&
                            imageCell.classList.contains(`cat_${cat.id}`)
                        ) {
                            ;(tr as HTMLElement).style.display = ""
                        } else {
                            ;(tr as HTMLElement).style.display = "none"
                        }
                    })
                }
            }))
        )
        this.imageOverview.menu.update()
    }

    //open a dialog for editing categories
    editCategoryDialog(): void {
        const buttons = [
            {
                text: gettext("Submit"),
                classes: "fw-dark",
                click: () => {
                    const cats: SaveCategoriesRequest = {
                        ids: [],
                        titles: []
                    }
                    document
                        .querySelectorAll("#edit-categories .category-form")
                        .forEach(el => {
                            const input = el as HTMLInputElement
                            const thisVal = input.value.trim()
                            let thisId: string | number =
                                input.dataset.id || "0"
                            if ("undefined" == typeof thisId) {
                                thisId = 0
                            }
                            if ("" !== thisVal) {
                                cats.ids.push(thisId)
                                cats.titles.push(thisVal)
                            }
                        })
                    this.saveCategories(cats)
                    dialog.close()
                }
            },
            {
                type: "cancel" as const
            }
        ]

        const dialog = new Dialog({
            id: "edit-categories",
            title: gettext("Edit Categories"),
            body: usermediaEditcategoriesTemplate({
                categories: this.imageOverview.app.imageDB.cats
            }),
            width: 350,
            height: 350,
            buttons
        })
        dialog.open()
    }
}
