/**
 * Interactive snap templates
 *
 * These templates produce snap JSON that triggers server-side handlers on POST.
 * They store metadata (template type, config) so the server knows how to handle submissions.
 */

import { makeText, makeSeparator, makeButton, makeBadge, addBadges, makeHorizontalStack, wrap, addTheme, makeInput, makeBarChart, makeProgress } from "./engine.js";

// ---------------------------------------------------------------------------
// Template: Poll
//
// Single-question poll with toggle_group + submit.
// Server tracks votes per FID (one vote per user), returns results on submit.
//
// Slots:
//   question  (string, required) — the poll question
//   options   (string[], 2-4, required) — answer options
//   theme     (string, optional, default "blue")
// ---------------------------------------------------------------------------

export function poll(slots: {
  question: string;
  options: string[];
  theme?: string;
}): { snapJson: any; meta: { template: string; config: Record<string, any> } } {
  const elements: any[] = [];
  const kids: string[] = [];
  const optionCount = Math.min(slots.options.length, 4);

  // Question
  elements.push(makeText("question", slots.question, { weight: "bold" }));
  kids.push("question");

  // Separator
  elements.push(makeSeparator("sep1"));
  kids.push("sep1");

  // Toggle group
  elements.push({
    type: "toggle_group", id: "options",
    props: { name: "vote", options: slots.options.slice(0, optionCount) },
  });
  kids.push("options");

  // Submit button — action is submit, target is self
  elements.push(makeButton("submit", "Vote", "submit", { target: "{{SELF_URL}}" }));
  kids.push("submit");

  // Root
  const root = { type: "stack", id: "root", props: { gap: "md" }, children: kids };
  elements.push(root);

  const snapJson = addTheme(wrap(elements), slots.theme || "blue");
  return {
    snapJson,
    meta: {
      template: "poll",
      config: { options: slots.options.slice(0, optionCount) },
    },
  };
}

// ---------------------------------------------------------------------------
// Template: Poll Results (returned after voting)
//
// Shows vote counts as bar visualization using text elements.
// Called by the poll handler to generate the results page.
// ---------------------------------------------------------------------------

export function pollResults(
  question: string,
  options: string[],
  counts: Record<string, number>,
  userVote: string | null,
  theme: string,
): any {
  const elements: any[] = [];
  const kids: string[] = [];

  elements.push(makeText("question", question, { weight: "bold" }));
  kids.push("question");

  elements.push(makeSeparator("sep1"));
  kids.push("sep1");

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  // Build bar data for native bar_chart (max 6 bars)
  const bars = options.slice(0, 4).map((option) => ({
    label: option + (option === userVote ? " ✓" : ""),
    value: counts[option] || 0,
  }));

  // Use native bar_chart component
  elements.push(makeBarChart("chart", bars));
  kids.push("chart");

  // Total votes
  elements.push(makeText("total", `${total} total vote${total !== 1 ? "s" : ""}`, { size: "sm" }));
  kids.push("total");

  const root = { type: "stack", id: "root", props: { gap: "sm" }, children: kids };
  elements.push(root);

  return addTheme(wrap(elements), theme);
}

// ---------------------------------------------------------------------------
// Template: Quiz
//
// Multi-page quiz with one question per page, submit to reveal answer.
// Tracks score across pages via FID-keyed session.
//
// Slots:
//   baseId    (string, required) — snap ID prefix
//   questions ({ question, options: string[], correct: number }[], 1-5)
//   theme     (string, optional, default "purple")
//   baseUrl   (string, optional)
// ---------------------------------------------------------------------------

