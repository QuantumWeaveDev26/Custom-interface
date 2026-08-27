import { signIn } from "@/auth";
import { redirect } from "next/navigation";

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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            Sign in to Creative AI
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Create and explore AI-generated art
          </p>
        </div>

        <form action={handleEmailSignIn} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Continue with email
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-gray-50 px-2 text-gray-500">Or continue with</span>
          </div>
        </div>

        <form action={handleGoogleSignIn}>
          <button
            type="submit"
            className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Google
          </button>
        </form>
      </div>
    </div>
  );
}
