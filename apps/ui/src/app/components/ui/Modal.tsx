import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  children: ReactNode;
  footer?: ReactNode;
  zIndex?: string;
}

const sizeMap = {
  sm:  'max-w-sm',
  md:  'max-w-md',
  lg:  'max-w-lg',
  xl:  'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
};

export function Modal({ open, onClose, title, description, size = 'md', children, footer, zIndex = 'z-50' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={cn('fixed inset-0 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm', zIndex)}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.96, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 8 }}
            transition={{ duration: 0.15 }}
            className={cn('bg-white rounded-3xl shadow-2xl w-full flex flex-col max-h-[90vh]', sizeMap[size])}
            role="dialog"
            aria-modal="true"
          >
            {(title || description) && (
              <div className="flex items-start justify-between px-7 pt-7 pb-5 border-b border-slate-100">
                <div>
                  {title && <h2 className="text-xl font-bold text-slate-900">{title}</h2>}
                  {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
                </div>
                <button onClick={onClose} className="p-2 -mt-1 -mr-1 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-7 py-6">
              {children}
            </div>

            {footer && (
              <div className="border-t border-slate-100 px-7 py-5 flex gap-3 flex-shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