export function quiz(slots: {
  baseId: string;
  questions: { question: string; options: string[]; correct: number }[];
  theme?: string;
  baseUrl?: string;
}): { pages: Array<{ snapJson: any; meta: { template: string; config: Record<string, any> } }> } {
  const theme = slots.theme || "purple";
  const baseUrl = slots.baseUrl || "https://snap.mxjxn.com";
  const total = Math.min(slots.questions.length, 5);

  const pages = slots.questions.slice(0, total).map((q, idx) => {
    const elements: any[] = [];
    const kids: string[] = [];

    // Progress
    elements.push(makeText("progress", `Question ${idx + 1} of ${total}`, { size: "sm" }));
    kids.push("progress");

    // Question
    elements.push(makeText("question", q.question, { weight: "bold" }));
    kids.push("question");

    elements.push(makeSeparator("sep1"));
    kids.push("sep1");

    // Toggle group with options
    const optionLabels = q.options.slice(0, 4).map((opt, oi) => `${String.fromCharCode(65 + oi)}. ${opt}`);
    elements.push({
      type: "toggle_group", id: "options",
      props: { name: "answer", options: optionLabels },
    });
    kids.push("options");

    // Submit button
    const isLast = idx === total - 1;
    const nextLabel = isLast ? "See Results →" : "Next Question →";
    const nextTarget = isLast
      ? `${baseUrl}/${slots.baseId}-results`
      : `${baseUrl}/${slots.baseId}-${idx + 1}`;

    elements.push(makeButton("submit", nextLabel, "submit", { target: nextTarget }));
    kids.push("submit");

    const root = { type: "stack", id: "root", props: { gap: "md" }, children: kids };
    elements.push(root);

    const snapJson = addTheme(wrap(elements), theme);
    return {
      snapJson,
      meta: {
        template: "quiz",
        config: { questionIndex: idx, correct: q.correct, total },
      },
    };
  });

  // Results page
  const resultElements: any[] = [];
  const resultKids: string[] = [];

  resultElements.push(makeText("title", "Quiz Complete!", { weight: "bold" }));
  resultKids.push("title");
  resultElements.push(makeSeparator("sep1"));
  resultKids.push("sep1");

  resultElements.push(makeText("score", "Your score will appear here after answering all questions.", { size: "sm" }));
  resultKids.push("score");

  resultElements.push(makeText("share", "Share your results!", { size: "sm" }));
  resultKids.push("share");

  // Compose cast button
  resultElements.push(makeButton("share-btn", "Share Score", "compose_cast", { text: "I just took a quiz on Farcaster! 🧠" }));
  resultKids.push("share-btn");

  // Restart
  resultElements.push(makeButton("restart", "↻ Retake", "submit", { target: `${baseUrl}/${slots.baseId}-0` }, "secondary"));
  resultKids.push("restart");

  const resultRoot = { type: "stack", id: "root", props: { gap: "md" }, children: resultKids };
  resultElements.push(resultRoot);

  const resultJson = addTheme(wrap(resultElements), theme);
  pages.push({
    snapJson: resultJson,
    meta: {
        template: "quiz-results",
        config: { total, baseId: slots.baseId } as any,
    },
  });

  return { pages };
}

// ---------------------------------------------------------------------------
// Template: Claim
//
// Token/NFT claim snap. User taps claim, server records FID, returns confirmation.
// Prevents double-claims via snap_claims table.
//
// Slots:
//   title       (string, required)
//   description (string, required)
//   buttonLabel (string, optional, default "Claim")
//   tokenAction ({ type: "send_token"|"swap_token", params: {} }?, optional)
//   theme       (string, optional, default "green")
// ---------------------------------------------------------------------------

export function claim(slots: {
  title: string;
  description: string;
  buttonLabel?: string;
  tokenAction?: { type: string; params: Record<string, any> };
  theme?: string;
}): { snapJson: any; meta: { template: string; config: Record<string, any> } } {
  const elements: any[] = [];
  const kids: string[] = [];

  elements.push(makeText("title", slots.title, { weight: "bold" }));
  kids.push("title");

  elements.push(makeSeparator("sep1"));
  kids.push("sep1");

  elements.push(makeText("desc", slots.description));
  kids.push("desc");

  // Claim button
  const action = slots.tokenAction || { action: "submit", params: { target: "{{SELF_URL}}" } };
  elements.push({
    type: "button", id: "claim-btn",
    props: { label: slots.buttonLabel || "Claim", variant: "primary" },
    on: { press: action },
  });
  kids.push("claim-btn");

  const root = { type: "stack", id: "root", props: { gap: "md" }, children: kids };
  elements.push(root);

  const snapJson = addTheme(wrap(elements), slots.theme || "green");
  return {
    snapJson,
    meta: {
      template: "claim",
      config: { buttonLabel: slots.buttonLabel || "Claim", tokenAction: slots.tokenAction || null },
    },
  };
}

