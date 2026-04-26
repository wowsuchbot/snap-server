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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function makeText(id: string, content: string, extra: Record<string, any> = {}): any {
  return { type: "text", id, props: { content, ...extra } };
}

export function makeSeparator(id: string): any {
  return { type: "separator", id, props: {} };
}

export function makeButton(id: string, label: string, action: string, params: Record<string, any>, variant: string = "primary"): any {
  return {
    type: "button", id,
    props: { label, variant },
    on: { press: { action, params } },
  };
}

export function makeBadge(id: string, label: string): any {
  return { type: "badge", id, props: { label } };
}

export function makeHorizontalStack(id: string, children: string[], gap = "sm"): any {
  return { type: "stack", id, props: { direction: "horizontal", gap }, children };
}

export function makeInput(id: string, name: string, extra: Record<string, any> = {}): any {
  return { type: "input", id, props: { name, ...extra } };
}

export function makeSwitch(id: string, name: string, label: string, defaultChecked = false): any {
  return { type: "switch", id, props: { name, label, defaultChecked } };
}

export function makeBarChart(id: string, bars: Array<{ label: string; value: number; color?: string }>, extra: Record<string, any> = {}): any {
  return { type: "bar_chart", id, props: { bars: bars.slice(0, 6), ...extra } };
}

export function makeProgress(id: string, value: number, max: number, label?: string): any {
  const props: Record<string, any> = { value, max };
  if (label) props.label = label;
  return { type: "progress", id, props };
}

export function makeIcon(id: string, name: string, extra: Record<string, any> = {}): any {
  return { type: "icon", id, props: { name, ...extra } };
}

/**
 * Build the snap JSON envelope from a flat list of elements.
 * Converts flat array into { ui: { root: "root", elements: { ... } } }.
 */
export function wrap(allElements: any[]): any {
  // Find root — should be the last element pushed
  const rootEl = allElements.find((e: any) => e.id === "root");
  if (!rootEl) throw new Error("No root element found");

  // Build flat elements map (remove the id field from each)
  const elements: Record<string, any> = {};
  for (const el of allElements) {
    const { id, ...rest } = el;
    elements[id] = rest;
  }

  return {
    version: "2.0" as const,
    ui: {
      root: "root",
      elements,
    },
  };
}

export function addTheme(snap: any, theme: string, effects?: string[]): any {
  if (theme) snap.theme = { accent: theme };
  if (effects?.length) snap.effects = effects;
  return snap;
}

/**
 * Build badge elements and return the container element + all badge sub-elements.
 * Adds to `elements` array in place. Returns the container element ID.
 */
export function addBadges(elements: any[], labels: string[], containerId: string): string | null {
  if (!labels.length) return null;
  const badgeLabels = labels.slice(0, 6);
  const rows: string[][] = [];
  for (let i = 0; i < badgeLabels.length; i += 3) {
    rows.push(badgeLabels.slice(i, i + 3));
  }

  const rowIds: string[] = [];
  rows.forEach((row, ri) => {
    const rowId = `${containerId}-row-${ri}`;
    const badgeIds = row.map((label, ci) => {
      const bid = `${containerId}-${ri}-${ci}`;
      elements.push(makeBadge(bid, label));
      return bid;
    });
    elements.push(makeHorizontalStack(rowId, badgeIds));
    rowIds.push(rowId);
  });

  const container = { type: "stack", id: containerId, props: { gap: "sm" }, children: rowIds };
  elements.push(container);
  return containerId;
}

// ---------------------------------------------------------------------------
// Template: Explainer
//
// Single-page informational snap. Title + key points + optional badges + optional CTA.
// Best for: explaining a concept, summarizing a topic, listing key facts.
//
// Slots:
//   title    (string, required) — bold heading
//   points   (string[], 1-4, required) — key points, one per line
//   badges   (string[], optional, max 6) — keyword tags
//   cta      ({ label, action, target }?, optional) — call to action button
//   theme    (string, optional, default "blue") — accent color
// ---------------------------------------------------------------------------

