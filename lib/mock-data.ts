import { CandidateLink, Doubt, DoubtCluster } from "@/lib/types";

const userId = "user-demo-001";

const monthAnchors = [
  "2025-03-05T20:00:00.000Z",
  "2025-04-08T20:00:00.000Z",
  "2025-05-10T20:00:00.000Z",
  "2025-06-12T20:00:00.000Z",
  "2025-07-14T20:00:00.000Z",
  "2025-08-15T20:00:00.000Z",
  "2025-09-12T20:00:00.000Z",
  "2025-10-11T20:00:00.000Z",
  "2025-11-14T20:00:00.000Z",
  "2025-12-13T20:00:00.000Z",
  "2026-01-10T20:00:00.000Z",
  "2026-02-16T20:00:00.000Z"
];

export const mockClusters: DoubtCluster[] = [
  {
    id: "self-worth",
    title: "自我价值星座",
    summary: "关于价值感、被看见和自我认可的长期疑惑。",
    domain: "内在体验",
    color: "#A78BFA",
    activeScore: 0.86,
    longTermScore: 0.92,
    unresolvedCoreQuestion: "我是否只在被认可时才觉得自己有价值？"
  },
  {
    id: "direction-choice",
    title: "方向选择星座",
    summary: "围绕选择、长期投入与放弃成本的反复提问。",
    domain: "人生决策",
    color: "#7DD3FC",
    activeScore: 0.8,
    longTermScore: 0.88,
    unresolvedCoreQuestion: "我该怎么判断一条路值得长期投入？"
  },
  {
    id: "zhihuo-product",
    title: "知惑产品星座",
    summary: "关于知惑定位、边界和体验取舍的持续探索。",
    domain: "产品构建",
    color: "#E5E7EB",
    activeScore: 0.94,
    longTermScore: 0.9,
    unresolvedCoreQuestion: "知惑如何在有用和克制之间保持平衡？"
  },
  {
    id: "learning-system",
    title: "学习系统星座",
    summary: "关于输入、整理、复盘效率与深度的困惑。",
    domain: "学习方法",
    color: "#93C5FD",
    activeScore: 0.72,
    longTermScore: 0.8,
    unresolvedCoreQuestion: "我怎样学，才能既深入又不焦虑？"
  },
  {
    id: "relationship-boundary",
    title: "关系边界星座",
    summary: "关于亲密关系中的表达、边界与责任分配。",
    domain: "关系与沟通",
    color: "#C4B5FD",
    activeScore: 0.65,
    longTermScore: 0.76,
    unresolvedCoreQuestion: "我怎样既真诚表达，又不越过彼此边界？"
  },
  {
    id: "action-discipline",
    title: "行动节律星座",
    summary: "关于行动拖延、节奏维持和执行波动。",
    domain: "行动与节律",
    color: "#99F6E4",
    activeScore: 0.74,
    longTermScore: 0.82,
    unresolvedCoreQuestion: "我怎么在低能量时仍然保持推进？"
  },
  {
    id: "chaos-zone",
    title: "混沌区",
    summary: "尚未形成结构的疑惑片段，允许保持未定。",
    domain: "未归类",
    color: "#64748B",
    activeScore: 0.5,
    longTermScore: 0.5,
    unresolvedCoreQuestion: "这片区域还在慢慢显形。"
  }
];

