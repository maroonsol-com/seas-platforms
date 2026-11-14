import Link from "next/link";

import { PAGE_SIZE } from "@/server/constants";

export function Pager({
  page,
  total,
  path,
  params,
}: {
  page: number;
  total: number;
  path: string;
  params?: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  function href(next: number) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value) search.set(key, value);
    }
    if (next > 1) search.set("page", String(next));
    const query = search.toString();
    return query ? `${path}?${query}` : path;
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      {page > 1 ? <Link className="underline" href={href(page - 1)}>Previous</Link> : <span />}
      <span>Page {page} of {pages} · {total} records</span>
      {page < pages ? <Link className="underline" href={href(page + 1)}>Next</Link> : null}
    </div>
  );
}