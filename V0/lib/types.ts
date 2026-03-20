export type EntryStatus = 
  | 'fresh'           // 刚记录，尚未进入思考层
  | 'in_thinking'     // 已衍生到思考层，正在持续
  | 'frozen'          // 对应思考空间已冻结
  | 'revisited'       // 多次回看过
  | 'archived'        // 已归档

export type SourceType = 
  | 'question'    // 问句
  | 'statement'   // 陈述
  | 'conflict'    // 冲突
  | 'intuition'   // 直觉

export interface TimeEntry {
  id: string
  content: string
  createdAt: Date
  updatedAt: Date
  sourceType: SourceType
  status: EntryStatus
  note?: string
  thinkingSpaceId?: string
  revisitCount: number
  lastViewedAt?: Date
  milestones?: string[]
  latestStateText?: string
}

export interface TimeCluster {
  label: string
  entries: TimeEntry[]
}
