import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthMe, useLogout } from "../hooks/useAuth";
import { clearAllTableStates } from "../hooks/useTableUrlState";
import { SITE_TITLE } from "../site.config";
import { BackupButton } from "./BackupButton";
import { Modal } from "./Modal";
import {
  IconAlertCircle,
  IconBox,
  IconGrid,
  IconList,
  IconReceipt,
  IconTrendDown,
  IconUsers,
} from "./icons";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex shrink-0 items-center gap-2 px-1 pb-3 text-sm font-medium whitespace-nowrap ${
    isActive
      ? "text-ink font-semibold after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:rounded-full after:bg-accent after:content-['']"
      : "text-ink-muted hover:text-ink"
  }`;

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

  return (
    <div className="mx-auto flex max-w-295 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-5 border-b border-rule pb-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide text-accent uppercase">
              {SITE_TITLE}
            </span>
            <h1 className="font-display text-2xl font-semibold text-balance text-ink sm:text-3xl print:hidden">
              LedgerLab - Cost Management System
            </h1>
            {/* Print only. The app's own product name isn't meaningful to
                whoever this report goes to -- they're reading about the
                project, not the software used to produce it. */}
            <h1 className="hidden font-display text-2xl font-semibold text-balance text-ink sm:text-3xl print:block">
              Cost Overview Report
            </h1>
            {/* Print only. These figures move, so a printout going up the
                approval chain has to say when it was taken and by whom --
                otherwise two copies are indistinguishable. */}
            {user && (
              <p className="hidden text-xs text-ink-muted print:block">
                Generated {generatedAt()} by {displayName}
              </p>
            )}
          </div>
          {user && (
            <div className="no-print flex items-center gap-3">
              <BackupButton />
              <div className="flex items-center gap-2.5 rounded-full border border-rule py-1 pr-3 pl-1 bg-surface">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
                  {initials(displayName)}
                </span>
                <span className="text-[13px] font-medium text-ink">
                  {displayName}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setConfirmLogout(true)}
                className="rounded-sm border border-rule-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-danger hover:text-danger"
              >
                Log out
              </button>
            </div>
          )}
        </div>
        <nav className="flex gap-7 overflow-x-auto">
          <NavLink to="/" end className={navLinkClass}>
            <IconGrid className="h-3.75 w-3.75 opacity-75" />
            Overview
          </NavLink>
          <NavLink to="/replenishments" className={navLinkClass}>
            <IconBox className="h-3.75 w-3.75 opacity-75" />
            Replenishments
          </NavLink>
          <NavLink to="/purchase-orders" className={navLinkClass}>
            <IconReceipt className="h-3.75 w-3.75 opacity-75" />
            Purchase Orders
          </NavLink>
          <NavLink to="/cash-advances" className={navLinkClass}>
            <IconTrendDown className="h-3.75 w-3.75 opacity-75" />
            Cash Advances
          </NavLink>
          <NavLink to="/additional-payments" className={navLinkClass}>
            <IconAlertCircle className="h-3.75 w-3.75 opacity-75" />
            Additional Payments
          </NavLink>
          <NavLink to="/payroll" className={navLinkClass}>
            <IconUsers className="h-3.75 w-3.75 opacity-75" />
            Payroll
          </NavLink>
          <NavLink to="/suppliers" className={navLinkClass}>
            <IconList className="h-3.75 w-3.75 opacity-75" />
            Suppliers
          </NavLink>
        </nav>
      </header>

      <Outlet />

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
