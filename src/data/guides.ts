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
  constraints?: {
    maxStatements?: number;
    maxQuestions?: number;
    maxIdeas?: number;
    maxWords?: number;
    includeInference?: boolean;
  };
}

// Stream categories per the 2017 Ministry Exam Guide
export type StreamCategory = "foreign_languages" | "literature_philosophy" | "sciences";

export function getStreamCategory(stream: string | null): StreamCategory {
  if (!stream) return "foreign_languages";
  if (stream.includes("Lettres et Langues") || stream.includes("Tronc commun Lettres")) return "foreign_languages";
  if (stream.includes("Philosophie")) return "literature_philosophy";
  return "sciences";
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
  language: string; // "en" (PRD 38.1: future "fr", "es" without redesign)
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
        topics: ["Friendship and being a good friend", "My hobbies and free time", "Knowing myself and my strengths", "Being kind to others", "My personality traits", "What makes a good friend", "Spending time with friends", "Being yourself", "Helping friends in need", "Sharing and caring", "My daily routine", "What I like and dislike", "Being a good listener", "Playing games together", "Learning from mistakes", "Being honest with friends", "Making new friends at school", "Enjoying outdoor activities", "My favourite season", "Dreams and goals"],
      },
      {
        key: "u-family",
        label: "Me and my family",
        theme: "family",
        topics: ["My family members and roles", "Family meals and traditions", "Helping at home", "My parents and me", "Brothers and sisters", "Family gatherings", "Cooking together", "Family traditions", "Grandparents stories", "Pet care at home", "Family games night", "Visiting relatives", "Family photos and memories", "Household chores", "Family holidays", "Family recipes", "Bedtime routines", "Family shopping trips", "Teaching younger siblings", "Sunday family outings"],
      },
      {
        key: "u-environment",
        label: "Me and my environment",
        theme: "environment",
        topics: ["My neighbourhood", "Keeping my environment clean", "Nature around me", "The park near my house", "Trees and flowers", "Clean streets matter", "My favourite outdoor place", "Weather and seasons", "Recycling at home", "Water is precious", "Air pollution problems", "Saving electricity", "Animals in my area", "Community gardens", "Keeping water clean", "Walking and cycling", "Green spaces in cities", "Litter and its effects", "The importance of trees", "Climate change basics"],
      },
      {
        key: "u-school",
        label: "Me and my school",
        theme: "school",
        topics: ["My school day", "My favourite subjects", "School rules and behaviour", "My classroom", "School assemblies", "Break time fun", "School library", "My teachers", "School trips", "School meals", "After school clubs", "Homework time", "School uniforms", "My school friends", "Sports day", "Art and craft classes", "Music lessons", "School projects", "Classroom jobs", "School playground"],
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
        topics: ["Choosing good friends", "Respecting differences", "Dealing with disagreements", "Making friends online", "Friendship across cultures", "Supporting friends", "True friends vs fair-weather friends", "Friendship at school", "How to apologise", "Being a loyal friend", "Friendship and trust", "Group activities with friends", "Helping a friend in trouble", "Writing a letter to a friend", "Pen pals around the world", "Friendship bracelets", "Playing team sports", "Birthday parties", "Friendship songs and stories", "Conflict resolution skills"],
      },
      {
        key: "u-family",
        label: "Me and my family life",
        theme: "family",
        topics: ["Family routines", "Generations in my family", "Family celebrations", "My grandparents' stories", "Family tree project", "Family vacation memories", "Cooking traditional dishes", "Family game nights", "Siblings and me", "Family photo album", "Holiday traditions", "Family outings and picnics", "Helping parents at home", "Family birthdays and parties", "Learning family recipes", "Family values we share", "Visiting relatives", "Family disagreements and how we solve them", "Family reunions", "Family support during exams"],
      },
      {
        key: "u-neighbourhood",
        label: "Me and my neighbourhood",
        theme: "community",
        topics: ["My neighbourhood and its people", "Helping neighbours", "Public places I use", "The local market", "Shops and stores nearby", "Community centre activities", "Neighbourhood safety", "Local library visits", "Parks and playgrounds", "Neighbourhood festivals", "Local healthcare clinic", "Transportation in my area", "Neighbourhood history", "Clean-up day events", "Local sports facilities", "Religious buildings nearby", "School in the neighbourhood", "Friends from the neighbourhood", "Local post office", "Emergency services in my area"],
      },
      {
        key: "u-school",
        label: "Me and my school life",
        theme: "school",
        topics: ["A day at school", "My teachers and classmates", "After-school activities", "My favourite lesson", "School assemblies", "Break time games", "School trips and excursions", "Homework and study time", "School library visits", "Sports day at school", "School concerts and performances", "Classroom displays", "School newsletters", "Parent-teacher meetings", "School uniform policy", "Canteen and school meals", "Exam preparation tips", "School clubs and societies", "Classroom responsibilities", "Friendship at school"],
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
        topics: ["My favourite hobbies", "Reading and stories I love", "Sports and games", "Painting and drawing", "Playing musical instruments", "Collecting things", "Gardening activities", "Cooking and baking", "Photography as a hobby", "Dancing and singing", "Board games and puzzles", "Building models", "Writing stories and poems", "Watching nature", "Swimming and water sports", "Cycling adventures", "Learning new skills", "Crafts and DIY projects", "Volunteer work in free time", "Technology and coding"],
      },
      {
        key: "u-community",
        label: "Me and my community",
        theme: "community",
        topics: ["Volunteering in my community", "Helping people in need", "Being a good citizen", "Community clean-up days", "Local charity work", "Helping elderly neighbours", "Community gardens and parks", "Blood donation drives", "Visiting orphanages", "Helping during festivals", "Community sports events", "Library volunteer programmes", "Environmental awareness campaigns", "Supporting local businesses", "Community cultural events", "Teaching younger children", "Community safety initiatives", "Organising neighbourhood meetings", "Helping during emergencies", "Building community spirit"],
      },
      {
        key: "u-env",
        label: "Me and my environment",
        theme: "environment",
        topics: ["Protecting nature", "Water and energy saving", "Pollution around us", "Reducing plastic waste", "Recycling paper and glass", "Saving endangered species", "Clean air initiatives", "Community recycling projects", "Energy conservation at home", "Green transportation options", "Planting trees in our area", "Water treatment processes", "Reducing carbon footprint", "Wildlife protection efforts", "Clean oceans campaign", "Sustainable living tips", "Environmental education", "Green technology innovations", "Climate change awareness", "Eco-friendly products"],
      },
      {
        key: "u-health",
        label: "Me and my health",
        theme: "health",
        topics: ["Healthy eating habits", "Sport and keeping fit", "Sleep and daily routines", "Drinking enough water", "Screen time and health", "Mental health awareness", "Personal hygiene basics", "Breakfast importance", "Vitamins and nutrition", "Outdoor exercise benefits", "Managing stress", "Staying active at home", "Healthy snack choices", "The food pyramid", "Rest and recovery", "Sports and teamwork", "Yoga and relaxation", "Benefits of walking", "Keeping a health diary", "Health checks at school"],
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
        topics: ["Being a reliable friend", "Honesty in relationships", "Cooperation and teamwork", "Building trust with others", "Active listening skills", "Standing up for friends", "Resolving peer conflicts", "Social media and friendships", "Peer pressure and how to handle it", "Emotional intelligence basics", "Bullying prevention", "Inclusive friendships", "Long-distance friendships", "Friendship and boundaries", "Group project dynamics", "Cultural differences in friendship", "Gender and friendships", "Friendship in the digital age", "Supporting friends through difficulties", "Making amends after arguments"],
      },
      {
        key: "u-family",
        label: "Me and my family",
        theme: "family",
        topics: ["My family values", "Sharing responsibilities", "Family memories", "Family traditions we keep", "Family meals together", "Supporting family members", "Family holidays and celebrations", "Family history and ancestors", "Roles in our household", "Conflict resolution in families", "Family communication styles", "Celebrating family achievements", "Family health and wellbeing", "Financial planning for families", "Family recreation activities", "Intergenerational relationships", "Family and cultural identity", "Adapting to family changes", "Family support networks", "The meaning of home"],
      },
      {
        key: "u-env",
        label: "Me and my environment",
        theme: "environment",
        topics: ["Protecting our planet", "Reduce, reuse, recycle", "Clean cities, clean future", "Climate change awareness", "Saving water at home", "Energy-saving habits", "Plastic pollution solutions", "Green transport choices", "Urban green spaces", "Wildlife conservation", "Renewable energy sources", "Sustainable development goals", "Environmental activism youth", "Carbon footprint reduction", "Ocean pollution and marine life", "Air quality monitoring", "Composting and organic waste", "Green building design", "Environmental policy impact", "Community environmental projects"],
      },
      {
        key: "u-health",
        label: "Me and my health",
        theme: "health",
        topics: ["Balanced diet", "The importance of sport", "Health habits for teenagers", "Mental health awareness", "Sleep quality and duration", "Managing exam stress", "Physical fitness goals", "Healthy eating on a budget", "Digital wellness and screen time", "Substance abuse prevention", "Body image and self-esteem", "First aid basics", "Regular health check-ups", "Healthy relationships and boundaries", "Sleep hygiene for students", "Nutrition labels and choices", "Stress management techniques", "Outdoor activities for wellbeing", "Healthy school environment", "Peer support for health"],
      },
      {
        key: "u-school",
        label: "Me and my school",
        theme: "school",
        topics: ["My future career", "Preparing for exams", "School clubs and projects", "Choosing a career path", "Study techniques that work", "Time management skills", "University preparation tips", "Work experience opportunities", "Exam revision strategies", "Balancing school and hobbies", "CV writing for beginners", "Interview skills practice", "Goal setting for students", "Study group dynamics", "Exam anxiety and coping", "Scholarship opportunities", "Career guidance services", "Lifelong learning mindset", "Student leadership roles", "Planning for success"],
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
        topics: ["School life and study habits", "Managing time wisely", "Setting goals for the year", "Effective note-taking methods", "Revision techniques for exams", "Balancing workload and rest", "Study space organisation", "Online learning resources", "Group study sessions", "Teacher-student relationships", "Academic integrity and honesty", "Handling academic pressure", "Choosing the right study method", "Weekly study planner", "Understanding your learning style", "Overcoming procrastination", "Active learning strategies", "Academic goal-setting framework", "Dealing with difficult subjects", "Building academic confidence"],
      },
      {
        key: "u-once",
        label: "Once upon a time",
        theme: "culture",
        topics: ["Famous legends and heroes", "Stories that teach values", "Historical heritage", "Algerian folklore and tales", "Myths and their meanings", "Legendary figures in history", "Oral storytelling traditions", "Cultural festivals and rituals", "Famous historical events", "Stories passed through generations", "Heroism in everyday life", "Ancient civilisations and their legacies", "National heroes and heroines", "The power of narrative", "Teaching through stories", "Legends from around the world", "Historical monuments and their stories", "Stories of courage and sacrifice", "Literary heroes and their impact", "Cultural identity through storytelling"],
      },
      {
        key: "u-treat",
        label: "It's my treat",
        theme: "food",
        topics: ["Traditional food and recipes", "Healthy eating", "Food around the world", "Algerian cuisine and culture", "Cooking as a life skill", "Food safety and hygiene", "Vegetarian and vegan diets", "Street food culture", "Food and identity", "Family recipes and traditions", "Superfoods and nutrition", "Food waste reduction", "School canteen meals", "Fasting and cultural practices", "Food labeling and consumer choices", "Global food security", "Organic food movement", "Food and technology", "Culinary tourism", "The science of cooking"],
      },
      {
        key: "u-eureka",
        label: "Eureka!",
        theme: "technology",
        topics: ["Great inventions", "Young inventors", "Science in daily life", "The history of technology", "Famous Algerian inventors", "How electricity was discovered", "The invention of the internet", "Medical breakthroughs", "Transportation innovations", "Communication technology evolution", "Space exploration inventions", "Sustainable technology solutions", "Inventions that changed education", "Patent systems and innovation", "The future of technology", "STEM education and innovation", "Problem-solving through invention", "Technology and ethical dilemmas", "Collaborative innovation", "From idea to product"],
      },
      {
        key: "u-family",
        label: "We are family",
        theme: "family",
        topics: ["Family values today", "Between generations", "Roles in the family", "Changing family structures", "Parenting in the digital age", "Sibling relationships and dynamics", "Family decision-making processes", "Cultural traditions in families", "Working parents and family life", "Grandparents as family pillars", "Blended families and step-parenting", "Family meals and communication", "Elderly care within families", "Family financial management", "Supporting children's education", "Family conflict resolution strategies", "The role of family in mental health", "Family traditions across cultures", "Maintaining family bonds", "The meaning of family in modern society"],
      },
      {
        key: "u-island",
        label: "No man is an island",
        theme: "community",
        topics: ["Volunteering and solidarity", "Charity work", "Being a responsible citizen", "Community service projects", "Social responsibility awareness", "Helping refugees and displaced persons", "International aid organisations", "Youth activism and engagement", "Civic participation in democracy", "Human rights and social justice", "Building inclusive communities", "Environmental volunteering", "Mentoring younger students", "Disaster relief efforts", "Supporting local charities", "Promoting peace through action", "Cultural exchange programmes", "Social entrepreneurship", "Community development initiatives", "Making a difference locally"],
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
        topics: ["Fashion and identity", "Music and generations", "Media and social networks", "Youth culture and trends", "Traditional vs modern clothing", "Digital literacy skills", "Internet safety and awareness", "Influence of advertising on youth", "The role of music in culture", "Social media and self-image", "Celebrity culture and its impact", "Fashion sustainability and ethics", "Hip-hop and global youth culture", "Traditional music instruments", "Photography and visual storytelling", "Censorship and freedom of expression", "Film and its cultural influence", "The rise of podcast culture", "Video gaming and community", "Cultural exchange through media"],
      },
      {
        key: "u-peace",
        label: "Make peace",
        theme: "community",
        topics: ["Resolving conflicts", "Tolerance and respect", "Peace in the world", "Diplomacy and negotiation", "Conflict transformation methods", "Building bridges between communities", "The cost of war on civilians", "Peace education in schools", "Intercultural dialogue", "Gender equality and peace", "Youth-led peace initiatives", "Post-conflict reconstruction", "The role of media in peacebuilding", "Non-violent communication", "Mediation and arbitration", "Refugee experiences and empathy", "Global peace movements", "Environmental peacekeeping", "Conflict resolution in daily life", "The philosophy of peace"],
      },
      {
        key: "u-waste",
        label: "Waste not, want not",
        theme: "environment",
        topics: ["Saving natural resources", "Recycling and waste management", "Sustainable development", "The circular economy concept", "Electronic waste solutions", "Water conservation strategies", "Deforestation and its effects", "Green energy alternatives", "Plastic bag bans worldwide", "Industrial pollution control", "Sustainable agriculture practices", "Urban waste reduction programmes", "Global warming and resource depletion", "Marine resource protection", "Sustainable fishing practices", "The zero-waste lifestyle", "Forest conservation efforts", "Fossil fuel alternatives", "Biodiversity and natural resources", "Environmental policy and action"],
      },
      {
        key: "u-scientist",
        label: "Budding scientist",
        theme: "technology",
        topics: ["Choosing a scientific career", "Famous scientists", "Experiments and discoveries", "The scientific method explained", "Women in science and technology", "Algerian scientists and researchers", "Laboratory safety and protocols", "Physics and its everyday applications", "Chemistry in the kitchen", "Biology and the natural world", "Environmental science and climate", "Genetic research and ethics", "Scientific literacy and critical thinking", "Science fairs and competitions", "Career paths in STEM fields", "Mathematics in scientific research", "Technology and scientific progress", "Science communication and journalism", "The future of scientific discovery", "Collaborative research across borders"],
      },
      {
        key: "u-planet",
        label: "Is it a planet?",
        theme: "technology",
        topics: ["Space exploration", "Astronomy and the universe", "Life in the future", "The solar system and its planets", "Black holes and dark matter", "Satellite technology and communication", "The search for extraterrestrial life", "History of space travel", "Space agencies and their missions", "Climate monitoring from space", "The future of Mars exploration", "Telescopes and astronomical discoveries", "Space tourism and its prospects", "The Big Bang theory explained", "International space stations", "Gravity and its effects in space", "Space medicine and astronaut health", "Asteroids and planetary defence", "The role of mathematics in astronomy", "Inspiring the next generation of space scientists"],
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
        topics: ["Ancient civilisations", "Archaeology and heritage", "Lessons from history", "The Roman Empire in North Africa", "Ottoman period in Algeria", "Colonial history and its impact", "The Algerian War of Independence", "Prehistoric cultures and tools", "Ancient Egyptian civilisation", "Greek and Roman mythology", "Medieval Islamic golden age", "The Renaissance and its global impact", "Industrial Revolution effects", "World Wars and their consequences", "Cold War geopolitics", "Decolonisation movements", "Archaeological excavation techniques", "Preserving historical sites", "History through primary sources", "The importance of oral history"],
      },
      {
        key: "u-education",
        label: "Education, teaching and learning",
        theme: "school",
        topics: ["The future of education", "Learning skills for life", "Education for all", "Digital classrooms and online learning", "Inclusive education practices", "The role of teachers in modern society", "Standardised testing debates", "Montessori and alternative methods", "Lifelong learning philosophy", "Education and economic development", "Early childhood education importance", "Student mental health in schools", "Gamification in learning", "Global education inequality", "Vocational training alternatives", "Critical thinking in education", "Education technology innovations", "Parental involvement in schooling", "The purpose of university education", "Education reform movements"],
      },
      {
        key: "u-innovation",
        label: "Innovation in science and technology",
        theme: "technology",
        topics: ["Artificial intelligence", "Biotechnology and medicine", "Innovations that changed the world", "Machine learning and data science", "CRISPR gene editing ethics", "Renewable energy breakthroughs", "Blockchain and digital currencies", "Quantum computing possibilities", "Nanotechnology applications", "3D printing revolution", "Autonomous vehicles and transport", "Virtual and augmented reality", "Robotics in everyday life", "Green building technologies", "Space technology for Earth", "Medical imaging advancements", "Telemedicine and remote healthcare", "Precision agriculture techniques", "Cybersecurity and digital privacy", "Ethics of emerging technologies"],
      },
      {
        key: "u-concerns",
        label: "Life concerns",
        theme: "health",
        topics: ["Health and modern life", "Global issues and ethics", "Youth and future challenges", "Climate change and personal responsibility", "Mental health in the digital age", "Poverty and global inequality", "Migration and cultural integration", "Food security worldwide", "Human trafficking awareness", "Access to clean water globally", "The refugee crisis and responses", "Ethical consumption and fair trade", "Sustainable development goals", "Youth unemployment challenges", "Digital divide and access to technology", "Pandemic preparedness and public health", "Cultural preservation in globalisation", "The future of work and automation", "Balancing progress with sustainability", "Global citizenship and responsibility"],
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

function guide(key: string, name: string, level: Level, grade: string, stream?: string, language = "en"): Guide {
  const cat = getStreamCategory(stream ?? null);
  const isMiddle = level === "middle";

  const partOneRules: Record<StreamCategory, PartOneRule[]> = {
    foreign_languages: [
      {
        family: "TRUE_FALSE",
        marks: 1.5,
        instruction: "Are the following statements true or false? Write T or F next to the letter corresponding to the statement.",
        constraints: { maxStatements: 4 },
      },
      {
        family: "QUESTIONS",
        marks: 2,
        instruction: "Answer the following questions according to the text.",
        constraints: { maxQuestions: 4, includeInference: true },
      },
      {
        family: "PARAGRAPH_ID",
        marks: 1.5,
        instruction: "In which paragraph is it mentioned that...?",
        constraints: { maxIdeas: 4 },
      },
      {
        family: "COHESIVE_MARKERS",
        marks: 1,
        instruction: "Who or what do the underlined words refer to in the text?",
        constraints: { maxWords: 4 },
      },
      {
        family: "TITLE_OR_IDEA",
        marks: 1,
        instruction: "Give a title to the text / Choose the general idea of the text.",
      },
    ],
    literature_philosophy: [
      {
        family: "TRUE_FALSE",
        marks: 2,
        instruction: "Are the following statements true or false? Write T or F next to the letter corresponding to the statement.",
        constraints: { maxStatements: 4 },
      },
      {
        family: "QUESTIONS",
        marks: 2,
        instruction: "Answer the following questions according to the text.",
        constraints: { maxQuestions: 3 },
      },
      {
        family: "PARAGRAPH_ID",
        marks: 1.5,
        instruction: "In which paragraph is it mentioned that...?",
        constraints: { maxIdeas: 4 },
      },
      {
        family: "COHESIVE_MARKERS",
        marks: 1.5,
        instruction: "Who or what do the underlined words refer to in the text?",
        constraints: { maxWords: 3 },
      },
    ],
    sciences: [
      {
        family: "TRUE_FALSE",
        marks: 2,
        instruction: "Are the following statements true or false? Write T or F next to the letter corresponding to the statement.",
        constraints: { maxStatements: 4 },
      },
      {
        family: "QUESTIONS",
        marks: 2,
        instruction: "Answer the following questions according to the text.",
        constraints: { maxQuestions: 3 },
      },
      {
        family: "PARAGRAPH_ID",
        marks: 2,
        instruction: "In which paragraph is it mentioned that...?",
        constraints: { maxIdeas: 4 },
      },
      {
        family: "COHESIVE_MARKERS",
        marks: 2,
        instruction: "Who or what do the underlined words refer to in the text?",
        constraints: { maxWords: 3 },
      },
    ],
  };

  const textExplorationMarks: Record<StreamCategory, { total: number; skills: { skill: string; family: string; marks: number; instruction: string }[] }> = {
    foreign_languages: {
      total: 7,
      skills: [
        { skill: "VOCABULARY", family: "MEANING", marks: 1.5, instruction: "Find in the text words or phrases that are closest in meaning to the following." },
        { skill: "MORPHOLOGY", family: "WORD_FAMILY", marks: 1.5, instruction: "Complete the chart as shown in the example. Give the noun (or verb / adjective / adverb) derived from the following words." },
        { skill: "PHONOLOGY", family: "SOUND_CLASS", marks: 1, instruction: "Classify the following words according to the pronunciation of the final '-s' (or final '-ed')." },
        { skill: "GRAMMAR", family: "REWRITE", marks: 2, instruction: "Rewrite sentence B so that it means the same as sentence A." },
        { skill: "DISCOURSE", family: "GAP_FILL", marks: 1, instruction: "Fill in the gaps with words from the list given." },
      ],
    },
    literature_philosophy: {
      total: 8,
      skills: [
        { skill: "VOCABULARY", family: "MEANING", marks: 2, instruction: "Find in the text words or phrases that are closest in meaning to the following." },
        { skill: "MORPHOLOGY", family: "WORD_FAMILY", marks: 1.5, instruction: "Complete the chart as shown in the example. Give the noun (or verb / adjective / adverb) derived from the following words." },
        { skill: "PHONOLOGY", family: "SOUND_CLASS", marks: 1.5, instruction: "Classify the following words according to the pronunciation of the final '-s' (or final '-ed')." },
        { skill: "GRAMMAR", family: "REWRITE", marks: 2, instruction: "Rewrite sentence B so that it means the same as sentence A." },
        { skill: "DISCOURSE", family: "GAP_FILL", marks: 1, instruction: "Fill in the gaps with words from the list given." },
      ],
    },
    sciences: {
      total: 7,
      skills: [
        { skill: "VOCABULARY", family: "MEANING", marks: 1.5, instruction: "Find in the text words or phrases that are closest in meaning to the following." },
        { skill: "MORPHOLOGY", family: "WORD_FAMILY", marks: 1.5, instruction: "Complete the chart as shown in the example. Give the noun (or verb / adjective / adverb) derived from the following words." },
        { skill: "PHONOLOGY", family: "SOUND_CLASS", marks: 1, instruction: "Classify the following words according to the pronunciation of the final '-s' (or final '-ed')." },
        { skill: "GRAMMAR", family: "REWRITE", marks: 2, instruction: "Rewrite sentence B so that it means the same as sentence A." },
        { skill: "DISCOURSE", family: "GAP_FILL", marks: 1, instruction: "Fill in the gaps with words from the list given." },
      ],
    },
  };

  const writingMarks = cat === "foreign_languages" ? 6 : 5;
  const textExploration = textExplorationMarks[cat];
  const partOneTotal = partOneRules[cat].reduce((s, r) => s + r.marks, 0);

  const lengthOptions = isMiddle ? [120, 150] : [120, 150, 200];

  return {
    key,
    name,
    language,
    level,
    grade,
    version: "2017.1-ministry",
    sourceRef: "2017 Ministry Exam Guide — Baccalaureate English",
    lengthOptions,
    defaultLength: isMiddle ? 120 : 150,
    marks: { partOne: partOneTotal, textExploration: textExploration.total, writing: writingMarks },
    partOne: partOneRules[cat],
    textExploration: {
      heading: "B. Text exploration",
      marksLabel: `${Number.isInteger(textExploration.total) ? textExploration.total : textExploration.total.toFixed(1).replace(/\.0$/, "")} pts`,
      skills: textExploration.skills,
    },
    writing: {
      marks: writingMarks,
      forms: ["a newspaper article", "a letter", "an email", "a diary entry", "a speech"],
      guidedLength: "about 80–120 words",
      freeLength: "about 80–120 words",
      guidedInstruction:
        "Write a text of about 80–120 words on the following topic, using the notes given.",
      freeInstruction: "Write a text of about 80–120 words on the following topic.",
    },
  };
}

export function getGuide(grade: string, language = "en", stream?: string): Guide {
  // Check for a language-specific guide in the registry (PRD 38.1/38.3)
  if (language !== "en") {
    const langKey = `${language}-${grade}`;
    if (GUIDES[langKey]) {
      const cached = GUIDES[langKey];
      return guide(cached.key, cached.name, cached.level, grade, stream, language);
    }
  }
  return guide(grade, grade, getGrade(grade).level, grade, stream);
}

// PRD 38.1/38.3: available exam languages are derived from the guide data, so
// adding a new language is a data-authoring task, not a code change.
export function languagesFromGuides(guides: Record<string, Guide>): string[] {
  return [...new Set(Object.values(guides).map((g) => g.language))].sort();
}

export function getAvailableLanguages(): string[] {
  return languagesFromGuides(GUIDES);
}

export function getGrade(grade: string): GradeDef {
  const d = GRADES[grade];
  if (!d) throw new Error(`No grade definition for "${grade}"`);
  return d;
}
