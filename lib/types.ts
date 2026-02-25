export type Layer = "life" | "learning";

export type GuardScene =
  | "life_auto"
  | "learning_auto"
  | "explore_prompt"
  | "semantic_hint";

export interface Doubt {
  id: string;
  userId: string;
  layer: Layer;
  rawText: string;
  createdAt: string;
  clusterId: string;
  importance: number;
  recency: number;
  growth: number;
}

export interface DoubtCluster {
  id: string;
  title: string;
  summary: string;
  domain: string;
  color: string;
  activeScore: number;
  longTermScore: number;
  unresolvedCoreQuestion: string;
}

export interface CandidateLink {
  id: string;
  aDoubtId: string;
  bDoubtId: string;
  score: number;
  strength: number;
  suppressed: boolean;
  signals: {
    similarity: number;
    timeGapDays: number;
    recurrence: number;
  };
}

export interface ExploreResult {
  selectedDoubts: Doubt[];
  questionPrompt: string | null;
  confidence: number;
}

export interface SmartSettings {
  enableExploreMode: boolean;
  enableMeteorHints: boolean;
  enableLearningAutoSort: boolean;
  enableSemanticDerivation: boolean;
}
