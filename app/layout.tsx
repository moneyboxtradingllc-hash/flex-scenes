import "./globals.css";
import "./ui-v2.css";
import type { Metadata, Viewport } from "next";
export const metadata: Metadata = { title: "Flex Scenes", description: "Private AI character and media studio" };
export const viewport: Viewport = { viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
