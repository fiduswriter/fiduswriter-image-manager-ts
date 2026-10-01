import { edtfParse } from "bibliojson"
import deepEqual from "fast-deep-equal"
import { Dialog, InputList, TypeSwitch, escapeText } from "fwtoolkit"
import type { InputListItemRenderResult } from "fwtoolkit"

import {
    copyrightTemplate,
    licenseInputTemplate,
    licenseSelectTemplate
} from "./templates.js"
import type { Copyright, License } from "../types.js"

export const LICENSE_URLS = [
    ["CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"],
    ["CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"],
    ["CC BY-ND 4.0", "https://creativecommons.org/licenses/by-nd/4.0/"],
    ["CC BY-NC 4.0", "https://creativecommons.org/licenses/by-nc/4.0/"],
    ["CC BY-NC-SA 4.0", "https://creativecommons.org/licenses/by-nc-sa/4.0/"],
    ["CC BY-NC-ND 4.0", "https://creativecommons.org/licenses/by-nc-nd/4.0/"],
    ["CC0", "https://creativecommons.org/publicdomain/zero/1.0/"]
] as [string, string][]

function getLicenseTitle(url: string): string {
    const license = LICENSE_URLS.find(license => license[1] === url)
    return license ? license[0] : ""
}

export class CopyrightDialog {
    copyright: Copyright

    origCopyright: Copyright

    dialog: Dialog | false = false

    licensesList!: InputList<License>

    constructor(copyright: Copyright) {
        this.copyright = copyright
        this.origCopyright = copyright
        this.dialog = false
    }

    getCurrentValue(): void {
        if (!this.dialog) {
            return
        }
        const dialogEl = this.dialog.dialogEl
        this.copyright = {} as Copyright
        const holder = (dialogEl.querySelector(".holder") as HTMLInputElement)
            .value
        this.copyright.holder = holder.length ? holder : false
        const year = (dialogEl.querySelector(".year") as HTMLInputElement).value
        this.copyright.year = year.length
            ? Math.max(0, Math.min(Number.parseInt(year) || 0, 2100))
            : false
        this.copyright.freeToRead = dialogEl.querySelector(
            ".free-to-read:checked"
        )
            ? true
            : false
        const licenseStartDates = Array.from(
            dialogEl.querySelectorAll(".license-start")
        ).map(el => (el as HTMLInputElement).value)
        this.copyright.licenses = this.licensesList.values
            .map((license, index) => {
                if (!license.url.length) {
                    return false
                }
                const returnValue: License = {
                    url: license.url,
                    title: license.title
                }
                const startDate = edtfParse(licenseStartDates[index])
                if (
                    startDate.valid &&
                    (startDate.type === "Date" ||
                        startDate.type === "YearMonth" ||
                        startDate.type === "Year") &&
                    !startDate.uncertain &&
                    !startDate.approximate
                ) {
                    returnValue.start = startDate.cleanedString
                }
                return returnValue
            })
            .filter((license): license is License => license !== false)
    }

    init(): Promise<Copyright | false> {
        return new Promise(resolve => {
            const buttons = []
            buttons.push({
                text: gettext("Change"),
                classes: "fw-dark",
                click: () => {
                    dialog.close()
                    this.getCurrentValue()
                    if (deepEqual(this.copyright, this.origCopyright)) {
                        // No change.
                        resolve(false)
                    }
                    resolve(this.copyright)
                }
            })

            buttons.push({
                type: "cancel" as const
            })

            const dialog = new Dialog({
                width: 940,
                height: 300,
                id: "configure-copyright",
                title: gettext("Set copyright information"),
                body: copyrightTemplate(this.copyright),
                buttons
            })
            this.dialog = dialog

            dialog.open()
            this.bind()
        })
    }

    bind(): void {
        if (!this.dialog) {
            return
        }
        const dialogEl = this.dialog.dialogEl
        this.licensesList = new InputList<License>({
            dom: dialogEl.querySelector(
                ".copyright-licenses-list"
            ) as HTMLElement,
            initialValues: this.copyright.licenses || [],
            emptyValue: { url: "", title: "", start: false },
            renderItem: (license): InputListItemRenderResult<License> => ({
                html: `<div class="copyright-license-switch"></div>
                    <div class="field-part field-part-small">
                        <input type="text" class="license-start" value="${license.start ? escapeText(license.start) : ""}" placeholder="${gettext("Start date")}">
                    </div>`,
                bind: el => {
                    const licenseContainer = el.closest("tr") as HTMLElement
                    const startInput =
                        licenseContainer.querySelector(".license-start")
                    if (license.start && startInput) {
                        ;(startInput as HTMLInputElement).value = license.start
                    }

                    const mode =
                        license.url === "" ||
                        LICENSE_URLS.find(
                            licenseUrl => licenseUrl[1] === license.url
                        )
                            ? 1
                            : 2
                    new TypeSwitch({
                        dom: el.querySelector(
                            ".copyright-license-switch"
                        ) as HTMLElement,
                        label1: gettext("From list"),
                        label2: gettext("Custom"),
                        initialMode: mode as 1 | 2,
                        render1: () =>
                            licenseSelectTemplate({ url: license.url }),
                        render2: () =>
                            licenseInputTemplate({
                                url: license.url,
                                title: license.title
                            }),
                        onChange: () => {
                            // Restore focus to the license input after switching.
                            const focusable = el.querySelector(
                                ".fw-type-switch-input-inner input, .fw-type-switch-input-inner select"
                            )
                            if (focusable) {
                                ;(focusable as HTMLElement).focus()
                            }
                        }
                    })
                }
            }),
            getValue: el => {
                const licenseInput = el.querySelector(
                    ".fw-type-switch-input-inner"
                ) as HTMLElement
                const selectEl = licenseInput.querySelector("select.license")
                let url: string, title: string
                if (selectEl) {
                    url = (selectEl as HTMLSelectElement).value
                    title = getLicenseTitle(url)
                } else {
                    url = (
                        licenseInput.querySelector(
                            "input.license"
                        ) as HTMLInputElement
                    ).value
                    title = (
                        licenseInput.querySelector(
                            "input.license-title"
                        ) as HTMLInputElement
                    ).value
                }
                const start = (el.closest("tr") as HTMLElement).querySelector(
                    ".license-start"
                )
                return {
                    url,
                    title,
                    start: start
                        ? (start as HTMLInputElement).value || false
                        : false
                }
            }
        })
    }
}
