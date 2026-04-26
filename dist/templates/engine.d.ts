/**
 * Snap Template Engine
 *
 * Takes a template name + slot values, returns valid snap JSON.
 * Templates define the UI structure; slots are the only user-supplied content.
 *
 * Usage:
 *   import { expand } from "./templates/engine.js";
 *   const json = expand("explainer", { title: "...", points: [...], theme: "blue" });
 *
 * All output conforms to snap spec v2.0:
 *   - max 7 root children, 64 total elements, 4 nesting levels
 *   - children are string references, never inline objects
 *   - all elements have props
 *   - text uses "content" not "text"
 */
export declare function makeText(id: string, content: string, extra?: Record<string, any>): any;
export declare function makeSeparator(id: string): any;
export declare function makeButton(id: string, label: string, action: string, params: Record<string, any>, variant?: string): any;
export declare function makeBadge(id: string, label: string): any;
export declare function makeHorizontalStack(id: string, children: string[], gap?: string): any;
export declare function makeInput(id: string, name: string, extra?: Record<string, any>): any;
export declare function makeSwitch(id: string, name: string, label: string, defaultChecked?: boolean): any;
export declare function makeBarChart(id: string, bars: Array<{
    label: string;
    value: number;
    color?: string;
}>, extra?: Record<string, any>): any;
export declare function makeProgress(id: string, value: number, max: number, label?: string): any;
export declare function makeIcon(id: string, name: string, extra?: Record<string, any>): any;
/**
 * Build the snap JSON envelope from a flat list of elements.
 * Converts flat array into { ui: { root: "root", elements: { ... } } }.
 */
export declare function wrap(allElements: any[]): any;
export declare function addTheme(snap: any, theme: string, effects?: string[]): any;
/**
 * Build badge elements and return the container element + all badge sub-elements.
 * Adds to `elements` array in place. Returns the container element ID.
 */
export declare function addBadges(elements: any[], labels: string[], containerId: string): string | null;
export type TemplateName = "explainer" | "tutorial" | "cheat-sheet" | "comparison" | "resource-list";
/**
 * Expand a template with given slot values.
 * Returns valid snap JSON (object) or array of snap JSONs (for multi-page templates like tutorial).
 */
export declare function expand(template: TemplateName, slots: Record<string, any>): any | any[];
/** Get the list of available template names */
export declare function listTemplates(): TemplateName[];
/** Get slot schema for a template (for documentation/validation) */
export declare function getSlotSchema(template: TemplateName): Record<string, {
    type: string;
    required: boolean;
    description: string;
}>;
