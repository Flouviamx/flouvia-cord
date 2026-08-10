export const OPS_PAGE_SIZE = 50;

export function parseOpsPage(value: string | null): number {
  const parsed = Number.parseInt(value || '1', 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(parsed, 1), 100_000);
}

export function opsPageOffset(page: number, pageSize = OPS_PAGE_SIZE): number {
  return (page - 1) * pageSize;
}

export function normalizeOpsSearch(value: string | null): string {
  return (value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
}
