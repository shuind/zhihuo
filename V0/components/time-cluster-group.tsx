'use client'

import type { TimeEntry } from '@/lib/types'
import { TimeEntryCard } from './time-entry-card'

interface TimeClusterGroupProps {
  label: string
  entries: TimeEntry[]
  selectedEntryId?: string
  onSelectEntry?: (entry: TimeEntry) => void
  onContinueThinking?: (entry: TimeEntry) => void
}

export function TimeClusterGroup({ 
  label, 
  entries, 
  selectedEntryId,
  onSelectEntry,
  onContinueThinking 
}: TimeClusterGroupProps) {
  if (entries.length === 0) return null

  return (
    <section className="relative">
      {/* Time Label */}
      <div className="sticky top-24 z-10 mb-6">
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-muted-foreground/35 tracking-[0.3em] uppercase font-medium">
            {label}
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-border/30 to-transparent" />
          <span className="text-[10px] text-muted-foreground/25 tabular-nums">
            {entries.length}
          </span>
        </div>
      </div>

      {/* Entries */}
      <div className="space-y-1">
        {entries.map((entry) => (
          <TimeEntryCard
            key={entry.id}
            entry={entry}
            isSelected={selectedEntryId === entry.id}
            onSelect={onSelectEntry}
            onContinueThinking={onContinueThinking}
          />
        ))}
      </div>
    </section>
  )
}
