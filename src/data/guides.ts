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
  tableRequired?: boolean;
}

export interface PartOneRule {
  family: string;
  marks: number;
  instruction: string;
  exactWording?: string;
  tableRequired?: boolean;
  itemCount?: number;
  streamVariants?: Record<string, Partial<PartOneRule>>;
  taskSpecificRules?: string[];
  teacherStandardRules?: string[];
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
  singleTopic?: boolean;
  instruction?: string;
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
  structure: "bac" | "bem";
  headings?: { partOne?: string; textExploration?: string; writing?: string };
}

export interface UnitDef {
  key: string;
  label: string;
  theme: string; // theme key in src/data/themes.ts
  topics: string[];
  streams?: string[]; // null/absent = applies to ALL streams of that grade
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
      // 1AS — textbook "At the Crossroads" — 5 units, ALL streams
      {
        key: "u-getting",
        label: "Getting Through",
        theme: "culture",
        topics: [
          "Intercultural exchanges and communication",
          "Meeting people from different cultures",
          "Cultural greetings and customs around the world",
          "Travelling and discovering new places",
          "Bridging cultural differences through dialogue",
          "The role of language in intercultural understanding",
          "Exchange programmes and student mobility",
          "Making friends across borders",
          "Dining etiquette in different cultures",
          "Cultural misunderstandings and how to resolve them",
          "The value of multicultural classrooms",
          "Traditional hospitality in Algerian culture",
          "Learning about other countries through stories",
          "How music and art connect cultures",
          "International festivals and celebrations",
          "Overcoming stereotypes about foreign cultures",
          "The impact of globalisation on local traditions",
          "Building tolerance through cultural awareness",
          "Social media and cross-cultural communication",
          "Adapting to life in a foreign country",
        ],
      },
      {
        key: "u-once",
        label: "Once Upon a Time",
        theme: "culture",
        topics: [
          "Famous legends and heroes",
          "Stories that teach moral values",
          "Algerian folklore and traditional tales",
          "Myths and their deeper meanings",
          "Legendary figures in North African history",
          "Oral storytelling traditions",
          "Cultural festivals and rituals",
          "Fairy tales from around the world",
          "Stories passed through generations",
          "Heroism in everyday life",
          "Ancient civilisations and their legacies",
          "National heroes and heroines of Algeria",
          "The power of narrative in education",
          "Teaching values through stories",
          "Legends from different continents",
          "Historical monuments and their stories",
          "Stories of courage and sacrifice",
          "Literary heroes and their impact",
          "Cultural identity through storytelling",
          "The role of proverbs in folk wisdom",
        ],
      },
      {
        key: "u-findings",
        label: "Our Findings Show…",
        theme: "technology",
        topics: [
          "The world of newspapers and journalism",
          "How the press shapes public opinion",
          "Media literacy and critical reading",
          "Writing a news article step by step",
          "Famous newspapers and their history",
          "The role of investigative journalism",
          "Press freedom and responsibility",
          "How newspapers report on science",
          "Headlines and their influence on readers",
          "Citizen journalism in the digital age",
          "Interview techniques and reporting",
          "The evolution from print to online media",
          "Social networks and news consumption",
          "Fake news and misinformation",
          "Photojournalism and visual storytelling",
          "The press and educational reform in Algeria",
          "Advertising in newspapers and magazines",
          "Letters to the editor as public debate",
          "Press coverage of environmental issues",
          "The future of journalism",
        ],
      },
      {
        key: "u-eureka",
        label: "Eureka!",
        theme: "technology",
        topics: [
          "Great inventions that changed the world",
          "Young inventors and their achievements",
          "Science in everyday life",
          "The history of technology and innovation",
          "Famous Algerian inventors and scientists",
          "How electricity was discovered",
          "The invention of the internet",
          "Medical breakthroughs and technology",
          "Transportation innovations through history",
          "Communication technology evolution",
          "Space exploration inventions",
          "Sustainable technology solutions",
          "Inventions that transformed education",
          "Patent systems and intellectual property",
          "The future of technology in society",
          "STEM education and innovation",
          "Problem-solving through scientific invention",
          "Technology and ethical dilemmas",
          "Collaborative innovation in research labs",
          "From scientific idea to real-world product",
        ],
      },
      {
        key: "u-nature",
        label: "Back to Nature",
        theme: "environment",
        topics: [
          "Protecting the natural environment",
          "Pollution and its effects on ecosystems",
          "Endangered animals and wildlife conservation",
          "Climate change and global warming",
          "Recycling and reducing waste",
          "The importance of forests and trees",
          "Water conservation and clean rivers",
          "Renewable energy and green technology",
          "The impact of plastic on oceans",
          "Community clean-up initiatives",
          "Organic farming and sustainable agriculture",
          "Air pollution and public health",
          "Green spaces in urban areas",
          "The role of zoos in animal protection",
          "Environmental activism by young people",
          "Biodiversity and natural habitats",
          "Reducing our carbon footprint",
          "Electric vehicles and clean transport",
          "Environmental education in schools",
          "International cooperation for the planet",
        ],
      },
    ],
  },
  "2as": {
    grade: "2as",
    label: "2 AS",
    level: "secondary",
    streams: ["Lettres et Philosophie", "Lettres et Langues Étrangères", "Sciences Expérimentales", "Mathématiques", "Gestion et Économie", "Technologie"],
    units: [
      // 2AS — textbook "Getting Through"
      // Foreign Languages & Lettres-et-Philosophie stream: 6 units
      {
        key: "u-signs",
        label: "Signs of the Time",
        theme: "culture",
        topics: [
          "Fashion and personal identity",
          "Music across generations",
          "Media and social networks",
          "Youth culture and contemporary trends",
          "Traditional versus modern clothing",
          "Digital literacy and online awareness",
          "Internet safety for young people",
          "The influence of advertising on youth",
          "The role of music in cultural expression",
          "Social media and self-image",
          "Celebrity culture and its impact on values",
          "Fashion sustainability and ethics",
          "Hip-hop and global youth culture",
          "Traditional music instruments and heritage",
          "Photography and visual storytelling",
          "Censorship and freedom of expression",
          "Film and its cultural influence",
          "The rise of podcast culture",
          "Video gaming and online community",
          "Cultural exchange through digital media",
        ],
        streams: ["Lettres et Philosophie", "Lettres et Langues Étrangères"],
      },
      {
        key: "u-peace",
        label: "Make Peace",
        theme: "community",
        topics: [
          "Resolving conflicts peacefully",
          "Tolerance and mutual respect",
          "Peace in the modern world",
          "Diplomacy and negotiation skills",
          "Conflict transformation methods",
          "Building bridges between communities",
          "The cost of war on civilians",
          "Peace education in schools",
          "Intercultural dialogue and understanding",
          "Gender equality and its role in peace",
          "Youth-led peace initiatives",
          "Post-conflict reconstruction efforts",
          "The role of media in peacebuilding",
          "Non-violent communication techniques",
          "Mediation and arbitration in disputes",
          "Refugee experiences and empathy",
          "Global peace movements and activism",
          "Environmental peacekeeping cooperation",
          "Conflict resolution in daily life",
          "The philosophy of peace and justice",
        ],
      },
      {
        key: "u-waste",
        label: "Waste Not, Want Not",
        theme: "environment",
        topics: [
          "Saving natural resources responsibly",
          "Recycling and waste management systems",
          "Sustainable development goals",
          "The circular economy concept explained",
          "Electronic waste and its dangers",
          "Water conservation strategies at home",
          "Deforestation and its environmental effects",
          "Green energy alternatives for the future",
          "Plastic bag bans and their impact",
          "Industrial pollution control measures",
          "Sustainable agriculture practices",
          "Urban waste reduction programmes",
          "Global warming and resource depletion",
          "Marine resource protection efforts",
          "Sustainable fishing and ocean health",
          "The zero-waste lifestyle movement",
          "Forest conservation and reforestation",
          "Fossil fuel alternatives and transition",
          "Biodiversity and natural resource protection",
          "Environmental policy and collective action",
        ],
      },
      {
        key: "u-scientist",
        label: "Budding Scientist",
        theme: "technology",
        topics: [
          "Choosing a scientific career path",
          "Famous scientists and their discoveries",
          "Experiments and the joy of discovery",
          "The scientific method explained step by step",
          "Women in science and technology",
          "Algerian scientists and researchers",
          "Laboratory safety and protocols",
          "Physics in everyday applications",
          "Chemistry in the kitchen and at home",
          "Biology and understanding the natural world",
          "Environmental science and climate studies",
          "Genetic research and bioethics",
          "Scientific literacy and critical thinking",
          "Science fairs and student competitions",
          "Career paths in STEM fields",
          "Mathematics in scientific research",
          "Technology driving scientific progress",
          "Science communication and journalism",
          "The future of scientific discovery",
          "Collaborative research across borders",
        ],
        streams: ["Lettres et Philosophie", "Lettres et Langues Étrangères"],
      },
      {
        key: "u-fiction",
        label: "Science or Fiction",
        theme: "technology",
        topics: [
          "Science fiction and real technology",
          "Imagination driving scientific progress",
          "Famous predictions that came true",
          "Technology in science fiction films",
          "Artificial intelligence in fiction and reality",
          "Robots from stories to modern factories",
          "Space travel: fiction becoming fact",
          "Virtual reality and the future of experience",
          "Drones and autonomous systems",
          "Time travel concepts in literature",
          "Genetic engineering: fiction versus science",
          "The ethics of advanced technology",
          "Smart homes and the Internet of Things",
          "Self-driving cars and future transport",
          "3D printing and manufacturing revolution",
          "Biotechnology and medical breakthroughs",
          "Nanotechnology: tiny science, big impact",
          "Quantum computing explained simply",
          "Digital surveillance and privacy concerns",
          "How fiction inspires real innovation",
        ],
        streams: ["Lettres et Philosophie", "Lettres et Langues Étrangères"],
      },
      {
        key: "u-island",
        label: "No Man Is an Island",
        theme: "community",
        topics: [
          "Solidarity during natural disasters",
          "Community response to crises",
          "International humanitarian aid",
          "Volunteering after catastrophes",
          "The power of collective action",
          "Supporting affected families and communities",
          "Disaster preparedness and resilience",
          "Youth involvement in emergency relief",
          "The role of the Red Cross and similar organisations",
          "Earthquakes, floods and their human impact",
          "Building stronger communities together",
          "Social solidarity across borders",
          "Rebuilding after destruction",
          "Psychological support for disaster survivors",
          "Government and NGO cooperation in emergencies",
          "Lessons learned from past disasters",
          "Climate change and increasing natural hazards",
          "Community shelters and emergency planning",
          "Stories of hope and survival",
          "Learning from disaster to prevent future loss",
        ],
        streams: ["Lettres et Philosophie", "Lettres et Langues Étrangères"],
      },
      // 2AS — Scientific streams (Sciences Expérimentales, Mathématiques, Technologie): 4 units
      {
        key: "u-scientist-sc",
        label: "Budding Scientist",
        theme: "technology",
        topics: [
          "Choosing a scientific career path",
          "Famous scientists and their discoveries",
          "Experiments and the joy of discovery",
          "The scientific method explained step by step",
          "Women in science and technology",
          "Algerian scientists and researchers",
          "Laboratory safety and protocols",
          "Physics in everyday applications",
          "Chemistry in the kitchen and at home",
          "Biology and understanding the natural world",
          "Environmental science and climate studies",
          "Genetic research and bioethics",
          "Scientific literacy and critical thinking",
          "Science fairs and student competitions",
          "Career paths in STEM fields",
          "Mathematics in scientific research",
          "Technology driving scientific progress",
          "Science communication and journalism",
          "The future of scientific discovery",
          "Collaborative research across borders",
        ],
        streams: ["Sciences Expérimentales", "Mathématiques", "Technologie"],
      },
      {
        key: "u-island-sc",
        label: "No Man Is an Island",
        theme: "community",
        topics: [
          "Solidarity during natural disasters",
          "Community response to crises",
          "International humanitarian aid",
          "Volunteering after catastrophes",
          "The power of collective action",
          "Supporting affected families and communities",
          "Disaster preparedness and resilience",
          "Youth involvement in emergency relief",
          "The role of the Red Cross and similar organisations",
          "Earthquakes, floods and their human impact",
          "Building stronger communities together",
          "Social solidarity across borders",
          "Rebuilding after destruction",
          "Psychological support for disaster survivors",
          "Government and NGO cooperation in emergencies",
          "Lessons learned from past disasters",
          "Climate change and increasing natural hazards",
          "Community shelters and emergency planning",
          "Stories of hope and survival",
          "Learning from disaster to prevent future loss",
        ],
        streams: ["Sciences Expérimentales", "Mathématiques", "Technologie"],
      },
      // 2AS — Gestion et Économie: 4 units
      {
        key: "u-scientist-ge",
        label: "Budding Scientist",
        theme: "technology",
        topics: [
          "Choosing a scientific career path",
          "Famous scientists and their discoveries",
          "Experiments and the joy of discovery",
          "The scientific method explained step by step",
          "Women in science and technology",
          "Algerian scientists and researchers",
          "Laboratory safety and protocols",
          "Physics in everyday applications",
          "Chemistry in the kitchen and at home",
          "Biology and understanding the natural world",
          "Environmental science and climate studies",
          "Genetic research and bioethics",
          "Scientific literacy and critical thinking",
          "Science fairs and student competitions",
          "Career paths in STEM fields",
          "Mathematics in scientific research",
          "Technology driving scientific progress",
          "Science communication and journalism",
          "The future of scientific discovery",
          "Collaborative research across borders",
        ],
        streams: ["Gestion et Économie"],
      },
      {
        key: "u-business",
        label: "Business Is Business",
        theme: "community",
        topics: [
          "How businesses start and grow",
          "The basics of supply and demand",
          "Marketing and consumer behaviour",
          "Small businesses and local economies",
          "Entrepreneurship and innovation",
          "The role of banks and financial services",
          "International trade and global markets",
          "Ethics in business management",
          "E-commerce and online shopping trends",
          "Advertising techniques and strategies",
          "Consumer rights and protection laws",
          "The impact of technology on business",
          "Social responsibility of companies",
          "Job creation and economic development",
          "The stock market explained simply",
          "Business communication skills",
          "Managing money and personal finance",
          "Sustainable business practices",
          "The future of work and automation",
          "Globalisation and its economic effects",
        ],
        streams: ["Gestion et Économie"],
      },
    ],
  },
  "3as": {
    grade: "3as",
    label: "3 AS",
    level: "secondary",
    streams: ["Lettres et Philosophie", "Lettres et Langues Étrangères", "Sciences Expérimentales", "Mathématiques", "Gestion et Économie", "Technique Mathématique"],
    units: [
      // 3AS — textbook "New Prospects"
      // Literary streams (Lettres et Philosophie, Lettres et Langues Étrangères): 4 units
      {
        key: "u-ancient",
        label: "Ancient Civilization",
        theme: "culture",
        topics: [
          "Exploring the ancient world",
          "Archaeology and heritage preservation",
          "Lessons history teaches us",
          "The Roman Empire in North Africa",
          "Ottoman period and its cultural legacy",
          "Colonial history and its lasting impact",
          "The Algerian War of Independence",
          "Prehistoric cultures and early tools",
          "Ancient Egyptian civilisation and achievements",
          "Greek philosophy and its global influence",
          "The medieval Islamic golden age",
          "The Renaissance and its worldwide impact",
          "The Industrial Revolution and social change",
          "World Wars and their consequences for humanity",
          "Cold War geopolitics and decolonisation",
          "Independence movements across Africa",
          "Archaeological excavation techniques",
          "Preserving historical sites and monuments",
          "Understanding history through primary sources",
          "The importance of oral history traditions",
        ],
        streams: ["Lettres et Philosophie", "Lettres et Langues Étrangères"],
      },
      {
        key: "u-ethics",
        label: "Ethics in Business",
        theme: "community",
        topics: [
          "What business ethics means in practice",
          "Fair trade and responsible sourcing",
          "Corporate social responsibility",
          "Corruption and its economic consequences",
          "Ethical advertising and honest marketing",
          "Worker rights and fair labour practices",
          "Environmental responsibility of companies",
          "Ethical decision-making in management",
          "The role of government regulation in business",
          "Consumer trust and brand reputation",
          "Sustainable profit and long-term thinking",
          "The impact of globalisation on business ethics",
          "Child labour and exploitation in supply chains",
          "Transparency and accountability in corporations",
          "Ethical dilemmas in international trade",
          "The role of whistleblowers in exposing misconduct",
          "Fair wages and the living wage debate",
          "Ethical banking and responsible investment",
          "Business ethics in the digital age",
          "Building an ethical company culture",
        ],
        streams: ["Lettres et Philosophie", "Lettres et Langues Étrangères"],
      },
      {
        key: "u-education",
        label: "Education in the World",
        theme: "school",
        topics: [
          "Schools different and alike around the world",
          "The future of education and lifelong learning",
          "Learning skills for the twenty-first century",
          "Education for all and global inequality",
          "Digital classrooms and online learning platforms",
          "Inclusive education for students with disabilities",
          "The role of teachers in modern society",
          "Standardised testing and its critics",
          "Montessori and alternative teaching methods",
          "Education and economic development",
          "Early childhood education importance",
          "Student mental health in schools",
          "Gamification and interactive learning",
          "Global comparisons of school systems",
          "Vocational training and apprenticeships",
          "Critical thinking as a core skill",
          "Education technology innovations",
          "Parental involvement in schooling",
          "The purpose and value of university education",
          "Education reform movements worldwide",
        ],
        streams: ["Lettres et Philosophie", "Lettres et Langues Étrangères"],
      },
      {
        key: "u-feelings-lit",
        label: "Feelings and Emotions",
        theme: "friendship",
        topics: [
          "We are a family: emotional bonds and belonging",
          "Understanding and expressing emotions",
          "Empathy and compassion in daily life",
          "The psychology of human feelings",
          "Emotional intelligence and maturity",
          "How culture shapes emotional expression",
          "Love, friendship and emotional support",
          "Dealing with grief and loss",
          "The role of art in expressing emotions",
          "Emotional resilience during difficult times",
          "How music affects our mood and feelings",
          "Emotions in literature and storytelling",
          "The science of happiness and wellbeing",
          "Managing anger and frustration constructively",
          "Gratitude and its positive effects",
          "Emotional bonds between generations",
          "The importance of saying 'I love you'",
          "Fear, courage and emotional growth",
          "Body language and non-verbal emotions",
          "Building emotional connections through empathy",
        ],
        streams: ["Lettres et Philosophie", "Lettres et Langues Étrangères"],
      },
      // 3AS — Scientific streams (Sciences Expérimentales, Mathématiques, Gestion et Économie, Technique Mathématique): 4 units
      {
        key: "u-ethics-sc",
        label: "Ethics in Business",
        theme: "community",
        topics: [
          "What business ethics means in practice",
          "Fair trade and responsible sourcing",
          "Corporate social responsibility",
          "Corruption and its economic consequences",
          "Ethical advertising and honest marketing",
          "Worker rights and fair labour practices",
          "Environmental responsibility of companies",
          "Ethical decision-making in management",
          "The role of government regulation in business",
          "Consumer trust and brand reputation",
          "Sustainable profit and long-term thinking",
          "The impact of globalisation on business ethics",
          "Child labour and exploitation in supply chains",
          "Transparency and accountability in corporations",
          "Ethical dilemmas in international trade",
          "The role of whistleblowers in exposing misconduct",
          "Fair wages and the living wage debate",
          "Ethical banking and responsible investment",
          "Business ethics in the digital age",
          "Building an ethical company culture",
        ],
        streams: ["Sciences Expérimentales", "Mathématiques", "Gestion et Économie", "Technique Mathématique"],
      },
      {
        key: "u-advertising",
        label: "Advertising and Consumers",
        theme: "culture",
        topics: [
          "Safety first: protecting consumers in the marketplace",
          "How advertising influences buying decisions",
          "The psychology of marketing and persuasion",
          "False advertising and consumer protection laws",
          "Digital marketing and targeted advertisements",
          "The role of logos, slogans and jingles in branding",
          "Consumer rights when purchasing products",
          "Product safety standards and regulations",
          "Social media influencers and product promotion",
          "Advertising to children: ethics and regulation",
          "The history of advertising and its evolution",
          "Comparative advertising and fair competition",
          "Greenwashing: deceptive environmental claims",
          "How to read nutrition labels and product information",
          "The impact of advertising on self-image",
          "Regulatory bodies and consumer advocacy",
          "Online reviews and word-of-mouth marketing",
          "Cultural differences in advertising worldwide",
          "The future of advertising in a digital world",
          "Empowering consumers through media literacy",
        ],
        streams: ["Sciences Expérimentales", "Mathématiques", "Gestion et Économie", "Technique Mathématique"],
      },
      {
        key: "u-astronomy",
        label: "Astronomy and the Solar System",
        theme: "technology",
        topics: [
          "The structure of our solar system",
          "The Sun and its role in our planetary system",
          "Rocky planets versus gas giants",
          "The Moon and its phases explained",
          "Asteroids, comets and meteorites",
          "How telescopes reveal the universe",
          "Space exploration and human missions to Mars",
          "Satellite technology and Earth observation",
          "The search for water on other planets",
          "Black holes and dark matter mysteries",
          "The life cycle of stars from birth to death",
          "Galaxies and the vastness of the universe",
          "The Big Bang theory and the origin of the cosmos",
          "International space stations and cooperation",
          "Gravity and its effects on planets and moons",
          "Space medicine and astronaut health challenges",
          "Asteroid mining and the future of resources",
          "Climate monitoring from satellites in orbit",
          "How mathematics describes planetary motion",
          "Inspiring the next generation of space scientists",
        ],
        streams: ["Sciences Expérimentales", "Mathématiques", "Gestion et Économie", "Technique Mathématique"],
      },
      {
        key: "u-feelings-sc",
        label: "Feelings and Emotions",
        theme: "friendship",
        topics: [
          "We are a family: emotional bonds and belonging",
          "Understanding and expressing emotions",
          "Empathy and compassion in daily life",
          "The psychology of human feelings",
          "Emotional intelligence and maturity",
          "How culture shapes emotional expression",
          "Love, friendship and emotional support",
          "Dealing with grief and loss",
          "The role of art in expressing emotions",
          "Emotional resilience during difficult times",
          "How music affects our mood and feelings",
          "Emotions in literature and storytelling",
          "The science of happiness and wellbeing",
          "Managing anger and frustration constructively",
          "Gratitude and its positive effects",
          "Emotional bonds between generations",
          "The importance of saying 'I love you'",
          "Fear, courage and emotional growth",
          "Body language and non-verbal emotions",
          "Building emotional connections through empathy",
        ],
        streams: ["Sciences Expérimentales", "Mathématiques", "Gestion et Économie", "Technique Mathématique"],
      },
    ],
  },
};

