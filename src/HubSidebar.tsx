"use client";

import { useState, type ReactNode } from "react";
import "./hub-sidebar.css";

export type HubSidebarItem = {
  key: string;
  label: string;
  href: string;
  active?: boolean;
};

export interface HubSidebarProps {
  /** Small uppercase section label at the top (e.g. the app name). */
  title?: ReactNode;
  /** Optional brand element above the title. */
  brand?: ReactNode;
  /** Flat list of page links. */
  items?: HubSidebarItem[];
  /** Render an item as the app's own link (e.g. next/link). Falls back to <a>. */
  renderLink?: (
    item: HubSidebarItem,
    opts: { className: string; onClick: () => void },
  ) => ReactNode;
  /** Bottom cluster (e.g. version / build labels). Pinned to the sidebar foot. */
  footer?: ReactNode;
}

export function HubSidebar({
  title,
  brand,
  items = [],
  renderLink,
  footer,
}: HubSidebarProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const renderItem = (item: HubSidebarItem) => {
    const className = `hub-sidebar__link${item.active ? " is-active" : ""}`;
    if (renderLink) return renderLink(item, { className, onClick: close });
    return (
      <a key={item.key} href={item.href} className={className} onClick={close}>
        {item.label}
      </a>
    );
  };

  return (
    <>
      {/* Hidden on desktop; on phones it toggles the drawer (see hub-sidebar.css). */}
      <button
        type="button"
        className="hub-sidebar__toggle"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "✕" : "☰"}
      </button>
      {open && (
        <div className="hub-sidebar__backdrop" onClick={close} aria-hidden />
      )}
      <aside
        className={`hub-sidebar${open ? " is-open" : ""}`}
        data-hub-sidebar
      >
        {brand && <div className="hub-sidebar__brand">{brand}</div>}
        {title && <div className="hub-sidebar__title">{title}</div>}
        <nav className="hub-sidebar__nav">{items.map(renderItem)}</nav>
        {footer && <div className="hub-sidebar__footer">{footer}</div>}
      </aside>
    </>
  );
}
