/**
 * Snap handler router
 *
 * Intercepts POST /:id for interactive snaps (polls, quizzes, claims, forms).
 * Checks snap_meta for the template type, dispatches to the appropriate handler.
 * Returns dynamically generated snap JSON as the response.
 */

import { getSnapMeta, castVote, getVoteCounts, hasVoted, submitForm, claimSnap, hasClaimed, getClaimCount, checkRateLimit, castRating, getRatingStats, getUserRating, getSubmissionCount } from "./handlers.js";
import { pollResults, claimed, ratingResults, textEntryResults } from "./templates/interactive.js";
import { getSnapState, setSnapState, getSnap } from "./db.js";
import { validateSnapResponse } from "@farcaster/snap";

export interface HandlerResult {
  snapJson: any;
  headers?: Record<string, string>;
}

/**
 * Route a POST submission to the appropriate handler.
 * Returns null if the snap has no handler (falls through to default behavior).
 */
export async function handleSnapPost(
  snapId: string,
  fid: number,
  inputs: Record<string, string>,
  buttonIndex: number,
): Promise<HandlerResult | null> {
  const meta = getSnapMeta(snapId);
  if (!meta) return null;

  // Rate limit check
  const rateCheck = checkRateLimit(snapId, fid, "submit", 10);
  if (!rateCheck.allowed) {
    return {
      snapJson: makeErrorSnap(`Too fast! Try again in ${rateCheck.retryAfter}s.`),
    };
  }

  switch (meta.template) {
    case "poll":
      return handlePoll(snapId, fid, inputs, meta.config as any);
    case "quiz":
      return handleQuiz(snapId, fid, inputs, meta.config as any);
    case "quiz-results":
      return handleQuizResults(snapId, fid, meta.config as any);
    case "claim":
      return handleClaim(snapId, fid, inputs, meta.config as any);
    case "rating":
      return handleRating(snapId, fid, inputs, meta.config as any);
    case "text-entry":
      return handleTextEntry(snapId, fid, inputs, meta.config as any);
    case "form":
      return handleForm(snapId, fid, inputs, meta.config as any);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Poll handler
// ---------------------------------------------------------------------------

function handlePoll(
  snapId: string,
  fid: number,
  inputs: Record<string, string>,
  config: { options: string[] },
): HandlerResult {
  const vote = inputs.vote;
  if (!vote) {
    return { snapJson: makeErrorSnap("Please select an option.") };
  }

  const result = castVote(snapId, vote, fid);
  const counts = getVoteCounts(snapId);
  const userVote = hasVoted(snapId, fid);

  // Get theme from original snap
  const snap = getSnap(snapId);
  const theme = snap ? (JSON.parse(snap.json).theme?.accent || "blue") : "blue";

  const resultsJson = pollResults(
    // Extract question from original snap (first text element)
    snap ? getFirstTextContent(snap.json) || "Poll Results" : "Poll Results",
    config.options,
    counts,
    userVote,
    theme,
  );

  return { snapJson: resultsJson };
}

// ---------------------------------------------------------------------------
// Quiz handler
// ---------------------------------------------------------------------------

function handleQuiz(
  snapId: string,
  fid: number,
  inputs: Record<string, string>,
  config: { questionIndex: number; correct: number; total: number },
): HandlerResult {
  const answer = inputs.answer;
  if (!answer) {
    return { snapJson: makeErrorSnap("Please select an answer.") };
  }

  // Parse the selected option (e.g., "A. Option text" → index 0)
  const selectedLetter = answer.charAt(0);
  const selectedIndex = selectedLetter.charCodeAt(0) - 65;
  const isCorrect = selectedIndex === config.correct;

  // Track score in state: quiz_score = "2/5" format
  const state = getSnapState(snapId, fid);
  const currentScore = parseInt(state.quiz_score?.split("/")[0] || "0", 10);
  const newScore = isCorrect ? currentScore + 1 : currentScore;
  setSnapState(snapId, fid, "quiz_score", `${newScore}/${config.total}`);
  setSnapState(snapId, fid, `q${config.questionIndex}`, isCorrect ? "correct" : "wrong");

  // Store answer for this question
  setSnapState(snapId, fid, `answer${config.questionIndex}`, answer);

  // Return the same page (snap JSON stays the same — state accumulates)
  return null as any; // Let default handler re-serve the snap with updated state
}

function handleQuizResults(
  snapId: string,
  fid: number,
  config: { total: number; baseId: string },
): HandlerResult {
  const state = getSnapState(snapId, fid);
  const scoreParts = (state.quiz_score || "0/" + config.total).split("/");
  const correct = parseInt(scoreParts[0], 10);
  const total = parseInt(scoreParts[1], 10);

  // Build a results snap dynamically
  const pct = Math.round((correct / total) * 100);
  const emoji = pct >= 80 ? "🏆" : pct >= 60 ? "👍" : pct >= 40 ? "🤔" : "📚";

  const elements: any[] = [];
  const kids: string[] = [];

  elements.push({ type: "text", id: "title", props: { content: `${emoji} Quiz Complete!`, weight: "bold" } });
  kids.push("title");
  elements.push({ type: "separator", id: "sep1", props: {} });
  kids.push("sep1");
  elements.push({ type: "text", id: "score", props: { content: `You scored ${correct} out of ${total} (${pct}%)`, size: "md" } });
  kids.push("score");
  elements.push({ type: "text", id: "share-text", props: { content: "Share your results!", size: "sm" } });
  kids.push("share-text");

  const baseUrl = "https://snap.mxjxn.com";
  elements.push({
    type: "button", id: "share-btn",
    props: { label: "Share Score", variant: "primary" },
    on: { press: { action: "compose_cast", params: { text: `I scored ${correct}/${total} (${pct}%) on a Farcaster quiz! ${emoji} Can you beat me?` } } },
  });
  kids.push("share-btn");

  elements.push({
    type: "button", id: "restart",
    props: { label: "↻ Retake", variant: "secondary" },
    on: { press: { action: "submit", params: { target: `${baseUrl}/${config.baseId}-0` } } },
  });
  kids.push("restart");

  const root = { type: "stack", id: "root", props: { gap: "md" }, children: kids };
  elements.push(root);

  const snapJson = {
    version: "2.0",
    theme: { accent: "purple" },
    ui: { root: "root", elements: Object.fromEntries(elements.map((e: any) => { const { id, ...rest } = e; return [id, rest]; })) },
  };

  return { snapJson };
}

// ---------------------------------------------------------------------------
// Claim handler
// ---------------------------------------------------------------------------

function handleClaim(
  snapId: string,
  fid: number,
  _inputs: Record<string, string>,
  config: { buttonLabel: string; tokenAction: any },
): HandlerResult {
  const result = claimSnap(snapId, fid);
  const claimCount = getClaimCount(snapId);

  const snap = getSnap(snapId);
  const theme = snap ? (JSON.parse(snap.json).theme?.accent || "green") : "green";
  const title = snap ? getFirstTextContent(snap.json) || "Claim" : "Claim";
  const desc = snap ? getSecondTextContent(snap.json) || "" : "";

  if (result.already) {
    return {
      snapJson: claimed(title, desc, claimCount, theme),
    };
  }

  // If there's a token action (send_token/swap_token), include it in the response
  const snapJson = claimed(title, desc, claimCount, theme);
  if (config.tokenAction) {
    // Attach the token action to the claim button so the client executes it
    // We can't easily modify the existing snap, so return as-is for now
    // The token action was already in the original snap's button
  }

  return { snapJson };
}

// ---------------------------------------------------------------------------
// Rating handler
// ---------------------------------------------------------------------------

function handleRating(
  snapId: string,
  fid: number,
  inputs: Record<string, string>,
  config: { subject: string; min: number; max: number; step: number },
): HandlerResult {
  const ratingVal = parseFloat(inputs.rating);
  if (isNaN(ratingVal)) {
    return { snapJson: makeErrorSnap("Please select a rating.") };
  }

  const result = castRating(snapId, ratingVal, fid);
  const userRating = getUserRating(snapId, fid);

  // Get theme from original snap
  const snap = getSnap(snapId);
  const theme = snap ? (JSON.parse(snap.json).theme?.accent || "amber") : "amber";

  const resultsJson = ratingResults(
    config.subject,
    result.avg,
    result.count,
    userRating,
    config.min,
    config.max,
    theme,
  );

  return { snapJson: resultsJson };
}

// ---------------------------------------------------------------------------
// Text Entry handler
// ---------------------------------------------------------------------------

function handleTextEntry(
  snapId: string,
  fid: number,
  inputs: Record<string, string>,
  config: { inputName: string; prompt: string },
): HandlerResult {
  const response = inputs[config.inputName];
  if (!response || !response.trim()) {
    return { snapJson: makeErrorSnap("Please enter a response.") };
  }

  // Store submission (per-FID dedup is handled by re-serving on repeat)
  submitForm(snapId, fid, { [config.inputName]: response.trim() });
  const count = getSubmissionCount(snapId);

  // Get theme from original snap
  const snap = getSnap(snapId);
  const theme = snap ? (JSON.parse(snap.json).theme?.accent || "teal") : "teal";

  const resultsJson = textEntryResults(config.prompt, response.trim(), count, theme);
  return { snapJson: resultsJson };
}

// ---------------------------------------------------------------------------
// Form handler (generic)
// ---------------------------------------------------------------------------

function handleForm(
  snapId: string,
  fid: number,
  inputs: Record<string, string>,
  _config: Record<string, any>,
): HandlerResult {
  submitForm(snapId, fid, inputs);

  // Build a confirmation snap
  const elements: any[] = [];
  const kids: string[] = [];

  elements.push({ type: "text", id: "title", props: { content: "✅ Submitted!", weight: "bold" } });
  kids.push("title");
  elements.push({ type: "separator", id: "sep1", props: {} });
  kids.push("sep1");

  // Show submitted values
  const entries = Object.entries(inputs).slice(0, 4);
  entries.forEach(([key, value], i) => {
    elements.push({ type: "text", id: `val${i}`, props: { content: `${key}: ${value}`, size: "sm" } });
    kids.push(`val${i}`);
  });

  const root = { type: "stack", id: "root", props: { gap: "md" }, children: kids };
  elements.push(root);

  const snapJson = {
    version: "2.0",
    theme: { accent: "green" },
    ui: { root: "root", elements: Object.fromEntries(elements.map((e: any) => { const { id, ...rest } = e; return [id, rest]; })) },
  };

  return { snapJson };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeErrorSnap(message: string): any {
  const elements: any[] = [];
  const kids: string[] = [];

  elements.push({ type: "text", id: "title", props: { content: "⚠️ Oops", weight: "bold" } });
  kids.push("title");
  elements.push({ type: "separator", id: "sep1", props: {} });
  kids.push("sep1");
  elements.push({ type: "text", id: "msg", props: { content: message } });
  kids.push("msg");

  const root = { type: "stack", id: "root", props: { gap: "md" }, children: kids };
  elements.push(root);

  return {
    version: "2.0",
    theme: { accent: "red" },
    ui: { root: "root", elements: Object.fromEntries(elements.map((e: any) => { const { id, ...rest } = e; return [id, rest]; })) },
  };
}

function getFirstTextContent(json: string): string | null {
  try {
    const snap = JSON.parse(json);
    const textEl = Object.values(snap.ui?.elements || {}).find((e: any) => e.type === "text");
    return (textEl as any)?.props?.content || null;
  } catch { return null; }
}

function getSecondTextContent(json: string): string | null {
  try {
    const snap = JSON.parse(json);
    const textEls = Object.values(snap.ui?.elements || {}).filter((e: any) => e.type === "text");
    return textEls.length > 1 ? (textEls[1] as any)?.props?.content || null : null;
  } catch { return null; }
}
