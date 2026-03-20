'use client'

import { useState, useMemo } from 'react'
import type { TimeEntry } from '@/lib/types'
import { mockEntries, groupEntriesByTime } from '@/lib/mock-data'
import { TimeClusterGroup } from './time-cluster-group'
import { DetailPanel } from './detail-panel'
import { motion, AnimatePresence } from 'framer-motion'

export function TimeArchive() {
  const [entries, setEntries] = useState<TimeEntry[]>(mockEntries)
  const [inputValue, setInputValue] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null)
  const [inputFocused, setInputFocused] = useState(false)

  const groupedEntries = useMemo(() => {
    return groupEntriesByTime(entries)
  }, [entries])

  const handleAddEntry = () => {
    if (!inputValue.trim()) return
    
    const newEntry: TimeEntry = {
      id: `entry-${Date.now()}`,
      content: inputValue.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
      sourceType: 'question',
      status: 'fresh',
      revisitCount: 0,
    }
    setEntries([newEntry, ...entries])
    setInputValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAddEntry()
    }
    if (e.key === 'Escape') {
      setSelectedEntry(null)
    }
  }

  const handleContinueThinking = (entry: TimeEntry) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entry.id
          ? {
              ...e,
              status: 'in_thinking' as const,
              revisitCount: e.revisitCount + 1,
              lastViewedAt: new Date(),
            }
          : e
      )
    )
  }

  const handleArchive = (entry: TimeEntry) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entry.id
          ? { ...e, status: 'archived' as const, archivedAt: new Date() }
          : e
      )
    )
    setSelectedEntry(null)
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Panel - Time River */}
      <motion.div 
        className="flex-1 flex flex-col"
        animate={{ 
          width: selectedEntry ? '55%' : '100%',
        }}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
      >
        {/* Header */}
        <header className="sticky top-0 z-10 backdrop-blur-xl bg-background/80">
          <div className="max-w-2xl mx-auto px-8 lg:px-12">
            <div className="pt-16 pb-8 flex items-end justify-between">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
              >
                <h1 className="text-xl font-light text-foreground/70 tracking-[0.2em]">
                  时间档案馆
                </h1>
                <p className="mt-2 text-xs text-muted-foreground/60 tracking-wider">
                  {entries.length} 个问题在此沉淀
                </p>
              </motion.div>
              
              {/* Decorative element */}
              <div className="flex items-center gap-1.5 opacity-30">
                <div className="w-1 h-1 rounded-full bg-primary/50" />
                <div className="w-1.5 h-1.5 rounded-full bg-primary/70" />
                <div className="w-1 h-1 rounded-full bg-primary/50" />
              </div>
            </div>

            {/* Input Area */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="pb-10"
            >
              <div className={`relative transition-all duration-500 ${inputFocused ? 'transform scale-[1.01]' : ''}`}>
                <div className="absolute -inset-4 rounded-2xl bg-card/50 opacity-0 transition-opacity duration-500"
                  style={{ opacity: inputFocused ? 1 : 0 }}
                />
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  placeholder="此刻，在想什么..."
                  rows={1}
                  className="relative w-full bg-transparent border-none resize-none text-foreground placeholder:text-muted-foreground/40 focus:outline-none text-lg leading-loose tracking-wide font-light"
                  style={{ minHeight: '3rem' }}
                />
                <motion.div 
                  className="mt-3 h-px bg-gradient-to-r from-transparent via-border to-transparent"
                  animate={{ opacity: inputFocused ? 0.8 : 0.3 }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </motion.div>
          </div>
        </header>

        {/* Time Flow */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-8 lg:px-12 pb-32">
            <div className="space-y-16">
              {groupedEntries.map((group, index) => (
                <motion.div
                  key={group.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                >
                  <TimeClusterGroup
                    label={group.label}
                    entries={group.entries}
                    selectedEntryId={selectedEntry?.id}
                    onSelectEntry={setSelectedEntry}
                    onContinueThinking={handleContinueThinking}
                  />
                </motion.div>
              ))}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-8 px-8 lg:px-12">
          <div className="max-w-2xl mx-auto">
            <p className="text-center text-[10px] text-muted-foreground/30 tracking-[0.3em] uppercase">
              留下的问题，等待时间的回响
            </p>
          </div>
        </footer>
      </motion.div>

      {/* Right Panel - Detail View */}
      <AnimatePresence mode="wait">
        {selectedEntry && (
          <DetailPanel
            entry={selectedEntry}
            onClose={() => setSelectedEntry(null)}
            onContinue={handleContinueThinking}
            onArchive={handleArchive}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
