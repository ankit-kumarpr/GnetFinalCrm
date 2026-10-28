import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";

const selectClass = "h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-600";

export const defaultQuantityPlan = () => ({
  mode: "QUANTITY",
  deliverables: [
    { key: "REEL", label: "Reel", quantity: 10 },
    { key: "POST", label: "Post", quantity: 5 },
    { key: "CAROUSEL", label: "Carousel", quantity: 5 },
  ],
  phases: [
    { key: "DESIGN", label: "Design", percent: 20 },
    { key: "DEVELOP", label: "Development", percent: 50 },
    { key: "CONTENT", label: "Content", percent: 15 },
    { key: "QA", label: "QA & launch", percent: 15 },
  ],
});

export const defaultPercentPlan = () => ({
  mode: "PERCENT",
  deliverables: defaultQuantityPlan().deliverables.map((row) => ({ ...row, quantity: 0 })),
  phases: defaultQuantityPlan().phases,
});

export const suggestPlanForService = (name = "") => {
  const text = String(name).toLowerCase();
  if (/seo|web|site|app|develop/.test(text)) return defaultPercentPlan();
  return defaultQuantityPlan();
};

export function ServiceWorkPlanEditor({ value, onChange, disabled, serviceName }) {
  const plan = value || suggestPlanForService(serviceName);

  const setMode = (mode) => onChange({ ...plan, mode });

  const updateRow = (listName, index, key, next) => {
    onChange({
      ...plan,
      [listName]: plan[listName].map((row, i) => (i === index ? { ...row, [key]: next } : row)),
    });
  };

  const addRow = (listName) => {
    if (listName === "deliverables") {
      onChange({
        ...plan,
        deliverables: [...(plan.deliverables || []), { key: "", label: "", quantity: 1 }],
      });
      return;
    }
    onChange({
      ...plan,
      phases: [...(plan.phases || []), { key: "", label: "", percent: 10 }],
    });
  };

  const removeRow = (listName, index) => {
    onChange({
      ...plan,
      [listName]: plan[listName].filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Work plan type *</label>
          <select className={selectClass} value={plan.mode} onChange={(e) => setMode(e.target.value)} disabled={disabled}>
            <option value="QUANTITY">Quantity (posts / reels / carousel…)</option>
            <option value="PERCENT">Percent (website / SEO / app…)</option>
          </select>
        </div>
        <p className="self-end text-xs text-slate-500 sm:pb-2">
          Deadline = project EOD. Sundays skip. Plan auto-splits across days for the assigned employee.
        </p>
      </div>

      {plan.mode === "QUANTITY" ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">Deliverables *</p>
            <Button type="button" variant="outline" onClick={() => addRow("deliverables")} disabled={disabled}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
          <div className="space-y-2">
            {(plan.deliverables || []).map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_100px_36px] gap-2">
                <Input
                  placeholder="e.g. Reel / Post / Carousel"
                  value={row.label}
                  onChange={(e) => updateRow("deliverables", index, "label", e.target.value)}
                  disabled={disabled}
                />
                <Input
                  type="number"
                  min={0}
                  value={row.quantity}
                  onChange={(e) => updateRow("deliverables", index, "quantity", e.target.value)}
                  disabled={disabled}
                />
                <button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => removeRow("deliverables", index)} disabled={disabled}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">Phases % *</p>
            <Button type="button" variant="outline" onClick={() => addRow("phases")} disabled={disabled}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
          <div className="space-y-2">
            {(plan.phases || []).map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_100px_36px] gap-2">
                <Input
                  placeholder="e.g. Design / Development"
                  value={row.label}
                  onChange={(e) => updateRow("phases", index, "label", e.target.value)}
                  disabled={disabled}
                />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={row.percent}
                  onChange={(e) => updateRow("phases", index, "percent", e.target.value)}
                  disabled={disabled}
                />
                <button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => removeRow("phases", index)} disabled={disabled}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
