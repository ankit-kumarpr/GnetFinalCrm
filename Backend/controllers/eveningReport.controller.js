const mongoose = require("mongoose");
const ClientEveningReport = require("../models/ClientEveningReport");
const Client = require("../models/Client");
const SoftwareSetting = require("../models/SoftwareSetting");
const { generateEveningReportsForDate, istParts } = require("../utils/eveningReportGenerator");
const { startOfDay } = require("../utils/workPlanSchedule");
const { notify } = require("../utils/notify");

const fail = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    throw error;
};

const isAdmin = (user) => user?.userType === "ADMIN";
const isClient = (req) => req.authKind === "CLIENT" || req.user?.userType === "CLIENT";

const idOf = (value) => String(value?._id || value || "");

const dayStartFromInput = (value) => {
    if (!value) {
        return startOfDay(new Date());
    }
    const text = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) fail("Date must be YYYY-MM-DD");
    return startOfDay(text);
};

const parsePagination = (page, limit) => {
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    return { pageNum, limitNum, skip: (pageNum - 1) * limitNum };
};

const canViewStaff = (report, user) => {
    if (isAdmin(user)) return true;
    const uid = String(user._id);
    if (idOf(report.reportingManager) === uid) return true;
    return (report.contributors || []).some((id) => idOf(id) === uid);
};

const canEditDraft = (report, user) => {
    if (report.status !== "DRAFT") return false;
    return canViewStaff(report, user);
};

const canLock = (report, user) => {
    if (report.status !== "DRAFT") return false;
    if (isAdmin(user)) return true;
    const uid = String(user._id);
    return (report.contributors || []).some((id) => idOf(id) === uid)
        || idOf(report.reportingManager) === uid;
};

const canApprove = (report, user) => {
    if (report.status !== "LOCKED") return false;
    if (isAdmin(user)) return true;
    return idOf(report.reportingManager) === String(user._id);
};

const canFeedback = (report, user, req) => {
    if (isClient(req)) {
        return report.status === "APPROVED" && idOf(report.client) === String(user._id);
    }
    return canViewStaff(report, user);
};

const present = (row, user, req) => {
    const clientUser = isClient(req);
    return {
        _id: row._id,
        client: row.client && row.client._id
            ? { _id: row.client._id, name: row.client.name, clientId: row.client.clientId }
            : row.client,
        date: row.date,
        status: row.status,
        items: row.items || [],
        notes: row.notes || "",
        reportingManager: row.reportingManager && row.reportingManager._id
            ? { _id: row.reportingManager._id, name: row.reportingManager.name }
            : row.reportingManager,
        contributors: row.contributors || [],
        generatedAt: row.generatedAt,
        lockedAt: row.lockedAt,
        lockedBy: row.lockedBy && row.lockedBy._id
            ? { _id: row.lockedBy._id, name: row.lockedBy.name }
            : row.lockedBy,
        approvedAt: row.approvedAt,
        approvedBy: row.approvedBy && row.approvedBy._id
            ? { _id: row.approvedBy._id, name: row.approvedBy.name }
            : row.approvedBy,
        feedback: (row.feedback || []).map((f) => ({
            _id: f._id,
            body: f.body,
            authorName: f.authorName,
            authorKind: f.authorKind,
            createdAt: f.createdAt,
        })),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        canEdit: clientUser ? false : canEditDraft(row, user),
        canLock: clientUser ? false : canLock(row, user),
        canApprove: clientUser ? false : canApprove(row, user),
        canFeedback: canFeedback(row, user, req),
    };
};

const withPeople = (query) => query
    .populate("client", "name clientId")
    .populate("reportingManager", "name")
    .populate("lockedBy", "name")
    .populate("approvedBy", "name")
    .populate("contributors", "name");

