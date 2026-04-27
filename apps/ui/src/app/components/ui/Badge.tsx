import { cn } from '../../lib/utils';

export type BadgeVariant =
  | 'default' | 'primary' | 'success' | 'warning' | 'danger'
  | 'indigo'  | 'teal'    | 'emerald' | 'rose'    | 'amber' | 'violet';

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-slate-100  text-slate-600  border-slate-200',
  primary: 'bg-teal-50    text-teal-700   border-teal-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50   text-amber-700  border-amber-200',
  danger:  'bg-rose-50    text-rose-700   border-rose-200',
  indigo:  'bg-indigo-50  text-indigo-700 border-indigo-200',
  teal:    'bg-teal-50    text-teal-700   border-teal-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rose:    'bg-rose-50    text-rose-700   border-rose-200',
  amber:   'bg-amber-50   text-amber-700  border-amber-200',
  violet:  'bg-violet-50  text-violet-700 border-violet-200',
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  size?: 'xs' | 'sm';
}

export function Badge({ variant = 'default', children, className, size = 'sm' }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-bold border rounded-full tracking-wide',
        size === 'xs' ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2.5 py-0.5',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeVariant> = {
    ACTIVE: 'warning', ONGOING: 'warning', RESOLVED: 'success',
    NORMAL: 'success', ABNORMAL: 'danger', BORDERLINE: 'warning',
  };
  return <Badge variant={map[status] ?? 'default'} size="xs">{status}</Badge>;
}
