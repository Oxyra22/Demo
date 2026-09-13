import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'oxyra TikTok · Rain & Fireworks',
  description:
    'A camera-native Halloween effect: smile for rain, laugh for fireworks, then move your head to collide with the particles.',
  openGraph: {
    title: 'oxyra TikTok',
    description:
      'Smile for rain. Laugh for fireworks. Move your head through the sparks.',
    images: [
      {
        url: '/og-h19.png',
        width: 1200,
        height: 630,
        alt: 'Live Reaction Weather — smile for rain, laugh for fireworks and collide with the sparks',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'oxyra TikTok',
    description:
      'Smile for rain. Laugh for fireworks. Move your head through the sparks.',
    images: ['/og-h19.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
