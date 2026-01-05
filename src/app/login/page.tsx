/**
 * Login Page - Redirect to Root
 * 
 * For backward compatibility, redirects /login to /
 */

import { redirect } from "next/navigation";

export default function LoginPage() {
  redirect("/");
}
