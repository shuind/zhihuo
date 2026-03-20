import type { TimeEntry } from './types'

const now = new Date()
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000)
const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000)
const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

export const mockEntries: TimeEntry[] = [
  {
    id: '1',
    content: '为什么我总是在关键时刻选择退缩',
    createdAt: new Date(today.getTime() + 10 * 60 * 60 * 1000),
    updatedAt: new Date(today.getTime() + 10 * 60 * 60 * 1000),
    sourceType: 'question',
    status: 'fresh',
    revisitCount: 0,
  },
  {
    id: '2',
    content: '我对成功的定义一直在变化',
    createdAt: new Date(today.getTime() + 8 * 60 * 60 * 1000),
    updatedAt: new Date(today.getTime() + 8 * 60 * 60 * 1000),
    sourceType: 'statement',
    status: 'fresh',
    note: '早上散步时想到的',
    revisitCount: 0,
  },
  {
    id: '3',
    content: '如果不再追求效率，生活会变成什么样',
    createdAt: new Date(yesterday.getTime() + 22 * 60 * 60 * 1000),
    updatedAt: new Date(yesterday.getTime() + 22 * 60 * 60 * 1000),
    sourceType: 'question',
    status: 'in_thinking',
    thinkingSpaceId: 'space-1',
    revisitCount: 3,
    lastViewedAt: new Date(today.getTime() + 9 * 60 * 60 * 1000),
    latestStateText: '问题不在执行层面',
    milestones: ['效率焦虑的根源', '对比不同的生活节奏'],
  },
  {
    id: '4',
    content: '我好像一直在用工作逃避某些东西',
    createdAt: new Date(yesterday.getTime() + 15 * 60 * 60 * 1000),
    updatedAt: new Date(yesterday.getTime() + 15 * 60 * 60 * 1000),
    sourceType: 'intuition',
    status: 'revisited',
    revisitCount: 5,
    lastViewedAt: new Date(today.getTime() + 7 * 60 * 60 * 1000),
  },
  {
    id: '5',
    content: '想做的事和应该做的事之间的张力',
    createdAt: new Date(threeDaysAgo.getTime() + 20 * 60 * 60 * 1000),
    updatedAt: new Date(threeDaysAgo.getTime() + 20 * 60 * 60 * 1000),
    sourceType: 'conflict',
    status: 'frozen',
    thinkingSpaceId: 'space-2',
    revisitCount: 2,
    lastViewedAt: new Date(yesterday.getTime() + 10 * 60 * 60 * 1000),
    latestStateText: '停在责任感这个词上',
  },
  {
    id: '6',
    content: '有些朋友渐行渐远，而我并不感到遗憾',
    createdAt: new Date(oneWeekAgo.getTime() + 18 * 60 * 60 * 1000),
    updatedAt: new Date(oneWeekAgo.getTime() + 18 * 60 * 60 * 1000),
    sourceType: 'question',
    status: 'in_thinking',
    thinkingSpaceId: 'space-3',
    revisitCount: 4,
    lastViewedAt: new Date(threeDaysAgo.getTime() + 12 * 60 * 60 * 1000),
    latestStateText: '关系的质量比数量重要',
  },
  {
    id: '7',
    content: '我想被怎样记住',
    createdAt: new Date(twoWeeksAgo.getTime() + 14 * 60 * 60 * 1000),
    updatedAt: new Date(twoWeeksAgo.getTime() + 14 * 60 * 60 * 1000),
    sourceType: 'question',
    status: 'archived',
    revisitCount: 2,
    note: '这个问题后来变了方向',
  },
  {
    id: '8',
    content: '深夜时感到最清醒，这说明了什么',
    createdAt: new Date(oneMonthAgo.getTime() + 23 * 60 * 60 * 1000),
    updatedAt: new Date(oneMonthAgo.getTime() + 23 * 60 * 60 * 1000),
    sourceType: 'intuition',
    status: 'frozen',
    thinkingSpaceId: 'space-4',
    revisitCount: 6,
    lastViewedAt: new Date(twoWeeksAgo.getTime() + 20 * 60 * 60 * 1000),
    latestStateText: '白天的自我与夜晚的自我',
  },
  {
    id: '9',
    content: '越是重要的对话，越容易沉默',
    createdAt: new Date(oneMonthAgo.getTime() + 16 * 60 * 60 * 1000),
    updatedAt: new Date(oneMonthAgo.getTime() + 16 * 60 * 60 * 1000),
    sourceType: 'question',
    status: 'revisited',
    revisitCount: 8,
    lastViewedAt: new Date(oneWeekAgo.getTime() + 9 * 60 * 60 * 1000),
    note: '这个问题一直在心里',
  },
]

export function groupEntriesByTime(entries: TimeEntry[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

  const groups: { label: string; entries: TimeEntry[] }[] = [
    { label: '今天', entries: [] },
    { label: '昨天', entries: [] },
    { label: '这周', entries: [] },
    { label: '更早', entries: [] },
  ]

  entries.forEach((entry) => {
    const entryDate = new Date(entry.createdAt)
    if (entryDate >= today) {
      groups[0].entries.push(entry)
    } else if (entryDate >= yesterday) {
      groups[1].entries.push(entry)
    } else if (entryDate >= weekAgo) {
      groups[2].entries.push(entry)
    } else {
      groups[3].entries.push(entry)
    }
  })

  // Sort entries within each group by createdAt (newest first)
  groups.forEach((group) => {
    group.entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  })

  // Filter out empty groups
  return groups.filter((group) => group.entries.length > 0)
}
