// Guide / curriculum configuration for Exaai.
//
// IMPORTANT (PRD OD-01, OD-02, section 19): exact official ministry guides and
// exam structures must be validated before production. The data below is a
// *draft configuration* modeled on the common Algerian English exam shape
// (Reading comprehension / Text exploration / Written expression, 7 + 8 + 5
// marks) and on the standard curriculum unit names. It lives in code so the
// MVP works end-to-end, and the GuideConfig table stores the governance
// metadata (version, source reference, active flag) per PRD section 19.3.

export type Level = "middle" | "secondary";

export interface SkillRule {
  skill: string; // VOCABULARY | MORPHOLOGY | PHONOLOGY | GRAMMAR | DISCOURSE
  family: string; // task family identifier
  marks: number;
  instruction: string;
}

export interface PartOneRule {
  family: string;
  marks: number;
  instruction: string;
}

export interface WritingRule {
  marks: number;
  forms: string[];
  guidedLength: string;
  freeLength: string;
  guidedInstruction: string;
  freeInstruction: string;
}

export interface Guide {
  key: string;
  name: string;
  level: Level;
  grade: string;
  version: string;
  sourceRef: string;
  lengthOptions: number[];
  defaultLength: number;
  marks: { partOne: number; textExploration: number; writing: number };
  partOne: PartOneRule[];
  textExploration: { heading: string; marksLabel: string; skills: SkillRule[] };
  writing: WritingRule;
}

export interface UnitDef {
  key: string;
  label: string;
  theme: string; // theme key in src/data/themes.ts
  topics: string[];
}

export interface GradeDef {
  grade: string;
  label: string;
  level: Level;
  streams: string[] | null;
  units: UnitDef[];
}

export const LEVELS: { key: Level; label: string; grades: string[] }[] = [
  { key: "middle", label: "Middle school", grades: ["1am", "2am", "3am", "4am"] },
  { key: "secondary", label: "Secondary school", grades: ["1as", "2as", "3as"] },
];

