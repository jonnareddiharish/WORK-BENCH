import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { ChatPanel } from '../components/chat/ChatPanel';

export function AIChatPage() {
  const { userId = '' } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-4" style={{ height: 'calc(100vh - 10rem)' }}>
      <button
        onClick={() => navigate(`/dashboard/${userId}`)}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-indigo-600 transition-colors font-medium self-start"
      >
        <ChevronLeft className="w-4 h-4" /> Back to Profile
      </button>
      <ChatPanel userId={userId} className="flex-1" />
    </div>
  );
}
