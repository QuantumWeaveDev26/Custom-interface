"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/studio", label: "Studio" },
  { href: "/director", label: "Director" },
  { href: "/marketing", label: "Marketing" },
  { href: "/transcribe", label: "Transcribe" },
  { href: "/voice-clone", label: "Voice Clone" },
  { href: "/gallery", label: "Gallery" },
] as const;

export function NavBar({ signOutAction }: { signOutAction: () => Promise<void> }) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/studio" className="flex items-center gap-2">
            <span className="gradient-ring h-6 w-6 rounded-lg" aria-hidden="true" />
            <span className="text-sm font-semibold tracking-tight text-[var(--text)]">
              Creative AI
            </span>
          </Link>
          <div className="hidden gap-1 sm:flex">
            {LINKS.map((link) => {
              const active = pathname?.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
                    active
                      ? "text-[var(--text)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                  style={active ? { background: "var(--surface-hover)" } : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            Sign out
          </button>
        </form>
      </div>
      <div className="flex gap-1 overflow-x-auto px-4 pb-2 sm:hidden">
        {LINKS.map((link) => {
          const active = pathname?.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
                active ? "text-[var(--text)]" : "text-[var(--text-muted)]"
              }`}
              style={active ? { background: "var(--surface-hover)" } : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
