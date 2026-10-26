export const BAD_TEXT_CONTENT = JSON.stringify({
  candidates: [{ title: "Exploring the ancient world", text: "The ancient world remains a subject of study for modern historians who work in museums and universities across the region." }],
});

export const GOOD_TEXT_CONTENT = JSON.stringify({
  candidates: [{ title: "Exploring the ancient world", text: "The ancient world still shapes the way modern societies understand themselves, and archaeologists continue to uncover evidence of ordinary life in its cities. Excavations at Uruk have revealed workshops, granaries and narrow streets that once held thousands of inhabitants, and every season adds detail to that picture.\n\nTrade carried ideas as well as goods across great distances, linking the Mediterranean with the valleys of Mesopotamia and the oases of the desert. Pottery styles and metal objects found far from their place of manufacture show how far merchants travelled, and how quickly a technique could spread from one community to another.\n\nWritten records offer another window onto these communities, recording harvests, debts and disputes in careful detail. Reading them reminds us that the people of the ancient world organised their lives with considerable skill and imagination, and that their concerns were often recognisably our own." }],
});

export const PART_ONE_FIXTURE = JSON.stringify({
  sets: [{
    tasks: [
      { skill: "READING", family: "TRUE_FALSE", prompt: "1. Museums display objects.\n2. Culture is modern.\n3. Festivals help.\n4. Heritage connects.", instruction: "Are the following statements true or false? Write T or F next to the letter corresponding to the statement.", answer: "1. True.\n2. False.\n3. True.\n4. True.", marks: 1.5 },
      { skill: "READING", family: "QUESTIONS", prompt: "1. What do museums display?\n2. How do festivals help?\n3. Why is heritage important?\n4. What do archaeologists study?", instruction: "Answer the following questions according to the text.", answer: "1. Objects.\n2. They celebrate history.\n3. It connects generations.\n4. They study ruins.", marks: 2 },
      { skill: "READING", family: "PARAGRAPH_ID", prompt: "A. Museums display daily stories.\nB. Trade carried ideas.\nC. Written records show skill.\nD. Festivals celebrate seasons.", instruction: "In which paragraph is it mentioned that...?", answer: "A. Paragraph 1\nB. Paragraph 2\nC. Paragraph 3\nD. Paragraph 1", marks: 1.5 },
      { skill: "READING", family: "COHESIVE_MARKERS", prompt: "1. \"Its\" (underlined)\n2. \"They\" (underlined)\n3. \"That\" (underlined)", instruction: "Who or what do the underlined words refer to in the text?", answer: "1. culture\n2. people\n3. heritage", marks: 1 },
      { skill: "READING", family: "TITLE_OR_IDEA", prompt: "Give a title to the text.", instruction: "Give a title to the text / Choose the general idea of the text.", answer: "Exploring the Ancient World", marks: 1 },
    ],
  }],
});

export const TEXT_EXPLORATION_FIXTURE = JSON.stringify({
  sets: [{
    tasks: [
      { skill: "VOCABULARY", prompt: "1. Ancient → ..........\n2. Societies → ..........\n3. Evidence → ..........\n4. Communities → ..........", instruction: "Find the meaning.", answer: "1. ancient = old\n2. societies = communities\n3. evidence = proof\n4. communities = groups", marks: 1.5 },
      { skill: "MORPHOLOGY", family: "WORD_FAMILY", prompt: '1. "societies" → ..........\n2. "archaeologists" → ..........\n3. "communities" → ..........', instruction: "Complete the chart.", answer: "1. noun/verb\n2. noun/verb\n3. noun", marks: 1.5, table: { headers: ["Verb","Noun","Adjective"], rows: [["to corrupt","corruption","corrupt"],["display","display","—"],["protect","protection","protected"]] } },
      { skill: "PHONOLOGY", family: "SOUND_CLASS", prompt: "List: [ancient, societies, communities, evidence]\nClassify words.", instruction: "Classify words by final sound.", answer: "/z/: preserve, heritage, ancestors\n/s/: displays", marks: 1, table: { headers: ["/s/","/z/","/ɪz/"], rows: [["","",""]] } },
      { skill: "GRAMMAR", family: "REWRITE", prompt: "A) The government encourages green energies.\nB) Green energies are encouraged ..........", instruction: "Rewrite B.", answer: "Green energies are encouraged by the government.", marks: 2 },
      { skill: "DISCOURSE", family: "GAP_FILL", prompt: "List: [who, when, that, and]\nMuseums display objects ___ tell stories.\n___ students visit sites, they learn.\nCraftsmen protect heritage ___ keep techniques alive.\nVisitors ___ respect customs are welcome.", instruction: "Fill in the gaps.", answer: "that, when, and, who", marks: 1 },
    ],
  }],
});

export const WRITING_FIXTURE = JSON.stringify({
  sets: [{ guided: { kind: "GUIDED", title: "Topic 1", situation: "Your school magazine is preparing a special issue about exploring the ancient world.", instruction: "Write a text of about 80–120 words.", keywords: "preservation/civilised/hereditary", form: "a newspaper article", marks: 6 }, free: { kind: "FREE", title: "Topic 2", situation: "In the coming years, exploring the ancient world will play an even bigger role in our lives.", instruction: "Write a text of about 80–120 words.", form: "a short article", marks: 6 } }],
});
