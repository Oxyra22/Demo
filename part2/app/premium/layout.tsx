import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ghost Kiss · Face-aware LIVE Gift',
  description:
    'A TikTok LIVE Gift prototype that finds a face, sends in a tiny ghost, and lands a playful cheek kiss.',
};

export default function PremiumLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