// ---------------------------------------------------------------------------
// Template: Claimed (returned after claiming)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Template: Tip Jar (client-only — send_token)
//
// Displays a tip prompt with one or more send_token buttons.
// Defaults to USDC on Base. No server handler needed — action is client-side.
//
// Slots:
//   id              (string, required) — snap ID
//   title           (string, optional, default "Tip Jar")
//   description     (string, optional, default "Send a tip!")
//   recipientFid    (number, required) — FID to receive tips
//   tokens          ({ label: string, token: string, amount?: string }[], optional)
//                     — custom tokens (defaults to USDC on Base if omitted)
//   theme           (string, optional, default "purple")
// ---------------------------------------------------------------------------

const DEFAULT_USDC = "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export function tipJar(slots: {
  id: string;
  title?: string;
  description?: string;
  recipientFid: number;
  tokens?: Array<{ label: string; token: string; amount?: string }>;
  theme?: string;
}): { snapJson: any } {
  const elements: any[] = [];
  const kids: string[] = [];
  const theme = slots.theme || "purple";
  const title = slots.title || "Tip Jar";
  const desc = slots.description || "Send a tip to support this creator!";

  const tokens = slots.tokens || [
    { label: "Tip USDC", token: DEFAULT_USDC },
  ];

  elements.push(makeText("title", title, { weight: "bold" }));
  kids.push("title");

  elements.push(makeSeparator("sep1"));
  kids.push("sep1");

  elements.push(makeText("desc", desc));
  kids.push("desc");

  // Token buttons (up to 3)
  tokens.slice(0, 3).forEach((t, i) => {
    const params: Record<string, any> = {
      token: t.token,
      recipientFid: slots.recipientFid,
    };
    // Normalize amount to smallest-unit string.
    // Warpcast interprets amount as the token's smallest unit (wei-adjacent).
    // USDC has 6 decimals, so "1" = 0.000001 USDC.
    // If the caller passes a human-readable amount (e.g., "5" for $5 USDC),
    // convert to smallest unit: multiply by 10^decimals.
    // Heuristic: if amount is < 1000, assume it's human-readable dollars.
    // If >= 1000 (or has no decimal point and is large), assume it's already in smallest units.
    if (t.amount) {
      const num = parseFloat(t.amount);
      if (!isNaN(num) && Number.isFinite(num)) {
        // Detect if already in smallest units (>1000 or matches USDC magnitude)
        const rawAmount = t.amount.replace(/[._]/g, '');
        const alreadySmallestUnit = rawAmount.length > 3;
        if (alreadySmallestUnit) {
          params.amount = String(Math.floor(num));
        } else {
          // Convert human-readable to smallest unit (USDC = 6 decimals)
          const smallestUnit = Math.floor(num * 1_000_000);
          params.amount = String(smallestUnit);
        }
      } else {
        params.amount = t.amount;
      }
    }

    const id = `tip-btn-${i}`;
    elements.push({
      type: "button", id,
      props: { label: t.label, variant: i === 0 ? "primary" : "secondary" },
      on: { press: { action: "send_token", params } },
    });
    kids.push(id);
  });

  const root = { type: "stack", id: "root", props: { gap: "md" }, children: kids };
  elements.push(root);

  const snapJson = addTheme(wrap(elements), theme);
  return { snapJson };
}

