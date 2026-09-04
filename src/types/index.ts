// Domain types shared between the API, generation engine and UI.
// Mirrors the PRD conceptual model (sections 13–15) in a serializable shape.

export type ExamStatus = "NEW" | "DRAFT" | "ACTIVE" | "EXPORTED" | "ARCHIVED";
export type SectionType = "TEXT" | "PART_ONE" | "TEXT_EXPLORATION" | "WRITING";

export interface ExamConfigDto {
  id?: string;
  level: string;
  grade: string;
  stream?: string | null;
  length: number;
  unit: string;
  topic: string;
  customTopic: boolean;
  teacherKeywords?: string | null;
  difficulty?: string | null;
  guideVersion?: string | null;
  language?: string;
}

export interface TaskDto {
  id: string;
  skill?: string | null;
  prompt: string;
  instruction?: string | null;
  answer?: string | null;
  marks: number;
  order: number;
  manualEdited: boolean;
  family?: string | null;
  table?: { headers: string[]; rows: string[][] } | null;
  candidates: TaskDto[]; // alternative candidates (flattened JSON)
}

export interface TopicDto {
  id: string;
  kind: "GUIDED" | "FREE";
  title?: string | null;
  situation?: string | null;
  instruction?: string | null;
  keywords?: string | null;
  form?: string | null;
  marks: number;
  order: number;
  manualEdited: boolean;
  candidates: TopicDto[];
}

export interface SectionDto {
  id: string;
  type: SectionType;
  heading?: string | null;
  order: number;
  text?: string | null;
  textTitle?: string | null;
  previousText?: string | null;
  previousTitle?: string | null;
  sourceIndex?: number | null; // index into ExamDto.sources — the citation the teacher chose
  candidates: { title: string; text: string }[];
  tasks: TaskDto[];
  topics: TopicDto[];
}

export interface SourceDto {
  title?: string | null;
  author?: string | null;
  publication?: string | null;
  url?: string | null;
  accessedAt?: string | null;
  adaptationNote?: string | null;
  isExternal: boolean;
}

export interface ExamDto {
  id: string;
  title: string;
  status: ExamStatus;
  config?: ExamConfigDto | null;
  sections: SectionDto[];
  sources: SourceDto[];
  lastOpenedAt: string;
  updatedAt: string;
  createdAt: string;
}

export interface GenerationRequest {
  type: "TEXT" | "PART_ONE" | "TEXT_EXPLORATION" | "WRITING" | "TASK_ALT" | "TOPIC_ALT" | "REWRITE";
  taskId?: string;
  topicId?: string;
  target?: "simpler" | "harder";
  mode?: "first" | "regenerate";
}

export interface GeneratedSource {
  title: string;
  author?: string | null;
  publication?: string | null;
  url?: string | null;
  adaptationNote: string;
  isExternal: boolean;
}

export interface GeneratedText {
  title: string;
  text: string;
  words: number;
  source?: GeneratedSource | null;
}

export interface GeneratedTextCandidate {
  title: string;
  text: string;
  source?: GeneratedSource | null;
}

export interface GeneratedTask {
  prompt: string;
  instruction: string;
  answer?: string;
  marks: number;
  skill?: string;
  family?: string;
  table?: { headers: string[]; rows: string[][] };
}

export interface GeneratedTopic {
  kind: "GUIDED" | "FREE";
  title: string;
  situation: string;
  instruction: string;
  keywords?: string;
  form: string;
  marks: number;
}
