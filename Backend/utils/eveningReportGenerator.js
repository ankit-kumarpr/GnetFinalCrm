const Client = require("../models/Client");
const ClientEveningReport = require("../models/ClientEveningReport");
const SoftwareSetting = require("../models/SoftwareSetting");
const { loadPlansWithDaySlots } = require("./dayWorkSlots");
const { startOfDay } = require("./workPlanSchedule");
const { notify } = require("./notify");

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, "0");

const istParts = (date = new Date()) => {
    const ist = new Date(date.getTime() + IST_OFFSET_MS);
    return {
        y: ist.getUTCFullYear(),
        m: ist.getUTCMonth() + 1,
        d: ist.getUTCDate(),
        hh: ist.getUTCHours(),
        mm: ist.getUTCMinutes(),
        dateKey: `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`,
        minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
    };
};

const parseTimeToMinutes = (value) => {
    const text = String(value || "18:30").trim();
    const match = /^(\d{1,2}):(\d{2})$/.exec(text);
    if (!match) return 18 * 60 + 30;
    const hh = Math.min(23, Math.max(0, Number(match[1])));
    const mm = Math.min(59, Math.max(0, Number(match[2])));
    return hh * 60 + mm;
};

const buildItemsFromPlans = (plans) => {
    const items = [];
    const contributorIds = new Set();

    for (const plan of plans) {
        const serviceName = plan.service?.name || "";
        const projectName = plan.project?.name || "";
        const serviceId = plan.service?._id || plan.service || null;
        const projectId = plan.project?._id || plan.project || null;
        if (plan.reportingManager) {
            const rm = plan.reportingManager._id || plan.reportingManager;
            if (rm) contributorIds.add(String(rm));
        }
        for (const id of plan.assignees || []) {
            if (id) contributorIds.add(String(id._id || id));
        }
        for (const slot of plan.slots || []) {
            const assigneeId = slot.assignee?._id || slot.assignee || null;
            if (assigneeId) contributorIds.add(String(assigneeId));
            items.push({
                planId: plan._id,
                projectId,
                projectName,
                serviceId,
                serviceName,
                slotId: String(slot._id || ""),
                label: slot.label || "",
                kind: slot.kind || "",
                status: slot.status || "PENDING",
                note: slot.note || "",
                assigneeId,
                assigneeName: slot.assignee?.name || "",
            });
        }
    }

    items.sort((a, b) => {
        const s = String(a.serviceName).localeCompare(String(b.serviceName));
        if (s) return s;
        return String(a.label).localeCompare(String(b.label));
    });

    return { items, contributorIds: [...contributorIds] };
};

/**
 * Build/refresh DRAFT evening reports for a calendar day from work-plan slots.
 * Does not overwrite LOCKED or APPROVED reports.
 */
const generateEveningReportsForDate = async (day = new Date(), { notifyOnCreate = false } = {}) => {
    const dayStart = startOfDay(day);
    const { plans } = await loadPlansWithDaySlots(dayStart, dayStart);

    const byClient = new Map();
    for (const plan of plans) {
        const clientId = String(plan.client?._id || plan.client || "");
        if (!clientId) continue;
        if (!byClient.has(clientId)) byClient.set(clientId, []);
        byClient.get(clientId).push(plan);
    }

    let created = 0;
    let updated = 0;
    const touched = [];

    for (const [clientId, clientPlans] of byClient.entries()) {
        const client = await Client.findById(clientId).select("name reportingManager").lean();
        if (!client) continue;

        const { items, contributorIds } = buildItemsFromPlans(clientPlans);
        if (!items.length) continue;

        const existing = await ClientEveningReport.findOne({ client: clientId, date: dayStart });
        if (existing && existing.status !== "DRAFT") {
            continue;
        }

        const rmId = client.reportingManager || clientPlans[0]?.reportingManager?._id || clientPlans[0]?.reportingManager || null;
        const contributors = [...new Set([
            ...contributorIds,
            ...(rmId ? [String(rmId)] : []),
        ])].filter(Boolean);

        if (!existing) {
            const row = await ClientEveningReport.create({
                client: clientId,
                date: dayStart,
                status: "DRAFT",
                items,
                notes: "",
                reportingManager: rmId,
                contributors,
                generatedAt: new Date(),
            });
            created += 1;
            touched.push(row);
            if (notifyOnCreate) {
                await notify({
                    type: "EVENING_REPORT",
                    title: `Evening report ready: ${client.name}`,
                    body: `${items.length} work item${items.length === 1 ? "" : "s"} for today — review & lock`,
                    href: `/dashboard/evening-reports/${row._id}`,
                    extraUserIds: contributors,
                });
            }
        } else {
            existing.items = items;
            existing.contributors = contributors;
            if (rmId) existing.reportingManager = rmId;
            existing.generatedAt = new Date();
            await existing.save();
            updated += 1;
            touched.push(existing);
        }
    }

    return { created, updated, totalClients: byClient.size, reports: touched };
};

const loadEveningSettings = async () => {
    let setting = await SoftwareSetting.findOne({ key: "software" });
    if (!setting) setting = await SoftwareSetting.create({ key: "software" });
    return setting;
};

/**
 * Hourly tick: if IST time passed configured evening time and not yet run today, generate.
 */
const runEveningReportJobIfDue = async () => {
    const setting = await loadEveningSettings();
    if (setting.eveningReportEnabled === false) {
        return { skipped: true, reason: "disabled" };
    }

    const now = istParts();
    const target = parseTimeToMinutes(setting.eveningReportTime || "18:30");
    if (now.minutes < target) {
        return { skipped: true, reason: "before-time", now: now.dateKey, target: setting.eveningReportTime };
    }
    if (setting.lastEveningReportRunDate === now.dateKey) {
        return { skipped: true, reason: "already-ran", date: now.dateKey };
    }

    const result = await generateEveningReportsForDate(new Date(), { notifyOnCreate: true });
    setting.lastEveningReportRunDate = now.dateKey;
    await setting.save();
    return { skipped: false, date: now.dateKey, ...result };
};

const startEveningReportJob = () => {
    const tick = async () => {
        try {
            const result = await runEveningReportJobIfDue();
            if (!result.skipped) {
                console.log(
                    `[evening-reports] ${result.date}: created ${result.created}, updated ${result.updated}`,
                );
            }
        } catch (error) {
            console.error("[evening-reports] failed:", error.message);
        }
    };

    setTimeout(tick, 25_000).unref?.();
    setInterval(tick, 15 * 60 * 1000).unref?.();
};

module.exports = {
    generateEveningReportsForDate,
    runEveningReportJobIfDue,
    startEveningReportJob,
    istParts,
    parseTimeToMinutes,
};
