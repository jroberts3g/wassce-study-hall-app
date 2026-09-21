const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { getSubject } = require("../data/subjects");
const anthropic = require("../services/anthropic.service");
const subscriptionService = require("../services/subscription.service");

const router = express.Router();

// A real DOM implementation is required for DOMPurify's SVG profile
// to work server-side (Node has no native DOM). This renders
// LLM-generated SVG through the same sanitization class of tool used
// for any other untrusted-content-into-a-browser problem — treating
// it as untrusted even though it's our own paid API call, since the
// output ultimately gets rendered directly in students' browsers.
//
// dompurify's CJS build checks a GLOBAL `window` at require()-time,
// before there's any chance to pass in a jsdom instance — so the
// jsdom window has to be installed as globals first, then dompurify
// required afterward. Requiring dompurify first (or skipping the
// globals) throws "ReferenceError: window is not defined" even
// though a window is passed to createDOMPurify() correctly.
const { JSDOM } = require("jsdom");
const dom = new JSDOM("");
global.window = dom.window;
global.document = dom.window.document;
const createDOMPurify = require("dompurify");
const DOMPurify = createDOMPurify(dom.window);

function sanitizeSvg(rawSvg) {
  // Defense in depth beyond DOMPurify's own defaults: explicitly
  // forbid tags/attributes that have no legitimate place in an
  // educational diagram, even ones DOMPurify's SVG profile might
  // otherwise tolerate.
  return DOMPurify.sanitize(rawSvg, {
    USE_PROFILES: { svg: true, svgFilters: false },
    FORBID_TAGS: ["script", "foreignObject", "iframe", "use", "image", "a"],
    FORBID_ATTR: ["onload", "onclick", "onerror", "href", "xlink:href"],
  });
}

function normalizeConcept(concept) {
  return String(concept || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * GET /diagrams?subjectId=..&topicId=..&concept=..
 * Requires an active subscription for subjectId — same gate as
 * assessments, since a diagram is study content like any other.
 * Cached by normalized concept text: the first student to request
 * "nitrogen cycle" pays the (one-time) generation cost and latency;
 * everyone after gets the cached SVG instantly.
 */
router.get("/", requireAuth, async (req, res) => {
  const { subjectId, topicId, concept } = req.query;

  if (!subjectId || !concept) {
    return res.status(400).json({ error: "subjectId and concept are required" });
  }
  const subject = getSubject(subjectId);
  if (!subject) return res.status(404).json({ error: "Unknown subject" });

  const conceptKey = normalizeConcept(concept);
  if (!conceptKey || conceptKey.length > 200) {
    return res.status(400).json({ error: "concept must be 1-200 characters" });
  }

  const user = await db.get("SELECT country_id FROM users WHERE id = $1", [req.userId]);
  const sub = await subscriptionService.getSubscription(req.userId, user.country_id, subjectId);
  const hasAccess = !!sub && sub.status === "active" && Number(sub.expires_at) > Date.now();
  if (!hasAccess) {
    return res.status(403).json({ error: "No active subscription for this subject" });
  }

  const cached = await db.get("SELECT * FROM diagrams WHERE concept_key = $1", [conceptKey]);
  if (cached) {
    return res.json({ svg: cached.svg, concept: cached.concept, mock: !!cached.mock, cached: true });
  }

  try {
    const { svg: rawSvg, mock } = await anthropic.generateDiagram(concept);
    const svg = sanitizeSvg(rawSvg);

    if (!svg.startsWith("<svg")) {
      // The model didn't return usable SVG (rare, but shouldn't ever
      // be cached or shown as if it were a real diagram).
      return res.status(502).json({ error: "Could not generate a usable diagram for this concept. Try rephrasing it." });
    }

    await db.run(
      `INSERT INTO diagrams (id, concept_key, concept, subject_id, topic_id, svg, mock, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (concept_key) DO NOTHING`,
      [uuid(), conceptKey, concept, subjectId, topicId || null, svg, mock, Date.now()]
    );

    res.json({ svg, concept, mock, cached: false });
  } catch (e) {
    console.error("Diagram generation failed", e);
    res.status(502).json({ error: "Could not generate a diagram right now. Try again shortly." });
  }
});

module.exports = router;
