/**
 * Snap handler router
 *
 * Intercepts POST /:id for interactive snaps (polls, quizzes, claims, forms).
 * Checks snap_meta for the template type, dispatches to the appropriate handler.
 * Returns dynamically generated snap JSON as the response.
 */
export interface HandlerResult {
    snapJson: any;
    headers?: Record<string, string>;
}
/**
 * Route a POST submission to the appropriate handler.
 * Returns null if the snap has no handler (falls through to default behavior).
 */
export declare function handleSnapPost(snapId: string, fid: number, inputs: Record<string, string>, buttonIndex: number): Promise<HandlerResult | null>;
