import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UIOS — Universal Intelligence Operating System",
  description: "UIOS is building a universal intelligence platform for models, agents, knowledge, tools and workflows.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