export const GRADES: Record<string, GradeDef> = {
  "1am": {
    grade: "1am",
    label: "1 AM",
    level: "middle",
    streams: null,
    units: [
      {
        key: "u-personality",
        label: "Me and my personality",
        theme: "friendship",
        topics: ["Friendship and being a good friend", "My hobbies and free time", "Knowing myself and my strengths"],
      },
      {
        key: "u-family",
        label: "Me and my family",
        theme: "family",
        topics: ["My family members and roles", "Family meals and traditions", "Helping at home"],
      },
      {
        key: "u-environment",
        label: "Me and my environment",
        theme: "environment",
        topics: ["My neighbourhood", "Keeping my environment clean", "Nature around me"],
      },
      {
        key: "u-school",
        label: "Me and my school",
        theme: "school",
        topics: ["My school day", "My favourite subjects", "School rules and behaviour"],
      },
    ],
  },
  "2am": {
    grade: "2am",
    label: "2 AM",
    level: "middle",
    streams: null,
    units: [
      {
        key: "u-friends",
        label: "Me and my friends",
        theme: "friendship",
        topics: ["Choosing good friends", "Respecting differences", "Dealing with disagreements"],
      },
      {
        key: "u-family",
        label: "Me and my family life",
        theme: "family",
        topics: ["Family routines", "Generations in my family", "Family celebrations"],
      },
      {
        key: "u-neighbourhood",
        label: "Me and my neighbourhood",
        theme: "community",
        topics: ["My neighbourhood and its people", "Helping neighbours", "Public places I use"],
      },
      {
        key: "u-school",
        label: "Me and my school life",
        theme: "school",
        topics: ["A day at school", "My teachers and classmates", "After-school activities"],
      },
    ],
  },
  "3am": {
    grade: "3am",
    label: "3 AM",
    level: "middle",
    streams: null,
    units: [
      {
        key: "u-interests",
        label: "Me and my interests",
        theme: "hobbies",
        topics: ["My favourite hobbies", "Reading and stories I love", "Sports and games"],
      },
      {
        key: "u-community",
        label: "Me and my community",
        theme: "community",
        topics: ["Volunteering in my community", "Helping people in need", "Being a good citizen"],
      },
      {
        key: "u-env",
        label: "Me and my environment",
        theme: "environment",
        topics: ["Protecting nature", "Water and energy saving", "Pollution around us"],
      },
      {
        key: "u-health",
        label: "Me and my health",
        theme: "health",
        topics: ["Healthy eating habits", "Sport and keeping fit", "Sleep and daily routines"],
      },
    ],
  },
  "4am": {
    grade: "4am",
    label: "4 AM",
    level: "middle",
    streams: null,
    units: [
      {
        key: "u-relationships",
        label: "Me, my personality and my relationships",
        theme: "friendship",
        topics: ["Being a reliable friend", "Honesty in relationships", "Cooperation and teamwork"],
      },
      {
        key: "u-family",
        label: "Me and my family",
        theme: "family",
        topics: ["My family values", "Sharing responsibilities", "Family memories"],
      },
      {
        key: "u-env",
        label: "Me and my environment",
        theme: "environment",
        topics: ["Protecting our planet", "Reduce, reuse, recycle", "Clean cities, clean future"],
      },
      {
        key: "u-health",
        label: "Me and my health",
        theme: "health",
        topics: ["Balanced diet", "The importance of sport", "Health habits for teenagers"],
      },
      {
        key: "u-school",
        label: "Me and my school",
        theme: "school",
        topics: ["My future career", "Preparing for exams", "School clubs and projects"],
      },
    ],
  },
  "1as": {
    grade: "1as",
    label: "1 AS",
    level: "secondary",
    streams: ["Tronc commun Lettres", "Tronc commun Sciences", "Tronc commun Technologie", "Tronc commun Gestion"],
    units: [
      {
        key: "u-getting",
        label: "Getting through",
        theme: "school",
        topics: ["School life and study habits", "Managing time wisely", "Setting goals for the year"],
      },
      {
        key: "u-once",
        label: "Once upon a time",
        theme: "culture",
        topics: ["Famous legends and heroes", "Stories that teach values", "Historical heritage"],
      },
      {
        key: "u-treat",
        label: "It's my treat",
        theme: "food",
        topics: ["Traditional food and recipes", "Healthy eating", "Food around the world"],
      },
      {
        key: "u-eureka",
        label: "Eureka!",
        theme: "technology",
        topics: ["Great inventions", "Young inventors", "Science in daily life"],
      },
      {
        key: "u-family",
        label: "We are family",
        theme: "family",
        topics: ["Family values today", "Between generations", "Roles in the family"],
      },
      {
        key: "u-island",
        label: "No man is an island",
        theme: "community",
        topics: ["Volunteering and solidarity", "Charity work", "Being a responsible citizen"],
      },
    ],
  },
  "2as": {
    grade: "2as",
    label: "2 AS",
    level: "secondary",
    streams: ["Lettres et Philosophie", "Lettres et Langues Étrangères", "Sciences Expérimentales", "Mathématiques", "Gestion et Économie", "Technologie"],
    units: [
      {
        key: "u-signs",
        label: "Signs of the time",
        theme: "culture",
        topics: ["Fashion and identity", "Music and generations", "Media and social networks"],
      },
      {
        key: "u-peace",
        label: "Make peace",
        theme: "community",
        topics: ["Resolving conflicts", "Tolerance and respect", "Peace in the world"],
      },
      {
        key: "u-waste",
        label: "Waste not, want not",
        theme: "environment",
        topics: ["Saving natural resources", "Recycling and waste management", "Sustainable development"],
      },
      {
        key: "u-scientist",
        label: "Budding scientist",
        theme: "technology",
        topics: ["Choosing a scientific career", "Famous scientists", "Experiments and discoveries"],
      },
      {
        key: "u-planet",
        label: "Is it a planet?",
        theme: "technology",
        topics: ["Space exploration", "Astronomy and the universe", "Life in the future"],
      },
    ],
  },
  "3as": {
    grade: "3as",
    label: "3 AS",
    level: "secondary",
    streams: ["Lettres et Philosophie", "Lettres et Langues Étrangères", "Sciences Expérimentales", "Mathématiques", "Gestion et Économie", "Technique Mathématique"],
    units: [
      {
        key: "u-past",
        label: "Exploring the past",
        theme: "culture",
        topics: ["Ancient civilisations", "Archaeology and heritage", "Lessons from history"],
      },
      {
        key: "u-education",
        label: "Education, teaching and learning",
        theme: "school",
        topics: ["The future of education", "Learning skills for life", "Education for all"],
      },
      {
        key: "u-innovation",
        label: "Innovation in science and technology",
        theme: "technology",
        topics: ["Artificial intelligence", "Biotechnology and medicine", "Innovations that changed the world"],
      },
      {
        key: "u-concerns",
        label: "Life concerns",
        theme: "health",
        topics: ["Health and modern life", "Global issues and ethics", "Youth and future challenges"],
      },
    ],
  },
};

