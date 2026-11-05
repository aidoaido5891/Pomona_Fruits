import type { Metadata, Viewport } from 'next';
import { DM_Sans, Fraunces } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const display = Fraunces({ subsets: ['latin'], variable: '--font-display', weight: ['500', '700'] });
const body = DM_Sans({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: 'Pomona Fruits | Fresh fruit, delivered in 2 hours',
  description:
    'Strawberries, lemons and cucumbers, delivered in 2 hours if you order before 16.00. Pay on delivery.',
};

export const viewport: Viewport = { themeColor: '#fbf6ea' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="page-content">{children}</div>
        <footer className="legal-footer">{'© 2026 <Fruits by Charlie>. Built with Claude Code'}</footer>
      </body>
    </html>
  );
}
