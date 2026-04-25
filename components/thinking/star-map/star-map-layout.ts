import type {
  StarMapCluster,
  StarMapClusterLink,
  StarMapClusterStar,
  StarMapInput,
  StarMapLayout,
  StarMapMainOrbit,
  StarMapNode,
} from "./star-map-types";

// -------- utils --------

export function formatClock(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatRelativeTime(ms: number | null): string {
  if (ms == null) return "";
  const now = Date.now();
  const diff = now - ms;
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(diff / day);
  if (days < 1) return "今天";
  if (days < 2) return "昨天";
  if (days < 30) return `${days} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

function toMs(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

// 基于字符串的种子随机
function makeRng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return ((h >>> 0) % 100000) / 100000;
  };
}

// Catmull-Rom 转贝塞尔曲线 path
function catmullRomToBezier(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  }
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

// -------- main layout --------

export function computeStarMapLayout(input: StarMapInput): StarMapLayout {
  const { width, height, tracks, activeTrackId, rootQuestionText } = input;
  const cx = width / 2;
  const cy = height / 2;
  const centerR = Math.max(110, Math.min(width, height) * 0.16);

  const validTracks = tracks.filter((t) => !t.isEmpty && t.nodes.length > 0);
  const activeTrack =
    validTracks.find((t) => t.id === activeTrackId) ?? validTracks[0] ?? null;

  // ===== Main orbit =====
  let mainOrbit: StarMapMainOrbit | null = null;
  if (activeTrack) {
    const sorted = [...activeTrack.nodes].sort((a, b) => {
      const ta = toMs(a.createdAt) ?? 0;
      const tb = toMs(b.createdAt) ?? 0;
      if (ta !== tb) return ta - tb;
      return activeTrack.nodes.indexOf(a) - activeTrack.nodes.indexOf(b);
    });

    const rng = makeRng(activeTrack.id);

    // 主轨大致从左下到右上，绕过中心
    const start = { x: width * 0.14, y: height * 0.78 };
    const end = { x: width * 0.62, y: height * 0.18 };

    const n = sorted.length;
    const points: Array<{ x: number; y: number }> = [];
    if (n === 1) {
      points.push({
        x: cx - centerR * 1.4,
        y: cy - centerR * 0.6,
      });
    } else {
      const minDist = centerR * 1.5;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const lx = start.x + (end.x - start.x) * t;
        const ly = start.y + (end.y - start.y) * t;
        // 推开靠近中心的点
        let px = lx;
        let py = ly;
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.hypot(dx, dy) || 0.0001;
        if (dist < minDist) {
          const k = minDist / dist;
          px = cx + dx * k;
          py = cy + dy * k;
        }
        // 轻微伪随机扰动，避免几何对称
        const jx = (rng() - 0.5) * width * 0.05;
        const jy = (rng() - 0.5) * height * 0.05;
        points.push({ x: px + jx, y: py + jy });
      }
    }

    const pathD = catmullRomToBezier(points);

    // brightness：越新越亮
    const validTimes = sorted
      .map((nd) => toMs(nd.createdAt))
      .filter((v): v is number => v !== null);
    const minT = validTimes.length ? Math.min(...validTimes) : 0;
    const maxT = validTimes.length ? Math.max(...validTimes) : 1;
    const span = maxT - minT || 1;

    const starNodes: StarMapNode[] = sorted.map((node, i) => {
      const ms = toMs(node.createdAt);
      const ratio = ms == null ? 0.6 : (ms - minT) / span;
      const brightness = 0.5 + ratio * 0.5;
      return {
        id: node.id,
        trackId: activeTrack.id,
        questionText: node.questionText,
        noteText: node.noteText,
        answerText: node.answerText,
        createdAt: node.createdAt,
        isSuggested: node.isSuggested,
        echoTrackId: node.echoTrackId,
        echoNodeId: node.echoNodeId,
        index: i,
        x: points[i]?.x ?? cx,
        y: points[i]?.y ?? cy,
        brightness,
      };
    });

    mainOrbit = {
      trackId: activeTrack.id,
      pathD,
      nodes: starNodes,
    };
  }

  // ===== Clusters =====
  const otherTracks = validTracks.filter(
    (t) => !activeTrack || t.id !== activeTrack.id
  );

  // 候选锚点：避开中心和主轨起止区
  const anchors: Array<{ x: number; y: number; side: "left" | "right" }> = [
    { x: width * 0.08, y: height * 0.18, side: "left" },
    { x: width * 0.86, y: height * 0.22, side: "right" },
    { x: width * 0.06, y: height * 0.48, side: "left" },
    { x: width * 0.88, y: height * 0.52, side: "right" },
    { x: width * 0.78, y: height * 0.82, side: "right" },
    { x: width * 0.36, y: height * 0.88, side: "left" },
    { x: width * 0.58, y: height * 0.86, side: "right" },
    { x: width * 0.18, y: height * 0.92, side: "left" },
  ];

  const clusters: StarMapCluster[] = [];
  otherTracks.slice(0, anchors.length).forEach((track, idx) => {
    const anchor = anchors[idx];
    const rng = makeRng(track.id);

    const starCount = Math.max(3, Math.min(7, track.nodes.length || 4));
    const radius = 24 + rng() * 14;

    const stars: StarMapClusterStar[] = [];
    const baseAngle = rng() * Math.PI * 2;
    for (let i = 0; i < starCount; i++) {
      const angle =
        baseAngle + (i / starCount) * Math.PI * 2 + (rng() - 0.5) * 0.9;
      const r = radius * (0.35 + rng() * 0.75);
      stars.push({
        id: `${track.id}-star-${i}`,
        x: anchor.x + Math.cos(angle) * r,
        y: anchor.y + Math.sin(angle) * r,
        size: 0.7 + rng() * 1.3,
        alpha: 0.35 + rng() * 0.45,
      });
    }

    // 极淡的连线
    const links: StarMapClusterLink[] = [];
    for (let i = 0; i < starCount - 1; i++) {
      if (rng() > 0.3) {
        links.push({ fromIndex: i, toIndex: i + 1 });
      }
    }
    if (starCount >= 4 && rng() > 0.5) {
      links.push({ fromIndex: 0, toIndex: starCount - 1 });
    }

    const lastNodeTime = toMs(
      track.nodes[track.nodes.length - 1]?.createdAt
    );
    const relativeTimeText = formatRelativeTime(lastNodeTime);

    const labelOffset = 18;
    const labelX =
      anchor.side === "left"
        ? anchor.x + radius + labelOffset
        : anchor.x - radius - labelOffset;

    clusters.push({
      trackId: track.id,
      titleQuestionText: track.titleQuestionText,
      nodeCount: track.nodeCount || track.nodes.length,
      relativeTimeText,
      cx: anchor.x,
      cy: anchor.y,
      radius,
      stars,
      links,
      labelAnchor: anchor.side,
      labelX,
      labelY: anchor.y,
    });
  });

  return {
    width,
    height,
    rootQuestionText,
    centerX: cx,
    centerY: cy,
    centerR,
    mainOrbit,
    clusters,
  };
}
