/**
 * Subject catalog — now spans two things under one roof:
 *
 * 1. WASSCE Study Hall: the 23-subject Senior Secondary (Grades
 *    10-12) exam-prep catalog, unchanged from before.
 * 2. Lecture Hall: Grades 1-9 reinforcement content, added here.
 *
 * BANDS is the source of truth for grade-band ids, matching the
 * structure in Gambia's MoBSE "Curriculum Framework for Basic
 * Education" (2011): Lower Primary (G1-3), Upper Primary (G4-6),
 * Upper Basic (G7-9). Senior Secondary (G10-12) is WAEC's own.
 *
 * A subject's `topicsByBand` only has keys for the bands it's
 * actually taught in — most subjects don't span all four. Where a
 * subject forks into different named subjects at Senior Secondary
 * (e.g. "Science" at Upper Basic becomes Biology/Chemistry/Physics
 * as separate electives), that's modelled as separate catalog
 * entries rather than one artificially continuous "family" — matches
 * how the two levels actually relate, and keeps this from turning
 * into a more complex model than the content needs.
 *
 * Topic lists for the Basic Education bands are condensed from the
 * real 2011 MoBSE framework's "themes for sub-learning areas" tables
 * — a reasonable starting scaffold, not exhaustive. Everything below
 * is deliberately light per topic (Lecture Hall explains concepts
 * and sketches diagrams on demand rather than delivering full
 * written lecture notes — students already have their textbooks).
 *
 * category: "core" | "elective" (Senior Secondary sense; basic-level
 *           subjects here are effectively all core/compulsory)
 * streams: which WASSCE stream(s) commonly carry this subject —
 *          only meaningful at the senior-secondary band.
 * readingList: [{ title, author, note }] — starts empty; filled in
 *          by hand as recommended texts are curated per subject.
 */

const BANDS = [
  { id: "lower-primary", label: "Lower Primary (Grades 1–3)" },
  { id: "upper-primary", label: "Upper Primary (Grades 4–6)" },
  { id: "upper-basic", label: "Upper Basic (Grades 7–9)" },
  { id: "senior-secondary", label: "Senior Secondary (Grades 10–12)" },
];

const SUBJECTS = [
  // ---------------- Core (spans multiple bands) ----------------
  {
    id: "english",
    name: "English Language",
    category: "core",
    streams: ["science", "arts", "commercial"],
    syllabusVersion: "2026-draft",
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
    streams: ["science", "arts", "commercial"],
    syllabusVersion: "2026-draft",
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

  // ---------------- Basic Education only (Lecture Hall) ----------------
  {
    id: "integrated-studies",
    name: "Integrated Studies",
    category: "core",
    streams: [],
    syllabusVersion: "2026-draft",
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
    streams: [],
    syllabusVersion: "2026-draft",
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
    streams: [],
    syllabusVersion: "2026-draft",
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
    streams: [],
    syllabusVersion: "2026-draft",
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

  // ---------------- Science electives (Senior Secondary) ----------------
  {
    id: "integrated-science",
    name: "Integrated Science",
    category: "core",
    streams: ["science", "arts", "commercial"],
    syllabusVersion: "2026-draft",
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
    streams: ["science", "arts", "commercial"],
    syllabusVersion: "2026-draft",
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
    streams: ["science", "arts", "commercial"],
    syllabusVersion: "2026-draft",
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
    streams: ["science"],
    syllabusVersion: "2026-draft",
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
    streams: ["science"],
    syllabusVersion: "2026-draft",
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
    streams: ["science"],
    syllabusVersion: "2026-draft",
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
    streams: ["science"],
    syllabusVersion: "2026-draft",
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
    streams: ["science"],
    syllabusVersion: "2026-draft",
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
    streams: ["science", "arts"],
    syllabusVersion: "2026-draft",
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
    streams: ["science", "commercial"],
    syllabusVersion: "2026-draft",
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

  // ---------------- Arts electives (Senior Secondary) ----------------
  {
    id: "government",
    name: "Government",
    category: "elective",
    streams: ["arts"],
    syllabusVersion: "2026-draft",
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
    streams: ["arts"],
    syllabusVersion: "2026-draft",
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
    streams: ["arts"],
    syllabusVersion: "2026-draft",
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
    streams: ["arts"],
    syllabusVersion: "2026-draft",
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
    streams: ["arts"],
    syllabusVersion: "2026-draft",
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
    streams: ["arts", "science"],
    syllabusVersion: "2026-draft",
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

  // ---------------- Commercial electives (Senior Secondary) ----------------
  {
    id: "financial-accounting",
    name: "Financial Accounting",
    category: "elective",
    streams: ["commercial"],
    syllabusVersion: "2026-draft",
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
    streams: ["commercial"],
    syllabusVersion: "2026-draft",
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
    streams: ["commercial"],
    syllabusVersion: "2026-draft",
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
    streams: ["commercial"],
    syllabusVersion: "2026-draft",
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
    streams: ["commercial"],
    syllabusVersion: "2026-draft",
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

function listSubjects() {
  return SUBJECTS.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    streams: s.streams,
    syllabusVersion: s.syllabusVersion,
    readingList: s.readingList,
    bands: Object.keys(s.topicsByBand),
    topicsByBand: s.topicsByBand,
  }));
}

function getSubject(id) {
  return SUBJECTS.find((s) => s.id === id) || null;
}

function getTopicsForBand(subjectId, bandId) {
  const subject = getSubject(subjectId);
  if (!subject) return null;
  return subject.topicsByBand[bandId] || null;
}

module.exports = { BANDS, SUBJECTS, listSubjects, getSubject, getTopicsForBand };
