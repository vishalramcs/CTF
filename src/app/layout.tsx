import type { Metadata } from 'next';
import './globals.css';
import { Archivo, Big_Shoulders, JetBrains_Mono } from 'next/font/google';
import { cn } from '@/lib/utils';

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
      <body className="antialiased">{children}</body>
    </html>
  );
}
