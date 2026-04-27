import { FileText } from 'lucide-react';

export function ReportsPage() {
  return (
    <div className="max-w-4xl mx-auto py-24 flex flex-col items-center justify-center text-center gap-4">
      <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center">
        <FileText className="w-10 h-10 text-slate-300" />
      </div>
      <h2 className="text-2xl font-black text-slate-700">Reports</h2>
      <p className="text-slate-400 text-sm max-w-sm leading-relaxed">
        Aggregate health reports and analytics across all family members will appear here in a future update.
      </p>
    </div>
  );
}
