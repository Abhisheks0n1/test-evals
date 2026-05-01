import Link from "next/link";

export function Navigation() {
  return (
    <nav className="bg-gray-900 text-white p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/" className="text-xl font-bold">HEALOSBENCH</Link>
        <div className="flex gap-6">
          <Link href="/" className="hover:text-blue-400">Runs</Link>
          <Link href="/compare" className="hover:text-blue-400">Compare</Link>
        </div>
      </div>
    </nav>
  );
}
