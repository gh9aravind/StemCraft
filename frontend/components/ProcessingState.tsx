'use client'

import { useEffect, useState } from 'react'

const STATUS_MESSAGES = [
  'Analyzing waveform…',
  'Loading AI separation model…',
  'Isolating vocal frequencies…',
  'Untangling drums & percussion…',
  'Separating bass frequencies…',
  'Reconstructing instrumentals…',
  'Finalizing your stems…',
]

const BAR_COUNT = 32

interface ProcessingStateProps {
  fileName: string
}

export default function ProcessingState({ fileName }: ProcessingStateProps) {
  const [progress, setProgress] = useState(0)
  const [messageIndex, setMessageIndex] = useState(0)

  // Demucs doesn't report granular progress over HTTP, so we ease toward
  // ~92% while waiting and let the caller's state transition handle 100%.
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 92) return prev + (99 - prev) * 0.03
        return prev + (92 - prev) * 0.06 + 0.4
      })
    }, 200)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % STATUS_MESSAGES.length)
    }, 2600)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="glass-card flex w-full max-w-lg flex-col items-center rounded-3xl px-8 py-12 text-center">
      <div className="mb-8 flex h-24 items-end gap-[3px]" aria-hidden="true">
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <span
            key={i}
            className="w-1.5 rounded-full bg-gradient-to-t from-neon-violet via-neon-cyan to-neon-mint"
            style={{
              height: '100%',
              opacity: 0.85,
              animation: `eqBar ${0.7 + (i % 7) * 0.09}s ease-in-out infinite`,
              animationDelay: `${(i % 9) * 0.07}s`,
            }}
          />
        ))}
      </div>

      <p className="text-xs uppercase tracking-[0.2em] text-white/30">Processing</p>
      <h2 className="mt-2 max-w-full truncate font-display text-xl font-semibold">{fileName}</h2>

      <div className="mt-8 w-full">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-neon-violet via-neon-cyan to-neon-mint transition-all duration-200 ease-out"
            style={{ width: `${Math.min(progress, 99)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-white/40">
          <span>{STATUS_MESSAGES[messageIndex]}</span>
          <span className="font-mono">{Math.min(Math.round(progress), 99)}%</span>
        </div>
      </div>

      <p className="mt-6 text-xs text-white/25">
        This can take a minute or two depending on track length.
      </p>
    </div>
  )
}
