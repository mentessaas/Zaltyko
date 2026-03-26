"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.revalidate = exports.dynamic = void 0;
exports.generateMetadata = generateMetadata;
exports.default = MyDashboard;
var headers_1 = require("next/headers");
var navigation_1 = require("next/navigation");
var drizzle_orm_1 = require("drizzle-orm");
var db_1 = require("@/db");
var schema_1 = require("@/db/schema");
var server_1 = require("@/lib/supabase/server");
var MyDashboardPage_1 = require("./MyDashboardPage");
exports.dynamic = "force-dynamic";
// Cache de 60 segundos para datos del dashboard personal
exports.revalidate = 60;
function generateMetadata(_a) {
    return __awaiter(this, arguments, void 0, function (_b) {
        var academy, name;
        var _c;
        var params = _b.params;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, db_1.db
                        .select({ name: schema_1.academies.name })
                        .from(schema_1.academies)
                        .where((0, drizzle_orm_1.eq)(schema_1.academies.id, params.academyId))
                        .limit(1)];
                case 1:
                    academy = (_d.sent())[0];
                    name = (_c = academy === null || academy === void 0 ? void 0 : academy.name) !== null && _c !== void 0 ? _c : "Academia";
                    return [2 /*return*/, {
                            title: "".concat(name, " \u00B7 Mi Dashboard"),
                            description: "Tu panel personal en ".concat(name, "."),
                        }];
            }
        });
    });
}
function MyDashboard(_a) {
    return __awaiter(this, arguments, void 0, function (_b) {
        var academyId, resolvedSearchParams, selectedAthleteId, cookieStore, supabase, user, profile, membership, allowedRoles, hasAccess, academy, athleteData, guardianAthletesList, athlete, groupName, groupColor, coachName, group, coach, guardian_1, athletesData, upcomingClasses, defaultParentAthleteId, targetAthleteId, selectedAthlete, enrollments, enrolledClassIds, athleteGroupMemberships, groupIds, classIds, groupClasses, today, nextWeek, todayStr, nextWeekStr, calendarSessions, sessions, calendarSessionsList, sessionsByDate_1, attendanceData, thirtyDaysAgo, thirtyDaysAgoStr, attendanceRecordsList, present, absent, excused, chargesData, chargesList, assessmentsData, assessmentsList, weeklySchedule, weeklyClasses;
        var _c, _d;
        var params = _b.params, searchParams = _b.searchParams;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    academyId = params.academyId;
                    return [4 /*yield*/, searchParams];
                case 1:
                    resolvedSearchParams = _e.sent();
                    selectedAthleteId = resolvedSearchParams === null || resolvedSearchParams === void 0 ? void 0 : resolvedSearchParams.athleteId;
                    return [4 /*yield*/, (0, headers_1.cookies)()];
                case 2:
                    cookieStore = _e.sent();
                    return [4 /*yield*/, (0, server_1.createClient)(cookieStore)];
                case 3:
                    supabase = _e.sent();
                    return [4 /*yield*/, supabase.auth.getUser()];
                case 4:
                    user = (_e.sent()).data.user;
                    if (!user) {
                        (0, navigation_1.redirect)("/auth/login");
                    }
                    return [4 /*yield*/, db_1.db
                            .select({
                            id: schema_1.profiles.id,
                            name: schema_1.profiles.name,
                            role: schema_1.profiles.role,
                            photoUrl: schema_1.profiles.photoUrl,
                            userId: schema_1.profiles.userId,
                        })
                            .from(schema_1.profiles)
                            .where((0, drizzle_orm_1.eq)(schema_1.profiles.userId, user.id))
                            .limit(1)];
                case 5:
                    profile = (_e.sent())[0];
                    if (!profile) {
                        (0, navigation_1.redirect)("/auth/login");
                    }
                    return [4 /*yield*/, db_1.db
                            .select({
                            role: schema_1.memberships.role,
                        })
                            .from(schema_1.memberships)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.memberships.userId, user.id), (0, drizzle_orm_1.eq)(schema_1.memberships.academyId, academyId)))
                            .limit(1)];
                case 6:
                    membership = (_e.sent())[0];
                    allowedRoles = new Set(["athlete", "parent"]);
                    hasAccess = profile.role === "athlete" || profile.role === "parent";
                    if (!hasAccess || !membership) {
                        // Redirigir según el rol del perfil
                        if (profile.role === "owner" || profile.role === "admin" || profile.role === "super_admin") {
                            (0, navigation_1.redirect)("/app/".concat(academyId, "/dashboard"));
                        }
                        (0, navigation_1.redirect)("/dashboard");
                    }
                    return [4 /*yield*/, db_1.db
                            .select({
                            id: schema_1.academies.id,
                            name: schema_1.academies.name,
                            country: schema_1.academies.country,
                            phone: schema_1.academies.contactPhone,
                        })
                            .from(schema_1.academies)
                            .where((0, drizzle_orm_1.eq)(schema_1.academies.id, academyId))
                            .limit(1)];
                case 7:
                    academy = (_e.sent())[0];
                    if (!academy) {
                        (0, navigation_1.redirect)("/dashboard");
                    }
                    athleteData = null;
                    guardianAthletesList = [];
                    if (!(profile.role === "athlete")) return [3 /*break*/, 13];
                    return [4 /*yield*/, db_1.db
                            .select({
                            id: schema_1.athletes.id,
                            name: schema_1.athletes.name,
                            level: schema_1.athletes.level,
                            groupId: schema_1.athletes.groupId,
                        })
                            .from(schema_1.athletes)
                            .where((0, drizzle_orm_1.eq)(schema_1.athletes.userId, user.id))
                            .limit(1)];
                case 8:
                    athlete = (_e.sent())[0];
                    if (!athlete) return [3 /*break*/, 12];
                    groupName = null;
                    groupColor = null;
                    coachName = null;
                    if (!athlete.groupId) return [3 /*break*/, 11];
                    return [4 /*yield*/, db_1.db
                            .select({
                            name: schema_1.groups.name,
                            color: schema_1.groups.color,
                            coachId: schema_1.groups.coachId,
                        })
                            .from(schema_1.groups)
                            .where((0, drizzle_orm_1.eq)(schema_1.groups.id, athlete.groupId))
                            .limit(1)];
                case 9:
                    group = (_e.sent())[0];
                    if (!group) return [3 /*break*/, 11];
                    groupName = group.name;
                    groupColor = group.color;
                    if (!group.coachId) return [3 /*break*/, 11];
                    return [4 /*yield*/, db_1.db
                            .select({ name: schema_1.profiles.name })
                            .from(schema_1.profiles)
                            .where((0, drizzle_orm_1.eq)(schema_1.profiles.id, group.coachId))
                            .limit(1)];
                case 10:
                    coach = (_e.sent())[0];
                    coachName = (_c = coach === null || coach === void 0 ? void 0 : coach.name) !== null && _c !== void 0 ? _c : null;
                    _e.label = 11;
                case 11:
                    athleteData = __assign(__assign({}, athlete), { groupName: groupName, groupColor: groupColor, coachName: coachName });
                    _e.label = 12;
                case 12: return [3 /*break*/, 16];
                case 13:
                    if (!(profile.role === "parent")) return [3 /*break*/, 16];
                    return [4 /*yield*/, db_1.db
                            .select({
                            id: schema_1.guardians.id,
                        })
                            .from(schema_1.guardians)
                            .where((0, drizzle_orm_1.eq)(schema_1.guardians.profileId, profile.id))
                            .limit(1)];
                case 14:
                    guardian_1 = (_e.sent())[0];
                    if (!guardian_1) return [3 /*break*/, 16];
                    return [4 /*yield*/, db_1.db
                            .select({
                            athleteId: schema_1.guardianAthletes.athleteId,
                            athleteName: schema_1.athletes.name,
                            athleteLevel: schema_1.athletes.level,
                            athleteGroupId: schema_1.athletes.groupId,
                            groupName: schema_1.groups.name,
                            groupColor: schema_1.groups.color,
                            coachName: schema_1.coaches.name,
                        })
                            .from(schema_1.guardianAthletes)
                            .leftJoin(schema_1.athletes, (0, drizzle_orm_1.eq)(schema_1.guardianAthletes.athleteId, schema_1.athletes.id))
                            .leftJoin(schema_1.groups, (0, drizzle_orm_1.eq)(schema_1.athletes.groupId, schema_1.groups.id))
                            .leftJoin(schema_1.coaches, (0, drizzle_orm_1.eq)(schema_1.groups.coachId, schema_1.coaches.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.guardianAthletes.guardianId, guardian_1.id))];
                case 15:
                    athletesData = _e.sent();
                    guardianAthletesList = athletesData.map(function (a) {
                        var _a, _b, _c, _d, _e, _f;
                        return ({
                            guardianId: guardian_1.id,
                            athleteId: a.athleteId,
                            athleteName: (_a = a.athleteName) !== null && _a !== void 0 ? _a : "Sin nombre",
                            athleteLevel: (_b = a.athleteLevel) !== null && _b !== void 0 ? _b : null,
                            athleteGroupId: (_c = a.athleteGroupId) !== null && _c !== void 0 ? _c : null,
                            athleteGroupName: (_d = a.groupName) !== null && _d !== void 0 ? _d : null,
                            athleteGroupColor: (_e = a.groupColor) !== null && _e !== void 0 ? _e : null,
                            athleteCoachName: (_f = a.coachName) !== null && _f !== void 0 ? _f : null,
                        });
                    });
                    _e.label = 16;
                case 16:
                    upcomingClasses = [];
                    defaultParentAthleteId = (_d = guardianAthletesList[0]) === null || _d === void 0 ? void 0 : _d.athleteId;
                    targetAthleteId = profile.role === "athlete"
                        ? athleteData === null || athleteData === void 0 ? void 0 : athleteData.id
                        : (selectedAthleteId && guardianAthletesList.some(function (a) { return a.athleteId === selectedAthleteId; })
                            ? selectedAthleteId
                            : defaultParentAthleteId);
                    // Para padres: crear un athleteData derivado del athlete seleccionado
                    // Esto se necesita para mostrar la info del athlete seleccionado en el header
                    if (profile.role === "parent" && targetAthleteId) {
                        selectedAthlete = guardianAthletesList.find(function (a) { return a.athleteId === targetAthleteId; });
                        if (selectedAthlete) {
                            athleteData = {
                                id: selectedAthlete.athleteId,
                                name: selectedAthlete.athleteName,
                                level: selectedAthlete.athleteLevel,
                                groupId: selectedAthlete.athleteGroupId,
                                groupName: selectedAthlete.athleteGroupName,
                                groupColor: selectedAthlete.athleteGroupColor,
                                coachName: selectedAthlete.athleteCoachName,
                            };
                        }
                    }
                    if (!targetAthleteId) return [3 /*break*/, 32];
                    return [4 /*yield*/, db_1.db
                            .select({ classId: schema_1.classEnrollments.classId })
                            .from(schema_1.classEnrollments)
                            .where((0, drizzle_orm_1.eq)(schema_1.classEnrollments.athleteId, targetAthleteId))];
                case 17:
                    enrollments = _e.sent();
                    enrolledClassIds = enrollments.map(function (e) { return e.classId; });
                    return [4 /*yield*/, db_1.db
                            .select({ groupId: schema_1.groupAthletes.groupId })
                            .from(schema_1.groupAthletes)
                            .where((0, drizzle_orm_1.eq)(schema_1.groupAthletes.athleteId, targetAthleteId))];
                case 18:
                    athleteGroupMemberships = _e.sent();
                    groupIds = athleteGroupMemberships.map(function (g) { return g.groupId; });
                    classIds = __spreadArray([], enrolledClassIds, true);
                    if (!(groupIds.length > 0)) return [3 /*break*/, 20];
                    return [4 /*yield*/, db_1.db
                            .select({ id: schema_1.classes.id })
                            .from(schema_1.classes)
                            .where((0, drizzle_orm_1.inArray)(schema_1.classes.groupId, groupIds))];
                case 19:
                    groupClasses = _e.sent();
                    classIds = __spreadArray([], new Set(__spreadArray(__spreadArray([], classIds, true), groupClasses.map(function (c) { return c.id; }), true)), true);
                    _e.label = 20;
                case 20:
                    today = new Date();
                    nextWeek = new Date(today);
                    nextWeek.setDate(nextWeek.getDate() + 7);
                    todayStr = today.toISOString().split("T")[0];
                    nextWeekStr = nextWeek.toISOString().split("T")[0];
                    calendarSessions = [];
                    if (!(classIds.length > 0)) return [3 /*break*/, 23];
                    return [4 /*yield*/, db_1.db
                            .select({
                            id: schema_1.classSessions.id,
                            classId: schema_1.classSessions.classId,
                            className: schema_1.classes.name,
                            sessionDate: schema_1.classSessions.sessionDate,
                            startTime: schema_1.classSessions.startTime,
                            endTime: schema_1.classSessions.endTime,
                            status: schema_1.classSessions.status,
                            groupName: schema_1.groups.name,
                            groupColor: schema_1.groups.color,
                            coachName: schema_1.coaches.name,
                        })
                            .from(schema_1.classSessions)
                            .leftJoin(schema_1.classes, (0, drizzle_orm_1.eq)(schema_1.classSessions.classId, schema_1.classes.id))
                            .leftJoin(schema_1.groups, (0, drizzle_orm_1.eq)(schema_1.classes.groupId, schema_1.groups.id))
                            .leftJoin(schema_1.coaches, (0, drizzle_orm_1.eq)(schema_1.classSessions.coachId, schema_1.coaches.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.classSessions.classId, classIds), (0, drizzle_orm_1.inArray)(schema_1.classSessions.status, ["scheduled", "in_progress"]), (0, drizzle_orm_1.eq)(schema_1.classSessions.sessionDate, todayStr) // Solo hoy para mostrar primero
                        ))
                            .orderBy(schema_1.classSessions.sessionDate, schema_1.classSessions.startTime)
                            .limit(10)];
                case 21:
                    sessions = _e.sent();
                    upcomingClasses = sessions.map(function (s) {
                        var _a;
                        return ({
                            id: s.id,
                            classId: s.classId,
                            className: (_a = s.className) !== null && _a !== void 0 ? _a : "Clase",
                            sessionDate: s.sessionDate,
                            startTime: s.startTime,
                            endTime: s.endTime,
                            groupName: s.groupName,
                            groupColor: s.groupColor,
                            coachName: s.coachName,
                            status: s.status,
                        });
                    });
                    return [4 /*yield*/, db_1.db
                            .select({
                            sessionDate: schema_1.classSessions.sessionDate,
                            id: schema_1.classSessions.id,
                            className: schema_1.classes.name,
                            startTime: schema_1.classSessions.startTime,
                            endTime: schema_1.classSessions.endTime,
                            groupName: schema_1.groups.name,
                            groupColor: schema_1.groups.color,
                        })
                            .from(schema_1.classSessions)
                            .leftJoin(schema_1.classes, (0, drizzle_orm_1.eq)(schema_1.classSessions.classId, schema_1.classes.id))
                            .leftJoin(schema_1.groups, (0, drizzle_orm_1.eq)(schema_1.classes.groupId, schema_1.groups.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.classSessions.classId, classIds), (0, drizzle_orm_1.inArray)(schema_1.classSessions.status, ["scheduled", "in_progress"]), (0, drizzle_orm_1.gte)(schema_1.classSessions.sessionDate, todayStr), (0, drizzle_orm_1.lte)(schema_1.classSessions.sessionDate, nextWeekStr)))
                            .orderBy(schema_1.classSessions.sessionDate, schema_1.classSessions.startTime)];
                case 22:
                    calendarSessionsList = _e.sent();
                    sessionsByDate_1 = new Map();
                    calendarSessionsList.forEach(function (session) {
                        var _a, _b;
                        var date = session.sessionDate;
                        if (!sessionsByDate_1.has(date)) {
                            sessionsByDate_1.set(date, []);
                        }
                        (_a = sessionsByDate_1.get(date)) === null || _a === void 0 ? void 0 : _a.push({
                            id: session.id,
                            className: (_b = session.className) !== null && _b !== void 0 ? _b : "Clase",
                            startTime: session.startTime,
                            endTime: session.endTime,
                            groupName: session.groupName,
                            groupColor: session.groupColor,
                        });
                    });
                    calendarSessions = Array.from(sessionsByDate_1.entries()).map(function (_a) {
                        var date = _a[0], sessions = _a[1];
                        return ({
                            date: date,
                            sessions: sessions,
                        });
                    });
                    _e.label = 23;
                case 23:
                    attendanceData = null;
                    if (!targetAthleteId) return [3 /*break*/, 25];
                    thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];
                    return [4 /*yield*/, db_1.db
                            .select({
                            id: schema_1.attendanceRecords.id,
                            status: schema_1.attendanceRecords.status,
                            recordedAt: schema_1.attendanceRecords.recordedAt,
                            sessionDate: schema_1.classSessions.sessionDate,
                            className: schema_1.classes.name,
                        })
                            .from(schema_1.attendanceRecords)
                            .leftJoin(schema_1.classSessions, (0, drizzle_orm_1.eq)(schema_1.attendanceRecords.sessionId, schema_1.classSessions.id))
                            .leftJoin(schema_1.classes, (0, drizzle_orm_1.eq)(schema_1.classSessions.classId, schema_1.classes.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.attendanceRecords.athleteId, targetAthleteId), (0, drizzle_orm_1.inArray)(schema_1.attendanceRecords.status, ["present", "absent", "excused"]), 
                        // @ts-ignore - sessionDate comparison
                        (0, drizzle_orm_1.inArray)(schema_1.classSessions.sessionDate, [thirtyDaysAgoStr, new Date().toISOString().split("T")[0]])))
                            .orderBy(schema_1.classSessions.sessionDate)
                            .limit(30)];
                case 24:
                    attendanceRecordsList = _e.sent();
                    present = attendanceRecordsList.filter(function (r) { return r.status === "present"; }).length;
                    absent = attendanceRecordsList.filter(function (r) { return r.status === "absent"; }).length;
                    excused = attendanceRecordsList.filter(function (r) { return r.status === "excused"; }).length;
                    attendanceData = {
                        total: attendanceRecordsList.length,
                        present: present,
                        absent: absent,
                        excused: excused,
                        recentRecords: attendanceRecordsList.slice(-5).map(function (r) {
                            var _a, _b;
                            return ({
                                date: (_a = r.sessionDate) !== null && _a !== void 0 ? _a : "",
                                status: r.status,
                                className: (_b = r.className) !== null && _b !== void 0 ? _b : "Clase",
                            });
                        }),
                    };
                    _e.label = 25;
                case 25:
                    chargesData = [];
                    if (!targetAthleteId) return [3 /*break*/, 27];
                    return [4 /*yield*/, db_1.db
                            .select({
                            id: schema_1.charges.id,
                            label: schema_1.charges.label,
                            amountCents: schema_1.charges.amountCents,
                            period: schema_1.charges.period,
                            status: schema_1.charges.status,
                            dueDate: schema_1.charges.dueDate,
                            notes: schema_1.charges.notes,
                            billingItemName: schema_1.billingItems.name,
                            billingItemDescription: schema_1.billingItems.description,
                        })
                            .from(schema_1.charges)
                            .leftJoin(schema_1.billingItems, (0, drizzle_orm_1.eq)(schema_1.charges.billingItemId, schema_1.billingItems.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.charges.athleteId, targetAthleteId), (0, drizzle_orm_1.inArray)(schema_1.charges.status, ["pending", "overdue", "paid"])))
                            .orderBy(schema_1.charges.dueDate)
                            .limit(10)];
                case 26:
                    chargesList = _e.sent();
                    chargesData = chargesList.map(function (c) { return ({
                        id: c.id,
                        label: c.label,
                        amountCents: c.amountCents,
                        period: c.period,
                        status: c.status,
                        dueDate: c.dueDate,
                        notes: c.notes,
                        billingItemName: c.billingItemName,
                        billingItemDescription: c.billingItemDescription,
                    }); });
                    _e.label = 27;
                case 27:
                    assessmentsData = [];
                    if (!targetAthleteId) return [3 /*break*/, 29];
                    return [4 /*yield*/, db_1.db
                            .select({
                            id: schema_1.athleteAssessments.id,
                            assessmentDate: schema_1.athleteAssessments.assessmentDate,
                            apparatus: schema_1.athleteAssessments.apparatus,
                            overallComment: schema_1.athleteAssessments.overallComment,
                            assessedByName: schema_1.coaches.name,
                        })
                            .from(schema_1.athleteAssessments)
                            .leftJoin(schema_1.coaches, (0, drizzle_orm_1.eq)(schema_1.athleteAssessments.assessedBy, schema_1.coaches.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.athleteAssessments.athleteId, targetAthleteId))
                            .orderBy(schema_1.athleteAssessments.assessmentDate)
                            .limit(5)];
                case 28:
                    assessmentsList = _e.sent();
                    assessmentsData = assessmentsList.map(function (a) { return ({
                        id: a.id,
                        assessmentDate: a.assessmentDate,
                        apparatus: a.apparatus,
                        overallComment: a.overallComment,
                        assessedByName: a.assessedByName,
                    }); });
                    _e.label = 29;
                case 29:
                    weeklySchedule = [];
                    if (!(targetAthleteId && (athleteData === null || athleteData === void 0 ? void 0 : athleteData.groupId))) return [3 /*break*/, 31];
                    return [4 /*yield*/, db_1.db
                            .select({
                            weekday: schema_1.classes.weekday,
                            name: schema_1.classes.name,
                            startTime: schema_1.classes.startTime,
                            endTime: schema_1.classes.endTime,
                        })
                            .from(schema_1.classes)
                            .where((0, drizzle_orm_1.eq)(schema_1.classes.groupId, athleteData.groupId))];
                case 30:
                    weeklyClasses = _e.sent();
                    weeklySchedule = weeklyClasses.map(function (c) {
                        var _a, _b;
                        return ({
                            day: (_a = c.weekday) !== null && _a !== void 0 ? _a : 0,
                            className: (_b = c.name) !== null && _b !== void 0 ? _b : "Clase",
                            time: c.startTime ? "".concat(c.startTime.substring(0, 5)).concat(c.endTime ? " - ".concat(c.endTime.substring(0, 5)) : "") : "Por definir",
                        });
                    });
                    _e.label = 31;
                case 31: return [2 /*return*/, (<MyDashboardPage_1.MyDashboardPage academyId={academyId} academyName={academy.name} academyCountry={academy.country} academyPhone={academy.phone} profileName={profile.name} profileRole={profile.role} profilePhotoUrl={profile.photoUrl} athleteData={athleteData} guardianAthletes={guardianAthletesList} upcomingClasses={upcomingClasses} attendanceData={attendanceData} chargesData={chargesData} weeklySchedule={weeklySchedule} assessmentsData={assessmentsData} calendarSessions={calendarSessions}/>)];
                case 32: return [2 /*return*/];
            }
        });
    });
}
