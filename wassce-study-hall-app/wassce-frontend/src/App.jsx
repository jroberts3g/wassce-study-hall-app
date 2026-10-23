import React, { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   WASSCE Study Hall — standalone version.

   This is the artifact prototype rebuilt as an ordinary web app,
   because Claude's artifact sandbox blocks fetch() to localhost/
   private-network addresses — there was no way to make the
   in-chat artifact talk to a locally-run backend. Running as a
   normal Vite dev server has none of that restriction.

   Differences from the artifact version:
   - Always requires the backend (no "local demo mode" — that
     relied on window.storage, which only exists inside Claude).
   - Auth token persists in localStorage (fine here — this is a
     real browser tab, not a sandboxed iframe).
   - AI tutor/quiz/report calls go through POST /ai/complete on
     the backend instead of directly to api.anthropic.com, because
     a standalone app can't hold an Anthropic API key client-side
     any more than it could hold a Modem Pay secret key.
   ============================================================ */

const DAY_MS = 24 * 60 * 60 * 1000;
const SUBSCRIPTION_DAYS = 30;
const DEFAULT_API_BASE = "http://localhost:3001";

const SUBJECTS = [
  {
    id: "english",
    name: "English Language",
    category: "core",
    readingList: [],
    topicsByBand: {
    "lower-primary": [
      { id: "phonics", name: "Phonics and Letter Sounds" },
      { id: "listening-speaking", name: "Listening and Speaking" },
      { id: "reading-basics", name: "Reading Skills" },
      { id: "writing-basics", name: "Writing Skills" },
      { id: "creative-writing-early", name: "Creative Writing: Songs and Rhymes" },
    ],
    "upper-primary": [
      { id: "reading-comprehension", name: "Reading and Comprehension" },
      { id: "writing-skills", name: "Writing Skills" },
      { id: "grammar-vocab", name: "Grammar and Vocabulary" },
      { id: "creative-writing", name: "Creative Writing" },
    ],
    "upper-basic": [
      { id: "reading-comprehension-ub", name: "Reading and Comprehension" },
      { id: "grammar-vocab-ub", name: "Grammar and Vocabulary" },
      { id: "functional-texts", name: "Functional Texts (Letters, Reports)" },
      { id: "creative-writing-ub", name: "Creative Writing and Literature" },
      { id: "sociocultural", name: "Socio-Cultural Appraisal" },
    ],
    "senior-secondary": [
      { id: "comprehension", name: "Comprehension and Summary" },
      { id: "essay", name: "Essay Writing" },
      { id: "grammar", name: "Grammar and Lexis" },
      { id: "oral", name: "Oral English" },
      { id: "letter-writing", name: "Formal and Informal Letter Writing" },
    ],
    },
  },
  {
    id: "math",
    name: "Mathematics",
    category: "core",
    readingList: [],
    topicsByBand: {
    "lower-primary": [
      { id: "counting", name: "Counting and Number Recognition" },
      { id: "add-subtract", name: "Addition and Subtraction" },
      { id: "shapes-early", name: "Shapes: Drawing and Grouping" },
      { id: "patterns-early", name: "Patterns and Relationships" },
      { id: "word-problems-early", name: "Simple Word Problems" },
    ],
    "upper-primary": [
      { id: "numbers-up", name: "Numbers and Operations" },
      { id: "algebra-up", name: "Introduction to Algebra" },
      { id: "measurement-up", name: "Measurement" },
      { id: "geometry-up", name: "Geometry" },
      { id: "data-up", name: "Data Handling" },
    ],
    "upper-basic": [
      { id: "algebra-ub", name: "Algebra" },
      { id: "geometry-ub", name: "Geometry and Measurement" },
      { id: "data-stats-ub", name: "Data, Probability and Statistics" },
      { id: "problem-solving-ub", name: "Problem Solving" },
    ],
    "senior-secondary": [
      { id: "number", name: "Number and Numeration" },
      { id: "algebra", name: "Algebra" },
      { id: "geometry", name: "Geometry and Mensuration" },
      { id: "trig", name: "Trigonometry" },
      { id: "stats", name: "Statistics and Probability" },
    ],
    },
  },
  {
    id: "integrated-studies",
    name: "Integrated Studies",
    category: "core",
    readingList: [],
    topicsByBand: {
    "lower-primary": [
      { id: "human-body-early", name: "The Human Body" },
      { id: "family-environment", name: "Family and Environment" },
      { id: "food-health-early", name: "Food, Health and Hygiene" },
      { id: "gambia-people-places", name: "The Gambia: People and Places" },
      { id: "caring-environment", name: "Caring for Our Environment" },
    ],
    },
  },
  {
    id: "science",
    name: "Science",
    category: "core",
    readingList: [],
    topicsByBand: {
    "upper-primary": [
      { id: "human-body-up", name: "Human Body and Health" },
      { id: "matter-materials", name: "Matter and Materials" },
      { id: "living-nonliving", name: "Living and Non-Living Things" },
      { id: "intro-physics-chem", name: "Introduction to Physics and Chemistry" },
      { id: "environmental-science-up", name: "Environmental Science" },
    ],
    "upper-basic": [
      { id: "human-body-ub", name: "Human Body and Health" },
      { id: "basic-physics-ub", name: "Basic Physics Concepts" },
      { id: "basic-chemistry-ub", name: "Basic Chemistry Concepts" },
      { id: "living-things-ecosystems", name: "Living Things and Ecosystems" },
      { id: "scientific-method", name: "Scientific Method and Investigation" },
      { id: "intro-technology", name: "Introduction to Technology" },
    ],
    },
  },
  {
    id: "social-environmental-studies",
    name: "Social and Environmental Studies",
    category: "core",
    readingList: [],
    topicsByBand: {
    "upper-primary": [
      { id: "history-citizenship-up", name: "History and Citizenship of the Gambia" },
      { id: "geography-gambia-wa-up", name: "Geography of the Gambia and West Africa" },
      { id: "governance-up", name: "Government and Governance" },
      { id: "natural-resources-up", name: "Natural Resources and Environment" },
    ],
    "upper-basic": [
      { id: "history-citizenship-ub", name: "History and Citizenship of the Gambia" },
      { id: "geography-gambia-wa-ub", name: "Geography of the Gambia and West Africa" },
      { id: "political-systems-ub", name: "Government and Political Systems" },
      { id: "economic-development-ub", name: "Economic Development" },
      { id: "environmental-management-ub", name: "Environmental Management" },
    ],
    },
  },
  {
    id: "arabic",
    name: "Arabic",
    category: "core",
    readingList: [],
    topicsByBand: {
    "lower-primary": [
      { id: "arabic-sounds", name: "Arabic Sounds and Letter Forms" },
      { id: "arabic-listening-speaking", name: "Listening and Speaking" },
      { id: "arabic-counting", name: "Arabic Counting" },
    ],
    "upper-primary": [
      { id: "arabic-reading-writing", name: "Reading and Writing" },
      { id: "arabic-vocabulary", name: "Vocabulary" },
      { id: "arabic-communication", name: "Communication Skills" },
    ],
    "upper-basic": [
      { id: "arabic-grammar", name: "Arabic Grammar" },
      { id: "arabic-composition", name: "Reading, Writing and Composition" },
      { id: "arabic-syntax", name: "Arabic Syntax and Letter Writing" },
    ],
    },
  },
  {
    id: "integrated-science",
    name: "Integrated Science",
    category: "core",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "living-things", name: "Diversity of Living Things" },
      { id: "matter", name: "Matter and Its Properties" },
      { id: "energy", name: "Energy and Its Uses" },
      { id: "earth-space", name: "Earth and Space Science" },
      { id: "health-science", name: "Human Health and Environment" },
    ],
    },
  },
  {
    id: "civic-education",
    name: "Civic Education",
    category: "core",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "citizenship", name: "Citizenship and National Values" },
      { id: "rights-duties", name: "Rights, Duties and Responsibilities" },
      { id: "governance", name: "Government and the Constitution" },
      { id: "social-issues", name: "Social and Political Issues" },
    ],
    },
  },
  {
    id: "social-studies",
    name: "Social Studies",
    category: "core",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "individual-environment", name: "The Individual and the Social Environment" },
      { id: "politics-governance", name: "Politics and Governance" },
      { id: "economics-development", name: "Economics and Development" },
      { id: "environment", name: "Environmental Issues" },
    ],
    },
  },
  {
    id: "biology",
    name: "Biology",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "cell", name: "Cell Structure and Function" },
      { id: "genetics", name: "Genetics and Heredity" },
      { id: "ecology", name: "Ecology and Ecosystems" },
      { id: "reproduction", name: "Reproduction in Plants and Animals" },
      { id: "transport-nutrition", name: "Transport and Nutrition in Organisms" },
    ],
    },
  },
  {
    id: "chemistry",
    name: "Chemistry",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "atomic-structure", name: "Atomic Structure and Bonding" },
      { id: "states-of-matter", name: "States of Matter" },
      { id: "acids-bases-salts", name: "Acids, Bases and Salts" },
      { id: "organic-chemistry", name: "Organic Chemistry" },
      { id: "chemical-kinetics", name: "Rates of Reaction and Chemical Kinetics" },
    ],
    },
  },
  {
    id: "physics",
    name: "Physics",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "motion-forces", name: "Motion, Forces and Newton's Laws" },
      { id: "work-energy-power", name: "Work, Energy and Power" },
      { id: "electricity-magnetism", name: "Electricity and Magnetism" },
      { id: "waves-optics", name: "Waves and Optics" },
      { id: "heat-thermodynamics", name: "Heat and Thermodynamics" },
    ],
    },
  },
  {
    id: "further-math",
    name: "Further Mathematics",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "vectors", name: "Vectors and Matrices" },
      { id: "calculus", name: "Differentiation and Integration" },
      { id: "complex-numbers", name: "Complex Numbers" },
      { id: "mechanics", name: "Mechanics" },
    ],
    },
  },
  {
    id: "agric-science",
    name: "Agricultural Science",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "upper-basic": [
      { id: "crop-production-ub", name: "Crop Production Basics" },
      { id: "animal-husbandry-ub", name: "Animal Husbandry Basics" },
      { id: "farm-technology-ub", name: "Farm Technology and Tools" },
      { id: "environmental-protection-ub", name: "Environmental Protection in Agriculture" },
    ],
    "senior-secondary": [
      { id: "soil-science", name: "Soil Science" },
      { id: "crop-production", name: "Crop Production" },
      { id: "animal-production", name: "Animal Production" },
      { id: "farm-management", name: "Farm Management and Economics" },
    ],
    },
  },
  {
    id: "geography",
    name: "Geography",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "physical-geography", name: "Physical Geography" },
      { id: "map-reading", name: "Map Reading and Interpretation" },
      { id: "human-geography", name: "Human and Economic Geography" },
      { id: "west-africa-geography", name: "Regional Geography of West Africa" },
    ],
    },
  },
  {
    id: "ict",
    name: "Information and Communication Technology",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "upper-primary": [
      { id: "intro-computers", name: "Introduction to Computers" },
      { id: "basic-typing", name: "Basic Typing and Word Processing" },
    ],
    "upper-basic": [
      { id: "computer-fundamentals-ub", name: "Computer Fundamentals" },
      { id: "word-processing-ub", name: "Word Processing Basics" },
      { id: "internet-safety-ub", name: "Internet Basics and Online Safety" },
    ],
    "senior-secondary": [
      { id: "computer-fundamentals", name: "Computer Fundamentals" },
      { id: "word-processing", name: "Word Processing and Desktop Publishing" },
      { id: "spreadsheets", name: "Spreadsheets" },
      { id: "internet-safety", name: "The Internet and Digital Citizenship" },
    ],
    },
  },
  {
    id: "government",
    name: "Government",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "political-systems", name: "Political Systems and Ideologies" },
      { id: "constitution", name: "The Constitution" },
      { id: "arms-of-government", name: "Legislature, Executive and Judiciary" },
      { id: "international-relations", name: "International Relations" },
    ],
    },
  },
  {
    id: "literature",
    name: "Literature-in-English",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "prose", name: "Prose: Set Texts" },
      { id: "drama", name: "Drama: Set Texts" },
      { id: "poetry", name: "African and Non-African Poetry" },
      { id: "literary-devices", name: "Literary Devices and Appreciation" },
    ],
    },
  },
  {
    id: "history",
    name: "History",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "precolonial-wa", name: "Pre-Colonial West African States" },
      { id: "colonial-rule", name: "Colonial Rule in West Africa" },
      { id: "independence", name: "Nationalism and Independence Movements" },
      { id: "postcolonial", name: "Post-Colonial West Africa" },
    ],
    },
  },
  {
    id: "crs",
    name: "Christian Religious Studies",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "old-testament", name: "Old Testament Studies" },
      { id: "new-testament", name: "New Testament Studies" },
      { id: "christian-living", name: "Christian Living and Ethics" },
    ],
    },
  },
  {
    id: "irs",
    name: "Islamic Religious Studies",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "quran-studies", name: "Qur'an Studies" },
      { id: "hadith", name: "Hadith and Sunnah" },
      { id: "islamic-jurisprudence", name: "Islamic Jurisprudence (Fiqh)" },
      { id: "islamic-history", name: "History of Islam in West Africa" },
    ],
    },
  },
  {
    id: "french",
    name: "French",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "lower-primary": [
      { id: "french-phonics", name: "Sounds and Simple Vocabulary" },
      { id: "french-listening-early", name: "Listening and Speaking" },
    ],
    "upper-primary": [
      { id: "french-listening-speaking", name: "Listening and Speaking" },
      { id: "french-reading-writing", name: "Reading and Writing" },
      { id: "french-grammar-early", name: "Grammar and Vocabulary" },
    ],
    "upper-basic": [
      { id: "french-grammar-ub", name: "Grammar and Vocabulary" },
      { id: "french-functions", name: "Everyday Functions: Asking, Describing, Instructing" },
      { id: "french-civilization", name: "French Civilization" },
    ],
    "senior-secondary": [
      { id: "grammar-fr", name: "Grammar and Verb Tenses" },
      { id: "comprehension-fr", name: "Reading Comprehension" },
      { id: "composition-fr", name: "Composition and Letter Writing" },
      { id: "oral-fr", name: "Oral and Listening Skills" },
    ],
    },
  },
  {
    id: "financial-accounting",
    name: "Financial Accounting",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "accounting-principles", name: "Accounting Principles and Concepts" },
      { id: "ledger-trial-balance", name: "Ledger Accounts and the Trial Balance" },
      { id: "financial-statements", name: "Preparing Financial Statements" },
      { id: "partnership-accounts", name: "Partnership and Company Accounts" },
    ],
    },
  },
  {
    id: "commerce",
    name: "Commerce",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "trade-basics", name: "Trade and Commerce Fundamentals" },
      { id: "business-organisation", name: "Forms of Business Organisation" },
      { id: "banking-finance", name: "Banking and Finance" },
      { id: "insurance", name: "Insurance and Risk" },
    ],
    },
  },
  {
    id: "business-management",
    name: "Business Management",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "management-functions", name: "Functions of Management" },
      { id: "organisational-structure", name: "Organisational Structure" },
      { id: "marketing", name: "Marketing Principles" },
      { id: "human-resources", name: "Human Resource Management" },
    ],
    },
  },
  {
    id: "economics",
    name: "Economics",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "basic-concepts", name: "Basic Economic Concepts" },
      { id: "demand-supply", name: "Demand, Supply and Market Equilibrium" },
      { id: "money-banking", name: "Money and Banking" },
      { id: "national-income", name: "National Income and Development" },
    ],
    },
  },
  {
    id: "cost-accounting",
    name: "Principles of Cost Accounting",
    category: "elective",
    readingList: [],
    topicsByBand: {
    "senior-secondary": [
      { id: "cost-classification", name: "Cost Classification and Behaviour" },
      { id: "costing-methods", name: "Costing Methods" },
      { id: "budgeting", name: "Budgeting and Budgetary Control" },
    ],
    },
  },
];

