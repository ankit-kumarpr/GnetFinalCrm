import { useEffect, useState } from "react";
import { Mail, Phone, UserRound, IdCard, Layers, ClipboardList, Video, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useBrand } from "../context/BrandContext";
import { ProfilePhotoEditor } from "../components/profile/ProfilePhotoEditor";
import { NotificationPrefsPanel } from "../components/notifications/NotificationPrefsPanel";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { cn } from "../utils/cn";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const whenLabel = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const meetStatusClass = (status) => {
  if (status === "APPROVED") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "PENDING") return "bg-amber-50 text-amber-800 border-amber-200";
  if (status === "REJECTED") return "bg-rose-50 text-rose-800 border-rose-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
};

export function ClientDashboard() {
  const { user, token, updateUser } = useAuth();
  const { brand } = useBrand();
  const [profile, setProfile] = useState(user);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [openReport, setOpenReport] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [savingFb, setSavingFb] = useState(false);
  const [meetings, setMeetings] = useState([]);
  const [meetForm, setMeetForm] = useState({ scheduledAt: "", agenda: "" });
  const [savingMeet, setSavingMeet] = useState(false);
  const [showMeetForm, setShowMeetForm] = useState(false);

  const loadMeetings = async () => {
    try {
      const res = await api.get("/auth/meetings", { params: { limit: 30 } });
      setMeetings(res.data.data || []);
    } catch {
      setMeetings([]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const [meRes, reportRes, meetRes] = await Promise.all([
          api.get("/auth/me"),
          api.get("/auth/evening-reports", { params: { limit: 20 } }).catch(() => ({ data: { data: [] } })),
          api.get("/auth/meetings", { params: { limit: 30 } }).catch(() => ({ data: { data: [] } })),
        ]);
        if (!cancelled) {
          setProfile(meRes.data.data);
          setReports(reportRes.data.data || []);
          setMeetings(meetRes.data.data || []);
        }
      } catch (error) {
        if (!cancelled) toast.error(error.response?.data?.message || "Could not load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (token) load();
    return () => { cancelled = true; };
  }, [token]);

  const postFeedback = async () => {
    if (!openReport || !feedback.trim()) return;
    try {
      setSavingFb(true);
      const res = await api.post(`/auth/evening-reports/${openReport._id}/feedback`, { body: feedback.trim() });
      setOpenReport(res.data.data);
      setFeedback("");
      toast.success("Feedback sent");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not send feedback");
    } finally {
      setSavingFb(false);
    }
  };

  const requestMeet = async (event) => {
    event.preventDefault();
    if (!meetForm.scheduledAt) return toast.error("Pick date & time");
    if (meetForm.agenda.trim().length < 5) return toast.error("Please add a short agenda");
    try {
      setSavingMeet(true);
      await api.post("/auth/meetings", {
        scheduledAt: new Date(meetForm.scheduledAt).toISOString(),
        agenda: meetForm.agenda.trim(),
      });
      toast.success("Meet request sent — waiting for approval");
      setMeetForm({ scheduledAt: "", agenda: "" });
      setShowMeetForm(false);
      await loadMeetings();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not send request");
    } finally {
      setSavingMeet(false);
    }
  };

  const cancelMeet = async (row) => {
    if (!window.confirm("Cancel this meet request?")) return;
    try {
      await api.post(`/auth/meetings/${row._id}/cancel`);
      toast.success("Request cancelled");
      await loadMeetings();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not cancel");
    }
  };

  if (loading && !profile) {
    return <div className="text-slate-500">Loading...</div>;
  }

  const manager = profile?.reportingManager;
  const services = profile?.services || [];
  const company = brand?.companyName || "your account";

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-4">
          <ProfilePhotoEditor
            name={profile?.name || ""}
            avatarUrl={profile?.avatar?.url || profile?.avatarUrl || ""}
            canEdit
            onUpdated={(url, avatar) => {
              setProfile((current) => current ? {
                ...current,
                avatarUrl: url,
                avatar: avatar || { url, publicId: current.avatar?.publicId || "" },
              } : current);
              updateUser({ avatarUrl: url, avatar: avatar || { url, publicId: "" } });
            }}
          />
          <div>
            <p className="text-sm text-slate-500">{greeting()}, {profile?.name?.split(" ")[0] || "there"}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Client dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Welcome to {company}. Tap the camera to update your photo.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Client ID</p>
            <IdCard className="h-4 w-4 text-emerald-700" />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{profile?.clientId || "—"}</p>
          <p className="mt-1 text-xs text-slate-500">Use this ID to sign in (password is the same)</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Contact</p>
            <Mail className="h-4 w-4 text-emerald-700" />
          </div>
          <p className="mt-3 text-lg font-semibold text-slate-900">{profile?.email || "—"}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
            <Phone className="h-3.5 w-3.5" />
            {profile?.phone || "—"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Services</p>
            <Layers className="h-4 w-4 text-emerald-700" />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{services.length}</p>
          <p className="mt-1 text-xs text-slate-500">Active services linked to your account</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Your reporting manager</h2>
          {manager?.name ? (
            <p className="mt-4 flex items-center gap-2 text-lg font-semibold text-emerald-900">
              <UserRound className="h-5 w-5" />
              {manager.name}
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Reporting manager will appear here once assigned.</p>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Your services</h2>
          {services.length ? (
            <ul className="mt-4 space-y-2">
              {services.map((service) => (
                <li
                  key={service._id || service}
                  className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                >
                  {service.name || service}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No services linked yet.</p>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-emerald-700" />
            <h2 className="text-sm font-semibold text-slate-900">Google Meet</h2>
          </div>
          <Button type="button" size="sm" onClick={() => setShowMeetForm((v) => !v)}>
            {showMeetForm ? "Close" : "Request Google Meet"}
          </Button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Request a meeting with time and agenda. After your manager or admin approves and adds a Meet link, Join Meet opens it in your browser.
        </p>

        {showMeetForm && (
          <form onSubmit={requestMeet} className="mt-4 space-y-3 rounded-lg border border-emerald-100 bg-emerald-50/40 p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Preferred date & time *</label>
              <Input
                type="datetime-local"
                value={meetForm.scheduledAt}
                onChange={(e) => setMeetForm((c) => ({ ...c, scheduledAt: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Agenda *</label>
              <textarea
                rows={3}
                value={meetForm.agenda}
                onChange={(e) => setMeetForm((c) => ({ ...c, agenda: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-600"
                placeholder="What would you like to discuss?"
                required
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={savingMeet}>{savingMeet ? "Sending..." : "Submit request"}</Button>
            </div>
          </form>
        )}

        {meetings.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No meetings yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {meetings.map((row) => (
              <li key={row._id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", meetStatusClass(row.status))}>
                        {row.status}
                      </span>
                      <span className="text-xs text-slate-500">
                        {row.origin === "CLIENT" ? "Your request" : "Scheduled by team"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-900">{whenLabel(row.scheduledAt)}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{row.agenda}</p>
                    {row.rejectReason ? (
                      <p className="mt-1 text-xs text-rose-600">Reason: {row.rejectReason}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {row.status === "APPROVED" && row.meetLink ? (
                      <a href={row.meetLink} target="_blank" rel="noreferrer">
                        <Button type="button" size="sm">
                          <ExternalLink className="mr-1 h-4 w-4" />
                          Join Meet
                        </Button>
                      </a>
                    ) : null}
                    {row.canCancel ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => cancelMeet(row)}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-emerald-700" />
          <h2 className="text-sm font-semibold text-slate-900">Approved daily reports</h2>
        </div>
        <p className="mt-1 text-xs text-slate-500">Reports appear here after your reporting manager or admin approves them.</p>
        {reports.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No approved reports yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {reports.map((row) => (
              <li key={row._id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-left text-sm hover:border-emerald-200 hover:bg-emerald-50/50"
                  onClick={() => setOpenReport(row)}
                >
                  <span className="font-medium text-slate-900">
                    {row.date ? new Date(row.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </span>
                  <span className="text-xs text-slate-500">{(row.items || []).length} tasks</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {openReport && (
          <div className="mt-4 space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                Report · {openReport.date ? new Date(openReport.date).toLocaleDateString("en-IN") : ""}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => setOpenReport(null)}>Close</Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-white bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Service</th>
                    <th className="px-3 py-2">Task</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(openReport.items || []).map((item, index) => (
                    <tr key={index} className="border-t border-slate-100">
                      <td className="px-3 py-2">{item.serviceName || "—"}</td>
                      <td className="px-3 py-2">{item.label || "—"}</td>
                      <td className="px-3 py-2">{item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {openReport.notes ? (
              <p className="whitespace-pre-wrap text-sm text-slate-700">{openReport.notes}</p>
            ) : null}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Feedback</p>
              {(openReport.feedback || []).map((f) => (
                <div key={f._id} className="rounded-md bg-white px-3 py-2 text-sm text-slate-700">
                  <span className="font-medium">{f.authorName || f.authorKind}: </span>{f.body}
                </div>
              ))}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Write feedback for the team..." />
                <Button type="button" onClick={postFeedback} disabled={savingFb}>{savingFb ? "Sending..." : "Send"}</Button>
              </div>
            </div>
          </div>
        )}
      </section>

      <NotificationPrefsPanel title="My notification preferences" />
    </div>
  );
}

export default ClientDashboard;