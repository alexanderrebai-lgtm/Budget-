import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { useStore } from '../store/store';
import type { Category } from '../lib/types';

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Cap Budget`;
  }, [title]);
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'pos' | 'neg' }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className={`value ${tone ?? ''}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/** Champ numérique en euros ; accepte la virgule décimale. */
export function NumberField({
  label,
  value,
  onChange,
  hint,
  suffix = '€',
  step,
  min = 0,
}: {
  label: ReactNode;
  value: number;
  onChange: (n: number) => void;
  hint?: ReactNode;
  suffix?: string;
  step?: number;
  min?: number;
}) {
  const [text, setText] = useState(value ? String(value).replace('.', ',') : '');
  useEffect(() => {
    const parsed = Number(text.replace(/\s/g, '').replace(',', '.'));
    if ((Number.isFinite(parsed) ? parsed : 0) !== value) setText(value ? String(value).replace('.', ',') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-suffix">
        <input
          inputMode="decimal"
          style={suffix ? { paddingRight: 14 + suffix.length * 8 } : undefined}
          value={text}
          placeholder="0"
          step={step}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            const n = Number(t.replace(/\s/g, '').replace(',', '.'));
            if (t.trim() === '') onChange(0);
            else if (Number.isFinite(n)) onChange(Math.max(min, n));
          }}
        />
        {suffix && <span>{suffix}</span>}
      </div>
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const r = max > 0 ? value / max : 0;
  const cls = r > 1 ? 'over' : r > 0.85 ? 'near' : '';
  return (
    <div className={`progress ${cls}`} role="progressbar" aria-valuenow={Math.round(r * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${Math.min(100, r * 100)}%` }} />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <h3>{title}</h3>
      {children && <div className="muted" style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

export function useCategoryMap() {
  const categories = useStore((s) => s.categories);
  return useMemo(() => new Map<string, Category>(categories.map((c) => [c.id, c])), [categories]);
}

export function CategorySelect({ value, onChange, allowEmpty = true, kinds }: { value: string | null; onChange: (id: string | null) => void; allowEmpty?: boolean; kinds?: Category['kind'][] }) {
  const categories = useStore((s) => s.categories);
  const groups: [Category['kind'], string][] = [
    ['expense', 'Dépenses'],
    ['income', 'Revenus'],
    ['transfer', 'Épargne et virements'],
  ];
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label="Catégorie">
      {allowEmpty && <option value="">— À catégoriser —</option>}
      {groups
        .filter(([k]) => !kinds || kinds.includes(k))
        .map(([k, label]) => (
          <optgroup key={k} label={label}>
            {categories
              .filter((c) => c.kind === k)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
          </optgroup>
        ))}
    </select>
  );
}

/* Notifications éphémères */
const useToastStore = create<{ message: string | null; show: (m: string) => void }>((set) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    message: null,
    show: (message) => {
      clearTimeout(timer);
      set({ message });
      timer = setTimeout(() => set({ message: null }), 3200);
    },
  };
});
export const toast = (m: string) => useToastStore.getState().show(m);
export function Toaster() {
  const message = useToastStore((s) => s.message);
  return message ? <div className="toast" role="status">{message}</div> : null;
}

export function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string; format: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tt">
      {label && <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="row" style={{ gap: 6 }}>
          <span className="dot" style={{ background: p.color }} />
          <span className="muted">{p.name}</span>
          <span className="num" style={{ marginLeft: 'auto', paddingLeft: 12 }}>{format(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function download(filename: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
