import { Link } from "wouter";

export default function ParaPetsHubPage() {
  return (
    <div
      data-testid="para-pets-hub-page"
      className="fixed inset-0 bg-[#07090f] overflow-y-auto"
      style={{ zIndex: 9999 }}
    >
      <header
        className="sticky top-0 z-50 w-full border-b border-[#1e2a24] bg-[#07090f]/90 backdrop-blur-md"
        data-testid="hub-header"
      >
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <span
            className="font-fantasy text-xl text-[#7fbfb0] tracking-widest"
            data-testid="text-hub-title"
          >
            Para Pets
          </span>
          <Link
            href="/auth"
            data-testid="link-hub-signin"
            className="text-xs font-medium text-[#c8d8b0] border border-[#3a5a4a] rounded-full px-4 py-1.5 hover:bg-[#1a2e22] transition-colors duration-150"
          >
            Sign In
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10" data-testid="hub-main">
      </main>
    </div>
  );
}
