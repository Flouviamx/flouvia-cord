/** Optional widgets stay in the library until explicitly selected.
 * `order` records known widgets; hidden remains the persisted visibility source.
 * Permission-hidden widgets must never be marked optional.
 */
export function optionalWidgetHidden(id: string, order: string[], hidden: string[]): boolean {
    return hidden.includes(id) || !order.includes(id);
}
