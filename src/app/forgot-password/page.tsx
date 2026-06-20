import Image from "next/image";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;

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
            Reset your password
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        {expired === "1" ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
            That reset link has expired or was already used. Request a new one
            below.
          </div>
        ) : null}

        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <ForgotPasswordForm />
        </div>
      </div>
    </main>
  );
}
