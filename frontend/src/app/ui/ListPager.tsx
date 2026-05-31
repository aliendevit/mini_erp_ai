'use client';

type ListPagerProps = {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export function getPageSlice<T>(items: T[], page: number, pageSize: number): T[] {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return items.slice((safePage - 1) * pageSize, safePage * pageSize);
}

export function ListPager({ page, total, pageSize, onPageChange }: ListPagerProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  if (total <= pageSize) return null;

  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  return (
    <div className="list-pager" aria-label="List pagination">
      <span>{start}-{end} / {total}</span>
      <div className="list-pager-actions">
        <button className="btn secondary" type="button" onClick={() => onPageChange(safePage - 1)} disabled={safePage <= 1} aria-label="Previous page">
          {'<'}
        </button>
        <strong>{safePage} / {totalPages}</strong>
        <button className="btn secondary" type="button" onClick={() => onPageChange(safePage + 1)} disabled={safePage >= totalPages} aria-label="Next page">
          {'>'}
        </button>
      </div>
    </div>
  );
}
