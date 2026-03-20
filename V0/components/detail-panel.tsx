'use client'

import type { TimeEntry } from '@/lib/types'
import { formatRelativeTime, formatFullDate } from '@/lib/time-utils'
import { motion } from 'framer-motion'
import { X, CornerDownRight, Archive, Clock, Eye, Sparkles } from 'lucide-react'

interface DetailPanelProps {
  entry: TimeEntry
  onClose: () => void
  onContinue: (entry: TimeEntry) => void
  onArchive: (entry: TimeEntry) => void
}

export function DetailPanel({ entry, onClose, onContinue, onArchive }: DetailPanelProps) {
  const hasThinkingProgress = entry.thinkingSpaceId || entry.latestStateText || (entry.milestones && entry.milestones.length > 0)

  return (
    <motion.aside
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      className="w-[45%] min-w-[400px] max-w-[600px] border-l border-border/30 bg-card/30 backdrop-blur-sm flex flex-col"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-border/20">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
          <span className="text-xs text-muted-foreground/60 tracking-widest uppercase">
            细节
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-2 -m-2 text-muted-foreground/40 hover:text-foreground/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-10">
        {/* Original Question */}
        <div className="mb-12">
          <p className="text-xl font-light text-foreground/90 leading-relaxed tracking-wide">
            {entry.content}
          </p>
        </div>

        {/* Meta Info */}
        <div className="flex flex-wrap items-center gap-6 mb-12 text-xs text-muted-foreground/50">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatFullDate(entry.createdAt)}</span>
          </div>
          {entry.revisitCount > 0 && (
            <div className="flex items-center gap-2">
              <Eye className="w-3.5 h-3.5" />
              <span>回看 {entry.revisitCount} 次</span>
            </div>
          )}
          {entry.status === 'in_thinking' && (
            <div className="flex items-center gap-2 text-primary/70">
              <Sparkles className="w-3.5 h-3.5" />
              <span>思考中</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-border/40 via-border/20 to-transparent mb-12" />

        {/* Note Section */}
        {entry.note && (
          <div className="mb-10">
            <h3 className="text-[10px] text-muted-foreground/40 tracking-[0.2em] uppercase mb-4">
              注记
            </h3>
            <p className="text-sm text-foreground/60 leading-relaxed italic pl-4 border-l-2 border-border/30">
              {entry.note}
            </p>
          </div>
        )}

        {/* Thinking Progress */}
        {hasThinkingProgress && (
          <div className="mb-10">
            <h3 className="text-[10px] text-muted-foreground/40 tracking-[0.2em] uppercase mb-4">
              思考轨迹
            </h3>
            
            {entry.latestStateText && (
              <div className="mb-6 p-5 rounded-lg bg-secondary/30 border border-border/20">
                <p className="text-xs text-muted-foreground/50 mb-2">停留在</p>
                <p className="text-sm text-foreground/70 leading-relaxed">
                  {entry.latestStateText}
                </p>
              </div>
            )}

            {entry.milestones && entry.milestones.length > 0 && (
              <div className="space-y-3">
                {entry.milestones.map((milestone, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-1 h-1 rounded-full bg-primary/40 mt-2 shrink-0" />
                    <span className="text-sm text-foreground/50">{milestone}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Related Tags */}
        {entry.relatedTags && entry.relatedTags.length > 0 && (
          <div className="mb-10">
            <h3 className="text-[10px] text-muted-foreground/40 tracking-[0.2em] uppercase mb-4">
              关联
            </h3>
            <div className="flex flex-wrap gap-2">
              {entry.relatedTags.map((tag, i) => (
                <span
                  key={i}
                  className="px-3 py-1.5 text-xs text-muted-foreground/60 bg-secondary/40 rounded-full border border-border/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {entry.status !== 'archived' && (
        <div className="px-8 py-6 border-t border-border/20">
          <div className="flex items-center gap-4">
            <button
              onClick={() => onContinue(entry)}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-primary/10 text-primary/80 hover:bg-primary/20 hover:text-primary transition-all duration-300 text-sm"
            >
              <CornerDownRight className="w-4 h-4" />
              <span>{entry.thinkingSpaceId ? '回到这里' : '继续思考'}</span>
            </button>
            <button
              onClick={() => onArchive(entry)}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-muted-foreground/50 hover:text-foreground/70 hover:bg-secondary/50 transition-all duration-300 text-sm"
            >
              <Archive className="w-4 h-4" />
              <span>归档</span>
            </button>
          </div>
        </div>
      )}

      {entry.status === 'archived' && (
        <div className="px-8 py-6 border-t border-border/20">
          <p className="text-xs text-muted-foreground/40 text-center tracking-wider">
            已归档于 {formatRelativeTime(entry.archivedAt || entry.updatedAt)}
          </p>
        </div>
      )}
    </motion.aside>
  )
}