export const GUIDES: Record<string, Guide> = {
  "1am": guide("1am", "Middle school — 1 AM", "middle", "1am"),
  "2am": guide("2am", "Middle school — 2 AM", "middle", "2am"),
  "3am": guide("3am", "Middle school — 3 AM", "middle", "3am"),
  "4am": guide("4am", "Middle school — 4 AM", "middle", "4am"),
  "1as": guide("1as", "Secondary school — 1 AS", "secondary", "1as"),
  "2as": guide("2as", "Secondary school — 2 AS", "secondary", "2as"),
  "3as": guide("3as", "Secondary school — 3 AS", "secondary", "3as"),
};

function guide(key: string, name: string, level: Level, grade: string): Guide {
  return {
    key,
    name,
    level,
    grade,
    version: "2025.1-draft",
    sourceRef: "Draft configuration pending official guide validation (PRD OD-01)",
    lengthOptions: [150, 250],
    defaultLength: 150,
    marks: { partOne: 7, textExploration: 8, writing: 5 },
    partOne: [
      {
        family: "QUESTIONS",
        marks: 2,
        instruction: "Answer the following questions according to the text.",
      },
      {
        family: "TRUE_FALSE",
        marks: 2,
        instruction: "Say whether the following statements are true or false according to the text. Justify your answers.",
      },
      {
        family: "LEXIS_MEANING",
        marks: 1.5,
        instruction: "Find in the text words or phrases that are closest in meaning to the following.",
      },
      {
        family: "LEXIS_OPPOSITE",
        marks: 1.5,
        instruction: "Find in the text words or phrases that are opposite in meaning to the following.",
      },
    ],
    textExploration: {
      heading: "B. Text exploration",
      marksLabel: "08 pts",
      skills: [
        {
          skill: "VOCABULARY",
          family: "MEANING",
          marks: 2,
          instruction:
            "Match each word with its definition / find the closest meaning of the underlined words.",
        },
        {
          skill: "MORPHOLOGY",
          family: "WORD_FAMILY",
          marks: 1.5,
          instruction: "Complete the table / give the noun (or verb / adjective / adverb) derived from the following words.",
        },
        {
          skill: "PHONOLOGY",
          family: "SOUND_CLASS",
          marks: 1.5,
          instruction: "Classify the following words according to the pronunciation of the final '-s' (or final '-ed').",
        },
        {
          skill: "GRAMMAR",
          family: "REWRITE",
          marks: 2,
          instruction: "Rewrite the following sentences without changing their meaning.",
        },
        {
          skill: "DISCOURSE",
          family: "GAP_FILL",
          marks: 1,
          instruction: "Fill in the gaps with the correct words from the list.",
        },
      ],
    },
    writing: {
      marks: 5,
      forms: ["a paragraph", "an email", "a short article", "a diary entry", "a speech"],
      guidedLength: "about 80–100 words",
      freeLength: "about 80–100 words",
      guidedInstruction:
        "Write a paragraph of about 80–100 words on the following topic, using the notes given.",
      freeInstruction: "Write a paragraph of about 80–100 words on the following topic.",
    },
  };
}

export function getGuide(grade: string): Guide {
  const g = GUIDES[grade];
  if (!g) throw new Error(`No guide configuration for grade "${grade}"`);
  return g;
}

export function getGrade(grade: string): GradeDef {
  const d = GRADES[grade];
  if (!d) throw new Error(`No grade definition for "${grade}"`);
  return d;
}