function explainer(slots: {
  title: string;
  points: string[];
  badges?: string[];
  cta?: { label: string; action: string; target: string };
  theme?: string;
}): any {
  const elements: any[] = [];
  const kids: string[] = [];

  // Title
  const titleEl = makeText("title", slots.title, { weight: "bold" });
  elements.push(titleEl);
  kids.push("title");

  // Separator
  const sep1 = makeSeparator("sep1");
  elements.push(sep1);
  kids.push("sep1");

  // Points (1-4)
  const count = Math.min(slots.points.length, 4);
  for (let i = 0; i < count; i++) {
    const id = `point${i}`;
    const el = makeText(id, slots.points[i]);
    elements.push(el);
    kids.push(id);
  }

  // Badges (optional, wrapped in a single vertical container)
  // Only add if we have room (need to stay at 7 root children max)
  if (slots.badges?.length && kids.length < 6) {
    // Only add separator if we still have room for badges + possibly CTA after
    if (kids.length < 5) {
      const sep2 = makeSeparator("sep2");
      elements.push(sep2);
      kids.push("sep2");
    }

    const badgeId = addBadges(elements, slots.badges, "badges");
    if (badgeId && kids.length < 7) kids.push(badgeId);
  }

  // CTA (optional)
  if (slots.cta) {
    const btn = makeButton("cta", slots.cta.label, slots.cta.action, { target: slots.cta.target });
    elements.push(btn);
    kids.push("cta");
  }

  // Root stack
  const root = { type: "stack", id: "root", props: { gap: "md" }, children: kids };
  elements.push(root);

  const snap = wrap(elements);
  return addTheme(snap, slots.theme || "blue");
}

// ---------------------------------------------------------------------------
// Template: Tutorial (multi-page)
//
// Multi-page info slides with prev/next navigation.
// Returns an array of snap JSONs, one per page.
//
// Slots:
//   baseId   (string, required) — snap ID prefix, pages become baseId-0, baseId-1, etc.
//   pages    ({ title, body, badges? }[], required) — one object per page
//   theme    (string, optional, default "purple") — accent color
//   loop     (boolean, optional, default false) — loop back to page 0 at end
//   baseUrl  (string, optional, default "https://snap.mxjxn.com") — for nav targets
//

function tutorial(slots: {
  baseId: string;
  pages: { title: string; body: string; badges?: string[] }[];
  theme?: string;
  loop?: boolean;
  baseUrl?: string;
}): any[] {
  const total = slots.pages.length;
  if (total === 0) throw new Error("Tutorial needs at least 1 page");
  if (total === 1) {
    return [explainer({ title: slots.pages[0].title, points: slots.pages[0].body.split("\n").filter(Boolean), theme: slots.theme })];
  }

  const theme = slots.theme || "purple";
  const baseUrl = slots.baseUrl || "https://snap.mxjxn.com";

  return slots.pages.map((page, idx) => {
    const elements: any[] = [];
    const kids: string[] = [];

    // Progress indicator
    const progress = makeText("progress", `${idx + 1} / ${total}`, { size: "sm" });
    elements.push(progress);
    kids.push("progress");

    // Title
    const titleEl = makeText("title", page.title, { weight: "bold" });
    elements.push(titleEl);
    kids.push("title");

    // Separator
    const sep1 = makeSeparator("sep1");
    elements.push(sep1);
    kids.push("sep1");

    // Body — split by newlines, max 3 lines to stay under 500px
    const lines = page.body.split("\n").filter(Boolean).slice(0, 3);
    lines.forEach((line, i) => {
      const id = `body${i}`;
      elements.push(makeText(id, line));
      kids.push(id);
    });

    // Badges (optional)
    if (page.badges?.length && kids.length < 5) {
      const sep2 = makeSeparator("sep2");
      elements.push(sep2);
      kids.push("sep2");

      const badgeId = addBadges(elements, page.badges.slice(0, 3), "badges");
      if (badgeId) kids.push(badgeId);
    }

    // Navigation buttons — fit in remaining root children budget
    // Current kids count: progress + title + sep1 + body lines + optional badges
    // We need room for nav (1-2 buttons) — max 7 root children
    const navKids: string[] = [];
    const remainingSlots = 7 - kids.length;

    if (idx > 0 && remainingSlots >= 2) {
      const backBtn = makeButton(
        "back",
        "← Back",
        "submit",
        { target: `${baseUrl}/${slots.baseId}-${idx - 1}` },
        "secondary"
      );
      elements.push(backBtn);
      navKids.push("back");
    }

    const isLastPage = idx === total - 1;
    const nextTarget = isLastPage
      ? (slots.loop ? `${baseUrl}/${slots.baseId}-0` : `${baseUrl}/${slots.baseId}-0`)
      : `${baseUrl}/${slots.baseId}-${idx + 1}`;
    const nextLabel = isLastPage ? (slots.loop ? "↻ Restart" : "← Start over") : "Next →";

    if (remainingSlots >= (navKids.length + 1)) {
      const nextBtn = makeButton("next", nextLabel, "submit", { target: nextTarget });
      elements.push(nextBtn);
      navKids.push("next");
    }

    if (navKids.length === 2) {
      const navRow = makeHorizontalStack("nav", navKids, "md");
      elements.push(navRow);
      kids.push("nav");
    } else if (navKids.length === 1) {
      kids.push(navKids[0]);
    }

    const root = { type: "stack", id: "root", props: { gap: "md" }, children: kids };
    elements.push(root);

    const snap = wrap(elements);
    return addTheme(snap, theme);
  });
}

