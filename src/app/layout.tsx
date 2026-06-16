import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '우리집 재정관리💰',
  description: '보험, 구독, 교육, 대출, 투자, 생활비를 한눈에',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
