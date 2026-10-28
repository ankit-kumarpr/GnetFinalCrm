import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, CheckCircle2, Lock, MessageSquare, RefreshCw, Unlock } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Pager } from "../../components/ui/Pager";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { cn } from "../../utils/cn";

const selectClass = "h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-600";

const todayKey = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

const dateLabel = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const statusClass = (status) => {
  if (status === "APPROVED") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "LOCKED") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
};

function ReportDetail({ id, onBack }) {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/admin/evening-reports/${id}`);
      setRow(res.data.data);
      setNotes(res.data.data?.notes || "");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const saveNotes = async () => {
    try {
      setSaving(true);
      const res = await api.patch(`/admin/evening-reports/${id}`, { notes });
      setRow(res.data.data);
      toast.success("Notes saved");
    } catch (error) {
      toast.error(error.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const act = async (path, ok) => {
    try {
      setSaving(true);
      const res = await api.post(`/admin/evening-reports/${id}/${path}`);
      setRow(res.data.data);
      toast.success(res.data.message || ok);
    } catch (error) {
      toast.error(error.response?.data?.message || "Action failed");
    } finally {
      setSaving(false);
    }
  };

  const sendFeedback = async () => {
    if (!feedback.trim()) {
      toast.error("Write feedback first");
      return;
    }
    try {
      setSaving(true);
      const res = await api.post(`/admin/evening-reports/${id}/feedback`, { body: feedback.trim() });
      setRow(res.data.data);
      setFeedback("");
      toast.success("Feedback added");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not add feedback");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="rounded-xl border bg-white p-6 text-sm text-slate-500">Loading report...</p>;
  if (!row) return <p className="rounded-xl border bg-white p-6 text-sm text-slate-500">Report not found.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button type="button" variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{row.client?.name || "Client"}</h2>
            <p className="text-sm text-slate-500">{dateLabel(row.date)} · RM {row.reportingManager?.name || "—"}</p>
          </div>
        </div>
        <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", statusClass(row.status))}>{row.status}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {row.canEdit && (
          <Button type="button" onClick={saveNotes} disabled={saving}>{saving ? "Saving..." : "Save notes"}</Button>
        )}
        {row.canLock && (
          <Button type="button" variant="outline" onClick={() => act("lock", "Locked")} disabled={saving}>
            <Lock className="mr-2 h-4 w-4" /> Lock for approval
          </Button>
        )}
        {row.canApprove && (
          <Button type="button" onClick={() => act("approve", "Approved")} disabled={saving}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Approve (client visible)
          </Button>
        )}
        {row.status === "LOCKED" && (
          <Button type="button" variant="outline" onClick={() => act("unlock", "Unlocked")} disabled={saving}>
            <Unlock className="mr-2 h-4 w-4" /> Send back to draft
          </Button>
        )}
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Today&apos;s work (auto from work plans)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">Service</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">Task</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">Assignee</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(row.items || []).length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No work items.</td></tr>
              ) : row.items.map((item, index) => (
                <tr key={`${item.slotId}-${index}`}>
                  <td className="px-4 py-2 text-slate-800">{item.serviceName || "—"}</td>
                  <td className="px-4 py-2 text-slate-800">{item.label || "—"}</td>
                  <td className="px-4 py-2 text-slate-700">{item.assigneeName || "—"}</td>
                  <td className="px-4 py-2"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">{item.status}</span></td>
                  <td className="px-4 py-2 text-slate-600">{item.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Extra notes</h3>
        <textarea
          rows={4}
          value={notes}
          disabled={!row.canEdit || saving}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-slate-50"
          placeholder="Optional summary / highlights"
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <MessageSquare className="h-4 w-4" /> Feedback
        </h3>
        <ul className="space-y-2">
          {(row.feedback || []).length === 0 ? (
            <li className="text-sm text-slate-500">No feedback yet.</li>
          ) : row.feedback.map((f) => (
            <li key={f._id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
              <p className="font-medium text-slate-800">{f.authorName || f.authorKind} · {dateLabel(f.createdAt)}</p>
              <p className="mt-1 text-slate-700 whitespace-pre-wrap">{f.body}</p>
            </li>
          ))}
        </ul>
        {row.canFeedback && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Add feedback..." disabled={saving} />
            <Button type="button" onClick={sendFeedback} disabled={saving}>Post</Button>
          </div>
        )}
      </section>
    </div>
  );
}

export function EveningReports({ todayMode = false } = {}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.userType === "ADMIN";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayKey());
  const [status, setStatus] = useState(todayMode ? "APPROVED" : "");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      if (todayMode) {
        const res = await api.get("/admin/evening-reports/today", { params: { date } });
        setRows(res.data.data || []);
        setTotal((res.data.data || []).length);
        setPages(1);
      } else {
        const params = { page, limit, date };
        if (status) params.status = status;
        const res = await api.get("/admin/evening-reports", { params });
        setRows(res.data.data || []);
        setTotal(res.data.pagination?.total || 0);
        setPages(res.data.pagination?.pages || 1);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load evening reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (!id) load(); }, [id, date, status, page, limit, todayMode]);

  const generate = async () => {
    try {
      setGenerating(true);
      const res = await api.post("/admin/evening-reports/generate", { date });
      toast.success(res.data.message || "Generated");
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Generate failed");
    } finally {
      setGenerating(false);
    }
  };

  if (id) {
    return (
      <ReportDetail
        id={id}
        onBack={() => navigate(todayMode ? "/dashboard/evening-reports/today" : "/dashboard/evening-reports")}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {todayMode ? "Today's approved reports" : "Evening client reports"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Auto from work plans · employee lock · RM/admin approve · then client can see
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/dashboard/evening-reports">
            <Button type="button" variant={todayMode ? "outline" : "default"}>All reports</Button>
          </Link>
          <Link to="/dashboard/evening-reports/today">
            <Button type="button" variant={todayMode ? "default" : "outline"}>Today approved</Button>
          </Link>
          {isAdmin && (
            <Button type="button" variant="outline" onClick={generate} disabled={generating}>
              <RefreshCw className={cn("mr-2 h-4 w-4", generating && "animate-spin")} />
              {generating ? "Generating..." : "Generate now"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
          <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} />
        </div>
        {!todayMode && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
            <select className={selectClass} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All</option>
              <option value="DRAFT">Draft</option>
              <option value="LOCKED">Locked</option>
              <option value="APPROVED">Approved</option>
            </select>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Client</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Items</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No reports yet. Wait for evening job or click Generate now.</td></tr>
            ) : rows.map((row) => (
              <tr key={row._id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{row.client?.name || "—"}</td>
                <td className="px-4 py-3 text-slate-700">{dateLabel(row.date)}</td>
                <td className="px-4 py-3 text-slate-700">{(row.items || []).length}</td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", statusClass(row.status))}>{row.status}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button type="button" variant="outline" size="sm" onClick={() => navigate(`/dashboard/evening-reports/${row._id}`)}>
                    Open
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!todayMode && (
          <Pager page={page} pages={pages} limit={limit} total={total} onPage={setPage} onLimit={(size) => { setLimit(size); setPage(1); }} />
        )}
      </div>
    </div>
  );
}
