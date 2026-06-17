import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '@/context/AppContext';
import { ToastProvider } from '@/components/shared/ToastProvider';

export const metadata: Metadata = {
  title: 'Ever Spark Monitoring',
  description: 'Multi-tenant IoT monitoring for Clara chlorine-production field nodes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <ToastProvider>{children}</ToastProvider>
        </AppProvider>
      </body>
    </html>
  );
}
