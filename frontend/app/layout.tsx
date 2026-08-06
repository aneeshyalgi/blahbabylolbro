import React from "react"
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from '@/components/theme-provider'
import { TabOrderProvider } from '@/context/tab-order-context'
import { LocaleProvider } from '@/context/locale-provider'
import { ClusterSelectionProvider } from '@/context/cluster-selection-context'
import './globals.css'

export const metadata: Metadata = {
  title: 'DataFlow Platform',
  description: 'Enterprise Excel-driven Data Processing Platform',
  generator: 'v0.app',
  icons: {
    icon: '/EY_logo.png',
    apple: '/EY_logo.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased" style={{ fontFamily: "'Inter', sans-serif" }}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          <LocaleProvider>
            <TabOrderProvider>
              <ClusterSelectionProvider>
                {children}
                <Toaster />
                <Analytics />
              </ClusterSelectionProvider>
            </TabOrderProvider>
        </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
