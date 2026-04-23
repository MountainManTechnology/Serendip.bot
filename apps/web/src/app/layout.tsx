import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Poppins, Lora, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TRPCProvider } from "@/components/providers/TRPCProvider";
import { ErrorBoundary } from "@/components/providers/ErrorBoundary";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-poppins",
});

const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-lora",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-jetbrains-mono",
  preload: false,
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://serendipbot.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Serendip Bot — AI-Powered StumbleUpon Alternative",
    template: "%s · Serendip Bot",
  },
  description:
    "Discover the internet you didn't know existed. Serendip Bot is an AI-curated stumbling engine that surfaces small, wonderful websites based on your mood. Free, no account needed.",
  keywords: [
    "stumbleupon alternative",
    "random website generator",
    "ai website discovery",
    "discover new websites",
    "serendipity engine",
    "small web",
    "curated web",
  ],
  authors: [{ name: "Serendip Bot" }],
  creator: "Serendip Bot",
  publisher: "Serendip Bot",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Serendip Bot",
    title: "Serendip Bot — AI-Powered StumbleUpon Alternative",
    description: "Discover the internet you didn't know existed.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Serendip Bot",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Serendip Bot — AI-Powered StumbleUpon Alternative",
    description: "Discover the internet you didn't know existed.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: { icon: "/assets/favicon.png", apple: "/assets/logo.png" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0f0d1a",
  width: "device-width",
  initialScale: 1,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Serendip Bot",
  url: SITE_URL,
  applicationCategory: "BrowserApplication",
  operatingSystem: "Any",
  description:
    "Discover the internet you didn't know existed — AI-powered web discovery and curation.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  creator: { "@type": "Organization", name: "Serendip Bot", url: SITE_URL },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${lora.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID && (
          <meta
            name="google-adsense-account"
            content={process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID}
          />
        )}
        {process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID &&
          process.env.NEXT_PUBLIC_DISABLE_ADS !== "true" && (
            <script
              async
              src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID}`}
              crossOrigin="anonymous"
            />
          )}
      </head>
      <body className="font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ErrorBoundary>
          <TRPCProvider>{children}</TRPCProvider>
        </ErrorBoundary>
        {process.env.NEXT_PUBLIC_UMAMI_ENABLED === "true" && (
          <>
            <Script
              src={process.env.NEXT_PUBLIC_UMAMI_RECORDER_SRC ?? ""}
              data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? ""}
              data-sample-rate="1"
              data-mask-level="strict"
              data-max-duration="300000"
              strategy="afterInteractive"
              defer
            />
            <Script
              src={process.env.NEXT_PUBLIC_UMAMI_SRC ?? ""}
              data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? ""}
              strategy="afterInteractive"
              defer
            />
          </>
        )}
      </body>
    </html>
  );
}
