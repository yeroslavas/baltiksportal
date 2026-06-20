"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ForgotState } from "./actions";

const initial: ForgotState = { sent: false, error: null };

const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (state.sent) {
    return (
      <div className="space-y-4 text-center">
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          If that email has an account, a password-reset link is on its way.
          Check your inbox (and spam).
        </p>
        <Link
          href="/login"
          className="inline-block text-sm font-medium text-brand-700 hover:underline"
        >
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Email</label>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className={inputClass}
        />
      </div>
      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-center">
        <Link
          href="/login"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Back to sign in
        </Link>
      </p>
    </form>
  );
}
