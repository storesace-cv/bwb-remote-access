/**
 * Root Page - Login Form
 * 
 * Shows credentials form directly at root URL.
 * Redirects to dashboard if already authenticated.
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/mesh-auth";
import { LoginForm } from "@/components/login-form";

export default async function HomePage() {
  // Check if already logged in
  const session = await getSession();
  
  if (session?.authenticated) {
    redirect("/dashboard");
  }
  
  return <LoginForm />;
}
