import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage() {
  // The recovery session is established by /auth/confirm before landing here.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Image
            src="/baltiks-logo.webp"
            width={750}
            height={375}
            alt="Baltik's Bagel"
            priority
            className="mx-auto mb-5 h-auto w-56"
          />
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Choose a new password
          </h1>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          {user ? (
            <ResetPasswordForm />
          ) : (
            <div className="space-y-4 text-center text-sm text-stone-600">
              <p>
                This password-reset link is invalid or has expired. Please
                request a new one.
              </p>
              <Link
                href="/forgot-password"
                className="inline-block font-medium text-brand-700 hover:underline"
              >
                Request a new link
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
