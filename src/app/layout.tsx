import type { Metadata } from 'next';
import './globals.css';
import { Archivo, Big_Shoulders, JetBrains_Mono } from 'next/font/google';
import { cn } from '@/lib/utils';
import { SiteBackground } from '@/components/shared/site-background';

const display = Big_Shoulders({
  subsets: ['latin'],
  weight: ['700', '900'],
  variable: '--font-display',
  // Next has no fallback metrics for this family.
  adjustFontFallback: false,
});
const sans = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'SPIDEY tracXer',
  description: 'Search the SpiderXman',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn('dark font-sans', display.variable, sans.variable, mono.variable)}
    >
      {/* The shadow keeps text readable over the bright background. */}
      <body className="antialiased [text-shadow:0_0_3px_#000,0_0_8px_#000,0_1px_2px_#000]">
        <SiteBackground />
        {children}
      </body>
    </html>
  );
}
