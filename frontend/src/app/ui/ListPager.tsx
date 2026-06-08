'use client';

import { useI18n } from '../../lib/i18n';

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
  const { locale } = useI18n();
  const labels = locale === 'ar'
    ? { pagination: 'تصفح القائمة', previous: 'الصفحة السابقة', next: 'الصفحة التالية' }
    : locale === 'de'
      ? { pagination: 'Listenpaginierung', previous: 'Vorherige Seite', next: 'Naechste Seite' }
      : { pagination: 'List pagination', previous: 'Previous page', next: 'Next page' };
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  if (total <= pageSize) return null;

  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  return (
    <div className="list-pager" aria-label={labels.pagination}>
      <span>{start}-{end} / {total}</span>
      <div className="list-pager-actions">
        <button className="btn secondary" type="button" onClick={() => onPageChange(safePage - 1)} disabled={safePage <= 1} aria-label={labels.previous}>
          {'<'}
        </button>
        <strong>{safePage} / {totalPages}</strong>
        <button className="btn secondary" type="button" onClick={() => onPageChange(safePage + 1)} disabled={safePage >= totalPages} aria-label={labels.next}>
          {'>'}
        </button>
      </div>
    </div>
  );
}
