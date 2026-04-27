import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize    = 'xs' | 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary:   'bg-teal-500 text-white hover:bg-teal-600 shadow-sm shadow-teal-200 active:scale-[0.98]',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 active:scale-[0.98]',
  ghost:     'text-slate-600 hover:bg-slate-100 active:scale-[0.98]',
  danger:    'bg-rose-500 text-white hover:bg-rose-600 shadow-sm shadow-rose-200 active:scale-[0.98]',
  success:   'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-200 active:scale-[0.98]',
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'px-2.5 py-1.5 text-[11px] rounded-lg gap-1',
  sm: 'px-3.5 py-2   text-xs   rounded-xl gap-1.5',
  md: 'px-5   py-2.5 text-sm   rounded-xl gap-2',
  lg: 'px-6   py-3   text-base rounded-2xl gap-2',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, icon, iconRight, children, className, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : icon}
      {children}
      {!loading && iconRight}
    </button>
  )
);

Button.displayName = 'Button';
