import type { Image, ImageCategory, ImageManagerApp } from "../../src/types.js"

/**
 * Minimal mock ImageDB that satisfies the interface expected by ImageOverview.
 * Provides stub data so the overview renders without a backend.
 */
export class MockImageDB {
    app: ImageManagerApp

    db: Record<number, Image>

    cats: ImageCategory[]

    constructor(app: ImageManagerApp) {
        this.app = app
        this.db = {}
        this.cats = [
            { id: 1, category_title: "Photos" },
            { id: 2, category_title: "Illustrations" },
            { id: 3, category_title: "Diagrams" }
        ]

        // Add a few sample images for demo purposes.
        const sampleImage = (
            id: number,
            title: string,
            catIds: number[]
        ): Image => ({
            id,
            title,
            file_type: "image/png",
            image: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="200" height="150" fill="#e2e8f0"/><text x="100" y="80" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#64748b">${title}</text></svg>`)}`,
            thumbnail: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="45"><rect width="60" height="45" fill="#e2e8f0"/><text x="30" y="25" text-anchor="middle" font-family="sans-serif" font-size="8" fill="#64748b">${title.substring(0, 6)}</text></svg>`)}`,
            width: 200,
            height: 150,
            added: Date.now() / 1000 - id * 86400,
            cats: catIds,
            copyright: {
                holder: "Demo Author",
                year: 2026,
                freeToRead: true,
                licenses: [
                    {
                        url: "https://creativecommons.org/licenses/by/4.0/",
                        title: "CC BY 4.0"
                    }
                ]
            }
        })

        this.db = {
            1: sampleImage(1, "Mountain landscape", [1]),
            2: sampleImage(2, "Architecture diagram", [3]),
            3: sampleImage(3, "Character sketch", [2]),
            4: sampleImage(4, "UI wireframe", [3]),
            5: sampleImage(5, "Nature photo", [1]),
            6: sampleImage(6, "Logo design", [2])
        }
    }

    getDB(): Promise<void> {
        return Promise.resolve()
    }

    saveImage(): Promise<number> {
        return Promise.resolve(0)
    }
}
