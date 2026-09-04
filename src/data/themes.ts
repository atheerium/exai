// Theme corpus for Exaai's deterministic ("mock") generation provider.
//
// Each theme feeds the passage assembler (title + lead/body/detail/conclusion
// sentences), the reading-comprehension tasks, and the Part Two language tasks
// (vocabulary, morphology, phonology, grammar, discourse). Vocabulary items
// marked `inText: true` are guaranteed to appear in assembled passages, so
// "find in the text" tasks always have an answer.

export interface VocabItem {
  word: string; // word as it appears in the text (lowercase)
  family: { noun?: string; verb?: string; adjective?: string; adverb?: string };
  finalS: "s" | "z" | "iz"; // pronunciation of the final "-s" (plural / 3rd person)
  finalEd?: "t" | "d" | "id"; // pronunciation of the final "-ed" (regular past)
  edWord?: string; // the "-ed" form when it appears in the text
  inText: boolean; // guaranteed to appear in assembled passages
}

export interface Theme {
  key: string;
  label: string;
  title: string; // supports {topic}
  lead: string[];
  body: string[];
  detail: string[];
  conclusion: string[];
  questions: { q: string; a: string }[];
  trueFalse: { statement: string; truth: boolean; justification: string }[];
  vocab: VocabItem[];
  lexisMeaning: { given: string; answer: string }[];
  lexisOpposite: { given: string; answer: string }[];
  grammar: { sentence: string; rewritten: string; note: string }[];
  discourse: { text: string; options: string[]; answers: string[] };
}

