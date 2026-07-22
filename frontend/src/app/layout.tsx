import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
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
  title: 'NEXORA P2P Exchange',
  description: 'Премиальная локальная P2P-биржа без границ',
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
    <html lang="ru" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="font-sans">
        <AuthProvider>
          <ToastProvider>
            <AmbientBackground />
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
