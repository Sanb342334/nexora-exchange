import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { LocaleProvider } from '@/lib/i18n/locale-context';
import { DEFAULT_LOCALE } from '@/lib/i18n/locales';
import { ToastProvider } from '@/components/nexora/ToastProvider';
import { AmbientBackground } from '@/components/nexora/AmbientBackground';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space',
});

export const metadata: Metadata = {
  title: 'NEXORA Exchange',
  description: 'Premium crypto exchange — spot, futures & P2P',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#0B0E14',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={DEFAULT_LOCALE} suppressHydrationWarning className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="font-sans">
        <LocaleProvider>
          <AuthProvider>
            <ToastProvider>
              <AmbientBackground />
              {children}
            </ToastProvider>
          </AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