export const THEMES: Record<string, Theme> = {
  friendship: {
    key: "friendship",
    label: "Friendship and relationships",
    title: "The value of {topic}",
    lead: [
      "In every school and every street, people build relationships that shape their daily lives.",
      "For most young people, {topic} is one of the most important parts of growing up.",
    ],
    body: [
      "A good friend is honest, kind and ready to listen when life becomes difficult.",
      "Young people who share their hobbies and interests often develop strong friendships.",
      "Respecting differences helps classmates work together and avoid useless conflicts.",
      "When a friend makes a mistake, forgiveness keeps the relationship healthy and strong.",
      "Teachers often encourage cooperation because teamwork teaches patience and trust.",
      "Reliable friends keep their promises, and that behaviour builds deep confidence between people.",
      "Groups that welcome new members make everyone feel valued and included.",
      "Many teenagers say that a single loyal friend is worth more than many ordinary ones.",
    ],
    detail: [
      "Scientists who study human behaviour agree that close relationships improve wellbeing.",
      "A friendly word in the morning can change a whole day at school.",
      "Students who feel accepted participate more in class and worry less about failure.",
      "Parents also play a role by teaching children how to greet, share and apologise.",
      "Modern communication helps friends stay connected even when they live far away.",
      "However, screens can never replace a genuine conversation face to face.",
    ],
    conclusion: [
      "In conclusion, friendship requires effort, honesty and respect from both sides.",
      "The relationships we build today prepare us to become responsible adults tomorrow.",
    ],
    questions: [
      { q: "According to the text, what makes a good friend?", a: "Honesty, kindness and readiness to listen." },
      { q: "How does forgiveness help a friendship?", a: "It keeps the relationship healthy and strong." },
      { q: "Why do teachers encourage cooperation?", a: "Because teamwork teaches patience and trust." },
      { q: "How does modern communication help friends?", a: "It helps friends stay connected even when they live far away." },
    ],
    trueFalse: [
      { statement: "Good friends never listen to each other.", truth: false, justification: "The text says a good friend is ready to listen." },
      { statement: "Respecting differences helps classmates work together.", truth: true, justification: "The text says it helps classmates avoid useless conflicts." },
      { statement: "Screens can replace face-to-face conversation.", truth: false, justification: "The text says screens can never replace genuine conversation." },
      { statement: "Teamwork teaches patience and trust.", truth: true, justification: "The text says teachers encourage cooperation because teamwork teaches patience and trust." },
    ],
    vocab: [
      { word: "honest", family: { noun: "honesty", adjective: "honest", adverb: "honestly" }, finalS: "z", inText: true },
      { word: "respects", family: { noun: "respect", verb: "respect", adjective: "respectful" }, finalS: "s", inText: true },
      { word: "forgiveness", family: { verb: "forgive", adjective: "forgiving" }, finalS: "z", inText: true },
      { word: "relies", family: { noun: "reliance", verb: "rely", adjective: "reliable" }, finalS: "z", inText: false },
      { word: "loyal", family: { noun: "loyalty", adjective: "loyal", adverb: "loyally" }, finalS: "z", inText: true },
      { word: "accepted", family: { noun: "acceptance", verb: "accept", adjective: "acceptable" }, finalS: "s", finalEd: "t", edWord: "accepted", inText: true },
      { word: "trust", family: { noun: "trust", verb: "trust", adjective: "trustworthy" }, finalS: "s", inText: true },
    ],
    lexisMeaning: [
      { given: "truthful", answer: "honest" },
      { given: "close and true (friend)", answer: "loyal" },
      { given: "belief in someone", answer: "trust" },
    ],
    lexisOpposite: [
      { given: "dishonest", answer: "honest" },
      { given: "disrespects", answer: "respects" },
      { given: "rejected", answer: "accepted" },
    ],
    grammar: [
      { sentence: "Respecting differences helps classmates work together.", rewritten: "Differences should be respected because they help classmates work together.", note: "modal passive rewrite" },
      { sentence: "A good friend is honest and kind.", rewritten: "It is important that a good friend should be honest and kind.", note: "it-clause rewrite" },
    ],
    discourse: {
      text: "A good friend is honest ___ kind. ___ they respect differences, classmates work together. ___ mistakes happen, forgiveness keeps the relationship strong.",
      options: ["because", "and", "when", "but"],
      answers: ["and", "because", "when"],
    },
  },

  family: {
    key: "family",
    label: "Family life",
    title: "Inside {topic}",
    lead: [
      "The family is the first school where children learn values, language and behaviour.",
      "In many homes, {topic} brings generations together around shared habits and memories.",
    ],
    body: [
      "Parents share responsibilities so that every member of the house feels supported.",
      "Children who help with daily tasks learn discipline and gain confidence quickly.",
      "Grandparents often pass down traditions, stories and recipes to the younger generation.",
      "Regular meals together give families a quiet moment to talk about the day.",
      "Celebrations strengthen the bond between relatives who live in different cities.",
      "Respecting each other's roles makes family life calmer and more harmonious.",
      "Modern families face new pressures, but communication solves most problems.",
      "Teenagers especially need patience from their parents during difficult years.",
    ],
    detail: [
      "Research shows that children who eat with their families develop better language skills.",
      "Housework, when shared fairly, teaches boys and girls the same life skills.",
      "Visiting grandparents regularly keeps the older generation connected and happy.",
      "Family rules work best when they are explained with kindness, not anger.",
      "Mothers and fathers who listen carefully raise children who listen in return.",
      "Even small gestures, like a morning greeting, strengthen family bonds.",
    ],
    conclusion: [
      "In the end, a loving family gives each member a safe place to grow.",
      "The habits we learn at home remain with us for the rest of our lives.",
    ],
    questions: [
      { q: "What do children learn by helping with daily tasks?", a: "Discipline and confidence." },
      { q: "What do grandparents often pass down?", a: "Traditions, stories and recipes." },
      { q: "Why do regular meals together matter?", a: "They give the family a quiet moment to talk about the day." },
      { q: "How does sharing housework fairly help children?", a: "It teaches boys and girls the same life skills." },
    ],
    trueFalse: [
      { statement: "Children never learn discipline by helping at home.", truth: false, justification: "The text says helping with daily tasks teaches discipline." },
      { statement: "Grandparents pass down traditions and recipes.", truth: true, justification: "The text says they pass down traditions, stories and recipes." },
      { statement: "Communication solves most family problems.", truth: true, justification: "The text says communication solves most problems." },
      { statement: "Regular meals give families time to talk about the day.", truth: true, justification: "The text says regular meals together give families a quiet moment to talk." },
    ],
    vocab: [
      { word: "responsibilities", family: { noun: "responsibility", adjective: "responsible" }, finalS: "z", inText: true },
      { word: "respects", family: { noun: "respect", verb: "respect", adjective: "respectful" }, finalS: "s", inText: true },
      { word: "supports", family: { noun: "support", verb: "support", adjective: "supportive" }, finalS: "s", inText: true },
      { word: "strengthen", family: { noun: "strength", verb: "strengthen", adjective: "strong" }, finalS: "z", inText: true },
      { word: "patient", family: { noun: "patience", adjective: "patient", adverb: "patiently" }, finalS: "s", inText: true },
      { word: "shared", family: { noun: "sharing", verb: "share", adjective: "shared" }, finalS: "z", finalEd: "d", edWord: "shared", inText: true },
      { word: "communicates", family: { noun: "communication", verb: "communicate" }, finalS: "z", inText: false },
    ],
    lexisMeaning: [
      { given: "duties", answer: "responsibilities" },
      { given: "calm", answer: "patient" },
      { given: "common to all members", answer: "shared" },
    ],
    lexisOpposite: [
      { given: "irresponsible", answer: "responsible" },
      { given: "weakens", answer: "strengthen" },
      { given: "disrespects", answer: "respects" },
    ],
    grammar: [
      { sentence: "Parents share responsibilities so that every member feels supported.", rewritten: "Responsibilities are shared by parents so that every member feels supported.", note: "passive voice" },
      { sentence: "Grandparents often pass down traditions to the younger generation.", rewritten: "Traditions are often passed down to the younger generation by grandparents.", note: "passive voice" },
    ],
    discourse: {
      text: "Parents share responsibilities ___ every member feels supported. Children who help at home learn discipline ___. ___ families eat together, they talk about their day.",
      options: ["when", "so that", "and", "quickly"],
      answers: ["so that", "quickly", "when"],
    },
  },

  school: {
    key: "school",
    label: "School and education",
    title: "Learning for life: {topic}",
    lead: [
      "School is not only a place for lessons; it is where young people learn how to live together.",
      "When students think seriously about {topic}, they start to take charge of their own progress.",
    ],
    body: [
      "Pupils who organise their time carefully usually remember their lessons better.",
      "Asking questions in class is a sign of curiosity, not a sign of weakness.",
      "Teachers who explain clearly and listen patiently build confident learners.",
      "Regular revision is more effective than studying everything the night before an exam.",
      "Group projects teach students to plan, share ideas and respect deadlines.",
      "A tidy notebook and a quiet place to study make homework much easier.",
      "Students who read for pleasure improve their vocabulary without noticing it.",
      "Balancing lessons, sport and rest keeps young people healthy and motivated.",
    ],
    detail: [
      "Modern classrooms use technology to make lessons more interactive and attractive.",
      "However, screens must not replace real practice, handwriting and memorisation.",
      "Education researchers agree that short breaks improve concentration during long sessions.",
      "School clubs develop talents that exams never measure, such as leadership and creativity.",
      "Parents who follow their children's schoolwork send a strong message about its importance.",
      "Every learner has a different pace, and that difference is completely normal.",
    ],
    conclusion: [
      "To conclude, success at school depends on organisation, curiosity and regular effort.",
      "Education opens doors, and the habits built in the classroom last a lifetime.",
    ],
    questions: [
      { q: "Why is asking questions in class a positive sign?", a: "Because it shows curiosity, not weakness." },
      { q: "What do group projects teach students?", a: "Planning, sharing ideas and respecting deadlines." },
      { q: "When is revision more effective?", a: "When it is done regularly rather than the night before an exam." },
      { q: "How do short breaks help during long study sessions?", a: "They improve concentration." },
    ],
    trueFalse: [
      { statement: "Studying everything the night before is the best strategy.", truth: false, justification: "The text says regular revision is more effective." },
      { statement: "Reading for pleasure improves vocabulary.", truth: true, justification: "The text says pupils improve their vocabulary without noticing it." },
      { statement: "School clubs only waste time.", truth: false, justification: "The text says clubs develop talents such as leadership and creativity." },
      { statement: "Asking questions in class shows curiosity.", truth: true, justification: "The text says asking questions is a sign of curiosity, not weakness." },
    ],
    vocab: [
      { word: "organise", family: { noun: "organisation", verb: "organise", adjective: "organised" }, finalS: "z", inText: true },
      { word: "curiosity", family: { adjective: "curious", adverb: "curiously" }, finalS: "z", inText: true },
      { word: "revises", family: { noun: "revision", verb: "revise" }, finalS: "iz", inText: true },
      { word: "encourages", family: { noun: "encouragement", verb: "encourage", adjective: "encouraging" }, finalS: "iz", inText: true },
      { word: "motivated", family: { noun: "motivation", verb: "motivate", adjective: "motivated" }, finalS: "s", finalEd: "id", edWord: "motivated", inText: true },
      { word: "concentrate", family: { noun: "concentration", verb: "concentrate" }, finalS: "s", inText: false },
      { word: "balanced", family: { noun: "balance", verb: "balance", adjective: "balanced" }, finalS: "z", finalEd: "t", edWord: "balanced", inText: true },
    ],
    lexisMeaning: [
      { given: "arrange in a planned way", answer: "organise" },
      { given: "willingness to learn and ask", answer: "curiosity" },
      { given: "with a good mixture of things", answer: "balanced" },
    ],
    lexisOpposite: [
      { given: "disorganised", answer: "organised" },
      { given: "discourages", answer: "encourages" },
      { given: "demotivated", answer: "motivated" },
    ],
    grammar: [
      { sentence: "Pupils who organise their time remember their lessons better.", rewritten: "If pupils organise their time, they remember their lessons better.", note: "relative clause → conditional" },
      { sentence: "Regular revision is more effective than studying the night before.", rewritten: "Studying the night before is not as effective as regular revision.", note: "comparison rewrite" },
    ],
    discourse: {
      text: "Pupils ___ organise their time remember lessons better. ___ they revise regularly, they feel confident. Balancing lessons, sport ___ rest keeps students healthy.",
      options: ["who", "when", "and", "but"],
      answers: ["who", "when", "and"],
    },
  },

  environment: {
    key: "environment",
    label: "Environment and nature",
    title: "Protecting our world: {topic}",
    lead: [
      "The planet we live on gives us air, water, food and beauty, yet people often forget how fragile it is.",
      "Every community can act on {topic}, and small daily habits make a real difference.",
    ],
    body: [
      "Families that recycle their waste reduce the amount of rubbish sent to landfill.",
      "Turning off taps and lights saves water and electricity without any effort.",
      "Trees absorb pollution and give us fresh air, so planting them protects our health.",
      "Plastic bags that are thrown into nature take hundreds of years to disappear.",
      "Neighbours who clean their streets together create a more pleasant environment.",
      "Public transport carries many passengers at once and produces less pollution per person.",
      "Local campaigns teach children to sort rubbish into paper, plastic and glass.",
      "Choosing reusable bottles instead of disposable ones is a simple ecological act.",
    ],
    detail: [
      "Environmental scientists warn that rising temperatures threaten coastal regions.",
      "Solar energy offers clean power for homes, schools and remote villages.",
      "Every recycled bottle saves enough energy to light a lamp for several hours.",
      "Community gardens bring nature back into crowded cities and feed families.",
      "Protecting rivers and forests preserves habitats for thousands of living species.",
      "The actions of one generation decide the world that the next generation inherits.",
    ],
    conclusion: [
      "In short, protecting the environment is everyone's responsibility, not a government duty alone.",
      "If each person changes one small habit today, tomorrow's world will be cleaner and safer.",
    ],
    questions: [
      { q: "How do trees help our health?", a: "They absorb pollution and give us fresh air." },
      { q: "Why are plastic bags dangerous for nature?", a: "They take hundreds of years to disappear." },
      { q: "What does choosing a reusable bottle do?", a: "It is a simple ecological act that reduces waste." },
      { q: "How does recycling help reduce landfill waste?", a: "Families that recycle reduce the amount of rubbish sent to landfill." },
    ],
    trueFalse: [
      { statement: "Recycling increases the rubbish sent to landfill.", truth: false, justification: "The text says recycling reduces the amount of rubbish." },
      { statement: "Trees give us fresh air.", truth: true, justification: "The text says trees absorb pollution and give fresh air." },
      { statement: "Public transport produces less pollution per person.", truth: true, justification: "The text says it produces less pollution per person." },
      { statement: "Plastic bags disappear quickly in nature.", truth: false, justification: "The text says plastic bags take hundreds of years to disappear." },
    ],
    vocab: [
      { word: "recycles", family: { noun: "recycling", verb: "recycle", adjective: "recyclable" }, finalS: "z", inText: true },
      { word: "pollution", family: { verb: "pollute", adjective: "polluted" }, finalS: "z", inText: true },
      { word: "protects", family: { noun: "protection", verb: "protect", adjective: "protective" }, finalS: "s", inText: true },
      { word: "disposable", family: { noun: "disposal", verb: "dispose", adjective: "disposable" }, finalS: "z", inText: true },
      { word: "saves", family: { noun: "saving", verb: "save" }, finalS: "z", inText: true },
      { word: "threatens", family: { noun: "threat", verb: "threaten", adjective: "threatening" }, finalS: "z", inText: false },
      { word: "cleaned", family: { noun: "cleanliness", verb: "clean", adjective: "clean" }, finalS: "z", finalEd: "d", edWord: "cleaned", inText: true },
    ],
    lexisMeaning: [
      { given: "convert waste into new products", answer: "recycle" },
      { given: "contamination of the air or water", answer: "pollution" },
      { given: "guard from harm", answer: "protect" },
    ],
    lexisOpposite: [
      { given: "wastes", answer: "saves" },
      { given: "harmful to nature", answer: "ecological" },
      { given: "dirty", answer: "clean" },
    ],
    grammar: [
      { sentence: "Families recycle their waste, so they reduce the rubbish sent to landfill.", rewritten: "If families recycle their waste, they reduce the rubbish sent to landfill.", note: "so → conditional" },
      { sentence: "Trees absorb pollution and give us fresh air.", rewritten: "Pollution is absorbed by trees, which give us fresh air.", note: "passive voice" },
    ],
    discourse: {
      text: "Families that recycle ___ waste reduce the rubbish. Trees absorb pollution ___ give us fresh air. ___ each person changes one habit, tomorrow's world will be cleaner.",
      options: ["their", "and", "if", "but"],
      answers: ["their", "and", "if"],
    },
  },

  community: {
    key: "community",
    label: "Community and citizenship",
    title: "Stronger together: {topic}",
    lead: [
      "A community is more than a group of houses; it is a network of people who help one another.",
      "When citizens invest their energy in {topic}, the whole neighbourhood benefits.",
    ],
    body: [
      "Volunteers who clean public spaces give their time without expecting payment.",
      "Helping an elderly neighbour with shopping costs nothing but means everything.",
      "Charity events collect food and clothes for families facing difficult situations.",
      "People who respect public property create a safer and more pleasant area for all.",
      "Students who join local associations learn responsibility outside the classroom.",
      "A simple smile or greeting in the street reduces isolation and builds trust.",
      "Community meetings give residents the chance to propose ideas and solve problems.",
      "Shared projects, such as painting a school wall, unite neighbours of every age.",
    ],
    detail: [
      "Sociologists observe that generous communities report higher levels of happiness.",
      "Donating blood is a quiet act of solidarity that saves lives every single day.",
      "Neighbourhood libraries and clubs offer free activities for children after school.",
      "Reporting broken equipment quickly helps local services repair it sooner.",
      "Citizens who vote shape the future of their city and their country.",
      "Solidarity during difficult times reveals the true strength of a community.",
    ],
    conclusion: [
      "Ultimately, a community becomes strong when every member contributes a little.",
      "Small acts of kindness, repeated every day, transform ordinary places into real homes.",
    ],
    questions: [
      { q: "Why do volunteers clean public spaces?", a: "They give their time without expecting payment." },
      { q: "What do charity events collect?", a: "Food and clothes for families facing difficult situations." },
      { q: "How do community meetings help residents?", a: "They give residents the chance to propose ideas and solve problems." },
      { q: "What does donating blood do?", a: "It is a quiet act of solidarity that saves lives every day." },
    ],
    trueFalse: [
      { statement: "Volunteers expect a salary for their work.", truth: false, justification: "The text says they give their time without expecting payment." },
      { statement: "Charity events collect food and clothes.", truth: true, justification: "The text says they collect food and clothes for families in difficulty." },
      { statement: "A smile in the street reduces isolation.", truth: true, justification: "The text says it reduces isolation and builds trust." },
      { statement: "Community meetings help residents solve problems.", truth: true, justification: "The text says meetings give residents the chance to propose ideas and solve problems." },
    ],
    vocab: [
      { word: "volunteers", family: { noun: "volunteering", verb: "volunteer" }, finalS: "z", inText: true },
      { word: "solidarity", family: { adjective: "supportive" }, finalS: "z", inText: true },
      { word: "unites", family: { noun: "unity", verb: "unite", adjective: "united" }, finalS: "s", inText: true },
      { word: "contributes", family: { noun: "contribution", verb: "contribute" }, finalS: "s", inText: true },
      { word: "generous", family: { noun: "generosity", adjective: "generous", adverb: "generously" }, finalS: "z", inText: true },
      { word: "reduces", family: { noun: "reduction", verb: "reduce" }, finalS: "iz", inText: true },
      { word: "united", family: { noun: "unity", verb: "unite", adjective: "united" }, finalS: "s", finalEd: "id", edWord: "united", inText: true },
    ],
    lexisMeaning: [
      { given: "people who help freely", answer: "volunteers" },
      { given: "togetherness and mutual help", answer: "solidarity" },
      { given: "bringing people together", answer: "unite" },
    ],
    lexisOpposite: [
      { given: "selfish", answer: "generous" },
      { given: "divides", answer: "unites" },
      { given: "increases", answer: "reduces" },
    ],
    grammar: [
      { sentence: "Volunteers clean public spaces without expecting payment.", rewritten: "Public spaces are cleaned by volunteers who expect no payment.", note: "passive voice" },
      { sentence: "People who respect public property create a pleasant area.", rewritten: "If people respect public property, they create a pleasant area.", note: "relative clause → conditional" },
    ],
    discourse: {
      text: "Volunteers give their time ___ expecting payment. People ___ respect public property create a pleasant area. ___ residents meet, they propose ideas and solve problems.",
      options: ["who", "without", "when", "because"],
      answers: ["without", "who", "when"],
    },
  },

  health: {
    key: "health",
    label: "Health and wellbeing",
    title: "A healthier life: {topic}",
    lead: [
      "Good health is the foundation of every other success in life.",
      "Teenagers who pay attention to {topic} build habits that protect them for decades.",
    ],
    body: [
      "A balanced diet gives the body the energy it needs to grow and concentrate.",
      "Eating fruit and vegetables every day strengthens the immune system naturally.",
      "Regular sport keeps the heart strong and helps people manage stress.",
      "Sleeping seven to nine hours each night improves memory and mood.",
      "Drinking enough water prevents headaches and keeps the skin healthy.",
      "Reducing sugar and fast food lowers the risk of serious diseases later in life.",
      "Doctors recommend at least thirty minutes of physical activity every day.",
      "Small breaks from screens protect the eyes and encourage real movement.",
    ],
    detail: [
      "Studies show that active students perform better in class than inactive ones.",
      "Walking to school is a simple way to add exercise to a busy day.",
      "Mental health is just as important as physical health, and talking helps.",
      "Teenagers who share their worries with trusted adults feel less anxious.",
      "Regular medical check-ups detect small problems before they become serious.",
      "A healthy lifestyle is a choice repeated many times, not a single decision.",
    ],
    conclusion: [
      "To sum up, health is built through small daily decisions about food, movement and rest.",
      "The effort we invest in our bodies today gives us energy for all our dreams tomorrow.",
    ],
    questions: [
      { q: "What does a balanced diet provide?", a: "The energy the body needs to grow and concentrate." },
      { q: "How does sport help people?", a: "It keeps the heart strong and helps manage stress." },
      { q: "Why is sleep important?", a: "It improves memory and mood." },
      { q: "How does drinking water help?", a: "It prevents headaches and keeps the skin healthy." },
    ],
    trueFalse: [
      { statement: "Eating fast food every day improves health.", truth: false, justification: "The text says reducing sugar and fast food lowers the risk of disease." },
      { statement: "Sleep improves memory and mood.", truth: true, justification: "The text says sleeping well improves memory and mood." },
      { statement: "Doctors recommend thirty minutes of activity daily.", truth: true, justification: "The text recommends at least thirty minutes of physical activity every day." },
      { statement: "Drinking water prevents headaches.", truth: true, justification: "The text says drinking enough water prevents headaches." },
    ],
    vocab: [
      { word: "balanced", family: { noun: "balance", verb: "balance", adjective: "balanced" }, finalS: "z", finalEd: "t", edWord: "balanced", inText: true },
      { word: "strengthens", family: { noun: "strength", verb: "strengthen", adjective: "strong" }, finalS: "z", inText: true },
      { word: "recommends", family: { noun: "recommendation", verb: "recommend" }, finalS: "z", inText: true },
      { word: "prevents", family: { noun: "prevention", verb: "prevent", adjective: "preventive" }, finalS: "s", inText: true },
      { word: "energetic", family: { noun: "energy", adjective: "energetic", adverb: "energetically" }, finalS: "z", inText: false },
      { word: "reduces", family: { noun: "reduction", verb: "reduce" }, finalS: "iz", inText: true },
      { word: "exercised", family: { noun: "exercise", verb: "exercise" }, finalS: "z", finalEd: "d", edWord: "exercised", inText: false },
    ],
    lexisMeaning: [
      { given: "with the right mixture of foods", answer: "balanced" },
      { given: "makes stronger", answer: "strengthens" },
      { given: "advises", answer: "recommends" },
    ],
    lexisOpposite: [
      { given: "encourages", answer: "prevents" },
      { given: "weakens", answer: "strengthens" },
      { given: "increases", answer: "reduces" },
    ],
    grammar: [
      { sentence: "Regular sport keeps the heart strong.", rewritten: "If you do regular sport, your heart stays strong.", note: "imperative → conditional" },
      { sentence: "Sleeping well improves memory and mood.", rewritten: "Memory and mood are improved by sleeping well.", note: "passive voice" },
    ],
    discourse: {
      text: "A balanced diet gives the body energy ___ it needs. ___ people sleep well, their memory improves. Drinking water ___ headaches keeps the skin healthy.",
      options: ["that", "when", "prevents", "and"],
      answers: ["that", "when", "prevents"],
    },
  },

  technology: {
    key: "technology",
    label: "Science and technology",
    title: "Innovation and change: {topic}",
    lead: [
      "Technology has transformed the way people learn, work and communicate.",
      "When young people explore {topic}, they discover how science shapes everyday life.",
    ],
    body: [
      "Smartphones give instant access to information that once required a library.",
      "Online lessons allow students in remote villages to follow qualified teachers.",
      "Artificial intelligence helps doctors analyse medical images more quickly.",
      "Renewable energy technologies convert sunlight and wind into clean electricity.",
      "Social networks connect families across continents in a few seconds.",
      "However, technology also requires responsibility, especially in the classroom.",
      "Engineers design machines that perform dangerous tasks instead of humans.",
      "Coding, the language of computers, has become a valuable skill for young people.",
    ],
    detail: [
      "Historians note that every major invention changed society in unexpected ways.",
      "The internet compresses entire libraries into a device that fits in a pocket.",
      "Solar panels installed on school roofs reduce electricity bills and teach ecology.",
      "Scientists warn that technology should serve people, not replace human judgement.",
      "Video calls make it possible to attend meetings and family events from anywhere.",
      "Digital skills, combined with creativity, open doors to new careers.",
    ],
    conclusion: [
      "In conclusion, technology is a powerful tool whose value depends on how we use it.",
      "Used wisely, innovation improves lives; ignored, it creates new problems for society.",
    ],
    questions: [
      { q: "How do online lessons help remote students?", a: "They allow them to follow qualified teachers." },
      { q: "What do renewable energy technologies do?", a: "They convert sunlight and wind into clean electricity." },
      { q: "Why is coding described as valuable?", a: "It has become a valuable skill for young people." },
      { q: "How does artificial intelligence help doctors?", a: "It helps them analyse medical images more quickly." },
    ],
    trueFalse: [
      { statement: "Technology never requires responsibility.", truth: false, justification: "The text says technology also requires responsibility." },
      { statement: "Social networks connect families across continents.", truth: true, justification: "The text says they connect families across continents in seconds." },
      { statement: "Machines now perform dangerous tasks instead of humans.", truth: true, justification: "The text says engineers design machines that perform dangerous tasks." },
      { statement: "Online lessons help remote students access qualified teachers.", truth: true, justification: "The text says online lessons allow students in remote villages to follow qualified teachers." },
    ],
    vocab: [
      { word: "transformed", family: { noun: "transformation", verb: "transform", adjective: "transformative" }, finalS: "z", finalEd: "d", edWord: "transformed", inText: true },
      { word: "access", family: { verb: "access", adjective: "accessible" }, finalS: "iz", inText: true },
      { word: "innovations", family: { noun: "innovation", verb: "innovate", adjective: "innovative" }, finalS: "z", inText: true },
      { word: "connects", family: { noun: "connection", verb: "connect", adjective: "connected" }, finalS: "s", inText: true },
      { word: "valuable", family: { noun: "value", verb: "value", adjective: "valuable" }, finalS: "z", inText: true },
      { word: "perform", family: { noun: "performance", verb: "perform" }, finalS: "z", inText: true },
      { word: "installed", family: { noun: "installation", verb: "install" }, finalS: "z", finalEd: "d", edWord: "installed", inText: true },
    ],
    lexisMeaning: [
      { given: "changed completely", answer: "transformed" },
      { given: "new ideas or devices", answer: "innovations" },
      { given: "carry out", answer: "perform" },
    ],
    lexisOpposite: [
      { given: "useless", answer: "valuable" },
      { given: "disconnects", answer: "connects" },
      { given: "old-fashioned", answer: "innovative" },
    ],
    grammar: [
      { sentence: "Engineers design machines that perform dangerous tasks.", rewritten: "Machines that perform dangerous tasks are designed by engineers.", note: "passive voice" },
      { sentence: "The internet gives instant access to information.", rewritten: "Instant access to information is given by the internet.", note: "passive voice" },
    ],
    discourse: {
      text: "Smartphones give access ___ information ___ once required a library. ___ technology is used wisely, it improves lives. Engineers design machines ___ perform dangerous tasks.",
      options: ["to", "that", "when", "which"],
      answers: ["to", "that", "when"],
    },
  },

  culture: {
    key: "culture",
    label: "Culture and heritage",
    title: "Remembering our roots: {topic}",
    lead: [
      "Culture is the memory of a people: its language, art, food and stories.",
      "Learning about {topic} helps young generations understand where they come from.",
    ],
    body: [
      "Ancient monuments preserve the knowledge and skill of past civilisations.",
      "Museums display objects that tell the daily stories of people who lived long ago.",
      "Traditional music and dance are passed from one generation to the next.",
      "Festivals celebrate history, faith and the changing seasons of the year.",
      "Handwritten manuscripts show how scholars shared ideas before printing.",
      "Local languages carry expressions that cannot be translated exactly.",
      "Archaeologists study ruins to understand how ancient cities were organised.",
      "Craftsmen who keep old techniques alive protect an irreplaceable heritage.",
    ],
    detail: [
      "Historians believe that understanding the past helps societies avoid old mistakes.",
      "Preserving old buildings also attracts visitors who support local businesses.",
      "Oral stories, told by grandmothers, carry wisdom that books sometimes lose.",
      "Students who visit heritage sites connect real places with their lessons.",
      "Digital archives now protect documents that would otherwise decay.",
      "Every culture contributes a unique piece to the shared heritage of humanity.",
    ],
    conclusion: [
      "In the end, heritage connects generations and gives identity to communities.",
      "Protecting culture is not about living in the past; it is about carrying it into the future.",
    ],
    questions: [
      { q: "What do museums display?", a: "Objects that tell the daily stories of people who lived long ago." },
      { q: "How do archaeologists help us?", a: "They study ruins to understand how ancient cities were organised." },
      { q: "Why are local languages precious?", a: "They carry expressions that cannot be translated exactly." },
      { q: "How do festivals help preserve culture?", a: "They celebrate history, faith and the changing seasons." },
    ],
    trueFalse: [
      { statement: "Culture is only about modern technology.", truth: false, justification: "The text says culture is language, art, food and stories." },
      { statement: "Festivals celebrate history and faith.", truth: true, justification: "The text says festivals celebrate history, faith and the seasons." },
      { statement: "Oral stories carry wisdom.", truth: true, justification: "The text says oral stories carry wisdom that books sometimes lose." },
      { statement: "Museums display objects from daily life long ago.", truth: true, justification: "The text says museums display objects that tell daily stories of people who lived long ago." },
    ],
    vocab: [
      { word: "preserve", family: { noun: "preservation", verb: "preserve", adjective: "preserved" }, finalS: "z", inText: true },
      { word: "civilisations", family: { adjective: "civilised" }, finalS: "z", inText: true },
      { word: "heritage", family: { adjective: "hereditary" }, finalS: "z", inText: true },
      { word: "ancestors", family: { noun: "ancestry", adjective: "ancestral" }, finalS: "z", inText: false },
      { word: "displays", family: { noun: "display", verb: "display" }, finalS: "z", inText: true },
      { word: "protected", family: { noun: "protection", verb: "protect", adjective: "protected" }, finalS: "s", finalEd: "id", edWord: "protected", inText: true },
      { word: "translated", family: { noun: "translation", verb: "translate", adjective: "translatable" }, finalS: "s", finalEd: "id", edWord: "translated", inText: true },
    ],
    lexisMeaning: [
      { given: "keep safe for the future", answer: "preserve" },
      { given: "advanced human societies of the past", answer: "civilisations" },
      { given: "inherited traditions and monuments", answer: "heritage" },
    ],
    lexisOpposite: [
      { given: "destroy", answer: "preserve" },
      { given: "hides", answer: "displays" },
      { given: "modern", answer: "ancient" },
    ],
    grammar: [
      { sentence: "Museums display objects that tell daily stories.", rewritten: "Objects that tell daily stories are displayed by museums.", note: "passive voice" },
      { sentence: "Students visit heritage sites, so they connect places with lessons.", rewritten: "If students visit heritage sites, they connect places with lessons.", note: "so → conditional" },
    ],
    discourse: {
      text: "Museums display objects ___ tell daily stories. ___ students visit heritage sites, they learn from real places. Craftsmen keep old techniques alive ___ protect our heritage.",
      options: ["who", "that", "when", "and"],
      answers: ["that", "when", "and"],
    },
  },

  food: {
    key: "food",
    label: "Food and tradition",
    title: "The taste of home: {topic}",
    lead: [
      "Food is much more than fuel for the body; it carries memory, identity and love.",
      "Around {topic}, families gather, stories are told and traditions are renewed.",
    ],
    body: [
      "Traditional recipes are often passed from grandmothers to their grandchildren.",
      "Cooking together teaches patience, organisation and the pleasure of sharing.",
      "Seasonal products taste better and support local farmers and markets.",
      "A family meal invites people to slow down and talk about their day.",
      "Hygiene in the kitchen protects families from avoidable illnesses.",
      "Culinary habits differ from one region to another, creating rich diversity.",
      "Meals prepared with fresh ingredients contain fewer additives and less salt.",
      "Inviting a guest to the table is a generous gesture in many cultures.",
    ],
    detail: [
      "Nutritionists recommend colourful plates because each colour brings different vitamins.",
      "Baking bread at home fills the house with warmth that supermarkets cannot sell.",
      "Festival dishes reconnect families with ancestors and old celebrations.",
      "Learning to cook a family recipe is a way of keeping a legacy alive.",
      "Sharing recipes with neighbours turns simple ingredients into friendship.",
      "Healthy eating does not mean giving up taste; it means choosing better quality.",
    ],
    conclusion: [
      "In short, food connects the past with the present on every family table.",
      "Cooking with care and eating together transforms ordinary meals into precious moments.",
    ],
    questions: [
      { q: "Who usually passes down traditional recipes?", a: "Grandmothers pass them to their grandchildren." },
      { q: "Why do seasonal products matter?", a: "They taste better and support local farmers and markets." },
      { q: "How does a family meal help?", a: "It invites people to slow down and talk about their day." },
      { q: "What do fresh ingredients contain compared to processed ones?", a: "Fewer additives and less salt." },
    ],
    trueFalse: [
      { statement: "Seasonal products support local farmers.", truth: true, justification: "The text says they support local farmers and markets." },
      { statement: "Fresh ingredients contain more additives.", truth: false, justification: "The text says fresh ingredients contain fewer additives." },
      { statement: "Festival dishes reconnect families with ancestors.", truth: true, justification: "The text says festival dishes reconnect families with ancestors." },
      { statement: "Cooking together teaches patience and sharing.", truth: true, justification: "The text says cooking together teaches patience, organisation and the pleasure of sharing." },
    ],
    vocab: [
      { word: "recipes", family: { noun: "recipe", adjective: "culinary" }, finalS: "z", inText: true },
      { word: "ingredients", family: { noun: "ingredient" }, finalS: "s", inText: true },
      { word: "generous", family: { noun: "generosity", adjective: "generous", adverb: "generously" }, finalS: "z", inText: true },
      { word: "invites", family: { noun: "invitation", verb: "invite" }, finalS: "s", inText: true },
      { word: "renewed", family: { noun: "renewal", verb: "renew", adjective: "renewable" }, finalS: "z", finalEd: "d", edWord: "renewed", inText: true },
      { word: "prepared", family: { noun: "preparation", verb: "prepare", adjective: "prepared" }, finalS: "z", finalEd: "d", edWord: "prepared", inText: true },
      { word: "differ", family: { noun: "difference", verb: "differ", adjective: "different" }, finalS: "z", inText: false },
    ],
    lexisMeaning: [
      { given: "instructions for preparing food", answer: "recipes" },
      { given: "items used to make a dish", answer: "ingredients" },
      { given: "kind and giving", answer: "generous" },
    ],
    lexisOpposite: [
      { given: "selfish", answer: "generous" },
      { given: "excludes", answer: "invites" },
      { given: "neglected", answer: "renewed" },
    ],
    grammar: [
      { sentence: "Families cook together, so they share stories.", rewritten: "If families cook together, they share stories.", note: "so → conditional" },
      { sentence: "Grandmothers pass recipes to their grandchildren.", rewritten: "Recipes are passed to grandchildren by grandmothers.", note: "passive voice" },
    ],
    discourse: {
      text: "Traditional recipes are passed ___ grandmothers. Cooking together teaches patience ___ sharing. ___ guests arrive, they are invited to the table.",
      options: ["from", "and", "when", "but"],
      answers: ["from", "and", "when"],
    },
  },

  hobbies: {
    key: "hobbies",
    label: "Hobbies and free time",
    title: "The joy of {topic}",
    lead: [
      "Free time is a precious gift, and how we spend it shapes our character.",
      "For many young people, {topic} is the happiest part of the week.",
    ],
    body: [
      "Reading transports readers to worlds they will never visit in reality.",
      "Sport teaches discipline, teamwork and the art of accepting defeat.",
      "Drawing and music allow young people to express feelings words cannot carry.",
      "Collecting stamps, coins or cards trains patience and attention to detail.",
      "Outdoor activities such as cycling and hiking strengthen the body and calm the mind.",
      "Creative hobbies reduce stress and give a healthy break from screens.",
      "Students who practise a hobby regularly develop better concentration at school.",
      "Sharing a hobby with friends makes the activity twice as enjoyable.",
    ],
    detail: [
      "Psychologists recommend at least one hobby that involves the hands, not just the eyes.",
      "Board games bring families together and sharpen thinking skills.",
      "Gardening teaches children patience and respect for nature.",
      "Learning a musical instrument improves memory and coordination.",
      "Hobbies discovered in childhood often become lifelong passions or careers.",
      "A hobby is never a waste of time; it is an investment in wellbeing.",
    ],
    conclusion: [
      "To conclude, hobbies enrich life far beyond the hours they occupy.",
      "Everyone deserves a small daily moment dedicated to what they truly love.",
    ],
    questions: [
      { q: "What does sport teach?", a: "Discipline, teamwork and the art of accepting defeat." },
      { q: "How do creative hobbies help?", a: "They reduce stress and give a healthy break from screens." },
      { q: "Why do psychologists recommend hands-on hobbies?", a: "Because hobbies involving the hands, not just the eyes, are valuable." },
      { q: "How does sharing a hobby with friends affect enjoyment?", a: "It makes the activity twice as enjoyable." },
    ],
    trueFalse: [
      { statement: "Collecting trains patience and attention to detail.", truth: true, justification: "The text says collecting trains patience and attention to detail." },
      { statement: "Hobbies increase stress.", truth: false, justification: "The text says creative hobbies reduce stress." },
      { statement: "Hobbies improve concentration at school.", truth: true, justification: "The text says students with a hobby develop better concentration." },
      { statement: "Sport teaches teamwork and accepting defeat.", truth: true, justification: "The text says sport teaches discipline, teamwork and the art of accepting defeat." },
    ],
    vocab: [
      { word: "transports", family: { noun: "transport", verb: "transport" }, finalS: "s", inText: true },
      { word: "expresses", family: { noun: "expression", verb: "express", adjective: "expressive" }, finalS: "iz", inText: true },
      { word: "reduces", family: { noun: "reduction", verb: "reduce" }, finalS: "iz", inText: true },
      { word: "disciplines", family: { noun: "discipline", verb: "discipline", adjective: "disciplined" }, finalS: "z", inText: true },
      { word: "enjoyable", family: { noun: "enjoyment", verb: "enjoy", adjective: "enjoyable" }, finalS: "z", inText: true },
      { word: "practised", family: { noun: "practice", verb: "practise" }, finalS: "z", finalEd: "d", edWord: "practised", inText: true },
      { word: "strengthen", family: { noun: "strength", verb: "strengthen", adjective: "strong" }, finalS: "z", inText: true },
    ],
    lexisMeaning: [
      { given: "carries to another place", answer: "transports" },
      { given: "shows or communicates", answer: "expresses" },
      { given: "lowers", answer: "reduces" },
    ],
    lexisOpposite: [
      { given: "increases", answer: "reduces" },
      { given: "boring", answer: "enjoyable" },
      { given: "weakens", answer: "strengthen" },
    ],
    grammar: [
      { sentence: "Sport teaches discipline and teamwork.", rewritten: "Discipline and teamwork are taught by sport.", note: "passive voice" },
      { sentence: "Students practise a hobby, so they concentrate better.", rewritten: "If students practise a hobby, they concentrate better.", note: "so → conditional" },
    ],
    discourse: {
      text: "Reading transports readers ___ worlds they will never visit. Sport teaches discipline ___ teamwork. ___ people share a hobby, they enjoy it twice as much.",
      options: ["to", "and", "when", "because"],
      answers: ["to", "and", "when"],
    },
  },
};

export function getTheme(key: string): Theme {
  const t = THEMES[key];
  if (!t) throw new Error(`No theme for key "${key}"`);
  return t;
}
