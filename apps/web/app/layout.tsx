import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

import { PRODUCT_NAME } from '@premier/shared';

import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider, THEME_ANTI_FLASH_SCRIPT } from '@/components/theme/theme-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: PRODUCT_NAME,
    template: `${PRODUCT_NAME} — %s`,
  },
  description: 'Premier Property Maintenance field operations.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: PRODUCT_NAME,
  },
  icons: {
    apple: '/icon-192.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Anti-flash: applies the `dark` class before first paint, reading
            the same storage key ThemeProvider uses — see theme-provider.tsx. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_ANTI_FLASH_SCRIPT }} />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
