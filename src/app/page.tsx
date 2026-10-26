"use client";

import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100">
        FontKu
      </h1>
      <p className="mt-4 text-zinc-600 dark:text-zinc-400 text-center">
        Font Trajectory Designer
      </p>
      <Link href="/editor">
        <button className="mt-8 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700">
          Open Editor
        </button>
      </Link>
    </div>
  );
}
