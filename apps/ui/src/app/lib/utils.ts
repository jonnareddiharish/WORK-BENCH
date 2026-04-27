export function formatDate(date: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleDateString('en-US', opts ?? { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateLong(date: string | Date): string {
  return formatDate(date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getDaysUntil(date: string): number {
  const due   = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export const CARD_PALETTE = [
  'bg-amber-50  border-amber-200  text-amber-900',
  'bg-sky-50    border-sky-200    text-sky-900',
  'bg-rose-50   border-rose-200   text-rose-900',
  'bg-emerald-50 border-emerald-200 text-emerald-900',
  'bg-violet-50 border-violet-200 text-violet-900',
] as const;
