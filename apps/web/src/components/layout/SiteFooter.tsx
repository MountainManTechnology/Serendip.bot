import Link from "next/link";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#0f0d1a] text-white/60 pt-16 pb-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* 4-column grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand column */}
          <div className="space-y-4">
            <p className="font-extrabold text-lg text-white tracking-tight">
              Serendip<span className="text-[#e8a020]">.</span>bot
            </p>
            <p className="text-sm leading-relaxed font-serif">
              AI-powered web discovery for curious minds. Find the internet you
              didn&apos;t know existed.
            </p>
            <a
              href="https://github.com/MountainManTechnology/Serendip.bot"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#e8a020] hover:text-[#f5c561] transition-colors"
            >
              ★ Open source on GitHub
            </a>
          </div>

          {/* Discover column */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest">
              Discover
            </h3>
            <ul className="space-y-2 text-sm">
              {[
                { label: "🔭 Wonder", href: "/moods/wonder" },
                { label: "📚 Learn", href: "/moods/learn" },
                { label: "🎨 Create", href: "/moods/create" },
                { label: "😄 Laugh", href: "/moods/laugh" },
                { label: "☕ Chill", href: "/moods/chill" },
              ].map(({ label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="hover:text-white transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources column */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest">
              Resources
            </h3>
            <ul className="space-y-2 text-sm">
              {[
                { label: "Daily Discoveries", href: "/daily" },
                {
                  label: "Best StumbleUpon Alternatives",
                  href: "/alternatives/stumbleupon",
                },
                { label: "How It Works", href: "/#how-it-works" },
                { label: "FAQ", href: "/#faq" },
              ].map(({ label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="hover:text-white transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Project column */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest">
              Project
            </h3>
            <ul className="space-y-2 text-sm">
              {[
                {
                  label: "GitHub",
                  href: "https://github.com/MountainManTechnology/Serendip.bot",
                },
                {
                  label: "Report a Bug",
                  href: "https://github.com/MountainManTechnology/Serendip.bot/issues",
                },
                {
                  label: "Contribute",
                  href: "https://github.com/MountainManTechnology/Serendip.bot/blob/main/CONTRIBUTING.md",
                },
              ].map(({ label, href }) => (
                <li key={label}>
                  <a
                    href={href}
                    target={href.startsWith("http") ? "_blank" : undefined}
                    rel={
                      href.startsWith("http")
                        ? "noopener noreferrer"
                        : undefined
                    }
                    className="hover:text-white transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <p>
            © {year} Serendip Bot — the AI-powered StumbleUpon alternative for
            curious minds.
          </p>
          <p className="text-white/40">
            Free &amp; open source · No account needed · Ad-supported
          </p>
        </div>
      </div>
    </footer>
  );
}
