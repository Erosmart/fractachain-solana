import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Lato, Share_Tech_Mono, Source_Serif_4 } from 'next/font/google';
import './globals.css';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import CrystalBackdrop from '../components/CrystalBackdrop';
import AppProviders from '../components/AppProviders';
import AppGate from '../components/AppGate';
import { getServerLocale, getServerMessages } from '../lib/i18n-server';

const lato = Lato({
  subsets: ['latin'],
  weight: ['300', '400', '700', '900'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-lato',
});

const shareTechMono = Share_Tech_Mono({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-lcd',
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['700', '800'],
  style: 'italic',
  display: 'swap',
  variable: '--font-serif',
});

export function generateMetadata(): Metadata {
  const m = getServerMessages();
  return {
    title: m.meta.title,
    description: m.meta.description,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang={getServerLocale()}
      className={`${lato.variable} ${shareTechMono.variable} ${sourceSerif.variable} scroll-smooth`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('fc_theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="relative min-h-screen bg-white text-black flex flex-col font-body selection:bg-leaf-200 selection:text-black">
        <AppProviders>
          <CrystalBackdrop />
          <Suspense fallback={null}>
            <Navbar />
          </Suspense>
          <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-3 sm:pt-4 pb-8 sm:pb-10">
            <AppGate>{children}</AppGate>
          </main>
          <Footer />
        </AppProviders>
      </body>
    </html>
  );
}
