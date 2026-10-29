// rovinggroup.js
const mongoose = require("mongoose");

const rovingGroupSchema = new mongoose.Schema(
  {
    // Auto-generated human-readable id, e.g. "ROV-0001". Assigned by the route.
    rovingId: { type: String, unique: true, index: true },
    // Numeric sequence behind rovingId (used to compute the next id safely).
    rovingSeq: { type: Number, index: true },

    // Account Supervisor who owns/created the package
    accountSupervisor: { type: String, required: true },

    // Region (derived from the first member outlet on the frontend)
    region: { type: String, default: "" },

    // The merged roving outlets — stored as outlet names (must be >= 2)
    outlets: {
      type: [{ type: String }],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length >= 2;
        },
        message: "A roving package needs at least 2 outlets.",
      },
    },

    // Audit
    createdBy: { type: String, default: "Unknown" },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }, // adds createdAt / updatedAt automatically
);

const RovingGroup = mongoose.model("RovingGroup", rovingGroupSchema);
module.exports = RovingGroup;
