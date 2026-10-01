import { escapeText } from "fwtoolkit"

import type { ImageCategory } from "../types.js"

/** HTML template for the standalone image overview layout
 *  (without the full page chrome from @fiduswriter/frontend).
 *  Provides the DOM elements required by OverviewMenuView, initTable(),
 *  activateWait/deactivateWait, and addAlert.
 */
export function imageOverviewTemplate(): string {
    return `<div id="fw-wait"><i class="fa fa-spinner fa-pulse"></i></div>
<div class="fw-contents-outer">
    <div class="fw-overview-menu-wrapper"><ul id="fw-overview-menu"></ul></div>
    <div class="fw-contents"></div>
</div>`
}

interface CategoryFormsTemplateData {
    categories: ImageCategory[]
}

interface EditcategoriesTemplateData {
    categories: ImageCategory[]
}

/** A template for the image category edit form. */
const usermediaCategoryformsTemplate = ({
    categories
}: CategoryFormsTemplateData) =>
    `${categories
        .map(
            cat =>
                `<tr id="categoryTr_${cat.id}" class="fw-list-input">
                <td>
                    <input type="text" class="category-form" id="categoryTitle_${cat.id}"
                            value="${escapeText(cat.category_title)}" data-id="${cat.id}" />
                    <span class="fw-add-input icon-addremove" tabindex="0"></span>
                </td>
            </tr>`
        )
        .join("")}
    <tr class="fw-list-input">
        <td>
            <input type="text" class="category-form" />
            <span class="fw-add-input icon-addremove" tabindex="0"></span>
        </td>
    </tr>`

/** A template to edit image categories. */
export const usermediaEditcategoriesTemplate = ({
    categories
}: EditcategoriesTemplateData) =>
    `<table id="editCategoryList" class="fw-dialog-table">
        <tbody>
            ${usermediaCategoryformsTemplate({ categories })}
        </tbody>
    </table>`
