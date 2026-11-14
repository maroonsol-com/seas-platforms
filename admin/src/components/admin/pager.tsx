import Link from "next/link";

import { PAGE_SIZE } from "@/server/constants";

export function Pager({ page, total, path, query, params }: { page: number; total: number; path: string; query?: string; params?: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  function href(next: number) {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value) search.set(key, value);
    }
    search.set("page", String(next));
    return `${path}?${search.toString()}`;
  }
  return (
    <div className="flex gap-3 text-sm">
      {page > 1 ? <Link href={href(page - 1)}>Previous</Link> : null}
      <span>Page {page} of {pages} · {total} records</span>
      {page < pages ? <Link href={href(page + 1)}>Next</Link> : null}
    </div>
  );
}
