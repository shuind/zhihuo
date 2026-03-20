'use client'

import type { TimeEntry } from '@/lib/types'
import { formatRelativeTime } from '@/lib/time-utils'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface TimeEntryCardProps {
  entry: TimeEntry
  isSelected?: boolean
  onSelect?: (entry: TimeEntry) => void
  onContinueThinking?: (entry: TimeEntry) => void
}

export function TimeEntryCard({ entry, isSelected, onSelect }: TimeEntryCardProps) {
  const hasProgress = entry.thinkingSpaceId || entry.latestStateText || (entry.milestones && entry.milestones.length > 0)

  return (
    <motion.article
      layout
      className="group relative"
    >
      {/* Selection indicator */}
      <motion.div
        className="absolute -left-4 top-1/2 -translate-y-1/2 w-0.5 h-0 rounded-full bg-primary/60"
        animate={{
          height: isSelected ? '60%' : 0,
          opacity: isSelected ? 1 : 0
        }}
        transition={{ duration: 0.3 }}
      />

      <button
        onClick={() => onSelect?.(entry)}
        className={cn(
          "w-full text-left py-7 px-4 -mx-4 rounded-xl transition-all duration-500",
          "hover:bg-card/60",
          isSelected && "bg-card/80"
        )}
      >
        {/* Status indicator */}
        <div className="flex items-start gap-4">
          <div className="relative mt-2.5 shrink-0">
            <div className={cn(
              "w-2 h-2 rounded-full transition-all duration-500",
              entry.status === 'fresh' && "bg-primary/50",
              entry.status === 'in_thinking' && "bg-primary/80 shadow-[0_0_8px_rgba(var(--primary),0.3)]",
              entry.status === 'frozen' && "bg-muted-foreground/30",
              entry.status === 'revisited' && "bg-accent/60",
              entry.status === 'archived' && "bg-muted-foreground/20",
            )} />
            {entry.status === 'in_thinking' && (
              <motion.div
                className="absolute inset-0 rounded-full bg-primary/30"
                animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Original Question */}
            <p className={cn(
              "text-foreground/75 leading-relaxed tracking-wide font-light transition-colors duration-300",
              "group-hover:text-foreground/90",
              isSelected && "text-foreground/95"
            )}>
              {entry.content}
            </p>

            {/* Meta Row */}
            <div className="mt-4 flex items-center gap-4">
              <time className="text-[11px] text-muted-foreground/40 tracking-wider">
                {formatRelativeTime(entry.createdAt)}
              </time>
              
              {hasProgress && (
                <span className="text-[11px] text-primary/40 tracking-wider">
                  有延续
                </span>
              )}
              
              {entry.revisitCount > 0 && (
                <span className="text-[11px] text-muted-foreground/30 tracking-wider">
                  回看 {entry.revisitCount}
                </span>
              )}

              {entry.status === 'archived' && (
                <span className="text-[11px] text-muted-foreground/25 tracking-wider">
                  已归档
                </span>
              )}
            </div>
          </div>

          {/* Chevron hint */}
          <div className={cn(
            "shrink-0 w-5 h-5 flex items-center justify-center transition-all duration-300",
            "opacity-0 group-hover:opacity-100",
            isSelected && "opacity-100"
          )}>
            <svg 
              width="6" 
              height="10" 
              viewBox="0 0 6 10" 
              fill="none" 
              className={cn(
                "transition-transform duration-300",
                isSelected && "translate-x-0.5"
              )}
            >
              <path 
                d="M1 1L5 5L1 9" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="text-muted-foreground/30"
              />
            </svg>
          </div>
        </div>
      </button>
    </motion.article>
  )
}
