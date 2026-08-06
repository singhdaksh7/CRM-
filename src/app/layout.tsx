import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Delhi Broker CRM",
  description: "Real-estate broker CRM & property inventory management",
  // Phase 4, Objective 14 - PWA. iOS Safari doesn't honor the manifest's
  // display:standalone on its own, hence the explicit apple-* tags.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Broker CRM",
  },
};

export const viewport: Viewport = {
  themeColor: "#3366FF",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <AuthSessionProvider>
          {children}
          <Toaster richColors position="top-right" />
          <ServiceWorkerRegister />
          <InstallPrompt />
        </AuthSessionProvider>
      </body>
    </html>
  );
}
