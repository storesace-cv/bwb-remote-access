/**
 * Auth Error Page
 * 
 * INVARIANT 4: NO AUTH LOOPS
 * This page handles authentication errors without restarting the auth flow.
 * Displays error information and provides manual retry option.
 */

import { Suspense } from 'react';
import Link from 'next/link';

function AuthErrorContent({ 
  searchParams 
}: { 
  searchParams: { error?: string; message?: string } 
}) {
  const error = searchParams.error || 'unknown_error';
  const message = searchParams.message || 'An authentication error occurred.';
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
            <svg 
              className="h-6 w-6 text-red-600" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
              />
            </svg>
          </div>
          
          <h1 className="mt-4 text-xl font-semibold text-gray-900">
            Authentication Error
          </h1>
          
          <p className="mt-2 text-sm text-gray-600">
            {message}
          </p>
          
          <div className="mt-4 p-3 bg-gray-50 rounded text-xs text-gray-500 font-mono">
            Error code: {error}
          </div>
          
          <div className="mt-6 space-y-3">
            <Link
              href="/auth/login"
              className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Try Again
            </Link>
            
            <Link
              href="/"
              className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Go Home
            </Link>
          </div>
          
          <p className="mt-6 text-xs text-gray-400">
            If this error persists, please contact support.
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AuthErrorContent searchParams={params} />
    </Suspense>
  );
}
