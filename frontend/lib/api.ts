import type { SeparationResult, StemMode } from '@/types'

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export class ApiError extends Error {}

export async function separateAudio(
  file: File,
  stemMode: StemMode,
  signal?: AbortSignal
): Promise<SeparationResult> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('stem_mode', stemMode)

  let res: Response
  try {
    res = await fetch(`${API_URL}/api/separate`, {
      method: 'POST',
      body: formData,
      signal,
    })
  } catch {
    throw new ApiError(
      `Couldn't reach the StemCraft API at ${API_URL}. Is the backend running?`
    )
  }

  if (!res.ok) {
    let detail = 'Something went wrong during separation.'
    try {
      const data = await res.json()
      detail = data.detail || detail
    } catch {
      // response wasn't JSON — fall back to the default message
    }
    throw new ApiError(detail)
  }

  return res.json()
}

export function resolveStemUrl(relativeUrl: string): string {
  if (relativeUrl.startsWith('http')) return relativeUrl
  return `${API_URL}${relativeUrl}`
}

export function getDownloadAllUrl(jobId: string): string {
  return `${API_URL}/api/download/${jobId}`
}
