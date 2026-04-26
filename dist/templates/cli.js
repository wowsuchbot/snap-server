#!/usr/bin/env tsx
/**
 * Snap template CLI — expand a template and optionally deploy
 *
 * Usage:
 *   tsx src/templates/cli.ts explainer --json '{"title":"Why L2?","points":["Batched txs","Lower gas"]}'
 *   tsx src/templates/cli.ts tutorial --json '{"pages":[{"title":"Step 1","body":"Do X"}]}'
 *   tsx src/templates/cli.ts list
 *   tsx src/templates/cli.ts schema explainer
 */
import { expand, listTemplates, getSlotSchema } from "./engine.js";
const args = process.argv.slice(2);
const command = args[0];
if (!command || command === "help" || command === "--help") {
    console.log("Usage:");
    console.log("  tsx src/templates/cli.ts list");
    console.log("  tsx src/templates/cli.ts schema <template>");
    console.log("  tsx src/templates/cli.ts <template> --json '<slot-json>'");
    console.log("");
    console.log("Templates:", listTemplates().join(", "));
    process.exit(0);
}
if (command === "list") {
    for (const t of listTemplates()) {
        const schema = getSlotSchema(t);
        const required = Object.values(schema).filter(s => s.required).map(s => s.type).join(", ");
        console.log(`  ${t}: ${required}`);
    }
    process.exit(0);
}
if (command === "schema") {
    const template = args[1];
    if (!template) {
        console.error("Missing template name");
        process.exit(1);
    }
    const schema = getSlotSchema(template);
    console.log(JSON.stringify(schema, null, 2));
    process.exit(0);
}
// Expand template
const template = command;
const jsonFlagIdx = args.indexOf("--json");
if (jsonFlagIdx === -1 || !args[jsonFlagIdx + 1]) {
    console.error("Usage: tsx src/templates/cli.ts <template> --json '<slot-json>'");
    process.exit(1);
}
const slots = JSON.parse(args[jsonFlagIdx + 1]);
try {
    const result = expand(template, slots);
    const pages = Array.isArray(result) ? result : [result];
    pages.forEach((page, i) => {
        if (pages.length > 1)
            console.log(`\n--- Page ${i} ---`);
        console.log(JSON.stringify(page, null, 2));
    });
}
catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
}
