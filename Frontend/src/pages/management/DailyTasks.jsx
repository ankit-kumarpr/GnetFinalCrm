import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { EmployeeSelect } from "../../components/ui/EmployeeSelect";
import api from "../../services/api";
import { useTaskAlerts } from "../../context/TaskAlertContext";
import { cn } from "../../utils/cn";

const selectClass = "h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-600";

const todayInput = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const shiftDate = (value, days) => {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

const monthRange = () => {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
};

const dayTitle = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const statusPill = (status) => {
  if (status === "DONE") return "bg-emerald-100 text-emerald-800";
  if (status === "PARTIAL") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-700";
};

const statusText = (status) => {
  if (status === "DONE") return "Done";
  if (status === "PARTIAL") return "Partial";
  return "Pending";
};

export function DailyTasks() {
  const { refreshAlerts } = useTaskAlerts();
  const [date, setDate] = useState(todayInput());
  const [assignee, setAssignee] = useState("");
  const [groups, setGroups] = useState([]);
  const [counts, setCounts] = useState({ PENDING: 0, PARTIAL: 0, DONE: 0, ALL: 0 });
  const [averagePercent, setAveragePercent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reportFrom, setReportFrom] = useState(todayInput());
  const [reportTo, setReportTo] = useState(todayInput());
  const [reportAssignee, setReportAssignee] = useState("");
  const [downloading, setDownloading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get("/admin/work-plans/daily", {
        params: { date, assignee: assignee || undefined },
      });
      const data = res.data.data || {};
      setGroups(data.groups || []);
      setCounts(data.counts || { PENDING: 0, PARTIAL: 0, DONE: 0, ALL: 0 });
      setAveragePercent(data.averagePercent || 0);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load daily work");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [date, assignee]);

  const markSlots = async (group, slots, status) => {
    const targets = (slots || []).filter((slot) => slot.status !== status);
    if (!targets.length) return;
    try {
      if (group.source === "URGENT") {
        await api.patch(`/admin/urgent-works/${group.urgentId}/status`, { status });
      } else {
        await Promise.all(
          targets.map((slot) => api.patch(`/admin/work-plans/${group.planId}/slots/${slot._id}`, { status })),
        );
      }
      await load();
      refreshAlerts();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update");
    }
  };

  const markOne = async (group, slots) => {
    const next = (slots || []).find((slot) => slot.status !== "DONE");
    if (!next) return;
    await markSlots(group, [next], "DONE");
  };

  const downloadReport = async () => {
    if (!reportFrom || !reportTo) {
      toast.error("Select from and to date");
      return;
    }
    if (reportTo < reportFrom) {
      toast.error("To date cannot be before from date");
      return;
    }
    try {
      setDownloading(true);
      const empId = reportAssignee || undefined;
      const res = await api.get("/admin/work-plans/daily/export", {
        params: {
          from: reportFrom,
          to: reportTo,
          assignee: empId,
        },
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      const slug = empId ? String(empId).slice(-6) : "all";
      link.download = `work-report-${slug}-${reportFrom}_to_${reportTo}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(reportAssignee ? "Employee report ready" : "Report downloaded");
    } catch (error) {
      let message = "Download failed";
      const data = error.response?.data;
      if (data instanceof Blob) {
        try {
          message = JSON.parse(await data.text()).message || message;
        } catch {
          // keep default
        }
      } else if (error.response?.data?.message) {
        message = error.response.data.message;
      }
      toast.error(message);
    } finally {
      setDownloading(false);
    }
  };

  const setThisMonth = () => {
    const range = monthRange();
    setReportFrom(range.from);
    setReportTo(range.to);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Daily tasks</h1>
          <p className="mt-1 text-sm text-slate-500">
            Work plans + assigned urgent work for the selected date (EOD day). Mark done / pending here.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_220px_auto]">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Date</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              onClick={() => setDate((d) => shiftDate(d, -1))}
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <button
              type="button"
              className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              onClick={() => setDate((d) => shiftDate(d, 1))}
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <Button type="button" variant="outline" onClick={() => setDate(todayInput())}>Today</Button>
          </div>
          <p className="mt-2 text-sm font-medium text-slate-800">
            {dayTitle.format(new Date(`${date}T00:00:00`))}
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Employee</label>
          <EmployeeSelect
            value={assignee}
            onChange={setAssignee}
            placeholder="All visible"
            allowEmpty
          />
        </div>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">All {counts.ALL || 0}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">Pending {counts.PENDING || 0}</span>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-900">Partial {counts.PARTIAL || 0}</span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800">Done {counts.DONE || 0}</span>
          <span className="rounded-full bg-teal-100 px-2.5 py-1 font-medium text-teal-900">Avg {averagePercent}%</span>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Monthly / range report</p>
            <p className="text-xs text-slate-500">
              Employee filter + Excel with % complete, % pending, done/pending counts (Summary + Details sheets).
            </p>
          </div>
          <Button type="button" variant="outline" onClick={setThisMonth}>This month</Button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Employee</label>
            <EmployeeSelect
              value={reportAssignee}
              onChange={setReportAssignee}
              placeholder="All employees"
              allowEmpty
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">From</label>
            <Input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">To</label>
            <Input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={downloadReport} disabled={downloading} className="w-full">
              <Download className="mr-2 h-4 w-4" />
              {downloading ? "Downloading..." : "Download Excel"}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">Loading daily work...</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-500">
          Is din ke liye koi work plan ya urgent work nahi hai.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const isUrgent = group.source === "URGENT";
            return (
            <section
              key={group.key}
              className={cn(
                "rounded-xl border bg-white shadow-sm",
                isUrgent ? "border-rose-200" : "border-slate-200",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {isUrgent ? "Urgent work" : (group.client?.name || "Client")}
                    <span className="font-normal text-slate-500">
                      {" · "}
                      {isUrgent
                        ? (group.project?.name || "Project")
                        : (group.service?.name || "Service")}
                    </span>
                    {isUrgent ? (
                      <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-800">
                        {group.service?.name || "URGENT"}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500">
                    {!isUrgent && group.project?.name ? `Project: ${group.project.name} · ` : ""}
                    {isUrgent ? "Assigned by" : "Senior"}: {group.reportingManager?.name || "—"}
                    {" · "}
                    {group.done}/{group.total} items done
                  </p>
                </div>
                <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium", statusPill(group.status))}>
                  {statusText(group.status)}
                </span>
              </div>

              <div className="space-y-2 p-3">
                {(group.types || []).map((type) => {
                  const assigneeNames = [
                    ...new Set(
                      type.slots.flatMap((slot) => {
                        if (slot.assignees?.length) return slot.assignees.map((person) => person.name);
                        return slot.assignee?.name ? [slot.assignee.name] : [];
                      }).filter(Boolean),
                    ),
                  ];
                  const note = isUrgent ? (type.slots[0]?.note || "") : "";
                  return (
                  <div
                    key={type.key}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5",
                      isUrgent ? "border-rose-100 bg-rose-50/70" : "border-slate-100 bg-slate-50/80",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {isUrgent ? "Urgent task" : `${type.total} ${type.label}`}
                        {!isUrgent && (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            {type.done}/{type.total} done
                          </span>
                        )}
                      </p>
                      {note ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{note}</p>
                      ) : null}
                      <p className="text-xs text-slate-500">
                        {assigneeNames.join(", ") || "Unassigned"}
                        {type.status === "PARTIAL" ? ` · ${type.pending} pending` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", statusPill(type.status))}>
                        {statusText(type.status)}
                      </span>
                      {group.canEdit !== false && type.pending > 0 && (
                        <>
                          <button
                            type="button"
                            className="text-xs font-medium text-emerald-700 hover:underline"
                            onClick={() => markOne(group, type.slots)}
                          >
                            {isUrgent ? "Mark done" : "+1 done"}
                          </button>
                          {!isUrgent && type.pending > 1 && (
                            <button
                              type="button"
                              className="text-xs font-medium text-emerald-700 hover:underline"
                              onClick={() => markSlots(group, type.slots, "DONE")}
                            >
                              All done
                            </button>
                          )}
                        </>
                      )}
                      {group.canEdit !== false && type.done > 0 && (
                        <button
                          type="button"
                          className="text-xs font-medium text-slate-500 hover:underline"
                          onClick={() => markSlots(group, type.slots, "PENDING")}
                        >
                          {isUrgent ? "Mark pending" : "Undo"}
                        </button>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
