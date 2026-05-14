import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { Logo } from "@/components/ui/Logo";

export default function SignupPage() {
  return (
    <main className="authPage">
      <section className="card authCard" aria-labelledby="signup-title">
        <Logo />
        <h1 id="signup-title">Create Account</h1>
        <AuthForm mode="signup" />
        <p className="authFootnote">
          Already have an account? <Link href="/login">Sign In</Link>
        </p>
      </section>
    </main>
  );
}
