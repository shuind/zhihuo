// Scene: the only language the director (LLM or fallback) speaks to the stage.
// Director never gives pixel coordinates. It only chooses semantic slots.

export type StarRole = "hero" | "support" | "echo" | "ambient"

export interface SceneStar {
  id: string
  /** 0=in core, 1=close, 2=mid, 3=far, 4=edge. */
  ring: 0 | 1 | 2 | 3 | 4
  /** degrees, 0 = right, 90 = down (CSS coords). */
  angle: number
  /** small on-ring nudge in [-2, 2] units. */
  drift?: number
  role: StarRole
  /** add a soft glow halo around this star. */
  halo?: boolean
  /** optional content; if absent the star is silent (visual only). */
  text?: string
  timestamp?: string
  /** metadata only; the stage doesn't read these. */
  trackId?: string
  nodeId?: string
}

export interface SceneStrand {
  id: string
  fromId: string
  toId: string
  /** 0..1; controls thickness/opacity. */
  weight: number
  /** -1..1; sideways bend amount. Positive = right of from->to vector. */
  detour?: number
  /** small dots sprinkled along the strand. 0..7. */
  dustCount?: number
}

export interface Scene {
  core: {
    text: string
    /** 0=ghost, 1=normal, 2=warm. */
    intensity: 0 | 1 | 2
  }
  stars: SceneStar[]
  strands: SceneStrand[]
  /** background ambient noise stars (pure decoration). */
  ambientStarCount?: number
}
