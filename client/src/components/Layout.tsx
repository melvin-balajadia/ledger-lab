import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthMe, useLogout } from "../hooks/useAuth";
import { useReviewItems } from "../hooks/useReview";
import { clearAllTableStates } from "../hooks/useTableUrlState";
import { SITE_TITLE } from "../site.config";
import { BackupButton } from "./BackupButton";
import { Modal } from "./Modal";
import {
  IconAlertTriangle,
  IconBanknote,
  IconBox,
  IconGrid,
  IconList,
  IconMenu,
  IconPlusCircle,
  IconReceipt,
  IconUsers,
  IconX,
} from "./icons";

// A left sidebar rather than a top row: eight pages (nine with the weekly
// budget) no longer fit across, and grouping them says what each one is for.
// The active page gets an accent bar on its left edge, the only colour in the
// menu -- everything else stays quiet so the figures are what you look at.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent ${
    isActive
      ? "bg-accent-soft font-semibold text-ink before:absolute before:inset-y-1.5 before:left-0 before:w-0.75 before:rounded-full before:bg-accent before:content-['']"
      : "font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
  }`;

const iconClass = "h-4 w-4 shrink-0 opacity-75";

function NavGroup({ label, children }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-3 pt-4 pb-1 text-xs font-medium text-ink-faint">{label}</p>
      {children}
    </div>
  );
}

function generatedAt() {
  return new Date().toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")
  ).toUpperCase();
}

export function Layout() {
  const navigate = useNavigate();
  const { data: user } = useAuthMe();
  const logout = useLogout();

  const [confirmLogout, setConfirmLogout] = useState(false);
  // Below the lg breakpoint the sidebar is a drawer behind a menu button.
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  async function handleLogout() {
    // Only clear local state and leave once the server has actually ended the
    // session. Doing it optimistically would drop her table filters and send
    // her to /login while the cookie is still live -- looking logged out
    // while not being logged out.
    try {
      await logout.mutateAsync();
    } catch {
      return; // logout.error renders in the dialog; she can retry or cancel.
    }
    clearAllTableStates();
    navigate("/login", { replace: true });
  }

  const displayName = user?.full_name ?? user?.username ?? "";
  const reviewCount = useReviewItems().data?.length ?? 0;

  return (
    <div className="min-h-screen lg:flex">
      {/* Small screens: a slim bar with the menu button. */}
      <div className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-rule bg-surface px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
          className="rounded-sm p-1.5 text-ink-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
        >
          <IconMenu className="h-5 w-5" />
        </button>
        <span className="font-display text-base font-semibold text-ink">LedgerLab</span>
      </div>

      {menuOpen && (
        <div
          className="no-print fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        id="app-sidebar"
        className={`no-print fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-rule bg-surface transition-transform motion-reduce:transition-none lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-2 border-b border-rule px-4 pt-5 pb-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-accent">{SITE_TITLE}</span>
            <h1 className="font-display text-lg font-semibold text-ink">LedgerLab</h1>
            <span className="text-xs text-ink-muted">Cost management system</span>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="rounded-sm p-1 text-ink-muted outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        {/* Any click on a link closes the drawer on small screens. */}
        <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-3" onClick={() => setMenuOpen(false)}>
          <NavLink to="/" end className={navLinkClass}>
            <IconGrid className={iconClass} />
            Overview
          </NavLink>
          <NavGroup label="Ledgers">
            <NavLink to="/replenishments" className={navLinkClass}>
              <IconBox className={iconClass} />
              Replenishments
            </NavLink>
            <NavLink to="/purchase-orders" className={navLinkClass}>
              <IconReceipt className={iconClass} />
              Purchase Orders
            </NavLink>
            <NavLink to="/cash-advances" className={navLinkClass}>
              <IconBanknote className={iconClass} />
              Cash Advances
            </NavLink>
            <NavLink to="/additional-payments" className={navLinkClass}>
              <IconPlusCircle className={iconClass} />
              Additional Payments
            </NavLink>
            <NavLink to="/payroll" className={navLinkClass}>
              <IconUsers className={iconClass} />
              Payroll
            </NavLink>
          </NavGroup>
          <NavGroup label="Maintenance">
            <NavLink to="/suppliers" className={navLinkClass}>
              <IconList className={iconClass} />
              Suppliers
            </NavLink>
            <NavLink to="/review" className={navLinkClass}>
              <IconAlertTriangle className={iconClass} />
              Needs review
              {reviewCount > 0 && (
                <span className="ml-auto rounded-full bg-warn-soft px-1.5 py-0.5 text-[11px] font-semibold text-warn tabular-nums">
                  {reviewCount}
                </span>
              )}
            </NavLink>
          </NavGroup>
        </nav>

        {user && (
          <div className="flex flex-col gap-3 border-t border-rule p-4">
            <BackupButton />
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
                {initials(displayName)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink" title={displayName}>
                {displayName}
              </span>
              <button
                type="button"
                onClick={() => setConfirmLogout(true)}
                className="shrink-0 rounded-sm px-2 py-1 text-xs font-medium text-ink-muted outline-none hover:text-danger focus-visible:ring-2 focus-visible:ring-accent"
              >
                Log out
              </button>
            </div>
          </div>
        )}
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto flex max-w-295 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
          {/* Print only. The sidebar doesn't print, so the report carries its
              own heading: what it is, for which site, and when and by whom it
              was taken -- these figures move, so two printouts must be
              distinguishable. */}
          <header className="hidden flex-col gap-1 border-b border-rule pb-3 print:flex">
            <span className="text-xs font-semibold text-accent">{SITE_TITLE}</span>
            <h1 className="font-display text-2xl font-semibold text-ink">Cost Overview Report</h1>
            {user && <p className="text-xs text-ink-muted">Generated {generatedAt()} by {displayName}</p>}
          </header>

          <Outlet />
        </div>
      </main>

      {confirmLogout && (
        <Modal title="Log out?" onClose={() => setConfirmLogout(false)}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-muted">
              You'll be signed out{displayName ? ` as ${displayName}` : ""} and returned to the login screen. The
              filters, sorting and page you have set on each table are cleared too.
            </p>

            {logout.error && (
              <p className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
                Couldn't log out ({logout.error.message}). You are still signed in.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-rule pt-3">
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                disabled={logout.isPending}
                className="rounded-sm border border-rule-strong bg-surface px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-2 disabled:opacity-60"
              >
                Stay signed in
              </button>
              {/* Danger-outlined rather than a solid accent button: the header
                  control this came from already hovers to danger, so the
                  colour of the action stays the same as the way in. */}
              <button
                type="button"
                onClick={handleLogout}
                disabled={logout.isPending}
                className="rounded-sm border border-danger px-4 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
              >
                {logout.isPending ? "Logging out…" : "Log out"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
