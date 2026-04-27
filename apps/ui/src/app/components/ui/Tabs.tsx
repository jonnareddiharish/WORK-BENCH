import { cn } from '../../lib/utils';

interface Tab<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface TabsProps<T extends string> {
  tabs: Tab<T>[];
  active: T;
  onChange: (value: T) => void;
  className?: string;
}

export function Tabs<T extends string>({ tabs, active, onChange, className }: TabsProps<T>) {
  return (
    <div className={cn('flex bg-slate-100 p-1 rounded-xl gap-0.5', className)}>
      {tabs.map(tab => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all duration-150',
            active === tab.value
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {tab.label}
          {tab.count != null && (
            <span className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
              active === tab.value ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-500',
            )}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
