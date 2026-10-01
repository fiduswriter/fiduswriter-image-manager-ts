// Globals provided by the Fidus Writer host page.

declare function gettext(msgid: string): string

declare function interpolate(
    fmt: string,
    args: unknown[],
    named?: boolean
): string

declare function staticUrl(path: string): string

declare const settings: Record<string, unknown>

interface Window {
    settings?: Record<string, unknown>
    csrfToken?: string
}