const BANDS = [
  { id: "lower-primary", label: "Lower Primary (Grades 1–3)" },
  { id: "upper-primary", label: "Upper Primary (Grades 4–6)" },
  { id: "upper-basic", label: "Upper Basic (Grades 7–9)" },
  { id: "senior-secondary", label: "Senior Secondary (Grades 10–12)" },
];
function bandLabel(bandId) {
  return BANDS.find((b) => b.id === bandId)?.label || bandId;
}

function subjectById(id) {
  return SUBJECTS.find((s) => s.id === id);
}
function bandsForSubject(subject) {
  return Object.keys(subject.topicsByBand);
}
function topicsForBand(subject, bandId) {
  return subject?.topicsByBand[bandId] || [];
}
function topicById(subject, bandId, topicId) {
  return topicsForBand(subject, bandId).find((t) => t.id === topicId);
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function daysLeft(expiresAt) {
  return Math.ceil((expiresAt - Date.now()) / DAY_MS);
}
function stripJsonFence(text) {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

/* ---------------- Backend API client ---------------- */

async function apiFetch(api, path, options = {}) {
  const res = await fetch(api.base.replace(/\/$/, "") + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(api.token ? { Authorization: "Bearer " + api.token } : {}),
      ...(options.headers || {}),
    },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // no body
  }
  if (!res.ok) {
    throw new Error((body && body.error) || "Request failed (" + res.status + ")");
  }
  return body;
}

async function callAI(api, system, messages, maxTokens = 1000) {
  const data = await apiFetch(api, "/ai/complete", {
    method: "POST",
    body: JSON.stringify({ system, messages, maxTokens }),
  });
  if (!data.text) throw new Error("Empty AI response");
  return data.text;
}

async function fetchPublicSettings(apiBase) {
  const res = await fetch(apiBase.replace(/\/$/, "") + "/settings");
  if (!res.ok) throw new Error("Could not load settings");
  return res.json();
}

async function fetchSubscriptions(api) {
  const data = await apiFetch(api, "/subscriptions");
  const map = {};
  for (const s of data.subscriptions) {
    map[s.subjectId] = { status: s.status, startedAt: s.startedAt, expiresAt: s.expiresAt, partnerAccess: !!s.partnerAccess };
  }
  return map;
}
async function fetchAssessments(api, subjectId, bandId) {
  const query = bandId ? "?band=" + encodeURIComponent(bandId) : "";
  const data = await apiFetch(api, "/assessments/" + subjectId + query);
  return data.assessments;
}
async function submitAssessment(api, subjectId, bandId, record) {
  await apiFetch(api, "/assessments", {
    method: "POST",
    body: JSON.stringify({
      subjectId,
      topicId: record.topicId,
      band: bandId,
      score: record.score,
      maxScore: record.maxScore,
    }),
  });
}

/* ================== App ================== */

export default function App() {
  const [tab, setTab] = useState("subscribe");
  const [studyMode, setStudyMode] = useState(null); // 'wassce' | 'lecture' | null
  const [backendUrl, setBackendUrl] = useState(() => localStorage.getItem("api_base") || DEFAULT_API_BASE);
  const [api, setApi] = useState(null); // { base, token } once authenticated
  const [authUser, setAuthUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [subscriptions, setSubscriptions] = useState({});
  const [checkout, setCheckout] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [priceGmd, setPriceGmd] = useState(10); // placeholder until /settings responds

  const refreshSubscriptions = useCallback(async (activeApi) => {
    try {
      setSubscriptions(await fetchSubscriptions(activeApi || api));
    } catch (e) {
      console.error("Could not load subscriptions", e);
    }
  }, [api]);

  const refreshPrice = useCallback(async (base) => {
    try {
      const settings = await fetchPublicSettings(base || backendUrl);
      setPriceGmd(settings.subscriptionPriceGmd);
    } catch (e) {
      console.error("Could not load settings", e);
    }
  }, [backendUrl]);

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem("auth_token");
      const base = localStorage.getItem("api_base") || DEFAULT_API_BASE;
      setBackendUrl(base);
      refreshPrice(base);
      if (token) {
        try {
          const me = await apiFetch({ base, token }, "/auth/me");
          setAuthUser(me);
          setApi({ base, token });
          await refreshSubscriptions({ base, token });
        } catch {
          localStorage.removeItem("auth_token");
        }
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeBackend = (url) => {
    localStorage.setItem("api_base", url);
    setBackendUrl(url);
    localStorage.removeItem("auth_token");
    setApi(null);
    setAuthUser(null);
    refreshPrice(url);
  };

  const onAuthenticated = async (token, user) => {
    localStorage.setItem("auth_token", token);
    const activeApi = { base: backendUrl, token };
    setApi(activeApi);
    setAuthUser(user);
    await refreshSubscriptions(activeApi);
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    setApi(null);
    setAuthUser(null);
  };

  const activeCount = Object.values(subscriptions).filter(
    (s) => s.status === "active" && s.expiresAt > Date.now()
  ).length;

  return (
    <div className="app-root">
      <style>{CSS}</style>

      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-seal">{studyMode === "lecture" ? "LH" : "SH"}</div>
            <div>
              <div className="brand-name">{studyMode === "lecture" ? "Lecture Hall" : "WASSCE Study Hall"}</div>
              <div className="brand-tag">
                {studyMode === "lecture"
                  ? "Reinforcing what you're learning in class"
                  : "Your own study desk for WAEC exams"}
              </div>
            </div>
          </div>
          <div className="header-right">
            {authUser && <div className="candidate-no">Candidate No. {authUser.candidateNo}</div>}
            {api && (
              <nav className="tabs">
                <button className={"tab" + (tab === "subscribe" ? " tab-active" : "")} onClick={() => { setTab("subscribe"); setStudyMode(null); }}>Subscribe</button>
                <button className={"tab" + (tab === "study" ? " tab-active" : "")} onClick={() => { setTab("study"); setStudyMode(null); }}>Study</button>
              </nav>
            )}
          </div>
        </div>
      </header>

      <main className="page">
        {!ready ? (
          <div className="loading-block">Opening your desk…</div>
        ) : !api ? (
          <AuthScreen apiBase={backendUrl} onAuthenticated={onAuthenticated} onChangeBackend={() => setSettingsOpen(true)} />
        ) : tab === "subscribe" ? (
          <SubscribeTab subscriptions={subscriptions} priceGmd={priceGmd} onPay={(subjectId) => { refreshPrice(); setCheckout({ subjectId }); }} />
        ) : (
          <StudyTab api={api} subscriptions={subscriptions} activeCount={activeCount} onModeChange={setStudyMode} />
        )}
      </main>

      <SettingsPanel
        open={settingsOpen}
        setOpen={setSettingsOpen}
        backendUrl={backendUrl}
        connected={!!api}
        authUser={authUser}
        onChangeBackend={changeBackend}
        onLogout={logout}
        priceGmd={priceGmd}
        onPriceChanged={setPriceGmd}
      />

      {checkout && (
        <CheckoutModal
          api={api}
          subject={subjectById(checkout.subjectId)}
          priceGmd={priceGmd}
          onClose={() => setCheckout(null)}
          onSuccess={async () => { await refreshSubscriptions(); setCheckout(null); }}
        />
      )}
    </div>
  );
}

/* ================== Auth screen ================== */

function AuthScreen({ apiBase, onAuthenticated, onChangeBackend }) {
  const [mode, setMode] = useState("signup");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/signup";
      const payload = mode === "login"
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password };
      const data = await apiFetch({ base: apiBase }, path, { method: "POST", body: JSON.stringify(payload) });
      onAuthenticated(data.token, data.user);
    } catch (e2) {
      setError(e2.message + " — is the backend running at " + apiBase + "?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="paper auth-wrap">
      <div className="auth-tabs">
        <button className={"auth-tab" + (mode === "signup" ? " auth-tab-active" : "")} onClick={() => setMode("signup")}>Create account</button>
        <button className={"auth-tab" + (mode === "login" ? " auth-tab-active" : "")} onClick={() => setMode("login")}>Log in</button>
      </div>

      <p className="page-sub">
        Backend: <code>{apiBase}</code>. <button className="btn-link" onClick={onChangeBackend}>Change</button>
      </p>

      <form className="auth-form" onSubmit={submit}>
        {mode === "signup" && (
          <label className="field">
            <span>Full name</span>
            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Fatou Jallow" />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="you@example.com" />
        </label>
        <label className="field">
          <span>Password</span>
          <input required type="password" minLength={mode === "signup" ? 8 : undefined} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"} />
        </label>
        {error && <div className="field-error">{error}</div>}
        <button className="btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}

/* ================== Subscribe tab ================== */

function SubscribeTab({ subscriptions, priceGmd, onPay }) {
  return (
    <div className="paper">
      <h1 className="page-title">Choose your subjects</h1>
      <p className="page-sub">
        Each subject is its own subscription — {priceGmd} GMD for {SUBSCRIPTION_DAYS} days of
        access to the study guide, practice questions and reports.
      </p>
      <ExpiryBanners subscriptions={subscriptions} onRenew={onPay} />
      <div className="subject-grid">
        {SUBJECTS.map((subject) => (
          <SubjectCard key={subject.id} subject={subject} sub={subscriptions[subject.id]} priceGmd={priceGmd} onPay={() => onPay(subject.id)} />
        ))}
      </div>
    </div>
  );
}

function ExpiryBanners({ subscriptions, onRenew }) {
  const items = SUBJECTS.filter((s) => {
    const sub = subscriptions[s.id];
    if (!sub || sub.status !== "active" || sub.partnerAccess) return false;
    const left = daysLeft(sub.expiresAt);
    return left <= 5 && left >= 0;
  });
  if (items.length === 0) return null;
  return (
    <div className="banner-stack">
      {items.map((s) => {
        const left = daysLeft(subscriptions[s.id].expiresAt);
        return (
          <div className="banner" key={s.id}>
            <span>{s.name} access ends in {left} {left === 1 ? "day" : "days"} — renew to keep studying.</span>
            <button className="btn-link" onClick={() => onRenew(s.id)}>Renew now</button>
          </div>
        );
      })}
    </div>
  );
}

function SubjectCard({ subject, sub, priceGmd, onPay }) {
  const now = Date.now();
  const isActive = sub && sub.status === "active" && sub.expiresAt > now;
  const isExpired = sub && sub.expiresAt <= now;
  return (
    <div className="subject-card">
      <div className="subject-card-top">
        <span className="subject-category">{subject.category}</span>
        <h3 className="subject-name">{subject.name}</h3>
      </div>
      <div className="subject-card-status">
        {isActive && sub.partnerAccess ? <span className="status status-active">Free for franchise partners until {fmtDate(sub.expiresAt)}</span>
          : isActive ? <span className="status status-active">Active until {fmtDate(sub.expiresAt)}</span>
          : isExpired ? <span className="status status-expired">Expired {fmtDate(sub.expiresAt)}</span>
          : <span className="status status-none">Not subscribed</span>}
      </div>
      <div className="subject-card-bottom">
        <div className="price">{priceGmd} GMD <span>/ {SUBSCRIPTION_DAYS} days</span></div>
        {isActive && sub.partnerAccess
          ? <span className="status status-active">Included</span>
          : <button className="btn-primary" onClick={onPay}>{isActive ? "Extend" : isExpired ? "Renew" : "Subscribe"}</button>}
      </div>
    </div>
  );
}

/* ================== Checkout modal ================== */

function CheckoutModal({ api, subject, priceGmd, onClose, onSuccess }) {
  const [stage, setStage] = useState("select"); // select | processing | link | success | error
  const [checkoutData, setCheckoutData] = useState(null);
  const [error, setError] = useState(null);

  const pay = async () => {
    setStage("processing");
    setError(null);
    try {
      const data = await apiFetch(api, "/subscriptions/" + subject.id + "/checkout", { method: "POST" });
      setCheckoutData(data);
      if (!data.mock) window.open(data.paymentLink, "_blank", "noopener,noreferrer");
      setStage("link");
    } catch (e) {
      setError(e.message);
      setStage("error");
    }
  };

  const simulateWebhook = async (outcome) => {
    setStage("processing");
    try {
      await apiFetch(api, "/dev/simulate-webhook", {
        method: "POST",
        body: JSON.stringify({ paymentId: checkoutData.paymentId, outcome }),
      });
      if (outcome === "succeed") {
        setStage("success");
        setTimeout(onSuccess, 600);
      } else {
        setError("Payment marked as failed.");
        setStage("error");
      }
    } catch (e) {
      setError(e.message);
      setStage("error");
    }
  };

  const pollStatus = async () => {
    setStage("processing");
    try {
      const data = await apiFetch(api, "/subscriptions/payments/" + checkoutData.paymentId);
      if (data.status === "succeeded") { setStage("success"); setTimeout(onSuccess, 600); }
      else if (data.status === "failed") { setError("Modem Pay reported this payment as failed."); setStage("error"); }
      else { setError("Still waiting for payment confirmation — try again in a moment."); setStage("link"); }
    } catch (e) {
      setError(e.message);
      setStage("link");
    }
  };

  return (
    <div className="modal-overlay" onClick={stage === "select" ? onClose : undefined}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modem-mark">Modem Pay</div>
          {stage === "select" && <button className="modal-close" onClick={onClose} aria-label="Close">×</button>}
        </div>

        {stage === "select" && (
          <>
            <div className="modal-amount">
              <div className="modal-amount-label">{subject.name} — {SUBSCRIPTION_DAYS} days</div>
              <div className="modal-amount-value">GMD {priceGmd.toFixed(2)}</div>
            </div>
            <button className="btn-primary btn-block" onClick={pay}>Pay GMD {priceGmd.toFixed(2)}</button>
            <div className="modal-fineprint">This creates a real Modem Pay Payment Intent via your backend.</div>
          </>
        )}

        {stage === "processing" && (
          <div className="modal-processing"><div className="spinner" /><div>Talking to your backend…</div></div>
        )}

        {stage === "link" && checkoutData && (
          <div className="modal-link">
            {checkoutData.mock ? (
              <>
                <div className="mock-note">
                  Your backend is running in Modem Pay <strong>mock mode</strong> (no <code>MODEMPAY_API_KEY</code> set).
                  Use the dev-only simulator below to exercise the rest of the flow.
                </div>
                <button className="btn-primary btn-block" onClick={() => simulateWebhook("succeed")}>Simulate successful payment</button>
                <button className="btn-secondary btn-block" onClick={() => simulateWebhook("fail")}>Simulate failed payment</button>
              </>
            ) : (
              <>
                <div className="mock-note">A Modem Pay payment page opened in a new tab. Once you've paid, come back and check the status.</div>
                {error && <div className="field-error" style={{ marginBottom: 8 }}>{error}</div>}
                <button className="btn-primary btn-block" onClick={() => window.open(checkoutData.paymentLink, "_blank")}>Reopen payment page</button>
                <button className="btn-secondary btn-block" onClick={pollStatus}>I've paid — check status</button>
              </>
            )}
          </div>
        )}

        {stage === "error" && (
          <div className="modal-error">
            <div>{error}</div>
            <button className="btn-secondary btn-block" onClick={() => setStage(checkoutData ? "link" : "select")}>Back</button>
          </div>
        )}

        {stage === "success" && (
          <div className="modal-success"><div className="success-mark">✓</div><div>Payment received. Access unlocked.</div></div>
        )}
      </div>
    </div>
  );
}

/* ================== Study tab ================== */

function StudyTab({ api, subscriptions, activeCount, onModeChange }) {
  const activeSubjects = SUBJECTS.filter((s) => {
    const sub = subscriptions[s.id];
    return sub && sub.status === "active" && sub.expiresAt > Date.now();
  });
  const [subjectId, setSubjectId] = useState(activeSubjects[0]?.id || null);
  const [bandId, setBandId] = useState(null);
  const [topicId, setTopicId] = useState(null);

  useEffect(() => {
    if (!subjectId && activeSubjects.length > 0) setSubjectId(activeSubjects[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubjects.length]);

  const subject = subjectById(subjectId);
  const availableBands = subject ? bandsForSubject(subject) : [];

  // Tell the header which "hall" we're in, so its title reflects
  // where the student actually is instead of always saying WASSCE.
  useEffect(() => {
    if (!bandId) return;
    onModeChange(bandId === "senior-secondary" ? "wassce" : "lecture");
  }, [bandId, onModeChange]);

  // Most subjects (WASSCE electives) only have one band — skip the
  // extra click and go straight to the topic list, same as before
  // Lecture Hall existed. Only subjects spanning multiple bands
  // (Mathematics, English, etc.) show a band picker.
  useEffect(() => {
    if (subject && availableBands.length === 1 && bandId !== availableBands[0]) {
      setBandId(availableBands[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  const [openQuestion, setOpenQuestion] = useState(null); // { id, text } | null

  const selectSubject = (id) => {
    setSubjectId(id);
    setBandId(null);
    setTopicId(null);
    setOpenQuestion(null);
  };

  if (activeCount === 0) {
    return (
      <div className="paper">
        <h1 className="page-title">Nothing to study yet</h1>
        <p className="page-sub">Subscribe to a subject first — head to the Subscribe tab, pick a subject, and pay to unlock the study guide.</p>
      </div>
    );
  }

  return (
    <div className="paper">
      <h1 className="page-title">Study session</h1>
      <div className="chip-row">
        {activeSubjects.map((s) => (
          <button key={s.id} className={"chip" + (s.id === subjectId ? " chip-selected" : "")} onClick={() => selectSubject(s.id)}>{s.name}</button>
        ))}
      </div>

      {subject && !bandId && availableBands.length > 1 && (
        <BandPicker bands={availableBands} onPick={setBandId} />
      )}

      {subject && bandId && !topicId && !openQuestion && (
        <>
          {bandId === "senior-secondary" && (
            <AskAnythingBox onAsk={(text) => setOpenQuestion({ id: Date.now(), text })} />
          )}
          <TopicPicker api={api} subject={subject} bandId={bandId} onPick={setTopicId} />
          <ReadingListPanel subject={subject} />
        </>
      )}

      {subject && bandId && (topicId || openQuestion) && (
        <SessionPanel
          key={subject.id + ":" + bandId + ":" + (topicId || "open:" + openQuestion.id)}
          api={api}
          subject={subject}
          bandId={bandId}
          topic={topicId ? topicById(subject, bandId, topicId) : null}
          initialQuestion={openQuestion ? openQuestion.text : null}
          onBack={() => { setTopicId(null); setOpenQuestion(null); }}
        />
      )}
    </div>
  );
}

function AskAnythingBox({ onAsk }) {
  const [value, setValue] = useState("");
  const submit = () => {
    const text = value.trim();
    if (!text) return;
    setValue("");
    onAsk(text);
  };
  return (
    <div className="ask-anything">
      <div className="ask-anything-label">Have a specific question? Ask it directly — no need to pick a topic first.</div>
      <div className="chat-input-row">
        <input
          className="chat-input"
          placeholder="e.g. Why does this circle theorem work?"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="btn-primary" onClick={submit} disabled={!value.trim()}>Ask</button>
      </div>
    </div>
  );
}

function BandPicker({ bands, onPick }) {
  return (
    <div className="band-picker">
      <p className="page-sub" style={{ marginBottom: 14 }}>Which level are you studying at?</p>
      <div className="chip-row">
        {bands.map((b) => (
          <button key={b} className="chip" onClick={() => onPick(b)}>{bandLabel(b)}</button>
        ))}
      </div>
    </div>
  );
}

function ReadingListPanel({ subject }) {
  return (
    <div className="reading-list">
      <div className="reading-list-title">Further reading</div>
      {subject.readingList.length === 0 ? (
        <div className="reading-list-empty">Recommended books and resources for {subject.name} are coming soon.</div>
      ) : (
        <ul className="reading-list-items">
          {subject.readingList.map((r, i) => (
            <li key={i}>
              <span className="reading-list-book">{r.title}</span>
              {r.author && <span className="reading-list-author"> — {r.author}</span>}
              {r.note && <div className="reading-list-note">{r.note}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TopicPicker({ api, subject, bandId, onPick }) {
  const [meta, setMeta] = useState({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await fetchAssessments(api, subject.id, bandId).catch(() => []);
      if (cancelled) return;
      const m = {};
      for (const t of topicsForBand(subject, bandId)) {
        const rows = all.filter((a) => a.topicId === t.id);
        if (rows.length > 0) {
          const avg = rows.reduce((sum, r) => sum + r.score / r.maxScore, 0) / rows.length;
          m[t.id] = { count: rows.length, avgPct: Math.round(avg * 100) };
        }
      }
      setMeta(m);
    })();
    return () => { cancelled = true; };
  }, [api, subject.id, bandId]);

  return (
    <div className="topic-list">
      {topicsForBand(subject, bandId).map((t) => (
        <button key={t.id} className="topic-row" onClick={() => onPick(t.id)}>
          <span className="topic-name">{t.name}</span>
          <span className="topic-meta">
            {meta[t.id] ? meta[t.id].count + " attempt" + (meta[t.id].count > 1 ? "s" : "") + " · avg " + meta[t.id].avgPct + "%" : "Not attempted yet"}
          </span>
        </button>
      ))}
    </div>
  );
}

function SessionPanel({ api, subject, bandId, topic, initialQuestion, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const scrollRef = useRef(null);

  const isOpenMode = !topic;

  const systemPrompt = isOpenMode
    ? "You are a patient WASSCE exam-prep study guide for the subject '" + subject.name +
      "'. The student has asked a specific question directly, rather than picking a topic first. Ground your answer in this subject's syllabus, which covers: " +
      topicsForBand(subject, bandId).map((t) => t.name).join(", ") +
      ". Answer clearly and directly since the student already knows what they want to ask, but still check understanding with a short follow-up question where it helps. If the question falls outside this subject, say so briefly and suggest picking a relevant topic instead. Keep replies under 150 words, plain text, no markdown headers. Never claim to be an official WAEC examiner and never guarantee real exam questions."
    : "You are a patient WASSCE exam-prep study guide for the subject '" + subject.name +
      "', topic '" + topic.name +
      "'. Explain concepts briefly and clearly with a short example relevant to a West African classroom. Check understanding with a short question and encourage the student to attempt it before you reveal the answer. Keep replies under 130 words, plain text, no markdown headers. Never claim to be an official WAEC examiner and never guarantee real exam questions.";

  useEffect(() => {
    if (isOpenMode) {
      sendToTutor([], initialQuestion, false);
    } else {
      sendToTutor([], "Hello — please introduce this topic and how we'll study it.", true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, chatLoading]);

  async function sendToTutor(history, userText, isOpening) {
    setChatError(null);
    setChatLoading(true);
    const nextMessages = isOpening ? [] : [...history, { role: "user", content: userText }];
    if (!isOpening) setMessages(nextMessages);
    try {
      const apiMessages = isOpening ? [{ role: "user", content: userText }] : nextMessages;
      const reply = await callAI(api, systemPrompt, apiMessages, 500);
      setMessages((prev) => (isOpening ? [{ role: "assistant", content: reply }] : [...prev, { role: "assistant", content: reply }]));
    } catch (e) {
      setChatError("Couldn't reach the study guide: " + e.message);
    } finally {
      setChatLoading(false);
    }
  }

  const send = () => {
    const text = input.trim();
    if (!text || chatLoading) return;
    setInput("");
    sendToTutor(messages, text, false);
  };

  return (
    <div className="session">
      <div className="session-head">
        <button className="btn-link" onClick={onBack}>← {isOpenMode ? "Back to topics" : "Choose a different topic"}</button>
        <div className="session-title">{isOpenMode ? "Your question" : topic.name}</div>
      </div>
      <div className="chat" ref={scrollRef}>
        {messages.map((m, i) => <div key={i} className={"bubble bubble-" + m.role}>{m.content}</div>)}
        {chatLoading && <div className="bubble bubble-assistant bubble-loading">…</div>}
        {chatError && <div className="chat-error">{chatError}</div>}
      </div>
      <div className="chat-input-row">
        <input className="chat-input" placeholder="Ask about this topic…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} disabled={chatLoading} />
        <button className="btn-primary" onClick={send} disabled={chatLoading}>Send</button>
      </div>
      <div className="session-actions">
        {!isOpenMode && <button className="btn-secondary" onClick={() => setShowQuiz(true)}>Start self-assessment</button>}
        <button className="btn-secondary" onClick={() => setShowReport(true)}>Get progress report</button>
      </div>
      {showQuiz && !isOpenMode && <><SectionBreak label="Self-assessment" /><QuizBlock api={api} subject={subject} bandId={bandId} topic={topic} /></>}
      {showReport && <><SectionBreak label="Progress report" /><ReportBlock api={api} subject={subject} bandId={bandId} /></>}
    </div>
  );
}

function SectionBreak({ label }) {
  return <div className="section-break"><span>{label}</span></div>;
}

function QuizBlock({ api, subject, bandId, topic }) {
  const [state, setState] = useState("loading");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [score, setScore] = useState(0);
  const [saveError, setSaveError] = useState(null);

  const levelPhrase = bandId === "senior-secondary" ? "WASSCE-style" : "age-appropriate, " + bandLabel(bandId) + "-level";

  const generate = useCallback(async () => {
    setState("loading");
    try {
      const raw = await callAI(
        api,
        "Respond only with valid JSON. No markdown, no commentary, no code fences.",
        [{ role: "user", content:
          "Generate 5 " + levelPhrase + " multiple-choice practice questions for the subject '" + subject.name +
          "', topic '" + topic.name +
          "'. JSON schema exactly: {\"questions\":[{\"id\":\"q1\",\"prompt\":\"...\",\"options\":[{\"id\":\"a\",\"text\":\"...\"},{\"id\":\"b\",\"text\":\"...\"},{\"id\":\"c\",\"text\":\"...\"},{\"id\":\"d\",\"text\":\"...\"}],\"correct_option_id\":\"a\",\"explanation\":\"...\"}]}. Keep each prompt under 25 words and each option under 8 words. Exactly 5 questions, exactly 4 options each."
        }],
        1000
      );
      const parsed = JSON.parse(stripJsonFence(raw));
      if (!parsed.questions || parsed.questions.length === 0) throw new Error("No questions returned");
      setQuestions(parsed.questions);
      setAnswers({});
      setState("active");
    } catch (e) {
      setState("error");
    }
  }, [api, subject.name, topic.name, levelPhrase]);

  useEffect(() => { generate(); }, [generate]);

  const submit = async () => {
    let correct = 0;
    for (const q of questions) if (answers[q.id] === q.correct_option_id) correct += 1;
    setScore(correct);
    setSaveError(null);
    try {
      await submitAssessment(api, subject.id, bandId, { topicId: topic.id, score: correct, maxScore: questions.length });
    } catch (e) {
      setSaveError("Score wasn't saved: " + e.message);
    }
    setState("submitted");
  };

  if (state === "loading") return <div className="quiz-loading">Preparing your practice questions…</div>;
  if (state === "error") return <div className="quiz-loading">Couldn't generate questions. <button className="btn-link" onClick={generate}>Try again</button></div>;

  if (state === "submitted") {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="quiz-result">
        <div className="score-seal">{score}/{questions.length}</div>
        <div className="quiz-result-pct">{pct}% correct</div>
        <div className="disclaimer">Practice score only — not an official WAEC prediction.</div>
        {saveError && <div className="field-error">{saveError}</div>}
        <div className="quiz-review">
          {questions.map((q) => {
            const isCorrect = answers[q.id] === q.correct_option_id;
            return (
              <div key={q.id} className="quiz-review-item">
                <div className="quiz-review-prompt">
                  <span className={isCorrect ? "mark mark-correct" : "mark mark-incorrect"}>{isCorrect ? "✓" : "✗"}</span>
                  {q.prompt}
                </div>
                <div className="quiz-review-explanation">{q.explanation}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="quiz-active">
      {questions.map((q, idx) => (
        <div key={q.id} className="quiz-question">
          <div className="quiz-question-prompt">{idx + 1}. {q.prompt}</div>
          <div className="quiz-options">
            {q.options.map((opt) => (
              <label key={opt.id} className={"quiz-option" + (answers[q.id] === opt.id ? " quiz-option-selected" : "")}>
                <input type="radio" name={q.id} checked={answers[q.id] === opt.id} onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))} />
                {opt.text}
              </label>
            ))}
          </div>
        </div>
      ))}
      <button className="btn-primary" disabled={Object.keys(answers).length < questions.length} onClick={submit}>Submit answers</button>
    </div>
  );
}

function ReportBlock({ api, subject, bandId }) {
  const [state, setState] = useState("loading");
  const [text, setText] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState("loading");
      const rows = await fetchAssessments(api, subject.id, bandId).catch(() => []);
      if (rows.length === 0) { if (!cancelled) setState("empty"); return; }
      const summary = rows.map((r) => {
        const t = topicById(subject, bandId, r.topicId);
        return (t ? t.name : r.topicId) + ": " + r.score + "/" + r.maxScore;
      }).join("; ");
      const studentPhrase = bandId === "senior-secondary" ? "a WASSCE candidate" : "a " + bandLabel(bandId) + " student";
      try {
        const report = await callAI(
          api,
          "You write short, encouraging study progress reports for " + studentPhrase + ". Plain text only, no markdown headers, about 130 words. Identify weaker topics and give 2-3 concrete next steps. Do not claim to predict official exam grades.",
          [{ role: "user", content: "Subject: " + subject.name + ". Self-assessment results so far: " + summary + "." }],
          400
        );
        if (!cancelled) { setText(report); setState("ready"); }
      } catch (e) {
        if (!cancelled) setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [api, subject, bandId]);

  if (state === "loading") return <div className="quiz-loading">Building your report…</div>;
  if (state === "empty") return <div className="quiz-loading">No self-assessments for {subject.name} yet — complete one above first.</div>;
  if (state === "error") return <div className="quiz-loading">Couldn't build the report. Try again shortly.</div>;

  return (
    <div className="report">
      <p className="report-text">{text}</p>
      <div className="disclaimer">Based on your practice scores only — not an official WAEC prediction.</div>
    </div>
  );
}

function SettingsPanel({ open, setOpen, backendUrl, connected, authUser, onChangeBackend, onLogout, priceGmd, onPriceChanged }) {
  const [urlInput, setUrlInput] = useState(backendUrl);
  useEffect(() => { setUrlInput(backendUrl); }, [backendUrl]);

  return (
    <div className="proto-tools">
      <button className="proto-toggle" onClick={() => setOpen((v) => !v)}>{open ? "Hide settings" : "Settings"}</button>
      {open && (
        <div className="proto-panel">
          <div className="proto-panel-label">Backend connection</div>
          {connected && <div className="backend-badge">Logged in as {authUser?.name} ({authUser?.email})</div>}
          <div className="backend-form">
            <input className="chat-input" placeholder="http://localhost:3001" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />
            <button className="btn-link" onClick={() => onChangeBackend(urlInput.trim())} disabled={!urlInput.trim()}>Save & log out</button>
          </div>
          {connected && <button className="btn-link" onClick={onLogout}>Log out</button>}

          <PricingAdminSection backendUrl={backendUrl} priceGmd={priceGmd} onPriceChanged={onPriceChanged} />
        </div>
      )}
    </div>
  );
}

function PricingAdminSection({ backendUrl, priceGmd, onPriceChanged }) {
  const [adminSecret, setAdminSecret] = useState(() => localStorage.getItem("admin_secret") || "");
  const [priceInput, setPriceInput] = useState(String(priceGmd));
  const [status, setStatus] = useState(null); // { kind: 'ok'|'error', text }
  const [saving, setSaving] = useState(false);

  useEffect(() => { setPriceInput(String(priceGmd)); }, [priceGmd]);

  const save = async () => {
    setStatus(null);
    setSaving(true);
    try {
      const res = await fetch(backendUrl.replace(/\/$/, "") + "/settings/subscription-price", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
        body: JSON.stringify({ priceGmd: Number(priceInput) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error((body && body.error) || "Request failed (" + res.status + ")");
      localStorage.setItem("admin_secret", adminSecret);
      onPriceChanged(body.subscriptionPriceGmd);
      setStatus({ kind: "ok", text: "Price updated to " + body.subscriptionPriceGmd + " GMD — effective immediately." });
    } catch (e) {
      setStatus({ kind: "error", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="proto-panel-label" style={{ marginTop: 12 }}>
        Subscription price (admin) — set ADMIN_SECRET in the backend's .env to enable this.
      </div>
      <div className="backend-form">
        <input
          type="password"
          className="chat-input"
          placeholder="Admin secret"
          value={adminSecret}
          onChange={(e) => setAdminSecret(e.target.value)}
          style={{ flex: "1 1 auto" }}
        />
      </div>
      <div className="backend-form" style={{ marginTop: 6 }}>
        <input
          type="number"
          min="1"
          className="chat-input"
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          style={{ maxWidth: 90 }}
        />
        <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>GMD / 30 days</span>
        <button className="btn-link" onClick={save} disabled={saving || !adminSecret || !priceInput}>
          {saving ? "Saving…" : "Update price"}
        </button>
      </div>
      {status && (
        <div className={status.kind === "error" ? "field-error" : "backend-badge"} style={{ marginTop: 6 }}>
          {status.text}
        </div>
      )}
    </>
  );
}

/* ================== Styles ================== */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');

:root {
  --paper: #EFE8D6; --paper-deep: #E6DDC6; --line: #CBBB99; --ink: #1C2B45; --ink-soft: #55617E;
  --gold: #A8792A; --green: #2F6B4F; --rust: #9C3F2E; --white: #FFFDF8;
}
* { box-sizing: border-box; }
body { margin: 0; }
.app-root { min-height: 100vh; background: var(--paper); color: var(--ink); font-family: 'IBM Plex Sans', sans-serif; }
.header { background: var(--white); border-bottom: 3px double var(--line); }
.header-inner { max-width: 900px; margin: 0 auto; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.brand { display: flex; align-items: center; gap: 12px; }
.brand-seal { width: 40px; height: 40px; border-radius: 50%; border: 2px solid var(--gold); display: flex; align-items: center; justify-content: center; font-family: 'Lora', serif; font-weight: 700; color: var(--gold); flex-shrink: 0; }
.brand-name { font-family: 'Lora', serif; font-weight: 600; font-size: 18px; }
.brand-tag { font-size: 12.5px; color: var(--ink-soft); }
.header-right { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.candidate-no { font-size: 12.5px; color: var(--ink-soft); }
.tabs { display: flex; gap: 4px; }
.tab { font-family: 'IBM Plex Sans', sans-serif; background: var(--paper); border: 1px solid var(--line); border-bottom: none; padding: 8px 16px; border-radius: 6px 6px 0 0; cursor: pointer; color: var(--ink-soft); font-size: 14px; }
.tab-active { background: var(--ink); color: var(--white); border-color: var(--ink); }
.page { max-width: 900px; margin: 0 auto; padding: 28px 20px 60px; }
.loading-block { padding: 60px 0; text-align: center; color: var(--ink-soft); }
.paper { background: var(--white); border: 1px solid var(--line); border-radius: 3px; padding: 32px 36px; position: relative; }
.paper::before { content: ""; position: absolute; top: 0; bottom: 0; left: 56px; width: 1px; background: var(--rust); opacity: 0.28; }
.page-title { font-family: 'Lora', serif; font-size: 26px; margin: 0 0 6px; font-weight: 600; }
.page-sub { color: var(--ink-soft); margin: 0 0 24px; max-width: 62ch; line-height: 1.5; }
.banner-stack { display: flex; flex-direction: column; gap: 8px; margin-bottom: 22px; }
.banner { border-left: 3px solid var(--rust); background: #FBF0EC; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 14px; }
.subject-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.subject-card { border: 1px solid var(--line); padding: 18px; display: flex; flex-direction: column; gap: 14px; background: var(--paper); }
.subject-category { font-size: 11.5px; color: var(--gold); text-transform: capitalize; }
.subject-name { font-family: 'Lora', serif; font-size: 18px; margin: 4px 0 0; font-weight: 600; }
.status { font-size: 13px; }
.status-active { color: var(--green); }
.status-expired { color: var(--rust); }
.status-none { color: var(--ink-soft); }
.subject-card-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: auto; }
.price { font-size: 13px; color: var(--ink-soft); }
.price span { font-size: 11.5px; }
.btn-primary { background: var(--ink); color: var(--white); border: none; padding: 9px 16px; font-size: 14px; cursor: pointer; border-radius: 3px; font-family: 'IBM Plex Sans', sans-serif; }
.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-secondary { background: transparent; color: var(--ink); border: 1px solid var(--ink); padding: 8px 14px; font-size: 13.5px; cursor: pointer; border-radius: 3px; }
.btn-block { width: 100%; margin-bottom: 8px; }
.btn-link { background: none; border: none; color: var(--gold); cursor: pointer; font-size: 13.5px; padding: 0; text-decoration: underline; display: block; margin-top: 4px; }
.btn-link:disabled { opacity: 0.4; cursor: not-allowed; }
.modal-overlay { position: fixed; inset: 0; background: rgba(28,43,69,0.45); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 50; }
.modal { background: var(--white); border-radius: 4px; width: 380px; max-width: 100%; padding: 24px; }
.modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
.modem-mark { font-family: 'Lora', serif; font-weight: 600; color: var(--ink); }
.modal-close { background: none; border: none; font-size: 22px; cursor: pointer; color: var(--ink-soft); line-height: 1; }
.modal-amount { border: 1px solid var(--line); padding: 14px; margin-bottom: 18px; }
.modal-amount-label { font-size: 13px; color: var(--ink-soft); }
.modal-amount-value { font-family: 'Lora', serif; font-size: 24px; font-weight: 600; margin-top: 4px; }
.modal-fineprint { font-size: 12px; color: var(--ink-soft); margin-top: 12px; line-height: 1.45; }
.modal-processing, .modal-success, .modal-error { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 20px 0; text-align: center; font-size: 14px; }
.modal-link { display: flex; flex-direction: column; gap: 8px; padding: 6px 0; }
.mock-note { font-size: 13px; color: var(--ink-soft); line-height: 1.5; margin-bottom: 6px; }
.spinner { width: 28px; height: 28px; border: 3px solid var(--line); border-top-color: var(--ink); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.success-mark { width: 40px; height: 40px; border-radius: 50%; background: var(--green); color: var(--white); display: flex; align-items: center; justify-content: center; font-size: 20px; }
.chip-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 22px; }
.chip { border: 1px solid var(--line); background: var(--paper); padding: 7px 14px; border-radius: 16px; font-size: 13.5px; cursor: pointer; }
.chip-selected { background: var(--ink); color: var(--white); border-color: var(--ink); }
.topic-list { display: flex; flex-direction: column; gap: 1px; border: 1px solid var(--line); }
.topic-row { display: flex; justify-content: space-between; align-items: center; background: var(--white); border: none; border-bottom: 1px solid var(--line); padding: 14px 16px; text-align: left; cursor: pointer; font-size: 14.5px; }
.topic-row:last-child { border-bottom: none; }
.topic-row:hover { background: var(--paper); }
.topic-meta { font-size: 12.5px; color: var(--ink-soft); }
.band-picker { padding: 8px 0 4px; }
.ask-anything { border: 1px solid var(--line); background: var(--paper); padding: 14px 16px; margin-bottom: 16px; }
.ask-anything-label { font-size: 13px; color: var(--ink-soft); margin-bottom: 10px; }
.reading-list { border-top: 1px dashed var(--line); margin-top: 20px; padding-top: 16px; }
.reading-list-title { font-family: 'Lora', serif; font-weight: 600; font-size: 14.5px; margin-bottom: 8px; }
.reading-list-empty { font-size: 13px; color: var(--ink-soft); }
.reading-list-items { margin: 0; padding-left: 18px; font-size: 13.5px; display: flex; flex-direction: column; gap: 8px; }
.reading-list-book { font-weight: 600; }
.reading-list-author { color: var(--ink-soft); }
.reading-list-note { font-size: 12.5px; color: var(--ink-soft); }
.session-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.session-title { font-family: 'Lora', serif; font-weight: 600; font-size: 17px; }
.chat { border: 1px solid var(--line); background: var(--paper); padding: 16px; height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.bubble { max-width: 80%; padding: 10px 14px; font-size: 14.5px; line-height: 1.5; border-radius: 3px; }
.bubble-assistant { align-self: flex-start; background: var(--white); border-left: 3px solid var(--gold); }
.bubble-user { align-self: flex-end; background: var(--ink); color: var(--white); }
.bubble-loading { color: var(--ink-soft); }
.chat-error { color: var(--rust); font-size: 13px; }
.chat-input-row { display: flex; gap: 8px; margin-top: 10px; }
.chat-input { flex: 1; border: 1px solid var(--line); padding: 10px 12px; font-size: 14px; font-family: 'IBM Plex Sans', sans-serif; }
.session-actions { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
.section-break { display: flex; align-items: center; gap: 12px; margin: 30px 0 18px; color: var(--ink-soft); font-size: 12.5px; }
.section-break::before, .section-break::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.quiz-loading { color: var(--ink-soft); font-size: 14px; }
.quiz-question { margin-bottom: 18px; }
.quiz-question-prompt { font-size: 14.5px; margin-bottom: 8px; }
.quiz-options { display: flex; flex-direction: column; gap: 6px; }
.quiz-option { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); padding: 8px 12px; font-size: 14px; cursor: pointer; border-radius: 3px; }
.quiz-option-selected { border-color: var(--ink); background: var(--paper); }
.quiz-result { text-align: center; }
.score-seal { width: 84px; height: 84px; border-radius: 50%; border: 2px solid var(--gold); display: flex; align-items: center; justify-content: center; font-family: 'Lora', serif; font-size: 22px; font-weight: 600; margin: 0 auto 10px; }
.quiz-result-pct { font-size: 14px; color: var(--ink-soft); margin-bottom: 6px; }
.disclaimer { font-size: 12px; color: var(--ink-soft); margin-bottom: 20px; }
.quiz-review { text-align: left; display: flex; flex-direction: column; gap: 14px; }
.quiz-review-prompt { display: flex; gap: 8px; font-size: 14px; }
.mark { flex-shrink: 0; }
.mark-correct { color: var(--green); }
.mark-incorrect { color: var(--rust); }
.quiz-review-explanation { font-size: 13px; color: var(--ink-soft); margin-left: 22px; }
.report-text { line-height: 1.6; font-size: 14.5px; white-space: pre-wrap; }
.auth-wrap { max-width: 420px; margin: 40px auto 0; }
.auth-tabs { display: flex; gap: 4px; margin-bottom: 18px; }
.auth-tab { flex: 1; background: var(--paper); border: 1px solid var(--line); padding: 9px; cursor: pointer; font-size: 14px; border-radius: 3px; }
.auth-tab-active { background: var(--ink); color: var(--white); border-color: var(--ink); }
.auth-form { display: flex; flex-direction: column; gap: 14px; margin-top: 10px; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--ink-soft); }
.field input { border: 1px solid var(--line); padding: 9px 11px; font-size: 14px; font-family: 'IBM Plex Sans', sans-serif; color: var(--ink); }
.field-error { color: var(--rust); font-size: 13px; }
.proto-tools { position: fixed; bottom: 14px; right: 14px; z-index: 40; }
.proto-toggle { background: var(--ink); color: var(--white); border: none; padding: 8px 14px; font-size: 12.5px; border-radius: 3px; cursor: pointer; }
.proto-panel { background: var(--white); border: 1px dashed var(--ink-soft); padding: 14px; margin-top: 8px; width: 300px; max-height: 70vh; overflow-y: auto; font-size: 12.5px; }
.proto-panel-label { color: var(--ink-soft); margin-bottom: 8px; line-height: 1.4; }
.backend-badge { font-size: 12.5px; margin-bottom: 8px; }
.backend-form { display: flex; gap: 6px; align-items: center; }
.backend-form .chat-input { padding: 6px 8px; font-size: 12.5px; }
@media (max-width: 560px) {
  .paper { padding: 22px 18px; }
  .paper::before { left: 30px; }
  .chat { height: 260px; }
}
`;
