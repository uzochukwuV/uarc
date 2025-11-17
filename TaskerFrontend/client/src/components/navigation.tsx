import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { ConnectButton } from '@rainbow-me/rainbowkit';

export function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/create", label: "Create Task" },
    { href: "/my-tasks", label: "My Tasks" },
    { href: "/execute", label: "Execute" },
    { href: "/analytics", label: "Analytics" },
    { href: "/leaderboard", label: "Leaderboard" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/">
            <div className="flex items-center gap-3 hover-elevate rounded-md px-3 py-2 -ml-3 cursor-pointer" data-testid="link-home">
              <div className="text-2xl font-bold tracking-tight">
                <span className="text-foreground">Tasker</span>
                <span className="text-primary">Onchain</span>
              </div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.slice(1).map((link) => (
              <Link key={link.href} href={link.href}>
                <div
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover-elevate rounded-md transition-colors cursor-pointer"
                  data-testid={`link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {link.label}
                </div>
              </Link>
            ))}
          </div>

          {/* Wallet Connect */}
          <div className="hidden md:flex items-center gap-4">
            <ConnectButton
              chainStatus="icon"
              accountStatus="address"
              showBalance={false}
            />
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 hover-elevate rounded-md"
            data-testid="button-mobile-menu"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-card">
          <div className="px-6 py-4 space-y-2">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <div
                  className="block px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover-elevate rounded-md cursor-pointer"
                  onClick={() => setMobileMenuOpen(false)}
                  data-testid={`mobile-link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {link.label}
                </div>
              </Link>
            ))}
            <div className="pt-4 mt-4 border-t border-border">
              <ConnectButton
                chainStatus="icon"
                accountStatus="address"
                showBalance={false}
              />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
