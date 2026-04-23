"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={[
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-[#0f0d1a]/95 backdrop-blur-md shadow-lg py-3"
          : "bg-transparent py-5",
      ].join(" ")}
    >
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <Image
            src="/assets/logo.png"
            alt="Serendip Bot"
            width={32}
            height={32}
            className="transition-transform duration-300 group-hover:rotate-12"
          />
          <span className="font-extrabold text-lg tracking-tight text-white">
            Serendip<span className="text-[#e8a020]">.</span>bot
          </span>
        </Link>

        {/* Nav links */}
        <ul className="hidden md:flex items-center gap-6 text-sm font-medium">
          {[
            { label: "How It Works", href: "#how-it-works" },
            { label: "Moods", href: "#moods" },
            { label: "Daily Discoveries", href: "/daily" },
            { label: "Why Us", href: "#why" },
            { label: "FAQ", href: "#faq" },
          ].map(({ label, href }) => (
            <li key={label}>
              <a
                href={href}
                className="text-white/70 hover:text-white transition-colors duration-200"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <Link
          href="#hero"
          className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#e8a020] text-[#0f0d1a] text-sm font-bold transition-all duration-200 hover:bg-[#f5c561] hover:shadow-[0_4px_20px_rgba(232,160,32,0.4)] active:scale-95"
        >
          ✦ Stumble Now
        </Link>
      </div>
    </nav>
  );
}
