'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { Pause, Play, Repeat, Music4, Clock3 } from 'lucide-react'
import StemTrack, { type StemTrackHandle } from './StemTrack'
import type { SeparationResult, TrackState } from '@/types'
import { formatTime } from '@/lib/utils'
import { getSharedAudioContext } from '@/lib/audio-context'

interface StudioMixerProps {
  result: SeparationResult
}

export default function StudioMixer({ result }: StudioMixerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [loop, setLoop] = useState(false)
  const [duration, setDuration] = useState(result.duration || 0)
  const [currentTime, setCurrentTime] = useState(0)
  const [readyCount, setReadyCount] = useState(0)
  const [trackStates, setTrackStates] = useState<Record<string, TrackState>>(() => {
    const initial: Record<string, TrackState> = {}
    result.stems.forEach((s) => {
      initial[s.name] = { volume: 1, pan: 0, muted: false, solo: false }
    })
    return initial
  })

  const handleRefs = useRef<Record<string, StemTrackHandle | null>>({})
  const isSeekingRef = useRef(false)

  const anySolo = useMemo(() => Object.values(trackStates).some((t) => t.solo), [trackStates])
  const allReady = readyCount >= result.stems.length

  const updateTrackState = useCallback((name: string, partial: Partial<TrackState>) => {
    setTrackStates((prev) => ({ ...prev, [name]: { ...prev[name], ...partial } }))
  }, [])

  const togglePlay = useCallback(async () => {
    if (!allReady) return
    const ctx = getSharedAudioContext()
    if (ctx.state === 'suspended') await ctx.resume()

    if (isPlaying) {
      Object.values(handleRefs.current).forEach((h) => h?.pause())
      setIsPlaying(false)
    } else {
      await Promise.all(Object.values(handleRefs.current).map((h) => h?.play()))
      setIsPlaying(true)
    }
  }, [isPlaying, allReady])

  const seekTo = useCallback((time: number) => {
    isSeekingRef.current = true
    Object.values(handleRefs.current).forEach((h) => h?.setTime(time))
    setCurrentTime(time)
    window.setTimeout(() => {
      isSeekingRef.current = false
    }, 150)
  }, [])

  const handleMasterTimeUpdate = useCallback((time: number) => {
    if (isSeekingRef.current) return
    setCurrentTime(time)

    // Drift correction: independent <audio> elements can slowly fall out of
    // sync, so nudge any stem that's more than ~80ms away from the master.
    Object.values(handleRefs.current).forEach((h) => {
      if (!h) return
      const diff = Math.abs(h.getCurrentTime() - time)
      if (diff > 0.08) {
        h.setTime(time)
      }
    })
  }, [])

  const handleFinish = useCallback(() => {
    if (loop) {
      seekTo(0)
      Object.values(handleRefs.current).forEach((h) => h?.play())
    } else {
      setIsPlaying(false)
      seekTo(0)
    }
  }, [loop, seekTo])

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex flex-col gap-5">
      <div className="glass-card sticky top-4 z-10 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{result.original_filename}</p>
            <div className="mt-1 flex items-center gap-3 text-xs text-white/40">
              <span className="flex items-center gap-1">
                <Music4 className="h-3 w-3" />
                {result.stem_mode === '4stems' ? '4 Stems' : '2 Stems'}
              </span>
              {result.bpm && <span>{result.bpm} BPM</span>}
              <span className="flex items-center gap-1">
                <Clock3 className="h-3 w-3" />
                {formatTime(duration)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setLoop((v) => !v)}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                loop ? 'bg-neon-cyan text-void' : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
              title="Loop"
              aria-label="Toggle loop"
              aria-pressed={loop}
            >
              <Repeat className="h-4 w-4" />
            </button>
            <button
              onClick={togglePlay}
              disabled={!allReady}
              className="shadow-glow-violet flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-neon-violet to-neon-cyan text-void transition-transform active:scale-95 disabled:opacity-40"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" fill="currentColor" />
              ) : (
                <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
              )}
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="w-10 shrink-0 text-right font-mono text-xs text-white/40">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            className="daw-slider"
            min={0}
            max={duration || 0}
            step={0.01}
            value={Math.min(currentTime, duration || 0)}
            style={{ '--slider-color': '#22D3EE', '--slider-fill': `${progressPercent}%` } as React.CSSProperties}
            onChange={(e) => seekTo(parseFloat(e.target.value))}
            aria-label="Seek"
          />
          <span className="w-10 shrink-0 font-mono text-xs text-white/40">{formatTime(duration)}</span>
        </div>

        {!allReady && <p className="mt-3 text-center text-xs text-white/30">Loading waveforms…</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {result.stems.map((stem, index) => {
          const state = trackStates[stem.name]
          const effectiveMuted = state.muted || (anySolo && !state.solo)
          return (
            <StemTrack
              key={stem.name}
              ref={(handle) => {
                handleRefs.current[stem.name] = handle
              }}
              stem={stem}
              state={state}
              effectiveMuted={effectiveMuted}
              onStateChange={(partial) => updateTrackState(stem.name, partial)}
              onReady={(d) => {
                setReadyCount((c) => c + 1)
                setDuration((prev) => Math.max(prev, d))
              }}
              onTimeUpdate={index === 0 ? handleMasterTimeUpdate : undefined}
              onFinish={index === 0 ? handleFinish : undefined}
              isMaster={index === 0}
            />
          )
        })}
      </div>
    </div>
  )
}
