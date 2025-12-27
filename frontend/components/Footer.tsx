import Link from "next/link";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-gray-800 text-gray-300 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-0">
          <div className="text-sm sm:text-base text-center sm:text-left">
            <p>© {currentYear} DSA. All rights reserved.</p>
            <p className="mt-1 text-xs sm:text-sm text-gray-400">Gakushuin University Okada Laboratory</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            <Link
              href="/terms"
              className="text-sm sm:text-base hover:text-white transition-colors underline"
            >
              利用規約
            </Link>
            <Link
              href="/privacy"
              className="text-sm sm:text-base hover:text-white transition-colors underline"
            >
              プライバシーポリシー
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