export const GUIDES: Record<string, Guide> = {
  "1am": guide("1am", "Middle school — 1 AM", "middle", "1am"),
  "2am": guide("2am", "Middle school — 2 AM", "middle", "2am"),
  "3am": guide("3am", "Middle school — 3 AM", "middle", "3am"),
  "4am": guide("4am", "Middle school — 4 AM", "middle", "4am"),
  "1as": guide("1as", "Secondary school — 1 AS (At the Crossroads)", "secondary", "1as", undefined, "en", "1AS Literary Stream — 2018 Official Yearly Planning"),
  "2as": guide("2as", "Secondary school — 2 AS (Getting Through)", "secondary", "2as", undefined, "en", "2AS Official Yearly Planning — Foreign Languages / Lettres et Philosophie / Sciences / GE"),
  "3as": guide("3as", "Secondary school — 3 AS (New Prospects)", "secondary", "3as", undefined, "en", "3AS Official Yearly Planning — Literary & Scientific Streams 2020"),
};

function guide(key: string, name: string, level: Level, grade: string, stream?: string, language = "en", sourceRef?: string): Guide {
  const cat = getStreamCategory(stream ?? null);
  const isMiddle = level === "middle";

  const bemPartOneRules: PartOneRule[] = [
    {
      family: "TRUE_FALSE",
      marks: 1.5,
      instruction: "Are the following statements true or false? Write T or F next to the letter corresponding to the statement.",
      exactWording: "Are the following statements true or false? Write T or F next to the letter corresponding to the statement.",
      tableRequired: true,
      itemCount: 4,
      constraints: { maxStatements: 4 },
    },
    {
      family: "QUESTIONS",
      marks: 2,
      instruction: "Answer the following questions according to the text.",
      exactWording: "Answer the following questions according to the text.",
      tableRequired: false,
      itemCount: 4,
      constraints: { maxQuestions: 4, includeInference: true },
    },
    {
      family: "PARAGRAPH_ID",
      marks: 1.5,
      instruction: "In which paragraph is it mentioned that...?",
      exactWording: "In which paragraph is it mentioned that...?",
      tableRequired: true,
      itemCount: 4,
      constraints: { maxIdeas: 4 },
    },
    {
      family: "COHESIVE_MARKERS",
      marks: 1,
      instruction: "Who or what do the underlined words refer to in the text?",
      exactWording: "Who or what do the underlined words refer to in the text?",
      tableRequired: true,
      itemCount: 4,
      constraints: { maxWords: 4 },
    },
    {
      family: "TITLE_OR_IDEA",
      marks: 1,
      instruction: "Give a title to the text / Choose the general idea of the text.",
      exactWording: "Give a title to the text / Choose the general idea of the text.",
      tableRequired: false,
      itemCount: 1,
    },
  ];

  const bemTextExploration = {
    total: 7,
    skills: [
      { skill: "VOCABULARY", family: "MEANING", marks: 1.5, instruction: "Find in the text words or phrases that are closest in meaning to the following.", tableRequired: true },
      { skill: "MORPHOLOGY", family: "WORD_FAMILY", marks: 1.5, instruction: "Complete the chart as shown in the example. Give the noun (or verb / adjective / adverb) derived from the following words.", tableRequired: true },
      { skill: "PHONOLOGY", family: "SOUND_CLASS", marks: 1, instruction: "Classify the following words according to the pronunciation of the final '-s' (or final '-ed').", tableRequired: false },
      { skill: "GRAMMAR", family: "REWRITE", marks: 2, instruction: "Rewrite sentence B so that it means the same as sentence A.", tableRequired: false },
      { skill: "DISCOURSE", family: "GAP_FILL", marks: 1, instruction: "Fill in the gaps with words from the list given.", tableRequired: true },
    ],
  };

  const partOneRules: Record<StreamCategory, PartOneRule[]> = {
    foreign_languages: [
      {
        family: "TRUE_FALSE",
        marks: 1.5,
        instruction: "Are the following statements true or false? Write T or F next to the letter corresponding to the statement.",
        exactWording: "Are the following statements true or false? Write T or F next to the letter corresponding to the statement.",
        tableRequired: true,
        itemCount: 4,
        constraints: { maxStatements: 4 },
      },
      {
        family: "QUESTIONS",
        marks: 2,
        instruction: "Answer the following questions according to the text.",
        exactWording: "Answer the following questions according to the text.",
        tableRequired: false,
        itemCount: 4,
        constraints: { maxQuestions: 4, includeInference: true },
      },
      {
        family: "PARAGRAPH_ID",
        marks: 1.5,
        instruction: "In which paragraph is it mentioned that...?",
        exactWording: "In which paragraph is it mentioned that...?",
        tableRequired: true,
        itemCount: 4,
        constraints: { maxIdeas: 4 },
      },
      {
        family: "COHESIVE_MARKERS",
        marks: 1,
        instruction: "Who or what do the underlined words refer to in the text?",
        exactWording: "Who or what do the underlined words refer to in the text?",
        tableRequired: true,
        itemCount: 4,
        constraints: { maxWords: 4 },
      },
      {
        family: "TITLE_OR_IDEA",
        marks: 1,
        instruction: "Give a title to the text / Choose the general idea of the text.",
        exactWording: "Give a title to the text / Choose the general idea of the text.",
        tableRequired: false,
        itemCount: 1,
      },
    ],
    literature_philosophy: [
      {
        family: "TRUE_FALSE",
        marks: 2,
        instruction: "Are the following statements true or false? Write T or F next to the letter corresponding to the statement.",
        exactWording: "Are the following statements true or false? Write T or F next to the letter corresponding to the statement.",
        tableRequired: true,
        itemCount: 4,
        constraints: { maxStatements: 4 },
      },
      {
        family: "QUESTIONS",
        marks: 2,
        instruction: "Answer the following questions according to the text.",
        exactWording: "Answer the following questions according to the text.",
        tableRequired: false,
        itemCount: 3,
        constraints: { maxQuestions: 3 },
      },
      {
        family: "PARAGRAPH_ID",
        marks: 1.5,
        instruction: "In which paragraph is it mentioned that...?",
        exactWording: "In which paragraph is it mentioned that...?",
        tableRequired: true,
        itemCount: 4,
        constraints: { maxIdeas: 4 },
      },
      {
        family: "COHESIVE_MARKERS",
        marks: 1.5,
        instruction: "Who or what do the underlined words refer to in the text?",
        exactWording: "Who or what do the underlined words refer to in the text?",
        tableRequired: true,
        itemCount: 3,
        constraints: { maxWords: 3 },
      },
    ],
    sciences: [
      {
        family: "TRUE_FALSE",
        marks: 2,
        instruction: "Are the following statements true or false? Write T or F next to the letter corresponding to the statement.",
        exactWording: "Are the following statements true or false? Write T or F next to the letter corresponding to the statement.",
        tableRequired: true,
        itemCount: 4,
        constraints: { maxStatements: 4 },
      },
      {
        family: "QUESTIONS",
        marks: 2,
        instruction: "Answer the following questions according to the text.",
        exactWording: "Answer the following questions according to the text.",
        tableRequired: false,
        itemCount: 3,
        constraints: { maxQuestions: 3 },
      },
      {
        family: "PARAGRAPH_ID",
        marks: 2,
        instruction: "In which paragraph is it mentioned that...?",
        exactWording: "In which paragraph is it mentioned that...?",
        tableRequired: true,
        itemCount: 4,
        constraints: { maxIdeas: 4 },
      },
      {
        family: "COHESIVE_MARKERS",
        marks: 2,
        instruction: "Who or what do the underlined words refer to in the text?",
        exactWording: "Who or what do the underlined words refer to in the text?",
        tableRequired: true,
        itemCount: 3,
        constraints: { maxWords: 3 },
      },
    ],
  };

  const textExplorationMarks: Record<StreamCategory, { total: number; skills: SkillRule[] }> = {
    foreign_languages: {
      total: 7,
      skills: [
        { skill: "VOCABULARY", family: "MEANING", marks: 1.5, instruction: "Find in the text words or phrases that are closest in meaning to the following.", tableRequired: true },
        { skill: "MORPHOLOGY", family: "WORD_FAMILY", marks: 1.5, instruction: "Complete the chart as shown in the example. Give the noun (or verb / adjective / adverb) derived from the following words.", tableRequired: true },
        { skill: "PHONOLOGY", family: "SOUND_CLASS", marks: 1, instruction: "Classify the following words according to the pronunciation of the final '-s' (or final '-ed').", tableRequired: false },
        { skill: "GRAMMAR", family: "REWRITE", marks: 2, instruction: "Rewrite sentence B so that it means the same as sentence A.", tableRequired: false },
        { skill: "DISCOURSE", family: "GAP_FILL", marks: 1, instruction: "Fill in the gaps with words from the list given.", tableRequired: true },
      ],
    },
    literature_philosophy: {
      total: 8,
      skills: [
        { skill: "VOCABULARY", family: "MEANING", marks: 2, instruction: "Find in the text words or phrases that are closest in meaning to the following.", tableRequired: true },
        { skill: "MORPHOLOGY", family: "WORD_FAMILY", marks: 1.5, instruction: "Complete the chart as shown in the example. Give the noun (or verb / adjective / adverb) derived from the following words.", tableRequired: true },
        { skill: "PHONOLOGY", family: "SOUND_CLASS", marks: 1.5, instruction: "Classify the following words according to the pronunciation of the final '-s' (or final '-ed').", tableRequired: false },
        { skill: "GRAMMAR", family: "REWRITE", marks: 2, instruction: "Rewrite sentence B so that it means the same as sentence A.", tableRequired: false },
        { skill: "DISCOURSE", family: "GAP_FILL", marks: 1, instruction: "Fill in the gaps with words from the list given.", tableRequired: true },
      ],
    },
    sciences: {
      total: 7,
      skills: [
        { skill: "VOCABULARY", family: "MEANING", marks: 1.5, instruction: "Find in the text words or phrases that are closest in meaning to the following.", tableRequired: true },
        { skill: "MORPHOLOGY", family: "WORD_FAMILY", marks: 1.5, instruction: "Complete the chart as shown in the example. Give the noun (or verb / adjective / adverb) derived from the following words.", tableRequired: true },
        { skill: "PHONOLOGY", family: "SOUND_CLASS", marks: 1, instruction: "Classify the following words according to the pronunciation of the final '-s' (or final '-ed').", tableRequired: false },
        { skill: "GRAMMAR", family: "REWRITE", marks: 2, instruction: "Rewrite sentence B so that it means the same as sentence A.", tableRequired: false },
        { skill: "DISCOURSE", family: "GAP_FILL", marks: 1, instruction: "Fill in the gaps with words from the list given.", tableRequired: true },
      ],
    },
  };

  const writingMarks = isMiddle ? 6 : (cat === "foreign_languages" ? 6 : 5);
  const resolvedPartOne = isMiddle ? bemPartOneRules : partOneRules[cat];
  const resolvedTextExploration = isMiddle ? bemTextExploration : textExplorationMarks[cat];
  const partOneTotal = resolvedPartOne.reduce((s, r) => s + r.marks, 0);

  const lengthOptions = isMiddle ? [120, 150] : [120, 150, 200];

  if (isMiddle) {
    return {
      key,
      name,
      language,
      level,
      grade,
      version: "2017.1-ministry",
      sourceRef: sourceRef ?? "2017 Ministry Exam Guide — BEM English",
      lengthOptions,
      defaultLength: 120,
      marks: { partOne: 7, textExploration: 7, writing: 6 },
      partOne: bemPartOneRules,
      textExploration: {
        heading: "B. Mastery of Language",
        marksLabel: "7 pts",
        skills: bemTextExploration.skills,
      },
      writing: {
        marks: 6,
        forms: ["a diary entry", "a letter", "a short article", "a paragraph"],
        guidedLength: "about 80–120 words",
        freeLength: "about 80–120 words",
        guidedInstruction:
          "Write a text of about 80–120 words on the following topic, using the notes given.",
        freeInstruction: "Write a text of about 80–120 words on the following topic.",
        singleTopic: true,
        instruction: "Write a text of about 80–120 words in response to the following situation.",
      },
      structure: "bem",
      headings: {
        partOne: "A. Reading Comprehension",
        textExploration: "B. Mastery of Language",
        writing: "Part Two — Written Expression",
      },
    };
  }

  return {
    key,
    name,
    language,
    level,
    grade,
    version: "2017.1-ministry",
    sourceRef: sourceRef ?? "2017 Ministry Exam Guide — Baccalaureate English",
    lengthOptions,
    defaultLength: 150,
    marks: { partOne: partOneTotal, textExploration: resolvedTextExploration.total, writing: writingMarks },
    partOne: resolvedPartOne,
    textExploration: {
      heading: "B. Text exploration",
      marksLabel: `${Number.isInteger(resolvedTextExploration.total) ? resolvedTextExploration.total : resolvedTextExploration.total.toFixed(1).replace(/\.0$/, "")} pts`,
      skills: resolvedTextExploration.skills,
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
    structure: "bac",
  };
}

export function getGuide(grade: string, language = "en", stream?: string): Guide {
  if (language !== "en") {
    const langKey = `${language}-${grade}`;
    if (GUIDES[langKey]) {
      const cached = GUIDES[langKey];
      return guide(cached.key, cached.name, cached.level, grade, stream, language, cached.sourceRef);
    }
  }
  const cached = GUIDES[grade];
  return guide(grade, cached?.name ?? grade, getGrade(grade).level, grade, stream, "en", cached?.sourceRef);
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
