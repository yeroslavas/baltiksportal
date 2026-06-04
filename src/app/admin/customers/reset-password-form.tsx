"use client";

import { useActionState, useState } from "react";
import { resetCustomerPassword, type ActionState } from "./actions";

const initialState: ActionState = { error: null, success: null };

const inputClass =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

// A readable, strong password (no ambiguous chars like O/0, l/1/I).
function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [state, formAction, pending] = useActionState(
    resetCustomerPassword,
    initialState,
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-medium text-stone-500 hover:text-stone-700 hover:underline"
      >
        Reset password
      </button>
    );
  }

  return (
    <form action={formAction} className="flex w-72 flex-col items-end gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <div className="flex w-full items-center gap-2">
        <input
          name="password"
          type="text"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="new temp password"
          className={`${inputClass} flex-1`}
        />
        <button
          type="button"
          onClick={() => setPassword(generatePassword())}
          className="shrink-0 rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
        >
          Generate
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-medium text-stone-500 hover:underline"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Set password"}
        </button>
      </div>

      {state.error ? (
        <p className="w-full rounded-lg bg-red-50 px-3 py-2 text-left text-xs text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="w-full rounded-lg bg-green-50 px-3 py-2 text-left text-xs text-green-700">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
