'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { Download, Volume2, VolumeX } from 'lucide-react'
import type { StemInfo, TrackState } from '@/types'
import { getStemColor, clamp } from '@/lib/utils'
import { getSharedAudioContext } from '@/lib/audio-context'
import { resolveStemUrl } from '@/lib/api'

export interface StemTrackHandle {
  play: () => Promise<void>
  pause: () => void
  setTime: (time: number) => void
  getCurrentTime: () => number
}

interface StemTrackProps {
  stem: StemInfo
  state: TrackState
  effectiveMuted: boolean
  onStateChange: (partial: Partial<TrackState>) => void
  onReady?: (duration: number) => void
  onTimeUpdate?: (time: number) => void
  onFinish?: () => void
  isMaster: boolean
}

const StemTrack = forwardRef<StemTrackHandle, StemTrackProps>(function StemTrack(
  { stem, state, effectiveMuted, onStateChange, onReady, onTimeUpdate, onFinish, isMaster },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const pannerRef = useRef<StereoPannerNode | null>(null)
  const sourceCreatedRef = useRef(false)
  const [isReady, setIsReady] = useState(false)
  const color = getStemColor(stem.name)

  // WaveSurfer is created exactly once per track (see the effect below with
  // its narrow dependency array). These refs keep the latest prop values
  // available to the event handlers registered inside that one-time setup,
  // so toggling loop/mute/etc. later never gets caught by a stale closure.
  const onReadyRef = useRef(onReady)
  const onTimeUpdateRef = useRef(onTimeUpdate)
  const onFinishRef = useRef(onFinish)
  const stateRef = useRef(state)
  const effectiveMutedRef = useRef(effectiveMuted)

  useEffect(() => {
    onReadyRef.current = onReady
    onTimeUpdateRef.current = onTimeUpdate
    onFinishRef.current = onFinish
    stateRef.current = state
    effectiveMutedRef.current = effectiveMuted
  })

  useImperativeHandle(ref, () => ({
    play: async () => {
      try {
        await wavesurferRef.current?.play()
      } catch {
        // Playback can be blocked until a user gesture unlocks audio; the
        // master Play button click is that gesture, so this is rare.
      }
    },
    pause: () => wavesurferRef.current?.pause(),
    setTime: (time: number) => {
      const ws = wavesurferRef.current
      if (ws && ws.getDuration() > 0) {
        ws.setTime(clamp(time, 0, ws.getDuration()))
      }
    },
    getCurrentTime: () => wavesurferRef.current?.getCurrentTime() ?? 0,
  }))

  useEffect(() => {
    if (!containerRef.current) return

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: `${color.wave}55`,
      progressColor: color.progress,
      cursorColor: color.accent,
      cursorWidth: 2,
      height: 56,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      normalize: true,
      url: resolveStemUrl(stem.url),
    })

    wavesurferRef.current = ws

    ws.on('ready', () => {
      setIsReady(true)
      const duration = ws.getDuration()
      ws.setVolume(effectiveMutedRef.current ? 0 : stateRef.current.volume)
      onReadyRef.current?.(duration)

      // wavesurfer.js v7 plays back through a plain <audio> element, which
      // it explicitly supports routing through the Web Audio API via
      // MediaElementSourceNode — that's how we add stereo panning per track.
      try {
        const ctx = getSharedAudioContext()
        const mediaEl = ws.getMediaElement()
        if (mediaEl && !sourceCreatedRef.current) {
          sourceCreatedRef.current = true
          const source = ctx.createMediaElementSource(mediaEl)
          const panner = ctx.createStereoPanner()
          panner.pan.value = stateRef.current.pan
          source.connect(panner)
          panner.connect(ctx.destination)
          pannerRef.current = panner
        }
      } catch (err) {
        console.warn('Stereo panning unavailable for this track:', err)
      }
    })

    if (isMaster) {
      ws.on('timeupdate', (time: number) => onTimeUpdateRef.current?.(time))
      ws.on('finish', () => onFinishRef.current?.())
    }

    return () => {
      ws.destroy()
      wavesurferRef.current = null
      sourceCreatedRef.current = false
      pannerRef.current = null
    }
    // Deliberately narrow: this instance should be created once per stem
    // and torn down on unmount, not on every prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stem.url, isMaster])

  useEffect(() => {
    wavesurferRef.current?.setVolume(effectiveMuted ? 0 : state.volume)
  }, [state.volume, effectiveMuted])

  useEffect(() => {
    if (pannerRef.current) {
      pannerRef.current.pan.value = state.pan
    }
  }, [state.pan])

  const volumePercent = Math.round(state.volume * 100)
  const panPercent = Math.round(((state.pan + 1) / 2) * 100)
  const panLabel =
    state.pan === 0 ? 'C' : state.pan < 0 ? `L${Math.round(-state.pan * 100)}` : `R${Math.round(state.pan * 100)}`

  return (
    <div className="glass-card rounded-2xl p-4 transition-shadow duration-300">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color.accent, boxShadow: `0 0 8px ${color.accent}` }}
          />
          <span className="font-display text-sm font-semibold">{stem.label}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onStateChange({ muted: !state.muted })}
            className={`h-7 w-7 rounded-md text-xs font-bold transition-colors ${
              state.muted ? 'bg-red-500/80 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
            }`}
            aria-label="Mute this track"
            aria-pressed={state.muted}
            title="Mute"
          >
            M
          </button>
          <button
            onClick={() => onStateChange({ solo: !state.solo })}
            className={`h-7 w-7 rounded-md text-xs font-bold transition-colors ${
              state.solo ? 'text-void' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
            }`}
            style={state.solo ? { backgroundColor: color.accent } : undefined}
            aria-label="Solo this track"
            aria-pressed={state.solo}
            title="Solo"
          >
            S
          </button>
          <a
            href={resolveStemUrl(stem.url)}
            download={`${stem.name}.wav`}
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-md bg-white/5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={`Download ${stem.label} stem`}
            title="Download stem"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="relative mt-3 min-h-[56px]">
        <div
          ref={containerRef}
          className={effectiveMuted ? 'opacity-30 transition-opacity' : 'transition-opacity'}
        />
        {!isReady && (
          <div className="absolute inset-0 flex items-center">
            <div className="animate-wave-pulse h-[2px] w-full rounded bg-white/10" />
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-white/40">
            <span className="flex items-center gap-1">
              {state.volume === 0 || state.muted ? (
                <VolumeX className="h-3 w-3" />
              ) : (
                <Volume2 className="h-3 w-3" />
              )}
              Volume
            </span>
            <span className="font-mono">{volumePercent}%</span>
          </div>
          <input
            type="range"
            className="daw-slider"
            min={0}
            max={1}
            step={0.01}
            value={state.volume}
            style={{ '--slider-color': color.accent, '--slider-fill': `${volumePercent}%` } as React.CSSProperties}
            onChange={(e) => onStateChange({ volume: parseFloat(e.target.value) })}
            aria-label={`${stem.label} volume`}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-white/40">
            <span>Pan</span>
            <span className="font-mono">{panLabel}</span>
          </div>
          <input
            type="range"
            className="daw-slider"
            min={-1}
            max={1}
            step={0.01}
            value={state.pan}
            style={{ '--slider-color': color.accent, '--slider-fill': `${panPercent}%` } as React.CSSProperties}
            onChange={(e) => onStateChange({ pan: clamp(parseFloat(e.target.value), -1, 1) })}
            aria-label={`${stem.label} pan`}
          />
        </div>
      </div>
    </div>
  )
})

export default StemTrack
