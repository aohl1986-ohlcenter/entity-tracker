"use client";

// Passwort-Verwaltung als Client-Insel: useActionState zeigt das generierte
// Passwort GENAU EINMAL in der Response an — kein URL-Param, kein Log-Leak.

import { useActionState } from "react";
import {
  generateTenantPassword,
  setTenantPassword,
  type PasswordActionState,
} from "@/app/admin/actions";

const inputCls =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-white placeholder:text-slate-500 focus:border-brand-gold/50 focus:outline-none";

export function PasswordSection({ entityId, hasPassword }: { entityId: number; hasPassword: boolean }) {
  const [genState, genAction, genPending] = useActionState<PasswordActionState, FormData>(
    generateTenantPassword,
    {},
  );
  const [setState, setAction, setPending] = useActionState<PasswordActionState, FormData>(
    setTenantPassword,
    {},
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Zugangs-Passwort: {hasPassword || genState.password || setState.saved ? "gesetzt ✓" : "— nicht gesetzt (Login deaktiviert)"}
      </p>

      {genState.password && (
        <div className="rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-brand-gold">
            Neues Passwort — jetzt kopieren, wird nur einmal angezeigt
          </div>
          <code className="mt-1 block select-all text-lg font-bold text-white">
            {genState.password}
          </code>
        </div>
      )}
      {setState.saved && (
        <p className="text-sm text-emerald-400">Passwort gespeichert.</p>
      )}
      {(genState.error || setState.error) && (
        <p className="text-sm text-displacement">{genState.error ?? setState.error}</p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <form action={genAction}>
          <input type="hidden" name="id" value={entityId} />
          <button
            type="submit"
            disabled={genPending}
            className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-navy transition hover:opacity-90 disabled:opacity-50"
          >
            {genPending ? "Generiere…" : "Passwort generieren"}
          </button>
        </form>
        <form action={setAction} className="flex items-end gap-2">
          <input type="hidden" name="id" value={entityId} />
          <label className="space-y-1 text-sm text-slate-300">
            <span className="block text-[12px]">…oder manuell setzen (min. 10 Zeichen)</span>
            <input name="password" type="text" minLength={10} required className={inputCls} />
          </label>
          <button
            type="submit"
            disabled={setPending}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5 disabled:opacity-50"
          >
            Setzen
          </button>
        </form>
      </div>
    </div>
  );
}