const listEveningReports = async (req, res, next) => {
    try {
        if (isClient(req)) {
            return res.status(403).json({ success: false, message: "Use client evening-report routes" });
        }
        const { page = 1, limit = 20, date, status, clientId } = req.query;
        const { pageNum, limitNum, skip } = parsePagination(page, limit);
        const filter = {};
        if (date) filter.date = dayStartFromInput(date);
        if (status) filter.status = String(status).toUpperCase();
        if (clientId && mongoose.Types.ObjectId.isValid(clientId)) filter.client = clientId;

        if (!isAdmin(req.user)) {
            const uid = req.user._id;
            filter.$or = [
                { reportingManager: uid },
                { contributors: uid },
            ];
        }

        const [total, rows] = await Promise.all([
            ClientEveningReport.countDocuments(filter),
            withPeople(ClientEveningReport.find(filter))
                .sort({ date: -1, updatedAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
        ]);

        res.status(200).json({
            success: true,
            data: rows.map((row) => present(row, req.user, req)),
            pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum) || 1, limit: limitNum },
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
    }
};

const listTodayApproved = async (req, res, next) => {
    try {
        if (!isAdmin(req.user) && req.user?.userType !== "EMPLOYEE") {
            return res.status(403).json({ success: false, message: "Not allowed" });
        }
        const day = dayStartFromInput(req.query.date || istParts().dateKey);
        const filter = { date: day, status: "APPROVED" };
        if (!isAdmin(req.user)) {
            filter.$or = [
                { reportingManager: req.user._id },
                { contributors: req.user._id },
            ];
        }
        const rows = await withPeople(ClientEveningReport.find(filter)).sort({ approvedAt: -1 }).lean();
        res.status(200).json({
            success: true,
            date: day,
            data: rows.map((row) => present(row, req.user, req)),
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
    }
};

const getEveningReport = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid report id" });
        }
        const row = await withPeople(ClientEveningReport.findById(req.params.id)).lean();
        if (!row) return res.status(404).json({ success: false, message: "Report not found" });

        if (isClient(req)) {
            if (idOf(row.client) !== String(req.user._id) || row.status !== "APPROVED") {
                return res.status(404).json({ success: false, message: "Report not found" });
            }
        } else if (!canViewStaff(row, req.user)) {
            return res.status(403).json({ success: false, message: "You cannot open this report" });
        }

        res.status(200).json({ success: true, data: present(row, req.user, req) });
    } catch (error) {
        next(error);
    }
};

const updateEveningReport = async (req, res, next) => {
    try {
        if (isClient(req)) return res.status(403).json({ success: false, message: "Clients cannot edit reports" });
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid report id" });
        }
        const row = await ClientEveningReport.findById(req.params.id);
        if (!row) return res.status(404).json({ success: false, message: "Report not found" });
        if (!canEditDraft(row, req.user)) {
            return res.status(403).json({ success: false, message: "Only draft reports can be edited by assignees / RM / admin" });
        }

        if (Object.prototype.hasOwnProperty.call(req.body || {}, "notes")) {
            const notes = String(req.body.notes || "").trim();
            if (notes.length > 10000) fail("Notes too long");
            row.notes = notes;
        }

        if (Array.isArray(req.body?.items)) {
            row.items = (req.body.items || []).map((item) => ({
                planId: item.planId || null,
                projectId: item.projectId || null,
                projectName: String(item.projectName || "").slice(0, 120),
                serviceId: item.serviceId || null,
                serviceName: String(item.serviceName || "").slice(0, 120),
                slotId: String(item.slotId || ""),
                label: String(item.label || "").slice(0, 120),
                kind: String(item.kind || "").slice(0, 40),
                status: String(item.status || "PENDING").slice(0, 20),
                note: String(item.note || "").slice(0, 500),
                assigneeId: item.assigneeId || null,
                assigneeName: String(item.assigneeName || "").slice(0, 120),
            }));
        }

        await row.save();
        const data = await withPeople(ClientEveningReport.findById(row._id)).lean();
        res.status(200).json({ success: true, data: present(data, req.user, req) });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
    }
};

const lockEveningReport = async (req, res, next) => {
    try {
        if (isClient(req)) return res.status(403).json({ success: false, message: "Not allowed" });
        const row = await ClientEveningReport.findById(req.params.id);
        if (!row) return res.status(404).json({ success: false, message: "Report not found" });
        if (!canLock(row, req.user)) {
            return res.status(403).json({ success: false, message: "Cannot lock this report" });
        }
        row.status = "LOCKED";
        row.lockedAt = new Date();
        row.lockedBy = req.user._id;
        await row.save();

        const client = await Client.findById(row.client).select("name").lean();
        await notify({
            type: "EVENING_REPORT",
            title: `Report locked for approval: ${client?.name || "Client"}`,
            body: `${req.user.name || "Employee"} locked today's evening report`,
            href: `/dashboard/evening-reports/${row._id}`,
            actorId: req.user._id,
            extraUserIds: [row.reportingManager].filter(Boolean),
        });

        const data = await withPeople(ClientEveningReport.findById(row._id)).lean();
        res.status(200).json({ success: true, message: "Report locked — waiting for RM/admin approval", data: present(data, req.user, req) });
    } catch (error) {
        next(error);
    }
};

