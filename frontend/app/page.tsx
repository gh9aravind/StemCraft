'use client'

import { useCallback, useState } from 'react'
import { AudioWaveform } from 'lucide-react'
import Uploader from '@/components/Uploader'
import ProcessingState from '@/components/ProcessingState'
import StudioMixer from '@/components/StudioMixer'
import ExportBar from '@/components/ExportBar'
import { separateAudio, ApiError } from '@/lib/api'
import type { AppStep, SeparationResult, StemMode } from '@/types'

export default function Home() {
  const [step, setStep] = useState<AppStep>('upload')
  const [result, setResult] = useState<SeparationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')

  const handleUpload = useCallback(async (file: File, stemMode: StemMode) => {
    setError(null)
    setFileName(file.name)
    setStep('processing')
    try {
      const data = await separateAudio(file, stemMode)
      setResult(data)
      setStep('studio')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unexpected error. Please try again.')
      setStep('upload')
    }
  }, [])

  const handleReset = useCallback(() => {
    setResult(null)
    setError(null)
    setStep('upload')
  }, [])

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="bg-grid-pattern pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-neon-violet/20 blur-[120px]" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <header className="mb-10 flex items-center gap-3">
          <div className="shadow-glow-violet flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-neon-violet to-neon-cyan">
            <AudioWaveform className="h-5 w-5 text-void" strokeWidth={2.5} />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">
            StemCraft <span className="text-neon-cyan">AI</span>
          </span>
        </header>

        <div className="flex flex-1 flex-col">
          {step === 'upload' && (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                Split any track into
                <span className="block bg-gradient-to-r from-neon-violet via-neon-cyan to-neon-mint bg-clip-text text-transparent">
                  isolated studio stems
                </span>
              </h1>
              <p className="mt-4 max-w-xl text-white/50">
                Drop a track below. The model separates vocals, drums, bass and instrumentals in
                seconds — ready to remix, mute or download.
              </p>
              <div className="mt-10 w-full max-w-xl">
                <Uploader onUpload={handleUpload} error={error} />
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="flex flex-1 items-center justify-center">
              <ProcessingState fileName={fileName} />
            </div>
          )}

          {step === 'studio' && result && (
            <div className="flex flex-1 flex-col gap-6 pb-10">
              <StudioMixer result={result} />
              <ExportBar jobId={result.job_id} onReset={handleReset} />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
