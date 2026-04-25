import type { ThinkingTrackView } from "@/components/thinking-layer";

export type StarMapNode = {
  id: string;
  trackId: string;
  questionText: string;
  noteText: string | null;
  answerText: string | null;
  createdAt?: string;
  isSuggested: boolean;
  echoTrackId: string | null;
  echoNodeId: string | null;
  index: number;
  // 布局坐标
  x: number;
  y: number;
  // 视觉强度（0~1，越新越亮）
  brightness: number;
};

export type StarMapMainOrbit = {
  trackId: string;
  pathD: string;
  nodes: StarMapNode[];
};

export type StarMapClusterStar = {
  id: string;
  x: number;
  y: number;
  size: number;
  alpha: number;
};

export type StarMapClusterLink = {
  fromIndex: number;
  toIndex: number;
};

export type StarMapCluster = {
  trackId: string;
  titleQuestionText: string;
  nodeCount: number;
  relativeTimeText: string;
  cx: number;
  cy: number;
  radius: number;
  stars: StarMapClusterStar[];
  links: StarMapClusterLink[];
  labelAnchor: "left" | "right";
  labelX: number;
  labelY: number;
};

export type StarMapLayout = {
  width: number;
  height: number;
  rootQuestionText: string;
  centerX: number;
  centerY: number;
  centerR: number;
  mainOrbit: StarMapMainOrbit | null;
  clusters: StarMapCluster[];
};

export type StarMapInput = {
  width: number;
  height: number;
  rootQuestionText: string;
  tracks: ThinkingTrackView[];
  activeTrackId: string | null;
};
