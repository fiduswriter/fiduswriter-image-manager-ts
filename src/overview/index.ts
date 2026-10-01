import {
    Dialog,
    OverviewDataTable,
    OverviewMenuView,
    activateWait,
    addAlert,
    deactivateWait,
    ensureCSS,
    escapeText,
    findTarget,
    gettext,
    isActivationEvent,
    localizeDate,
    setDocTitle,
    staticUrl,
    whenReady
} from "fwtoolkit"
import type { DataTable } from "simple-datatables"

import { imageOverviewTemplate } from "./templates.js"
import { ImageOverviewCategories } from "./categories.js"
import { bulkMenuModel, menuModel } from "./menu.js"
import type {
    ImageManagerApp,
    ImageManagerPage,
    ImageOverviewPlugin,
    ImageOverviewPluginConstructor,
    ImageTableRow
} from "../types.js"

interface DataTableRow {
    cells: { data: unknown; text?: string }[]
}

interface VirtualNode {
    nodeName: string
    attributes?: Record<string, string | boolean>
    childNodes?: VirtualNode[]
}

/** Helper functions for user added images/SVGs.*/

export class ImageOverview {
    app: ImageManagerApp

    container: HTMLElement

    plugins: [string, Record<string, ImageOverviewPluginConstructor>][]

    mod: {
        categories?: ImageOverviewCategories
    }

    lastSort: {
        column: number
        dir: "asc" | "desc"
    }

    pluginsActivated = false

    dom!: HTMLElement

    menu!: OverviewMenuView

    overviewTable: OverviewDataTable | null = null

    table: DataTable | null = null

    dtBulk: import("fwtoolkit").DatatableBulk | null = null

    _boundHandleActivation?: (event: Event) => void

    constructor({
        app,
        container,
        plugins = []
    }: {
        app: ImageManagerApp
        container: HTMLElement
        plugins?: [string, Record<string, ImageOverviewPluginConstructor>][]
    }) {
        this.app = app
        this.container = container
        this.plugins = plugins
        this.mod = {}

        this.lastSort = { column: 0, dir: "asc" }
    }

    init(): Promise<void> {
        ensureCSS([
            staticUrl("css/dialog_usermedia.css"),
            staticUrl("css/editor/dot_menu.css")
        ])

        return whenReady().then(() => {
            this.render()
            new ImageOverviewCategories(this)
            this.menu = new OverviewMenuView(this, menuModel)
            this.menu.init()
            this.activatePlugins()
            this.bindEvents()
            this.mod.categories!.setImageCategoryList(this.app.imageDB.cats)
            this.initTable(Object.keys(this.app.imageDB.db))
            // Reset scroll position to top to prevent Safari from auto-scrolling
            // to the focused table element, which would hide the header/menu
            window.scrollTo(0, 0)
        })
    }

    render(): void {
        this.dom = this.container
        this.dom.innerHTML = imageOverviewTemplate()
        ensureCSS([staticUrl("css/cropper.min.css")])
        setDocTitle(gettext("Media Manager"), this.app)
    }

    activatePlugins(): Promise<void> {
        if (this.pluginsActivated) {
            // Plugins have been activated already
            return Promise.resolve()
        }
        this.pluginsActivated = true
        // Add plugins.
        const pluginInstances: Record<string, ImageOverviewPlugin> = {}

        return Promise.all(
            this.plugins.map(([app, plugin]) => {
                if (!this.app.settings.APPS.includes(app)) {
                    return Promise.resolve()
                }
                return Promise.all(
                    Object.values(plugin).map(pluginExport => {
                        if (typeof pluginExport === "function") {
                            const Plugin =
                                pluginExport as ImageOverviewPluginConstructor
                            pluginInstances[Plugin.name] = new Plugin(this)
                            return (
                                pluginInstances[Plugin.name].init?.() ||
                                Promise.resolve()
                            )
                        }
                        return Promise.resolve()
                    })
                )
            })
        ).then(() => undefined)
    }

    //delete image
    deleteImage(ids: (string | number)[]): void {
        const numericIds = ids.map(id => Number.parseInt(String(id)))
        if (this.app.isOffline()) {
            addAlert(
                "error",
                gettext(
                    "You are currently offline. Please try again when you are back online."
                )
            )
            return
        }
        activateWait()
        this.app.apiConnectors.image
            .deleteImages(numericIds)
            .catch(error => {
                addAlert("error", gettext("The image(s) could not be deleted"))
                deactivateWait()
                if (this.app.isOffline()) {
                    addAlert(
                        "error",
                        gettext(
                            "You are currently offline. Please try again when you are back online."
                        )
                    )
                } else {
                    throw error
                }
            })
            .then(() => {
                numericIds.forEach(id => delete this.app.imageDB.db[id])
                this.removeTableRows(numericIds)
                addAlert("success", gettext("The image(s) have been deleted"))
            })
            .then(() => deactivateWait())
    }

