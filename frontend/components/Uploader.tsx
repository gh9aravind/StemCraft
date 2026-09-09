'use client'

import { useCallback, useRef, useState } from 'react'
import { UploadCloud, Music2, AlertCircle, X } from 'lucide-react'
import type { StemMode } from '@/types'
import { cx } from '@/lib/utils'

const ACCEPTED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.flac']
const MAX_SIZE_BYTES = 60 * 1024 * 1024

interface UploaderProps {
  onUpload: (file: File, stemMode: StemMode) => void
  error?: string | null
}

export default function Uploader({ onUpload, error }: UploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [stemMode, setStemMode] = useState<StemMode>('4stems')
  const inputRef = useRef<HTMLInputElement>(null)

  const validateFile = (candidate: File): string | null => {
    const ext = '.' + (candidate.name.split('.').pop() || '').toLowerCase()
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `Unsupported format "${ext || 'unknown'}". Use MP3, WAV, M4A or FLAC.`
    }
    if (candidate.size > MAX_SIZE_BYTES) {
      return 'File is too large. Max size is 60MB.'
    }
    return null
  }

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const candidate = files[0]
    const validationError = validateFile(candidate)
    if (validationError) {
      setLocalError(validationError)
      setFile(null)
      return
    }
    setLocalError(null)
    setFile(candidate)
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles]
  )

  const displayError = localError || error

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        className={cx(
          'glass-card group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-all duration-300',
          isDragging
            ? 'shadow-glow-cyan border-neon-cyan bg-neon-cyan/5'
            : 'border-white/10 hover:border-neon-violet/50 hover:bg-white/[0.02]'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {file ? (
          <div className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Music2 className="h-5 w-5 shrink-0 text-neon-cyan" />
              <div className="min-w-0 text-left">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-white/40">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setFile(null)
                if (inputRef.current) inputRef.current.value = ''
              }}
              className="rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
              aria-label="Remove selected file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 transition-transform duration-300 group-hover:scale-110">
              <UploadCloud className="h-6 w-6 text-neon-violet" />
            </div>
            <p className="text-sm font-medium text-white/80">
              Drag & drop your track here, or <span className="text-neon-cyan">browse</span>
            </p>
            <p className="mt-1 text-xs text-white/30">MP3, WAV, M4A or FLAC — up to 60MB</p>
          </>
        )}
      </div>

      {displayError && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{displayError}</span>
        </div>
      )}

      <div className="mt-6 flex flex-col items-center gap-4">
        <StemModeToggle value={stemMode} onChange={setStemMode} />
        <button
          disabled={!file}
          onClick={() => file && onUpload(file, stemMode)}
          className={cx(
            'w-full rounded-xl py-3.5 text-sm font-semibold tracking-wide transition-all duration-300',
            file
              ? 'shadow-glow-violet bg-gradient-to-r from-neon-violet to-neon-cyan text-void hover:brightness-110 active:scale-[0.99]'
              : 'cursor-not-allowed bg-white/5 text-white/30'
          )}
        >
          Separate Audio
        </button>
      </div>
    </div>
  )
}

function StemModeToggle({
  value,
  onChange,
}: {
  value: StemMode
  onChange: (mode: StemMode) => void
}) {
  const options: { mode: StemMode; label: string; sub: string }[] = [
    { mode: '2stems', label: '2 Stems', sub: 'Vocals / Instrumental' },
    { mode: '4stems', label: '4 Stems', sub: 'Vocals · Drums · Bass · Other' },
  ]

  return (
    <div className="glass-card flex w-full rounded-xl p-1">
      {options.map((opt) => (
        <button
          key={opt.mode}
          onClick={() => onChange(opt.mode)}
          className={cx(
            'flex-1 rounded-lg px-4 py-2.5 text-center transition-all duration-300',
            value === opt.mode ? 'bg-white/10 shadow-inner' : 'hover:bg-white/[0.03]'
          )}
        >
          <p className={cx('text-sm font-semibold', value === opt.mode ? 'text-neon-cyan' : 'text-white/60')}>
            {opt.label}
          </p>
          <p className="mt-0.5 text-[11px] text-white/30">{opt.sub}</p>
        </button>
      ))}
    </div>
  )
}