const approveEveningReport = async (req, res, next) => {
    try {
        if (isClient(req)) return res.status(403).json({ success: false, message: "Not allowed" });
        const row = await ClientEveningReport.findById(req.params.id);
        if (!row) return res.status(404).json({ success: false, message: "Report not found" });
        if (!canApprove(row, req.user)) {
            return res.status(403).json({ success: false, message: "Only RM or admin can approve a locked report" });
        }
        row.status = "APPROVED";
        row.approvedAt = new Date();
        row.approvedBy = req.user._id;
        await row.save();

        const client = await Client.findById(row.client).select("name").lean();
        await notify({
            type: "EVENING_REPORT",
            title: `Evening report approved: ${client?.name || "Client"}`,
            body: "Visible to client now · also on Today's reports",
            href: `/dashboard/evening-reports/today`,
            actorId: req.user._id,
            extraUserIds: row.contributors || [],
        });

        const data = await withPeople(ClientEveningReport.findById(row._id)).lean();
        res.status(200).json({ success: true, message: "Approved — client can view this report", data: present(data, req.user, req) });
    } catch (error) {
        next(error);
    }
};

const unlockEveningReport = async (req, res, next) => {
    try {
        if (isClient(req)) return res.status(403).json({ success: false, message: "Not allowed" });
        const row = await ClientEveningReport.findById(req.params.id);
        if (!row) return res.status(404).json({ success: false, message: "Report not found" });
        if (row.status !== "LOCKED") fail("Only locked reports can be sent back to draft");
        if (!isAdmin(req.user) && idOf(row.reportingManager) !== String(req.user._id)) {
            return res.status(403).json({ success: false, message: "Only RM or admin can unlock" });
        }
        row.status = "DRAFT";
        row.lockedAt = null;
        row.lockedBy = null;
        await row.save();
        const data = await withPeople(ClientEveningReport.findById(row._id)).lean();
        res.status(200).json({ success: true, message: "Sent back to draft", data: present(data, req.user, req) });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
    }
};

const addEveningFeedback = async (req, res, next) => {
    try {
        const row = await ClientEveningReport.findById(req.params.id);
        if (!row) return res.status(404).json({ success: false, message: "Report not found" });
        if (!canFeedback(row, req.user, req)) {
            return res.status(403).json({ success: false, message: "You cannot comment on this report" });
        }
        const body = String(req.body?.body || "").trim();
        if (!body) fail("Feedback is required");
        if (body.length > 2000) fail("Feedback too long");

        let authorKind = "EMPLOYEE";
        if (isClient(req)) authorKind = "CLIENT";
        else if (isAdmin(req.user)) authorKind = "ADMIN";

        row.feedback.push({
            body,
            author: req.user._id,
            authorName: req.user.name || "",
            authorKind,
        });
        await row.save();

        const data = await withPeople(ClientEveningReport.findById(row._id)).lean();
        res.status(201).json({ success: true, data: present(data, req.user, req) });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
    }
};

const generateNow = async (req, res, next) => {
    try {
        if (!isAdmin(req.user)) {
            return res.status(403).json({ success: false, message: "Only admin can run generation manually" });
        }
        const day = dayStartFromInput(req.body?.date || req.query?.date || istParts().dateKey);
        const result = await generateEveningReportsForDate(day, { notifyOnCreate: true });
        res.status(200).json({
            success: true,
            message: `Generated for ${day.toISOString().slice(0, 10)}: ${result.created} new, ${result.updated} refreshed`,
            data: result,
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
    }
};

const listClientEveningReports = async (req, res, next) => {
    try {
        if (!isClient(req)) return res.status(403).json({ success: false, message: "Clients only" });
        const { page = 1, limit = 20 } = req.query;
        const { pageNum, limitNum, skip } = parsePagination(page, limit);
        const filter = { client: req.user._id, status: "APPROVED" };
        const [total, rows] = await Promise.all([
            ClientEveningReport.countDocuments(filter),
            withPeople(ClientEveningReport.find(filter))
                .sort({ date: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
        ]);
        res.status(200).json({
            success: true,
            data: rows.map((row) => present(row, req.user, req)),
            pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum) || 1, limit: limitNum },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    listEveningReports,
    listTodayApproved,
    getEveningReport,
    updateEveningReport,
    lockEveningReport,
    approveEveningReport,
    unlockEveningReport,
    addEveningFeedback,
    generateNow,
    listClientEveningReports,
};
