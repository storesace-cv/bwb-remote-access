/**
 * Auth Error Page
 * 
 * INVARIANT 4: NO AUTH LOOPS
 * This page handles authentication errors WITHOUT restarting the auth flow.
 * It is a TERMINAL state - users must manually choose to retry.
 * 
 * This page is EXPLICITLY PUBLIC (no auth required) to prevent loops.
 */

// Error code descriptions for user-friendly messages
const ERROR_MESSAGES: Record<string, string> = {
  'invalid_state': 'Your login session expired or was interrupted. This can happen if you took too long to complete login, or if you opened multiple login windows.',
  'callback_error': 'There was an error completing your login. This may be a temporary issue.',
  'access_denied': 'Access to the application was denied. Please contact your administrator if you believe this is an error.',
  'unauthorized': 'You are not authorized to access this application.',
  'unknown': 'An unexpected error occurred during login.',
};

interface AuthErrorPageProps {
  searchParams: Promise<{ 
    e?: string;      // Error code
    cid?: string;    // Correlation ID for support
    message?: string; // Legacy message param
  }>;
}

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const params = await searchParams;
  
  const errorCode = params.e || params.message || 'unknown';
  const correlationId = params.cid || 'N/A';
  const errorMessage = ERROR_MESSAGES[errorCode] || ERROR_MESSAGES['unknown'];
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
        <div className="text-center">
          {/* Error Icon */}
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100">
            <svg 
              className="h-8 w-8 text-red-600" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
              aria-hidden="true"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
              />
            </svg>
          </div>
          
          {/* Title */}
          <h1 className="mt-4 text-2xl font-semibold text-gray-900">
            Login Failed
          </h1>
          
          {/* Error Description */}
          <p className="mt-3 text-sm text-gray-600 leading-relaxed">
            {errorMessage}
          </p>
          
          {/* Technical Details (collapsed) */}
          <details className="mt-4 text-left">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
              Technical details
            </summary>
            <div className="mt-2 p-3 bg-gray-50 rounded text-xs text-gray-500 font-mono space-y-1">
              <div>Error: {errorCode}</div>
              <div>Reference: {correlationId}</div>
              <div>Time: {new Date().toISOString()}</div>
            </div>
          </details>
          
          {/* Actions */}
          <div className="mt-6 space-y-3">
            {/* Primary: Try Again - MUST use <a> for full page navigation */}
            <a
              href="/auth/login"
              className="w-full inline-flex justify-center items-center px-4 py-3 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              Try Again
            </a>
            
            {/* Secondary: Go Home */}
            <a
              href="/"
              className="w-full inline-flex justify-center items-center px-4 py-3 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              Go to Home Page
            </Link>
          </div>
          
          {/* Help Text */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-400">
              If this error persists, please contact support with the reference code above.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Static metadata for the page
export const metadata = {
  title: 'Login Error',
  description: 'An error occurred during authentication',
};
