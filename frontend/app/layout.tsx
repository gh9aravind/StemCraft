import type { Metadata } from 'next'
import './globals.css'

// Fonts are loaded via the Google Fonts CSS @import at the top of
// globals.css. If you'd rather self-host them (recommended for production —
// no external request, automatic fallback-metric optimization), switch to
// next/font/google: import { Space_Grotesk, Inter, JetBrains_Mono } from
// 'next/font/google', assign each a `variable`, and reference those
// variables from the --font-* tokens in the @theme block instead.

export const metadata: Metadata = {
  title: 'StemCraft AI — AI Audio Stem Separator',
  description:
    'Split any track into isolated vocals, drums, bass and instrumentals with AI-powered stem separation.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-void font-sans text-white antialiased">{children}</body>
    </html>
  )
}
