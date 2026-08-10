"use client";

import { useState, type ReactNode } from "react";
import "./hub-toolbar.css";

export type HubNavItem = { key: string; label: string; href: string; active?: boolean };

export interface HubToolbarProps {
  /** Optional brand element on the far left (most Hub apps omit it — the Hub pill is the identity). */
  brand?: ReactNode;
  /** App navigation items rendered on the left. */
  nav?: HubNavItem[];
  /** Render a nav item as the app's own link (e.g. next/link). Falls back to a plain <a>. */
  renderNavLink?: (
    item: HubNavItem,
    opts: { className: string; onClick: () => void },
  ) => ReactNode;
  /** Muted, monospace cluster on the right (e.g. version / build labels). */
  meta?: ReactNode;
  /** Primary call-to-action on the right (e.g. "New Company"). */
  primaryAction?: ReactNode;
  /** Notifications control on the right (e.g. a bell). */
  notifications?: ReactNode;
  /** Extra right-side controls (e.g. theme toggle, admin/user menu). */
  actions?: ReactNode;
}

export function HubToolbar({
  brand,
  nav = [],
  renderNavLink,
  meta,
  primaryAction,
  notifications,
  actions,
}: HubToolbarProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const renderItem = (item: HubNavItem) => {
    const className = `hub-toolbar__link${item.active ? " is-active" : ""}`;
    if (renderNavLink) return renderNavLink(item, { className, onClick: close });
    return (
      <a key={item.key} href={item.href} className={className} onClick={close}>
        {item.label}
      </a>
    );
  };

  return (
    <header className="hub-toolbar" data-hub-toolbar>
      {brand && <div className="hub-toolbar__brand">{brand}</div>}

      <button
        type="button"
        className="hub-toolbar__toggle"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "✕" : "☰"}
      </button>

      <nav className={`hub-toolbar__nav${open ? " is-open" : ""}`}>
        {nav.map(renderItem)}
      </nav>

      <div className="hub-toolbar__right">
        {meta && <div className="hub-toolbar__meta">{meta}</div>}
        {notifications}
        {primaryAction}
        {actions}
      </div>
    </header>
  );
}