// ---------------------------------------------------------------------------
// Template: Cheat Sheet
//
// Dense reference page with grouped sections, badges, and optional nav.
// Best for: command references, API docs, quick reference guides.
//
// Slots:
//   title    (string, required) — bold heading
//   sections ({ heading, items: string[] }[], 1-3, required) — grouped content
//   badges   (string[], optional, max 6) — category tags
//   cta      ({ label, action, target }?, optional)
//   theme    (string, optional, default "teal")
// ---------------------------------------------------------------------------

function cheatSheet(slots: {
  title: string;
  sections: { heading: string; items: string[] }[];
  badges?: string[];
  cta?: { label: string; action: string; target: string };
  theme?: string;
}): any {
  const elements: any[] = [];
  const kids: string[] = [];

  // Title
  elements.push(makeText("title", slots.title, { weight: "bold" }));
  kids.push("title");

  // Sections (1-3, each with heading + items)
  // Budget: max 7 root children total. Title takes 1.
  // With 2 sections + separator + badges: 1 + (head + 2items)*2 + sep + badges = too many
  // With 2 sections: allow 1 item each + separator = 1 + 3 + 3 + 1 = 8 → still too many with badges
  // Solution: 2 sections → 1 item each, no separator. 1 section → 3 items.
  const sectionCount = Math.min(slots.sections.length, 3);
  const maxItemsPerSection = sectionCount >= 2 ? 1 : 3;
  for (let si = 0; si < sectionCount; si++) {
    const section = slots.sections[si];
    const prefix = `s${si}`;

    // Section heading
    const headingId = `${prefix}-head`;
    elements.push(makeText(headingId, section.heading, { weight: "bold", size: "sm" }));
    kids.push(headingId);

    // Items (limited by budget)
    const items = section.items.slice(0, maxItemsPerSection);
    items.forEach((item, ii) => {
      const id = `${prefix}-item${ii}`;
      elements.push(makeText(id, `• ${item}`, { size: "sm" }));
      kids.push(id);
    });

    // Separator between sections (not after last, only if room)
    if (si < sectionCount - 1 && kids.length < 6) {
      const sepId = `sep${si}`;
      elements.push(makeSeparator(sepId));
      kids.push(sepId);
    }
  }

  // Badges (optional)
  if (slots.badges?.length && kids.length < 6) {
    const badgeId = addBadges(elements, slots.badges, "badges");
    if (badgeId) kids.push(badgeId);
  }

  // CTA (optional)
  if (slots.cta && kids.length < 7) {
    const btn = makeButton("cta", slots.cta.label, slots.cta.action, { target: slots.cta.target });
    elements.push(btn);
    kids.push("cta");
  }

  const root = { type: "stack", id: "root", props: { gap: "sm" }, children: kids };
  elements.push(root);

  const snap = wrap(elements);
  return addTheme(snap, slots.theme || "teal");
}

// ---------------------------------------------------------------------------
// Template: Comparison
//
// Side-by-side comparison of 2-3 options using item components.
// Best for: tool comparisons, plan tiers, "X vs Y" breakdowns.
//
// Slots:
//   title    (string, required)
//   options  ({ label, description, badge? }[], 2-3, required)
//   cta      ({ label, action, target }?, optional)
//   theme    (string, optional, default "amber")
// ---------------------------------------------------------------------------

function comparison(slots: {
  title: string;
  options: { label: string; description: string; badge?: string }[];
  cta?: { label: string; action: string; target: string };
  theme?: string;
}): any {
  const elements: any[] = [];
  const kids: string[] = [];
  const optCount = Math.min(slots.options.length, 3);

  // Title
  elements.push(makeText("title", slots.title, { weight: "bold" }));
  kids.push("title");

  // Separator
  elements.push(makeSeparator("sep0"));
  kids.push("sep0");

  // Options as items (2-3)
  for (let i = 0; i < optCount; i++) {
    const opt = slots.options[i];
    const itemId = `opt${i}`;
    const itemChildren: string[] = [];

    // Item component
    elements.push({
      type: "item", id: itemId,
      props: { title: opt.label, description: opt.description },
      children: itemChildren,
    });
    kids.push(itemId);

    // Optional badge inside item
    if (opt.badge) {
      const bid = `opt-badge${i}`;
      elements.push(makeBadge(bid, opt.badge));
      itemChildren.push(bid);
    }
  }

  // CTA (optional)
  if (slots.cta && kids.length < 7) {
    const btn = makeButton("cta", slots.cta.label, slots.cta.action, { target: slots.cta.target });
    elements.push(btn);
    kids.push("cta");
  }

  const root = { type: "stack", id: "root", props: { gap: "md" }, children: kids };
  elements.push(root);

  const snap = wrap(elements);
  return addTheme(snap, slots.theme || "amber");
}

