import { Copy, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CUSTOM_FIELD_TYPES, type CustomField, type WeeklySchedule } from '@bookly/shared';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Checkbox, Switch } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

const DAYS = [0, 1, 2, 3, 4, 5, 6];

export function normalizeSchedule(s?: WeeklySchedule): WeeklySchedule {
  return DAYS.map((day) => s?.find((d) => d.day === day) ?? { day, enabled: false, intervals: [] });
}

export function WeeklyScheduleEditor({ value, onChange }: { value: WeeklySchedule; onChange: (v: WeeklySchedule) => void }) {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const s = normalizeSchedule(value);
  const update = (day: number, patch: Partial<WeeklySchedule[number]>) => onChange(s.map((d) => (d.day === day ? { ...d, ...patch } : d)));
  return (
    <div className="divide-y rounded-2xl border">
      {s.map((d) => (
        <div key={d.day} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
          <label className="flex w-36 shrink-0 items-center gap-3 pt-2">
            <Switch
              checked={d.enabled}
              onCheckedChange={(c) => update(d.day, { enabled: c, intervals: c && !d.intervals.length ? [{ start: '09:00', end: '17:00' }] : d.intervals })}
              aria-label={tc(`days.${d.day}`)}
            />
            <span className="text-sm font-medium">{tc(`days.${d.day}`)}</span>
          </label>
          <div className="flex-1 space-y-2">
            {d.enabled ? (
              d.intervals.map((iv, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input type="time" value={iv.start} className="w-32" onChange={(e) => update(d.day, { intervals: d.intervals.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} aria-label="Start" />
                  <span className="text-muted-foreground">–</span>
                  <Input type="time" value={iv.end} className="w-32" onChange={(e) => update(d.day, { intervals: d.intervals.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} aria-label="End" />
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => update(d.day, { intervals: d.intervals.filter((_, j) => j !== i), enabled: d.intervals.length > 1 })} aria-label={tc('actions.remove')}><Trash2 /></Button>
                </div>
              ))
            ) : (
              <p className="pt-2 text-sm text-muted-foreground">{t('form.dayOff')}</p>
            )}
            {d.enabled && (
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => update(d.day, { intervals: [...d.intervals, { start: '18:00', end: '20:00' }] })}><Plus />{t('form.addInterval')}</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange(s.map((x) => ({ ...x, enabled: true, intervals: d.intervals.map((iv) => ({ ...iv })) })))}><Copy />{t('form.copyToAll')}</Button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CustomFieldsEditor({ value, onChange }: { value: CustomField[]; onChange: (v: CustomField[]) => void }) {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const set = (i: number, patch: Partial<CustomField>) => onChange(value.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="space-y-3">
      {value.map((f, i) => (
        <div key={i} className="grid gap-2 rounded-2xl border p-3 sm:grid-cols-6">
          <Input className="sm:col-span-2" placeholder={t('form.fieldLabelEn')} value={f.label.en} onChange={(e) => set(i, { label: { ...f.label, en: e.target.value }, key: f.key || e.target.value.replace(/[^a-zA-Z0-9]+(.)?/g, (_, c: string) => (c ? c.toUpperCase() : '')).replace(/^[^a-zA-Z]+/, '').replace(/^./, (c) => c.toLowerCase()).slice(0, 40) })} aria-label={t('form.fieldLabelEn')} />
          <Input className="sm:col-span-2" placeholder={t('form.fieldLabelAr')} dir="rtl" value={f.label.ar ?? ''} onChange={(e) => set(i, { label: { ...f.label, ar: e.target.value } })} aria-label={t('form.fieldLabelAr')} />
          <NativeSelect className="sm:col-span-2" value={f.type} onChange={(e) => set(i, { type: e.target.value as CustomField['type'] })} aria-label={t('form.fieldType')}>
            {CUSTOM_FIELD_TYPES.map((ty) => <option key={ty} value={ty}>{t(`form.types.${ty}`)}</option>)}
          </NativeSelect>
          <Input className="sm:col-span-2" placeholder={t('form.fieldKey')} dir="ltr" value={f.key} onChange={(e) => set(i, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })} aria-label={t('form.fieldKey')} />
          {f.type === 'select' ? (
            <Input className="sm:col-span-3" placeholder={t('form.fieldOptions')} value={(f.options ?? []).join(', ')} onChange={(e) => set(i, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} aria-label={t('form.fieldOptions')} />
          ) : <div className="hidden sm:col-span-3 sm:block" />}
          <div className="flex items-center justify-between gap-2 sm:col-span-1">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.required} onCheckedChange={(c) => set(i, { required: c === true })} />{t('form.fieldRequired')}</label>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={tc('actions.remove')}><Trash2 /></Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { key: '', label: { en: '', ar: '' }, type: 'text', required: false }])}><Plus />{t('form.addField')}</Button>
    </div>
  );
}

/** Toggleable chips for selecting ids from a list. */
export function ChipSelect<T extends { _id: string; name: string; color?: string }>({ items, value, onChange, empty }: { items: T[]; value: string[]; onChange: (v: string[]) => void; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty ?? '—'}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const on = value.includes(it._id);
        return (
          <button
            key={it._id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== it._id) : [...value, it._id])}
            className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors', on ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted')}
          >
            {it.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: it.color }} aria-hidden />}
            {it.name}
          </button>
        );
      })}
    </div>
  );
}

export function ColorInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border bg-transparent p-1" aria-label="Colour picker" />
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-32 font-mono" dir="ltr" maxLength={7} />
    </div>
  );
}
