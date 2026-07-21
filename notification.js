const mongoose = require("mongoose");
const NotificationSchema = new mongoose.Schema({
  message: String,
  activityType: { type: String, default: "UPDATE" },
  employeeName: String,
  updatedBy: String,
  updatedByRole: String,
  targetRoles: [String], // who should receive it
  readBy: [String], // fullNames who've read it
  activityId: { type: mongoose.Schema.Types.ObjectId, ref: "RecentActivity" },
  date: { type: Date, default: Date.now },
  changes: [
    {
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
    },
  ],
});
module.exports = mongoose.model("Notification", NotificationSchema);
