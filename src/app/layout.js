import { Outfit } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/saas/Navbar";

const font = Outfit({ subsets: ["latin"] });

export const metadata = {
  title: "Seedance X - Premium AI Generator",
  description: "The next evolution of AI video generation.",
};

export default function RootLayout({ children }) {
  const theme = process.env.NEXT_PUBLIC_THEME || "acid-forest";

  return (
    <html lang="en" className="h-dvh w-full transition-colors duration-500" data-theme={theme} style={{ colorScheme: "dark" }}>
      <body className={`${font.className} h-dvh w-full flex flex-col antialiased transition-colors duration-500`}>
        <Providers>
          <Navbar />
          <div className="flex-1 flex flex-col overflow-hidden">
            {children}
          </div>
          <footer className="shrink-0 border-t border-glass-border bg-glass-bg px-4 py-3 text-[10px] font-medium text-muted backdrop-blur-3xl md:px-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <span>© 2026 SeedanceX AI™. All rights reserved.</span>
              <a
                href="mailto:support@seedancex.app"
                className="transition-colors hover:text-foreground"
              >
                Email: support@seedancex.app
              </a>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
