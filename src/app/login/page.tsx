import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { Logo } from "@/components/ui/Logo";

export default function LoginPage() {
  return (
    <main className="authPage">
      <section className="card authCard" aria-labelledby="login-title">
        <Logo />
        <h1 id="login-title">Sign In</h1>
        <AuthForm mode="login" />
        <p className="authFootnote">
          Don&apos;t have an account? <Link href="/signup">Sign Up</Link>
        </p>
      </section>
    </main>
  );
}