const doubtSeeds: Record<string, string[]> = {
  "self-worth": [
    "我是不是只有在做出成绩时才敢肯定自己？",
    "别人一句否定会让我整天怀疑自己，这是为什么？",
    "我想知道自我价值能不能不依赖结果。",
    "当我停下来时，为什么会有强烈的空心感？",
    "我在追求优秀，还是在躲避无价值感？",
    "如果没有外部认可，我还会认真做这些事吗？",
    "我开始区分‘想被看见’和‘想做成事’，这对吗？",
    "我是不是把自律当成证明自己值得存在？",
    "我能不能接受一个不那么强的自己？",
    "当我不再证明自己时，我还剩下什么动力？",
    "我最近更常问‘我想成为什么样的人’，这是变化吗？",
    "也许价值感不是赢出来的，而是长期活出来的？"
  ],
  "direction-choice": [
    "我该选稳定路径还是更难但更想做的路径？",
    "我到底是在害怕失败，还是害怕选错？",
    "如果两条路都可行，我该用什么标准决策？",
    "我是不是总想先得到确定性再行动？",
    "放弃一条路时，我最难受的是沉没成本吗？",
    "我能不能先承诺一个阶段，再复盘去留？",
    "我发现自己更在意‘是否长期值得’而不是短期收益。",
    "当方向不清时，我该先做验证还是继续思考？",
    "我怎么知道这是阶段性低谷还是方向错误？",
    "也许我需要的是‘可逆决策’，不是一次选对？",
    "我最近提问从‘选哪个’变成‘为什么选’，这正常吗？",
    "我想要的方向，应该让我更稳定地投入，而不是更焦虑。"
  ],
  "zhihuo-product": [
    "知惑应该优先做记录，还是优先做思考辅助？",
    "用户为什么会愿意把未成熟的疑惑交出来？",
    "星空和森林是隐喻，怎样让它们成为数据实体？",
    "知惑的核心价值是解决问题还是陪伴演变？",
    "我该不该在 v0 就加入任务陪跑能力？",
    "如何避免产品变成另一个效率工具？",
    "时间轴是不是比颜色编码更适合表达演变？",
    "探索模式要不要默认触发？还是必须主动点击？",
    "我该如何定义‘只并置不解释’这条产品宪法？",
    "如果只能保留四个功能，应该是哪四个？",
    "我希望用户三年后回来仍有价值，这会影响哪些设计？",
    "知惑是否应该把‘允许混沌’做成显式功能？"
  ],
  "learning-system": [
    "我读了很多内容，但为什么总感觉没内化？",
    "我该如何区分‘收集信息’和‘建立理解’？",
    "复盘到底应该按主题还是按时间？",
    "我是不是在用笔记制造学习幻觉？",
    "什么时候该继续输入，什么时候该停下来整理？",
    "如果一个问题反复出现，我该如何折叠它？",
    "我能不能建立一个不依赖意志力的学习节律？",
    "我最近更想追求深度，而不是覆盖面，这对吗？",
    "我该怎么把抽象概念转成可验证的问题？",
    "学习卡点到底是缺信息，还是缺边界定义？",
    "我是否需要把每次学习都落成一个可追踪疑惑？",
    "我想试试先提问再学习，这会不会更稳定？"
  ],
  "relationship-boundary": [
    "我表达需求时总怕给别人压力，怎么办？",
    "我是不是把‘体贴’误当成‘不表达’？",
    "关系里的边界到底该提前说还是边走边调？",
    "我害怕冲突，所以常常选择沉默，这值得吗？",
    "我怎样表达不同意见又不让关系变僵？",
    "我是不是在替别人承担他们自己的情绪？",
    "当我说‘我不舒服’时，为什么会有内疚感？",
    "我最近能更早识别边界被越过的时刻了。",
    "我该怎样区分‘理解对方’和‘牺牲自己’？",
    "如果关系需要我长期压抑自己，它还健康吗？",
    "我能否把边界表达成邀请，而不是对抗？",
    "也许真诚关系本来就包含可被讨论的摩擦。"
  ],
  "action-discipline": [
    "我明明知道该做什么，却总是启动困难。",
    "我是不是把任务想得太大所以迟迟不开始？",
    "低能量的时候，最小可行动作应该是什么？",
    "我能否把‘完成’改成‘连续出现’来减压？",
    "我为什么会在快完成时突然分心？",
    "我的执行波动和睡眠、情绪有关吗？",
    "我应该按情绪工作，还是按时段工作？",
    "我最近更能接受慢推进，而不是冲刺后崩溃。",
    "如果今天状态差，我该如何不自责地维持节奏？",
    "我是不是把计划做得过细，导致执行阻力变大？",
    "我怎样设计一个能在现实里活下来的节律系统？",
    "长期稳定推进，是否比短期高强度更值得追求？"
  ]
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function buildDoubts(): Doubt[] {
  const targetClusters = mockClusters.filter((cluster) => cluster.id !== "chaos-zone");

  return targetClusters.flatMap((cluster, clusterIndex) =>
    monthAnchors.map((monthAnchor, monthIndex) => {
      const date = new Date(monthAnchor);
      date.setDate(date.getDate() + ((clusterIndex + monthIndex) % 5));

      const recency = (monthIndex + 1) / monthAnchors.length;
      const importance = clamp(
        0.35 +
          cluster.activeScore * 0.4 +
          recency * 0.2 +
          ((monthIndex + clusterIndex) % 4) * 0.03
      );
      const growth = clamp(0.3 + cluster.longTermScore * 0.5 + recency * 0.2);

      return {
        id: `d-${cluster.id}-${monthIndex + 1}`,
        userId,
        layer: cluster.id === "learning-system" ? "learning" : "life",
        rawText: doubtSeeds[cluster.id][monthIndex],
        createdAt: date.toISOString(),
        clusterId: cluster.id,
        importance,
        recency,
        growth
      } satisfies Doubt;
    })
  );
}

export const mockDoubts: Doubt[] = buildDoubts();

function getDaysGap(a: string, b: string): number {
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / oneDay;
}

function buildLinks(doubts: Doubt[]): CandidateLink[] {
  const links: CandidateLink[] = [];
  const byCluster = doubts.reduce<Record<string, Doubt[]>>((accumulator, doubt) => {
    accumulator[doubt.clusterId] ??= [];
    accumulator[doubt.clusterId].push(doubt);
    return accumulator;
  }, {});

  Object.values(byCluster).forEach((clusterDoubts) => {
    const sorted = [...clusterDoubts].sort(
      (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    );

    for (let index = 0; index < sorted.length - 1; index += 1) {
      const a = sorted[index];
      const b = sorted[index + 1];
      const timeGapDays = getDaysGap(a.createdAt, b.createdAt);
      const similarity = clamp(0.66 + index * 0.018, 0, 0.95);
      const recurrence = clamp((index + 1) / sorted.length, 0.2, 1);
      const score = clamp(0.6 * similarity + 0.3 * Math.log(1 + timeGapDays) / 4 + 0.1 * recurrence);

      links.push({
        id: `l-${a.id}-${b.id}`,
        aDoubtId: a.id,
        bDoubtId: b.id,
        score,
        strength: clamp(score + 0.1),
        suppressed: false,
        signals: { similarity, timeGapDays, recurrence }
      });
    }
  });

  const crossPairs = [
    ["d-direction-choice-7", "d-zhihuo-product-7"],
    ["d-self-worth-8", "d-action-discipline-8"],
    ["d-relationship-boundary-6", "d-self-worth-6"],
    ["d-learning-system-9", "d-zhihuo-product-9"],
    ["d-direction-choice-10", "d-action-discipline-10"],
    ["d-self-worth-11", "d-zhihuo-product-11"]
  ];

  crossPairs.forEach(([aId, bId], index) => {
    const a = doubts.find((doubt) => doubt.id === aId);
    const b = doubts.find((doubt) => doubt.id === bId);

    if (!a || !b) {
      return;
    }

    const timeGapDays = getDaysGap(a.createdAt, b.createdAt);
    const similarity = 0.72 + index * 0.02;
    const recurrence = 0.55 + index * 0.05;
    const score = clamp(0.5 * similarity + 0.3 * Math.log(1 + timeGapDays) / 4 + 0.2 * recurrence);

    links.push({
      id: `l-cross-${a.id}-${b.id}`,
      aDoubtId: a.id,
      bDoubtId: b.id,
      score,
      strength: clamp(score + 0.08),
      suppressed: false,
      signals: { similarity, timeGapDays, recurrence }
    });
  });

  return links;
}

export const mockCandidateLinks = buildLinks(mockDoubts);

export const emptyStateCopy = {
  feed: "先写下一句，哪怕它还很乱。",
  sky: "还没有形成星群，先种下一颗疑惑。",
  explore: "目前尚无显著线索，等更多时间与疑惑经过。",
  timeline: "时间还短，回看会慢慢显形。"
};
