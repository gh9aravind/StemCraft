export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

interface StemColor {
  wave: string
  progress: string
  accent: string
}

const STEM_COLORS: Record<string, StemColor> = {
  vocals: { wave: '#8B5CF6', progress: '#C4B5FD', accent: '#8B5CF6' },
  drums: { wave: '#22D3EE', progress: '#A5F3FC', accent: '#22D3EE' },
  bass: { wave: '#34D399', progress: '#A7F3D0', accent: '#34D399' },
  other: { wave: '#FB923C', progress: '#FED7AA', accent: '#FB923C' },
  instrumental: { wave: '#22D3EE', progress: '#A5F3FC', accent: '#22D3EE' },
}

const FALLBACK_COLOR: StemColor = { wave: '#8B5CF6', progress: '#C4B5FD', accent: '#8B5CF6' }

export function getStemColor(name: string): StemColor {
  return STEM_COLORS[name] || FALLBACK_COLOR
}
