import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthMe, useLogout } from "../hooks/useAuth";
import { useReviewItems } from "../hooks/useReview";
import { clearAllTableStates } from "../hooks/useTableUrlState";
import { SITE_NAME, SITE_TITLE } from "../site.config";
import { BackupButton } from "./BackupButton";
import { Modal } from "./Modal";
import {
  IconAlertTriangle,
  IconBanknote,
  IconBox,
  IconGrid,
  IconList,
  IconMapPin,
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

// "Royale Cold Storage" out of "Royale Cold Storage — Plaridel Extension":
// the top bar shows the site and the company on separate lines.
const COMPANY = SITE_TITLE.replace(` — ${SITE_NAME}`, "");

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
      {menuOpen && (
        <div
          className="no-print fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* The product: the same at every site. */}
      <aside
        id="app-sidebar"
        className={`no-print fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-rule bg-surface transition-transform motion-reduce:transition-none lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-rule px-4">
          {/* The same file as the browser-tab icon, so the mark is never redrawn. */}
          <img src="/favicon.svg" alt="" className="h-8 w-8 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="font-display text-[15px] leading-tight font-semibold text-ink">LedgerLab</h1>
            <span className="text-xs leading-tight text-ink-muted">Cost management system</span>
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
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Where you are and who you are. The site leads: Plaridel and
            Villasis run side by side on the same PC, and this is what tells
            them apart before anything is entered. Same height as the
            sidebar's brand row so the two read as one line. */}
        <header className="no-print sticky top-0 z-30 flex h-16 shrink-0 items-center border-b border-rule bg-surface">
          {/* Same max width as the page below, so the site lines up with the
              page title and the user menu with the page's right edge. */}
          <div className="flex w-full max-w-350 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="app-sidebar"
              className="-ml-1.5 rounded-sm p-1.5 text-ink-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
            >
              <IconMenu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent sm:flex">
                <IconMapPin className="h-4 w-4" />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm leading-tight font-semibold text-ink">{SITE_NAME}</span>
                <span className="truncate text-xs leading-tight text-ink-muted">{COMPANY}</span>
              </div>
            </div>

            {user && (
              <div className="ml-auto flex shrink-0 items-center gap-3">
                <BackupButton />
                <span className="hidden h-6 w-px bg-rule sm:block" aria-hidden="true" />
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent"
                    title={displayName}
                  >
                    {initials(displayName)}
                  </span>
                  <span className="hidden max-w-40 truncate text-[13px] font-medium text-ink md:block">{displayName}</span>
                  <button
                    type="button"
                    onClick={() => setConfirmLogout(true)}
                    className="rounded-sm px-2 py-1 text-xs font-medium text-ink-muted outline-none hover:text-danger focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Log out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Royale spacing: a 16px gutter at minimum (24px from sm up), 20px
            between stacked sections. Starts right after the sidebar and runs
            up to 1400px, so a large monitor gets more table, not a gap
            between the menu and the page. */}
        <main className="flex w-full max-w-350 flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6">
          {/* Print only. The sidebar and top bar don't print, so the report
              carries its own heading: what it is, for which site, and when
              and by whom it was taken -- these figures move, so two
              printouts must be distinguishable. */}
          <header className="hidden flex-col gap-1 border-b border-rule pb-3 print:flex">
            <span className="text-xs font-semibold text-accent">{SITE_TITLE}</span>
            <h1 className="font-display text-2xl font-semibold text-ink">Cost Overview Report</h1>
            {user && <p className="text-xs text-ink-muted">Generated {generatedAt()} by {displayName}</p>}
          </header>

          <Outlet />
        </main>
      </div>

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
