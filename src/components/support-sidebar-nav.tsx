"use client";

import { useEffect, useState } from "react";

type MenuIcon = "dashboard" | "users" | "ui-check" | "tickets" | "billing" | "recovery" | "default";

type SidebarNavItem = {
  id: string;
  title: string;
  href: string;
  icon: MenuIcon;
};

function renderMenuIcon(icon: MenuIcon) {
  if (icon === "dashboard") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 13h8V3H3v10Zm10 8h8V11h-8v10Zm0-18v6h8V3h-8ZM3 21h8v-6H3v6Z" />
      </svg>
    );
  }
  if (icon === "users") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (icon === "ui-check") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8" />
        <path d="M12 16v4" />
        <circle cx="12" cy="10" r="2.8" />
      </svg>
    );
  }
  if (icon === "tickets") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 7h16v10H4z" />
        <path d="M8 7V5h8v2" />
        <path d="M8 12h8" />
      </svg>
    );
  }
  if (icon === "billing") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 15h4" />
      </svg>
    );
  }
  if (icon === "recovery") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M21 12a9 9 0 1 1-3.2-6.9" />
        <path d="M21 3v6h-6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function SupportSidebarNav({ items }: { items: SidebarNavItem[] }) {
  const [activeHref, setActiveHref] = useState("");

  useEffect(() => {
    const syncFromHash = () => {
      setActiveHref(window.location.hash || "");
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  return (
    <nav className="support-nav-list mt-5" aria-label="Support menu">
      {items.map((menu) => (
        <a
          key={menu.id}
          className={`support-nav-item support-nav-link ${activeHref === menu.href ? "support-nav-item-active" : ""}`}
          href={menu.href}
          aria-label={menu.title}
          onClick={() => setActiveHref(menu.href)}
        >
          <span aria-hidden className="support-nav-icon">
            {renderMenuIcon(menu.icon)}
          </span>
          <span className="support-nav-content">
            <span className="support-nav-title">{menu.title}</span>
          </span>
        </a>
      ))}
    </nav>
  );
}

