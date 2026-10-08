"use client";

import { useActionState, useState } from "react";
import {
  addCustomerLogin,
  removeCustomerLogin,
  updateLoginEmail,
  resetCustomerPassword,
  type ActionState,
} from "./actions";
import { submitOnEnter } from "@/lib/submit-on-enter";

const initialState: ActionState = { error: null, success: null };

const inputClass =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200";
const subtleBtn =
  "rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100";

// A readable, strong password — no ambiguous characters (O/0, l/1/I), since
// these get read aloud or pasted into an email.
function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

export type LoginRow = {
  userId: string;
  email: string;
  // The legacy customers.user_id pointer. Shown only so it's clear why this one
  // can't simply vanish; it carries no extra privileges — all logins are equal.
  isPrimary: boolean;
};

function Feedback({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
        {state.success}
      </p>
    );
  }
  return null;
}

function LoginActions({
  customerId,
  login,
  canRemove,
}: {
  customerId: string;
  login: LoginRow;
  canRemove: boolean;
}) {
  const [panel, setPanel] = useState<"none" | "password" | "email">("none");
  const [password, setPassword] = useState("");
  const [pwState, pwAction, pwPending] = useActionState(
    resetCustomerPassword,
    initialState,
  );
  const [emailState, emailAction, emailPending] = useActionState(
    updateLoginEmail,
    initialState,
  );
  const [rmState, rmAction, rmPending] = useActionState(
    removeCustomerLogin,
    initialState,
  );

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setPanel(panel === "password" ? "none" : "password");
            if (panel !== "password" && !password) setPassword(generatePassword());
          }}
          className={subtleBtn}
        >
          {panel === "password" ? "Cancel" : "Reset password"}
        </button>
        <button
          type="button"
          onClick={() => setPanel(panel === "email" ? "none" : "email")}
          className={subtleBtn}
        >
          {panel === "email" ? "Cancel" : "Change email"}
        </button>
        {canRemove ? (
          <form
            action={rmAction}
            onSubmit={(e) => {
              if (
                !confirm(
                  `Remove ${login.email}? They will no longer be able to sign in. The account and its history are untouched.`,
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="customer_id" value={customerId} />
            <input type="hidden" name="user_id" value={login.userId} />
            <button
              type="submit"
              disabled={rmPending}
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
            >
              {rmPending ? "Removing…" : "Remove"}
            </button>
          </form>
        ) : (
          <span
            title="An account must keep at least one login — add another first."
            className="px-1 text-xs text-stone-400"
          >
            last login
          </span>
        )}
      </div>

      {panel === "password" ? (
        <form action={pwAction} onKeyDown={submitOnEnter} className="w-full">
          <input type="hidden" name="user_id" value={login.userId} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <input
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} font-mono`}
              size={22}
            />
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              className={subtleBtn}
            >
              Regenerate
            </button>
            <button
              type="submit"
              disabled={pwPending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {pwPending ? "Saving…" : "Set password"}
            </button>
          </div>
          <Feedback state={pwState} />
        </form>
      ) : null}

      {panel === "email" ? (
        <form action={emailAction} onKeyDown={submitOnEnter} className="w-full">
          <input type="hidden" name="customer_id" value={customerId} />
          <input type="hidden" name="user_id" value={login.userId} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <input
              name="email"
              type="email"
              required
              defaultValue={login.email}
              className={inputClass}
              size={28}
            />
            <button
              type="submit"
              disabled={emailPending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {emailPending ? "Saving…" : "Change email"}
            </button>
          </div>
          <Feedback state={emailState} />
        </form>
      ) : null}

      <Feedback state={rmState} />
    </div>
  );
}

export function CustomerLogins({
  customerId,
  logins,
}: {
  customerId: string;
  logins: LoginRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [password, setPassword] = useState("");
  const [addState, addAction, addPending] = useActionState(
    addCustomerLogin,
    initialState,
  );

  return (
    <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-6 py-4">
        <div>
          <h2 className="font-semibold text-stone-900">Logins</h2>
          <p className="mt-1 text-sm text-stone-500">
            Everyone here signs in to this same account and sees the same orders
            and invoices — useful when the person ordering isn&apos;t the person
            paying.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAdding((v) => !v);
            if (!adding && !password) setPassword(generatePassword());
          }}
          className={subtleBtn}
        >
          {adding ? "Cancel" : "Add login"}
        </button>
      </div>

      <ul className="divide-y divide-stone-100">
        {logins.map((l) => (
          <li
            key={l.userId}
            className="flex flex-wrap items-start justify-between gap-3 px-6 py-4"
          >
            <div className="min-w-0">
              <p className="break-all font-medium text-stone-900">{l.email}</p>
              {l.isPrimary ? (
                <p className="mt-0.5 text-xs text-stone-400">
                  primary contact login
                </p>
              ) : null}
            </div>
            <LoginActions
              customerId={customerId}
              login={l}
              canRemove={logins.length > 1}
            />
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          action={addAction}
          onKeyDown={submitOnEnter}
          className="border-t border-stone-200 px-6 py-4"
        >
          <input type="hidden" name="customer_id" value={customerId} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-stone-700">Email</label>
              <input
                name="email"
                type="email"
                required
                placeholder="billing@theircompany.com"
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-stone-700">
                Temporary password
              </label>
              <div className="flex items-center gap-2">
                <input
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} w-full font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setPassword(generatePassword())}
                  className={subtleBtn}
                >
                  New
                </button>
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Copy the password before saving — it isn&apos;t shown again.
          </p>
          <Feedback state={addState} />
          <div className="mt-3">
            <button
              type="submit"
              disabled={addPending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {addPending ? "Adding…" : "Add login"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
