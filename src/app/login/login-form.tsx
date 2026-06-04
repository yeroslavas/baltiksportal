"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-stone-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          placeholder="you@business.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-stone-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          placeholder="••••••••"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white transition hover:bg-brand-700 focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