// ---------------------------------------------------------------------------
// Template: Token Buy (client-only — swap_token)
//
// Displays a token with a swap button to buy it.
// No server handler needed — action is client-side.
//
// Slots:
//   id              (string, required) — snap ID
//   title           (string, required) — token name
//   description     (string, optional) — token description (max 160 chars)
//   buyToken        (string, required) — CAIP-19 token ID to buy
//   sellToken       (string, optional) — CAIP-19 token to sell (default: native ETH)
//   buttonLabel     (string, optional, default "Buy {title}")
//   badges          (string[], optional, max 3)
//   theme           (string, optional, default "green")
// ---------------------------------------------------------------------------

export function tokenBuy(slots: {
  id: string;
  title: string;
  description?: string;
  buyToken: string;
  sellToken?: string;
  buttonLabel?: string;
  badges?: string[];
  theme?: string;
}): { snapJson: any } {
  const elements: any[] = [];
  const kids: string[] = [];
  const theme = slots.theme || "green";

  elements.push(makeText("title", slots.title, { weight: "bold" }));
  kids.push("title");

  elements.push(makeSeparator("sep1"));
  kids.push("sep1");

  if (slots.description) {
    elements.push(makeText("desc", slots.description, { size: "sm" }));
    kids.push("desc");
  }

  // Badges (max 3, horizontal row)
  if (slots.badges && slots.badges.length > 0) {
    const badgeKids = slots.badges.slice(0, 3).map((label, i) => {
      const id = `badge-${i}`;
      elements.push(makeBadge(id, label));
      return id;
    });
    elements.push(makeHorizontalStack("badges", badgeKids));
    kids.push("badges");
  }

  // Buy button
  const params: Record<string, any> = { buyToken: slots.buyToken };
  if (slots.sellToken) params.sellToken = slots.sellToken;

  elements.push({
    type: "button", id: "buy-btn",
    props: { label: slots.buttonLabel || `Buy ${slots.title}`, variant: "primary" },
    on: { press: { action: "swap_token", params } },
  });
  kids.push("buy-btn");

  const root = { type: "stack", id: "root", props: { gap: "md" }, children: kids };
  elements.push(root);

  const snapJson = addTheme(wrap(elements), theme);
  return { snapJson };
}

// ---------------------------------------------------------------------------
// Template: Token Showcase (client-only — view_token + optional actions)
//
// Displays a token with view_token button and optional swap/send buttons.
// No server handler needed — all actions are client-side.
//
// Slots:
//   id              (string, required) — snap ID
//   title           (string, required) — token name
//   description     (string, optional) — token description
//   token           (string, required) — CAIP-19 token ID
//   actions         ({ type: "swap_token"|"send_token", label: string, params: {} }[], optional)
//   badges          (string[], optional, max 3)
//   theme           (string, optional, default "blue")
// ---------------------------------------------------------------------------

export function tokenShowcase(slots: {
  id: string;
  title: string;
  description?: string;
  token: string;
  actions?: Array<{ type: string; label: string; params: Record<string, any> }>;
  badges?: string[];
  theme?: string;
}): { snapJson: any } {
  const elements: any[] = [];
  const kids: string[] = [];
  const theme = slots.theme || "blue";

  elements.push(makeText("title", slots.title, { weight: "bold" }));
  kids.push("title");

  elements.push(makeSeparator("sep1"));
  kids.push("sep1");

  if (slots.description) {
    elements.push(makeText("desc", slots.description, { size: "sm" }));
    kids.push("desc");
  }

  // Badges
  if (slots.badges && slots.badges.length > 0) {
    const badgeKids = slots.badges.slice(0, 3).map((label, i) => {
      const id = `badge-${i}`;
      elements.push(makeBadge(id, label));
      return id;
    });
    elements.push(makeHorizontalStack("badges", badgeKids));
    kids.push("badges");
  }

  // View token button (always primary)
  elements.push({
    type: "button", id: "view-btn",
    props: { label: "View Token", variant: "primary" },
    on: { press: { action: "view_token", params: { token: slots.token } } },
  });
  kids.push("view-btn");

  // Optional extra actions (max 2 more — stay within 7 root children)
  const extraActions = slots.actions?.slice(0, 2) || [];
  extraActions.forEach((a, i) => {
    const id = `action-${i}`;
    elements.push({
      type: "button", id,
      props: { label: a.label, variant: "secondary" },
      on: { press: { action: a.type, params: a.params } },
    });
    kids.push(id);
  });

  const root = { type: "stack", id: "root", props: { gap: "md" }, children: kids };
  elements.push(root);

  const snapJson = addTheme(wrap(elements), theme);
  return { snapJson };
}

