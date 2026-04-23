"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component to catch and display errors gracefully.
 * Prevents the entire app from crashing on component errors.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to error tracking service (Sentry) in production when configured
    // Install: npm install --save-dev @sentry/nextjs
    // See: https://docs.sentry.io/platforms/javascript/guides/nextjs/
    console.error("Error caught by boundary:", error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="text-center max-w-md space-y-4">
            <div className="text-5xl">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-900">
              Something went wrong
            </h1>
            <p className="text-gray-600">
              We&apos;ve logged this error. Please try refreshing the page.
            </p>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <details className="mt-6 text-left bg-gray-100 rounded-lg p-4 text-sm font-mono">
                <summary className="cursor-pointer font-bold">
                  Error details
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-words text-red-700">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-6 py-2 rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-700"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
