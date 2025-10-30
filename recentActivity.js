const mongoose = require("mongoose");

const RecentActivitySchema = new mongoose.Schema({
  employeeName: String,
  updatedBy: String,
  changes: [
    {
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
    },
  ],
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("RecentActivity", RecentActivitySchema);
