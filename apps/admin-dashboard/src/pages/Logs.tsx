import { useTranslation } from 'react-i18next';
import { useFormat } from '@masar/ui';
import { DataTable, FilterBar, PageHeader, type Column } from '../components/DataTable';
import { usePaged } from '../lib/hooks';

interface Log {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
  admin: { firstName: string; lastName: string; adminRole: string | null };
}

export function LogsPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const list = usePaged<Log>('/admin/logs', {}, 30);
  const cols: Column<Log>[] = [
    {
      key: 'w',
      header: t('logs.when'),
      cell: (l) => <span className="whitespace-nowrap text-xs text-muted">{f.dateTime(l.createdAt)}</span>,
    },
    {
      key: 'a',
      header: t('logs.admin'),
      cell: (l) => (
        <span>
          {l.admin.firstName} {l.admin.lastName}{' '}
          <span className="text-xs text-muted">· {l.admin.adminRole?.toLowerCase()}</span>
        </span>
      ),
    },
    {
      key: 'ac',
      header: t('logs.action'),
      cell: (l) => <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs">{l.action}</span>,
    },
    {
      key: 'e',
      header: t('logs.entity'),
      cell: (l) => (
        <span className="text-xs">
          {l.entityType}
          {l.entityId ? ` · ${l.entityId.slice(0, 10)}…` : ''}
        </span>
      ),
    },
    {
      key: 'm',
      header: '',
      cell: (l) =>
        l.metadata ? (
          <code className="block max-w-96 truncate text-xs text-muted">{JSON.stringify(l.metadata)}</code>
        ) : null,
    },
    { key: 'ip', header: 'IP', cell: (l) => <span className="text-xs text-muted">{l.ip}</span> },
  ];
  return (
    <div>
      <PageHeader title={t('logs.title')} />
      <FilterBar onSearch={(v) => list.setFilter('q', v)} />
      <DataTable
        columns={cols}
        rows={list.data?.items}
        loading={list.isLoading}
        page={list.page}
        totalPages={list.data?.totalPages}
        total={list.data?.total}
        onPage={list.setPage}
      />
    </div>
  );
}