    deleteImageDialog(ids: (string | number)[]): void {
        const buttons = [
            {
                text: gettext("Delete"),
                classes: "fw-dark",
                click: () => {
                    this.deleteImage(ids)
                    dialog.close()
                }
            },
            {
                type: "cancel" as const
            }
        ]
        const dialog = new Dialog({
            id: "confirmdeletion",
            icon: "exclamation-triangle",
            title: gettext("Confirm deletion"),
            body: `<p>${gettext("Delete the image(s)")}?</p>`,
            buttons
        })
        dialog.open()
    }

    updateTable(ids: (string | number)[]): void {
        // Remove items that already exist
        this.removeTableRows(ids)
        if (this.table) {
            this.table.insert({
                data: ids.map(id => this.createTableRow(Number(id)))
            })
            // Redo last sort
            this.table.columns.sort(this.lastSort.column, this.lastSort.dir)
        }
    }

    createTableRow(id: number): ImageTableRow {
        const image = this.app.imageDB.db[id]
        const cats = image.cats.map(cat => `cat_${cat}`)

        const fileTypeParts = image.file_type.split("/")

        let fileType: string
        if (1 < fileTypeParts.length) {
            fileType = fileTypeParts[1].toUpperCase()
        } else {
            fileType = fileTypeParts[0].toUpperCase()
        }

        return [
            id,
            false, // checkbox
            `<span class="fw-usermedia-image ${cats.join(" ")}">
                <img src="${image.thumbnail ? image.thumbnail : image.image}">
            </span>
            <span class="fw-usermedia-title">
                <span class="edit-image fw-link-text fw-searchable" data-id="${id}">
                    ${image.title.length ? escapeText(image.title) : gettext("Untitled")}
                </span>
                <span class="fw-usermedia-type">${fileType}</span>
            </span>`,
            `<span>${image.width} x ${image.height}</span>`,
            `<span class="fw-date">${localizeDate(image.added, "sortable-date")}</span>`,
            `<span class="delete-image fw-link-text" data-id="${id}">
                <i class="fa fa-trash-alt"></i>
            </span>`
        ]
    }

    removeTableRows(ids: (string | number)[]): void {
        const numericIds = ids.map(id => Number.parseInt(String(id)))

        if (!this.table) {
            return
        }

        const existingRows = this.table.data.data
            .map((row: DataTableRow, index: number) => {
                const id = Number(row.cells[0].data)
                if (numericIds.includes(id)) {
                    return index
                } else {
                    return false
                }
            })
            .filter((rowIndex): rowIndex is number => rowIndex !== false)

        if (existingRows.length) {
            this.table.rows.remove(existingRows)
        }
    }

    onResize(): void {
        if (!this.table) {
            return
        }
        this.initTable(Object.keys(this.app.imageDB.db))
    }

    /* Initialize the overview table */
    initTable(ids: string[]): void {
        if (this.overviewTable) {
            this.overviewTable.destroy()
            this.overviewTable = null
        }
        this.table = null
        this.dtBulk = null

        const contentsEl = this.dom as HTMLElement
        contentsEl.innerHTML = ""

        const hiddenCols: number[] = [0]

        if (window.innerWidth < 500) {
            hiddenCols.push(1)
        }

        this.overviewTable = new OverviewDataTable({
            dom: contentsEl,
            classes: ["fw-data-table", "fw-large"],
            columns: [
                {
                    select: 0,
                    type: "number"
                },
                {
                    select: 1,
                    type: "boolean"
                },
                {
                    select: hiddenCols,
                    hidden: true
                },
                {
                    select: [1, 3, 5],
                    sortable: false
                },
                {
                    select: [this.lastSort.column],
                    sort: this.lastSort.dir
                }
            ],
            data: ids.map(id => this.createTableRow(Number.parseInt(id))),
            idColumn: 0,
            checkboxColumn: 1,
            bulkMenu: bulkMenuModel(),
            bulkMenuPage: this as Record<string, unknown>,
            searchable: true,
            scrollY: `${Math.max(window.innerHeight - 360, 100)}px`,
            tabIndex: 1,
            labels: {
                noRows: gettext("No images available"), // Message shown when there are no images
                noResults: gettext("No images found") // Message shown when no images are found after search
            },
            headings: [
                "",
                "",
                gettext("File"),
                gettext("Size (px)"),
                gettext("Added"),
                ""
            ],
            template: (
                options: {
                    classes: Record<string, string>
                    scrollY: string
                    paging?: boolean
                },
                _dom
            ) =>
                `<div class='${options.classes.container}'${options.scrollY.length ? ` style='height: ${options.scrollY}; overflow-Y: auto;'` : ""}></div>
            <div class='${options.classes.bottom}'>
                ${
                    options.paging
                        ? `<div class='${options.classes.info}'></div>`
                        : ""
                }
                <nav class='${options.classes.pagination}'></nav>
            </div>`,
            rowRender: (row, tr, _index) => {
                const id = row.cells[0].data as number
                const inputNode: VirtualNode = {
                    nodeName: "input",
                    attributes: {
                        type: "checkbox",
                        class: "entry-select fw-check",
                        "data-id": String(id),
                        id: `doc-img-${id}`
                    }
                }
                if (row.cells[1].data) {
                    inputNode.attributes!.checked = "checked"
                }
                const trNode = tr as {
                    childNodes: { childNodes: VirtualNode[] }[]
                }
                trNode.childNodes[0].childNodes = [
                    inputNode,
                    {
                        nodeName: "label",
                        attributes: {
                            for: `doc-img-${id}`
                        }
                    }
                ]
            },
            onEnter: (row, _event) => {
                if (this.getSelected().length > 0) {
                    return
                }
                if (!this.table) {
                    return
                }
                const rowIndex = this.table.data.data.findIndex(
                    dataRow =>
                        (dataRow as unknown as DataTableRow).cells[0].data ===
                        row.cells[0].data
                )
                const button = this.table.dom.querySelector(
                    `tr[data-index="${rowIndex}"] span.edit-image`
                )
                if (button) {
                    ;(button as HTMLElement).click()
                }
            },
            onDelete: row => {
                const imageId = row.cells[0].data as number
                this.deleteImageDialog([imageId])
            }
        })
        this.overviewTable.init()
        this.table = this.overviewTable.table!
        ;(this.table as unknown as { id: string }).id = "imagelist"
        this.dtBulk = this.overviewTable.dtBulk || null

        this.table.on("datatable.sort", (column, dir) => {
            this.lastSort = {
                column: column as number,
                dir: dir as "asc" | "desc"
            }
        })

        this.table.dom.focus()
    }