// ---------------------------------------------------------------------------
// Template: Rating (slider + submit)
//
// Single-item rating snap. User drags a slider and submits.
// Server tracks per-FID ratings (one per user), shows average after rating.
//
// Slots:
//   subject   (string, required) — what's being rated (e.g. "Base chain UX")
//   min       (number, optional, default 1)
//   max       (number, optional, default 10)
//   step      (number, optional, default 1)
//   label     (string, optional, default "{subject} ({min}–{max})")
//   theme     (string, optional, default "amber")
// ---------------------------------------------------------------------------

export function rating(slots: {
  id?: string;
  subject: string;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  theme?: string;
}): { snapJson: any; meta: { template: string; config: Record<string, any> } } {
  const elements: any[] = [];
  const kids: string[] = [];
  const theme = slots.theme || "amber";
  const min = slots.min ?? 1;
  const max = slots.max ?? 10;
  const step = slots.step ?? 1;
  const label = slots.label || `${slots.subject} (${min}–${max})`;

  // Subject
  elements.push(makeText("subject", slots.subject, { weight: "bold" }));
  kids.push("subject");

  elements.push(makeSeparator("sep1"));
  kids.push("sep1");

  // Slider
  elements.push({
    type: "slider", id: "rating-slider",
    props: { name: "rating", label, min, max, step, showValue: true },
  });
  kids.push("rating-slider");

  // Submit button
  elements.push(makeButton("submit", "Rate", "submit", { target: "{{SELF_URL}}" }));
  kids.push("submit");

  const root = { type: "stack", id: "root", props: { gap: "md" }, children: kids };
  elements.push(root);

  const snapJson = addTheme(wrap(elements), theme);
  return {
    snapJson,
    meta: {
      template: "rating",
      config: { subject: slots.subject, min, max, step },
    },
  };
}

// ---------------------------------------------------------------------------
// Template: Rating Results (returned after rating)
//
// Shows average rating and count as text visualization.
// ---------------------------------------------------------------------------

export function ratingResults(
  subject: string,
  avg: number,
  count: number,
  userRating: number | null,
  min: number,
  max: number,
  theme: string,
): any {
  const elements: any[] = [];
  const kids: string[] = [];

  elements.push(makeText("subject", subject, { weight: "bold" }));
  kids.push("subject");

  elements.push(makeSeparator("sep1"));
  kids.push("sep1");

  // Average display with native progress bar
  const normalizedValue = Math.round(((avg - min) / (max - min)) * 100);
  elements.push(makeText("avg-label", `${avg.toFixed(1)} / ${max}`, { size: "md" }));
  kids.push("avg-label");

  elements.push(makeProgress("avg-bar", normalizedValue, 100, `${avg.toFixed(1)} average`));
  kids.push("avg-bar");

  const userNote = userRating !== null ? `Your rating: ${userRating}` : "Be the first to rate!";
  elements.push(makeText("user-note", userNote, { size: "sm" }));
  kids.push("user-note");

  elements.push(makeText("count", `${count} rating${count !== 1 ? "s" : ""}`, { size: "sm" }));
  kids.push("count");

  const root = { type: "stack", id: "root", props: { gap: "sm" }, children: kids };
  elements.push(root);

  return addTheme(wrap(elements), theme);
}

// ---------------------------------------------------------------------------
// Template: Claimed (returned after claiming)
// ---------------------------------------------------------------------------

