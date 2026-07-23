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

export interface SubtitleInput {
  shotId: string
  script: string
  durationMs?: number
}

export interface VoiceoverInput {
  shotId: string
  text: string
  voiceId?: string
}

export interface SfxInput {
  shotId: string
  brief?: string
}

export interface ScoreInput {
  projectId: string
  brief?: string
}

interface PlaceholderResult {
  status: 'placeholder'
  implementation: 'P1'
  note: '占位实现，P1 补齐'
}

export interface SubtitleResult extends PlaceholderResult {
  kind: 'subtitle'
  shotId: string
  captions: Caption[]
}

export interface VoiceoverResult extends PlaceholderResult {
  kind: 'voiceover'
  shotId: string
  track: VoiceoverTrack | null
}

export interface SfxResult extends PlaceholderResult {
  kind: 'sfx'
  shotId: string
  cues: SfxCue[]
}

export interface ScoreResult extends PlaceholderResult {
  kind: 'score'
  projectId: string
  plan: BgmPlan | null
}
