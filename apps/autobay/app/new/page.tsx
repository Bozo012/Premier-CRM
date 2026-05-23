import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PhotoUploadFlow } from "@/components/PhotoUpload";

export default function NewListingPage() {
  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <Link
          href="/"
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors -ml-1"
        >
          <ChevronLeft size={22} className="text-slate-700" />
        </Link>
        <h1 className="font-semibold text-slate-900">New Listing</h1>
      </header>

      <main className="flex-1 px-4 py-4">
        <PhotoUploadFlow />
      </main>
    </div>
  );
}
