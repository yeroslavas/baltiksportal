import Image from "next/image";
import { LoginForm } from "./login-form";

export default function LoginPage() {
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
            Wholesale Portal
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Sign in to view your catalog and pricing.
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-stone-400">
          Accounts are created by Baltiks. Need access? Contact your account
          manager.
        </p>
      </div>
    </main>
  );
}
