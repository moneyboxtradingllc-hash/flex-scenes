import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Flex Scenes", description: "Private AI character and media studio" };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
