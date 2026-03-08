import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "PROMETHEUS — Supply Chain Intelligence",
  description: "Observe · Reason · Decide · Act · Learn",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-base h-screen w-screen overflow-hidden">{children}</body>
    </html>
  );
}
