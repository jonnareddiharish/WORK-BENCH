import { cn } from '../../lib/utils';

interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = { xs: 'w-3 h-3 border-[1.5px]', sm: 'w-5 h-5 border-2', md: 'w-8 h-8 border-2', lg: 'w-12 h-12 border-[3px]' };

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <span
      className={cn('rounded-full border-slate-200 border-t-teal-500 animate-spin inline-block', sizeMap[size], className)}
      role="status"
      aria-label="Loading"
    />
  );
}

export function PageSpinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-slate-400">
      <Spinner size="lg" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('bg-white rounded-3xl border border-slate-100 p-6 space-y-3 animate-pulse', className)}>
      <div className="h-4 bg-slate-100 rounded-full w-1/3" />
      <div className="h-3 bg-slate-100 rounded-full w-full" />
      <div className="h-3 bg-slate-100 rounded-full w-4/5" />
      <div className="h-3 bg-slate-100 rounded-full w-2/3" />
    </div>
  );
}
