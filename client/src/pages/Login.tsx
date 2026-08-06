import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLogin } from "../hooks/useAuth";
import { Button } from "../components/Button";
import { IconEye, IconEyeOff } from "../components/icons";

// A faint ledger-paper ruling behind the card -- the one deliberate flourish
// on this page, and it's not decoration for its own sake: this tool is a
// digitized ledger, so the background is quite literally ruled paper.
// Built from the same --color-rule token every hairline border in the app
// already uses, so it repaints correctly under dark mode with no extra work.
const LEDGER_BACKGROUND = {
  backgroundImage:
    "repeating-linear-gradient(to bottom, transparent, transparent 31px, var(--color-rule) 31px, var(--color-rule) 32px)",
};

export function Login() {
  const navigate = useNavigate();
  const mutation = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await mutation.mutateAsync({ username, password });
    navigate("/", { replace: true });
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4"
      style={LEDGER_BACKGROUND}
    >
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-md flex-col gap-5 rounded-lg border border-rule bg-surface p-7 shadow-card sm:p-9"
      >
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold tracking-wide text-accent uppercase">
            Royale Cold Storage — Plaridel Extension
          </span>
          <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink">
            LedgerLab
          </h1>
          <p className="text-sm text-ink-muted">
            Budget, Purchase Orders, and Payrolls — all in one place.
          </p>
        </div>

        {mutation.error && (
          <p className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
            {mutation.error.message}
          </p>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            Username
          </span>
          <input
            type="text"
            required
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            Password
          </span>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2.5 pr-10 text-sm text-ink outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-faint hover:text-ink-muted"
            >
              {showPassword ? (
                <IconEyeOff className="h-4 w-4" />
              ) : (
                <IconEye className="h-4 w-4" />
              )}
            </button>
          </div>
        </label>

        <Button
          type="submit"
          variant="primary"
          disabled={mutation.isPending}
          className="mt-1 justify-center"
        >
          {mutation.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-xs text-ink-faint">
        Internal use only — Royale Cold Storage North Inc.
      </p>
    </div>
  );
}