export function claimed(title: string, description: string, claimCount: number, theme: string): any {
  const elements: any[] = [];
  const kids: string[] = [];

  elements.push(makeText("title", "✅ Claimed!", { weight: "bold" }));
  kids.push("title");

  elements.push(makeSeparator("sep1"));
  kids.push("sep1");

  elements.push(makeText("desc", `${title}\n${description}`));
  kids.push("desc");

  elements.push(makeText("count", `${claimCount} total claim${claimCount !== 1 ? "s" : ""}`, { size: "sm" }));
  kids.push("count");

  elements.push(makeText("share-label", "Share that you claimed!", { size: "sm" }));
  kids.push("share-label");

  elements.push(makeButton("share", "Share Claim", "compose_cast", { text: `I just claimed ${title}! 🎉` }));
  kids.push("share");

  const root = { type: "stack", id: "root", props: { gap: "md" }, children: kids };
  elements.push(root);

  return addTheme(wrap(elements), theme);
}

// ---------------------------------------------------------------------------
// Template: Text Entry (input + submit)
//
// Free-text input snap. User types a response, server stores it, shows confirmation.
// Supports single or multiple input fields. Per-FID dedup on submission.
//
// Slots:
//   prompt        (string, required) — what to ask the user
//   inputName     (string, optional, default "response") — POST input key
//   inputType     (string, optional, default "text") — "text" or "number"
//   placeholder   (string, optional) — placeholder text (max 60 chars)
//   maxLength     (number, optional) — max input length (1-280)
//   buttonLabel   (string, optional, default "Submit")
//   theme         (string, optional, default "teal")
// ---------------------------------------------------------------------------

export function textEntry(slots: {
  prompt: string;
  inputName?: string;
  inputType?: "text" | "number";
  placeholder?: string;
  maxLength?: number;
  buttonLabel?: string;
  theme?: string;
}): { snapJson: any; meta: { template: string; config: Record<string, any> } } {
  const elements: any[] = [];
  const kids: string[] = [];
  const theme = slots.theme || "teal";
  const inputName = slots.inputName || "response";

  // Prompt
  elements.push(makeText("prompt", slots.prompt, { weight: "bold" }));
  kids.push("prompt");

  elements.push(makeSeparator("sep1"));
  kids.push("sep1");

  // Input field
  const inputProps: Record<string, any> = { name: inputName, label: slots.prompt };
  if (slots.inputType) inputProps.type = slots.inputType;
  if (slots.placeholder) inputProps.placeholder = slots.placeholder;
  if (slots.maxLength) inputProps.maxLength = slots.maxLength;

  elements.push(makeInput("field", inputName, inputProps));
  kids.push("field");

  // Submit button
  elements.push(makeButton("submit", slots.buttonLabel || "Submit", "submit", { target: "{{SELF_URL}}" }));
  kids.push("submit");

  const root = { type: "stack", id: "root", props: { gap: "md" }, children: kids };
  elements.push(root);

  const snapJson = addTheme(wrap(elements), theme);
  return {
    snapJson,
    meta: {
      template: "text-entry",
      config: { inputName, prompt: slots.prompt },
    },
  };
}

// ---------------------------------------------------------------------------
// Template: Text Entry Results (returned after submission)
// ---------------------------------------------------------------------------

export function textEntryResults(
  prompt: string,
  userResponse: string,
  submissionCount: number,
  theme: string,
): any {
  const elements: any[] = [];
  const kids: string[] = [];

  elements.push(makeText("title", "✅ Submitted!", { weight: "bold" }));
  kids.push("title");

  elements.push(makeSeparator("sep1"));
  kids.push("sep1");

  elements.push(makeText("prompt-label", prompt, { size: "sm" }));
  kids.push("prompt-label");

  elements.push(makeText("response", `"${userResponse}"`));
  kids.push("response");

  elements.push(makeText("count", `${submissionCount} response${submissionCount !== 1 ? "s" : ""}`, { size: "sm" }));
  kids.push("count");

  const root = { type: "stack", id: "root", props: { gap: "sm" }, children: kids };
  elements.push(root);

  return addTheme(wrap(elements), theme);
}