    // get IDs of selected bib entries
    getSelected(): number[] {
        return Array.from(
            this.dom.querySelectorAll(".entry-select:checked:not(:disabled)")
        ).map(el => Number.parseInt(el.getAttribute("data-id") || "0"))
    }

    bindEvents(): void {
        const handler = (event: Event) => this.handleActivation(event)
        document.body.addEventListener("click", handler)
        document.body.addEventListener("keydown", handler)
        this._boundHandleActivation = handler
    }

    handleActivation(event: Event): void {
        if (!isActivationEvent(event)) {
            return
        }
        const el: { target?: Element | null } = {}
        switch (true) {
            case findTarget(event, ".delete-image", el): {
                const imageId = (el.target as HTMLElement | null)?.dataset.id
                this.deleteImageDialog([imageId || ""])
                break
            }
            case findTarget(event, ".edit-image", el): {
                const imageId = (el.target as HTMLElement | null)?.dataset.id
                import("../edit_dialog/index.js").then(
                    ({ ImageEditDialog }) => {
                        const dialog = new ImageEditDialog(
                            this.app.imageDB,
                            imageId ? Number.parseInt(imageId) : false,
                            this as unknown as ImageManagerPage
                        )
                        dialog.init().then(() => {
                            if (imageId) {
                                this.updateTable([Number.parseInt(imageId)])
                            }
                        })
                    }
                )
                break
            }
            case findTarget(event, ".fw-add-input", el): {
                const itemEl = (el.target as HTMLElement | null)?.closest(
                    ".fw-list-input"
                ) as HTMLElement
                if (!itemEl.nextElementSibling) {
                    itemEl.insertAdjacentHTML(
                        "afterend",
                        `<tr class="fw-list-input">
                            <td>
                                <input type="text" class="category-form">
                                <span class="fw-add-input icon-addremove" tabindex="0"></span>
                            </td>
                        </tr>`
                    )
                } else {
                    itemEl.parentElement!.removeChild(itemEl)
                }
                break
            }
            case event.type === "keydown" &&
                (event.target as Element).matches(".category-form"): {
                const input = event.target as HTMLInputElement
                if (!input.value.trim().length) {
                    break
                }
                const itemEl = (event.target as HTMLElement).closest(
                    ".fw-list-input"
                )
                if (itemEl && !itemEl.nextElementSibling) {
                    itemEl.insertAdjacentHTML(
                        "afterend",
                        `<tr class="fw-list-input">
                            <td>
                                <input type="text" class="category-form">
                                <span class="fw-add-input icon-addremove" tabindex="0"></span>
                            </td>
                        </tr>`
                    )
                    const newInput = (
                        itemEl.nextElementSibling as unknown as HTMLElement
                    )?.querySelector(
                        ".category-form"
                    ) as HTMLInputElement | null
                    newInput?.focus()
                }
                break
            }
            default:
                break
        }
    }

    close(): void {
        if (this.table) {
            this.table.destroy()
            this.table = null
        }
        if (this.dtBulk) {
            this.dtBulk.destroy()
            this.dtBulk = null
        }
        if (this.menu) {
            this.menu.destroy()
            this.menu = null as unknown as OverviewMenuView
        }
        if (this._boundHandleActivation) {
            document.body.removeEventListener(
                "click",
                this._boundHandleActivation
            )
            document.body.removeEventListener(
                "keydown",
                this._boundHandleActivation
            )
            this._boundHandleActivation = undefined
        }
    }
}
