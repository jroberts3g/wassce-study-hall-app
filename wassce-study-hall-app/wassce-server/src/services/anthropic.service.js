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

module.exports = { complete, isMockMode };
