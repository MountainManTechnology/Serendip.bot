import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-4 bg-gradient-to-br from-violet-50 to-indigo-50">
      <div className="text-center space-y-4 max-w-md">
        <div className="text-7xl">🔭</div>
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">
          Page not found
        </h1>
        <p className="text-lg text-gray-500">
          This corner of the internet doesn&apos;t exist yet — but there&apos;s
          plenty more to discover.
        </p>
      </div>
      <Link
        href="/"
        className="px-8 py-3 rounded-2xl text-lg font-bold text-white bg-violet-600 hover:bg-violet-700 transition-colors shadow-lg"
      >
        Back to exploring
      </Link>
    </main>
  );
}
