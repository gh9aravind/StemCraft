'use client'

import { Download, RotateCcw } from 'lucide-react'
import { getDownloadAllUrl } from '@/lib/api'

interface ExportBarProps {
  jobId: string
  onReset: () => void
}

export default function ExportBar({ jobId, onReset }: ExportBarProps) {
  return (
    <div className="glass-card flex flex-col items-center justify-between gap-4 rounded-2xl p-4 sm:flex-row">
      <p className="text-center text-xs text-white/40 sm:text-left">
        Files are kept for 30 minutes, then automatically removed from the server.
      </p>
      <div className="flex w-full gap-3 sm:w-auto">
        <a
          href={getDownloadAllUrl(jobId)}
          className="shadow-glow-violet flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-neon-violet to-neon-cyan px-5 py-2.5 text-sm font-semibold text-void transition-transform active:scale-[0.98] sm:flex-initial"
        >
          <Download className="h-4 w-4" />
          Download All (ZIP)
        </a>
        <button
          onClick={onReset}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 sm:flex-initial"
        >
          <RotateCcw className="h-4 w-4" />
          Process Another Track
        </button>
      </div>
    </div>
  )
}
