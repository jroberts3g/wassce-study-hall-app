const fetch = require("node-fetch");

/**
 * Server-side Anthropic API calls.
 *
 * The Claude-artifact version of this project could call
 * api.anthropic.com directly from the browser for free, with no API
 * key — that's a convenience specific to running inside a Claude.ai
 * artifact and doesn't exist for an ordinary web app. A standalone
 * frontend must never hold an Anthropic API key client-side (same
 * reasoning as Modem Pay's secret key), so this route exists to make
 * the call on the frontend's behalf.
 *
 * Get a key at https://console.anthropic.com — put it in .env as
 * ANTHROPIC_API_KEY. Until you do, this runs in a clearly-labelled
 * mock mode so you can verify the rest of the app (auth, payments,
 * subscriptions) without paying for API usage first.
 */

const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const isMockMode = () => !API_KEY;

function mockQuizJson() {
  return JSON.stringify({
    questions: [
      {
        id: "q1",
        prompt: "[Mock question — set ANTHROPIC_API_KEY for real ones] 2 + 2 = ?",
        options: [
          { id: "a", text: "3" },
          { id: "b", text: "4" },
          { id: "c", text: "5" },
          { id: "d", text: "6" },
        ],
        correct_option_id: "b",
        explanation: "This is a placeholder question shown because no ANTHROPIC_API_KEY is set.",
      },
      {
        id: "q2",
        prompt: "[Mock question] Which of these is a prime number?",
        options: [
          { id: "a", text: "9" },
          { id: "b", text: "15" },
          { id: "c", text: "7" },
          { id: "d", text: "21" },
        ],
        correct_option_id: "c",
        explanation: "7 is only divisible by 1 and itself.",
      },
    ],
  });
}

async function complete({ system, messages, maxTokens = 1000 }) {
  if (isMockMode()) {
    const looksLikeQuizRequest = /valid JSON/i.test(system || "");
    const text = looksLikeQuizRequest
      ? mockQuizJson()
      : "This is a placeholder response from the study guide. Set ANTHROPIC_API_KEY in your .env file to get real AI tutoring, quiz questions, and reports.";
    return { text, mock: true };
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    const message = (body && body.error && body.error.message) || "Anthropic API request failed";
    throw new Error(message);
  }

  const text = (body.content || [])
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n");

  return { text, mock: false };
}

/**
 * Generates an educational SVG diagram for a given concept (e.g.
 * "the nitrogen cycle", "cross-section of a plant cell"). Returns
 * raw SVG markup as text — the caller is responsible for caching and
 * for sanitizing before ever rendering it in a browser (this
 * function does not sanitize; see diagrams.routes.js).
 *
 * Reuses complete() rather than a separate API-calling path — same
 * mock-mode behavior, same error handling.
 */
async function generateDiagram(concept) {
  if (isMockMode()) {
    return {
      svg: `<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="400" fill="#FBF7EE"/><text x="400" y="190" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#6B5518">[Mock diagram]</text><text x="400" y="220" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#8A8770">Set ANTHROPIC_API_KEY for a real generated diagram of: ${concept.replace(/[<>&]/g, "")}</text></svg>`,
      mock: true,
    };
  }

  const { text } = await complete({
    system:
      "You are generating a single educational diagram as raw SVG markup, for a student studying West African secondary school (WASSCE) subjects. " +
      "Output ONLY the SVG markup itself — starting with <svg and ending with </svg> — with no markdown code fences, no explanation before or after, no XML declaration. " +
      "Use viewBox=\"0 0 800 600\" (or similar 4:3-ish proportions). Use only basic SVG shapes (rect, circle, ellipse, line, path, polygon, text) and clean, high-contrast colors suitable for a study aid on a light background. " +
      "Label every key part with <text> elements — labels are the point of an educational diagram. " +
      "For a cycle or pathway, use arrows (simple line/path shapes) to show direction and flow between labeled stages. " +
      "Never include <script>, <foreignObject>, <iframe>, external image references, or any event-handler attributes (onclick, onload, etc). " +
      "Never include real or placeholder personal data. This is the entire response — do not add commentary.",
    messages: [{ role: "user", content: `Diagram this for a WASSCE study aid: ${concept}` }],
    maxTokens: 3000,
  });

  return { svg: extractSvg(text), mock: false };
}

/**
 * Extracts the actual <svg>...</svg> content from a model response,
 * regardless of whatever wraps it. Despite explicit instructions not
 * to, models frequently wrap structured output like this in markdown
 * code fences (```svg ... ```) or add a stray sentence before/after —
 * the exact same failure mode this codebase already had to handle
 * for quiz JSON (see stripJsonFence in the frontend). Simple fence-
 * stripping isn't quite enough on its own (it doesn't handle a
 * preamble sentence with no fence at all), so this extracts from the
 * first "<svg" to the last "</svg>" directly — robust to both cases,
 * and to any combination of them.
 */
function extractSvg(text) {
  const start = text.search(/<svg[\s>]/i);
  const end = text.toLowerCase().lastIndexOf("</svg>");
  if (start === -1 || end === -1 || end < start) {
    return text.trim(); // nothing recognizable — let the caller's own validation reject this
  }
  return text.slice(start, end + "</svg>".length).trim();
}

module.exports = { complete, isMockMode, generateDiagram };
