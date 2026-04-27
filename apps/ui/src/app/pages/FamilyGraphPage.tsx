import { useState, useEffect, useRef, useCallback } from 'react';
import { Share2, UserPlus, Link2, RefreshCw } from 'lucide-react';
import ForceGraph2D from 'react-force-graph-2d';
import { getFamilyGraph, linkUsers, getUsers } from '../lib/api';
import type { User } from '../types';

interface GraphNode {
  id: string;
  name: string;
  val?: number;
  color?: string;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  relationship?: string;
}

const NODE_COLORS = [
  '#14b8a6', '#8b5cf6', '#f43f5e', '#f59e0b', '#3b82f6',
  '#10b981', '#ec4899', '#6366f1',
];

export function FamilyGraphPage() {
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({ nodes: [], links: [] });
  const [users, setUsers]         = useState<User[]>([]);
  const [loading, setLoading]     = useState(true);
  const [linking, setLinking]     = useState(false);
  const [linkForm, setLinkForm]   = useState({ sourceId: '', targetId: '', relationship: 'SPOUSE' });
  const [showForm, setShowForm]   = useState(false);
  const graphRef = useRef<any>(null);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    try {
      const [graph, userList] = await Promise.all([getFamilyGraph(), getUsers()]);

      // Normalise: API may return _id instead of id; ForceGraph2D requires id
      const nodesWithColor = (graph.nodes as any[]).map((n: any, i: number) => ({
        ...n,
        id:    String(n.id ?? n._id ?? i),
        name:  n.name ?? n.label ?? String(n.id ?? n._id ?? i),
        color: NODE_COLORS[i % NODE_COLORS.length],
        val:   4,
      }));

      const nodeIds = new Set(nodesWithColor.map((n: any) => n.id));

      // Only keep links whose both endpoints exist in the node set
      const safeLinks = (graph.links as any[])
        .map((l: any) => ({
          source:       String(l.source ?? l.from ?? l.startNodeId ?? ''),
          target:       String(l.target ?? l.to   ?? l.endNodeId   ?? ''),
          relationship: l.relationship ?? l.type ?? '',
        }))
        .filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));

      setGraphData({ nodes: nodesWithColor, links: safeLinks });
      setUsers(userList);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkForm.sourceId || !linkForm.targetId) return;
    setLinking(true);
    try {
      await linkUsers(linkForm);
      setShowForm(false);
      setLinkForm({ sourceId: '', targetId: '', relationship: 'SPOUSE' });
      await fetchGraph();
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Family Tree</h2>
          <p className="text-sm text-slate-500 mt-1">Visualise relationships between family members</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchGraph}
            className="p-2.5 rounded-xl text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-bold rounded-2xl shadow-md shadow-teal-200 transition-all active:scale-95"
          >
            <Link2 className="w-4 h-4" />
            Link Members
          </button>
        </div>
      </div>

      {/* Link form */}
      {showForm && (
        <form onSubmit={handleLink} className="bg-white rounded-3xl border border-teal-100 shadow-sm p-5 grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">From</label>
            <select value={linkForm.sourceId} onChange={e => setLinkForm(f => ({ ...f, sourceId: e.target.value }))} required
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-2xl focus:ring-2 focus:ring-teal-300 focus:outline-none bg-white">
              <option value="">Select member…</option>
              {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">To</label>
            <select value={linkForm.targetId} onChange={e => setLinkForm(f => ({ ...f, targetId: e.target.value }))} required
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-2xl focus:ring-2 focus:ring-teal-300 focus:outline-none bg-white">
              <option value="">Select member…</option>
              {users.filter(u => u._id !== linkForm.sourceId).map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Relationship</label>
            <select value={linkForm.relationship} onChange={e => setLinkForm(f => ({ ...f, relationship: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-2xl focus:ring-2 focus:ring-teal-300 focus:outline-none bg-white">
              {['SPOUSE', 'PARENT', 'CHILD', 'SIBLING', 'GRANDPARENT', 'GRANDCHILD', 'UNCLE', 'AUNT', 'COUSIN'].map(r => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 text-sm font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={linking} className="flex-1 py-2.5 text-sm font-bold text-white bg-teal-500 hover:bg-teal-600 rounded-2xl shadow-sm disabled:opacity-50 transition-colors">
              {linking ? 'Linking…' : 'Link'}
            </button>
          </div>
        </form>
      )}

      {/* Graph canvas */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" style={{ height: 560 }}>
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
            <p className="text-sm text-slate-400 font-medium">Loading family graph…</p>
          </div>
        ) : graphData.nodes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8">
            <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center">
              <Share2 className="w-8 h-8 text-teal-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-700">No connections yet</h3>
            <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
              Add family members from the Dashboard and then link them here to visualise your family tree.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 mt-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-bold rounded-2xl shadow-md transition-all"
            >
              <UserPlus className="w-4 h-4" />
              Link Members
            </button>
          </div>
        ) : (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            width={undefined as any}
            height={560}
            nodeLabel={(node: any) => node.name}
            nodeColor={(node: any) => node.color ?? '#14b8a6'}
            nodeRelSize={6}
            linkLabel={(link: any) => link.relationship ?? ''}
            linkColor={() => '#cbd5e1'}
            linkWidth={2}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
              const label  = node.name as string;
              const size   = 8;
              const fontSize = Math.max(10 / globalScale, 3);

              ctx.beginPath();
              ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
              ctx.fillStyle = node.color ?? '#14b8a6';
              ctx.fill();
              ctx.strokeStyle = '#fff';
              ctx.lineWidth = 2 / globalScale;
              ctx.stroke();

              ctx.font = `bold ${fontSize}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = '#1e293b';
              ctx.fillText(label, node.x, node.y + size + 2 / globalScale);
            }}
            backgroundColor="#f8fafc"
            cooldownTicks={80}
            onEngineStop={() => graphRef.current?.zoomToFit(400, 60)}
          />
        )}
      </div>

      {/* Legend */}
      {graphData.nodes.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {graphData.nodes.map((node, i) => (
            <div key={node.id} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: node.color ?? NODE_COLORS[i % NODE_COLORS.length] }} />
              <span className="text-xs text-slate-600 font-medium">{node.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
