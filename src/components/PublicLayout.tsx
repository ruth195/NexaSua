import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { CandlelightToggle } from './CandlelightToggle';

export function PublicLayout({
  currentPath,
  onNavigate,
  platformAnnouncement,
  candlelight = false,
  onToggleCandlelight,
  children,
}: {
  currentPath: string;
  onNavigate: (path: string) => void;
  platformAnnouncement?: string;
  candlelight?: boolean;
  onToggleCandlelight?: () => void;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const go = (path: string) => {
    setMobileOpen(false);
    onNavigate(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navLinks = [
    { label: 'Features', path: '/features' },
    { label: 'Solutions', path: '/solutions' },
    { label: 'Pricing', path: '/pricing' },
    { label: 'Custom', path: '/custom' },
    { label: 'Login', path: '/login' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF8F1] text-[#102846]">
      {platformAnnouncement && (
        <div className="bg-[#102846] text-white text-xs py-2 px-4 text-center">
          {platformAnnouncement}
        </div>
      )}

      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single Brand Mark */}
          <button
            type="button"
            onClick={() => go('/')}
            className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#148D82] rounded-md whitespace-nowrap shrink-0"
            aria-label="NexaSua Home"
          >
            <BrandLogo size="sm" />
          </button>

          {/* Zone 2: 5 concise single-line text links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#102846]">
            {navLinks.map((link) => {
              const active = currentPath === link.path;
              return (
                <button
                  key={link.path}
                  type="button"
                  onClick={() => go(link.path)}
                  className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                    active
                      ? 'border-[#148D82] text-[#148D82] font-semibold'
                      : 'border-transparent hover:border-slate-300 hover:text-[#148D82]'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Candlelight toggle + primary CTA + mobile menu toggle */}
          <div className="flex items-center gap-3 shrink-0">
            {onToggleCandlelight && (
              <CandlelightToggle enabled={candlelight} onToggle={onToggleCandlelight} />
            )}

            <button
              type="button"
              onClick={() => go('/register')}
              className="hidden sm:inline-flex items-center justify-center rounded-lg bg-[#148D82] px-4 py-2 text-sm font-semibold text-white hover:bg-[#10766c] transition-colors whitespace-nowrap shrink-0"
            >
              Register School
            </button>

            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="md:hidden inline-flex items-center justify-center p-2 rounded-lg border border-slate-200 text-[#102846] min-w-[44px] min-h-[44px]"
              aria-label="Toggle navigation menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-2">
            {[
              { label: 'Home', path: '/' },
              { label: 'Features', path: '/features' },
              { label: 'How It Works', path: '/how-it-works' },
              { label: 'Solutions', path: '/solutions' },
              { label: 'NexaSua Core', path: '/core' },
              { label: 'NexaSua Complete', path: '/complete' },
              { label: 'Pricing', path: '/pricing' },
              { label: 'Custom Systems', path: '/custom' },
              { label: 'About', path: '/about' },
              { label: 'Contact', path: '/contact' },
              { label: 'FAQ', path: '/faq' },
              { label: 'School Portal Login', path: '/login' },
            ].map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => go(item.path)}
                className="block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-[#102846] hover:bg-[#FBF8F1]"
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => go('/register')}
              className="w-full mt-2 rounded-lg bg-[#148D82] px-4 py-3 text-sm font-semibold text-white"
            >
              Register Your School
            </button>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-[#102846] text-white border-t border-[#102846]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div className="space-y-4">
              <div className="inline-block bg-white rounded-lg px-3 py-2">
                <BrandLogo size="sm" />
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                Smart Schools. Brighter Futures. Developed by NexaFlow Technologies for Ghanaian
                and African educational institutions.
              </p>
              <p className="text-xs text-slate-400">
                Accra, Ghana · Currency: GH₵ · Timezone: Africa/Accra
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Platform</h3>
              <ul className="space-y-2 text-sm text-slate-300">
                {[
                  ['Home', '/'],
                  ['Features', '/features'],
                  ['How It Works', '/how-it-works'],
                  ['Solutions', '/solutions'],
                  ['NexaSua Core', '/core'],
                  ['NexaSua Complete', '/complete'],
                ].map(([label, path]) => (
                  <li key={path}>
                    <button
                      type="button"
                      onClick={() => go(path)}
                      className="hover:text-[#E2A83B] transition-colors"
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Commercial & Support</h3>
              <ul className="space-y-2 text-sm text-slate-300">
                {[
                  ['Pricing Calculator', '/pricing'],
                  ['NexaSua Custom', '/custom'],
                  ['Register Your School', '/register'],
                  ['Portal Login', '/login'],
                  ['Verify Report Card', '/verify-report'],
                  ['FAQ', '/faq'],
                ].map(([label, path]) => (
                  <li key={path}>
                    <button
                      type="button"
                      onClick={() => go(path)}
                      className="hover:text-[#E2A83B] transition-colors"
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Company & Governance</h3>
              <ul className="space-y-2 text-sm text-slate-300">
                {[
                  ['About NexaFlow', '/about'],
                  ['Contact Us', '/contact'],
                  ['Privacy Policy (Act 843)', '/privacy'],
                  ['Terms of Service', '/terms'],
                ].map(([label, path]) => (
                  <li key={path}>
                    <button
                      type="button"
                      onClick={() => go(path)}
                      className="hover:text-[#E2A83B] transition-colors"
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
            <p>© {new Date().getFullYear()} NexaFlow Technologies. All rights reserved.</p>
            <p>Designed for Kindergarten, Primary, Junior High & Senior High Schools in Ghana.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
