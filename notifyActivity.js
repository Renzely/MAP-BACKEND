const Notification = require("./notification");

const OVERSIGHT_ROLES = ["HR HEAD", "EXECUTIVE DIRECTOR", "HR OFFICER", "MIS"];

const SPX_ROLES = [
  "SPX HR SPECIALIST",
  "SPX COORDINATOR",
  "SPX ACCOUNT SUPERVISOR",
  "SPX OPERATION HEAD & LOGISTICS",
  "SPX PAYROLL & BILLING",
  ...OVERSIGHT_ROLES,
];
const CORE_ROLES = [
  "HR SPECIALIST",
  "ACCOUNT SUPERVISOR",
  "HR COMPENSATION AND BENEFITS",
  ...OVERSIGHT_ROLES,
];

async function notifyActivity(io, activity, domain = "CORE") {
  const targetRoles = domain === "SPX" ? SPX_ROLES : CORE_ROLES;

  const changes = activity.changes || [];
  const assigned = changes.find(
    (c) => c.field === "Outlet Assigned" || c.field === "Hub Assigned",
  );
  const deployChange = changes.find((c) => c.field === "Deploy Status");

  let message;
  if (activity.activityType === "NEW_EMPLOYEE") {
    message = `${activity.updatedBy} registered ${activity.employeeName}`;
  } else if (assigned) {
    message = `${activity.updatedBy} assigned ${activity.employeeName} to ${assigned.newValue}`;
  } else if (deployChange) {
    message = `${activity.updatedBy} set ${activity.employeeName} to ${deployChange.newValue}${activity.outletName ? ` at ${activity.outletName}` : ""}`;
  } else {
    message = `${activity.updatedBy} updated ${activity.employeeName}`;
  }

  const notif = await Notification.create({
    message,
    activityType: activity.activityType,
    employeeName: activity.employeeName,
    updatedBy: activity.updatedBy,
    updatedByRole: activity.updatedByRole,
    changes,
    targetRoles,
    readBy: [],
    activityId: activity._id,
    date: activity.date || new Date(),
  });

  let channel = io;
  targetRoles.forEach((r) => (channel = channel.to(r)));
  channel.emit("notification", notif);
  return notif;
}

module.exports = { notifyActivity };