// ---------------------------------------------------------------------------
// Template: Resource List
//
// Curated list of tappable items. Each item has a title, description, and link.
// Best for: tool directories, reading lists, link roundups.
//
// Slots:
//   title    (string, required)
//   items    ({ title, description, url }[], 1-4, required) — tappable resources
//   theme    (string, optional, default "green")
// ---------------------------------------------------------------------------

function resourceList(slots: {
  title: string;
  items: { title: string; description: string; url: string }[];
  theme?: string;
}): any {
  const elements: any[] = [];
  const kids: string[] = [];
  const itemCount = Math.min(slots.items.length, 4);

  // Title
  elements.push(makeText("title", slots.title, { weight: "bold" }));
  kids.push("title");

  // Separator
  elements.push(makeSeparator("sep0"));
  kids.push("sep0");

  // Items with open_url actions
  for (let i = 0; i < itemCount; i++) {
    const item = slots.items[i];
    const itemId = `item${i}`;

    elements.push({
      type: "item", id: itemId,
      props: { title: item.title, description: item.description },
      on: { press: { action: "open_url", params: { target: item.url } } },
    });
    kids.push(itemId);
  }

  const root = { type: "stack", id: "root", props: { gap: "md" }, children: kids };
  elements.push(root);

  const snap = wrap(elements);
  return addTheme(snap, slots.theme || "green");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type TemplateName = "explainer" | "tutorial" | "cheat-sheet" | "comparison" | "resource-list";

const TEMPLATES: Record<TemplateName, (slots: any) => any | any[]> = {
  explainer,
  tutorial,
  "cheat-sheet": cheatSheet,
  comparison,
  "resource-list": resourceList,
};

/**
 * Expand a template with given slot values.
 * Returns valid snap JSON (object) or array of snap JSONs (for multi-page templates like tutorial).
 */
export function expand(template: TemplateName, slots: Record<string, any>): any | any[] {
  const fn = TEMPLATES[template];
  if (!fn) throw new Error(`Unknown template: ${template}. Available: ${Object.keys(TEMPLATES).join(", ")}`);
  return fn(slots);
}

/** Get the list of available template names */
export function listTemplates(): TemplateName[] {
  return Object.keys(TEMPLATES) as TemplateName[];
}

/** Get slot schema for a template (for documentation/validation) */
export function getSlotSchema(template: TemplateName): Record<string, { type: string; required: boolean; description: string }> {
  const schemas: Record<TemplateName, Record<string, { type: string; required: boolean; description: string }>> = {
    explainer: {
      title: { type: "string", required: true, description: "Bold heading" },
      points: { type: "string[]", required: true, description: "1-4 key points" },
      badges: { type: "string[]", required: false, description: "Up to 6 keyword tags" },
      cta: { type: "{ label, action, target }", required: false, description: "Call to action button" },
      theme: { type: "string", required: false, description: "Accent color (default: blue)" },
    },
    tutorial: {
      pages: { type: "{ title, body, badges? }[]", required: true, description: "One object per page" },
      theme: { type: "string", required: false, description: "Accent color (default: purple)" },
      loop: { type: "boolean", required: false, description: "Loop back to start at end (default: false)" },
    },
    "cheat-sheet": {
      title: { type: "string", required: true, description: "Bold heading" },
      sections: { type: "{ heading, items: string[] }[]", required: true, description: "1-3 grouped sections" },
      badges: { type: "string[]", required: false, description: "Up to 6 category tags" },
      cta: { type: "{ label, action, target }", required: false, description: "Call to action button" },
      theme: { type: "string", required: false, description: "Accent color (default: teal)" },
    },
    comparison: {
      title: { type: "string", required: true, description: "Bold heading" },
      options: { type: "{ label, description, badge? }[]", required: true, description: "2-3 options to compare" },
      cta: { type: "{ label, action, target }", required: false, description: "Call to action button" },
      theme: { type: "string", required: false, description: "Accent color (default: amber)" },
    },
    "resource-list": {
      title: { type: "string", required: true, description: "Bold heading" },
      items: { type: "{ title, description, url }[]", required: true, description: "1-4 tappable resources" },
      theme: { type: "string", required: false, description: "Accent color (default: green)" },
    },
  };
  return schemas[template];
}
