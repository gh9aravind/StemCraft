// A single shared AudioContext is reused across every stem track so we
// don't spin up one context per track (browsers cap concurrent contexts,
// and there's no benefit to more than one here).
let sharedContext: AudioContext | null = null

export function getSharedAudioContext(): AudioContext {
  if (typeof window === 'undefined') {
    throw new Error('AudioContext is only available in the browser')
  }
  if (!sharedContext) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    sharedContext = new Ctor()
  }
  return sharedContext
}
