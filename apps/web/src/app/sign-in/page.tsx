import { signIn } from "@/auth";

export default function SignInPage() {
  async function handleEmailSignIn(formData: FormData) {
    "use server";

    const email = formData.get("email") as string | null;
    if (!email || !email.includes("@")) {
      return;
    }

    await signIn("resend", { email, redirectTo: "/" });
  }

  async function handleGoogleSignIn() {
    "use server";
    await signIn("google", { redirectTo: "/" });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg)] px-4 py-12">
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full opacity-20 blur-[120px]"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--accent-from), var(--accent-via) 45%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="gradient-ring mb-4 h-10 w-10 rounded-2xl" aria-hidden="true" />
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            Sign in to <span className="gradient-text">Creative AI</span>
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Create images, video, and voice with AI
          </p>
        </div>

        <div className="card p-6">
          <form action={handleEmailSignIn} className="space-y-3">
            <label htmlFor="email" className="block text-xs font-medium text-[var(--text-muted)]">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="input-field"
              placeholder="you@example.com"
            />
            <button type="submit" className="btn-primary w-full">
              Continue with email
            </button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border)]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[var(--surface)] px-2 text-[var(--text-faint)]">
                Or continue with
              </span>
            </div>
          </div>

          <form action={handleGoogleSignIn}>
            <button type="submit" className="btn-secondary w-full">
              Google
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
