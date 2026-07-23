export interface Caption {
  startMs: number
  endMs: number
  text: string
}

export interface VoiceoverTrack {
  shotId: string
  audioKey: string
  durationMs: number
}

export interface BgmPlan {
  trackKey: string
  gainDb: number
}

export interface SfxCue {
  shotId: string
  atMs: number
  sfxKey: string
}
