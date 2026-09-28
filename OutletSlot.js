const mongoose = require("mongoose");

const OutletSlotSchema = new mongoose.Schema(
  {
    slotId: { type: Number, unique: true }, // numeric id used by the frontend
    parentOutlet: { type: String, required: true },
    outlet: { type: String, required: true, unique: true }, // e.g. "BONIFACIO - 2"
    region: { type: String, default: "" },
    accountSupervisor: { type: String, default: "" },
    adp: { type: String, default: "" },
    payrollAccount: { type: String, default: "" },
    createdBy: { type: String, default: "Unknown" },
  },
  { timestamps: true },
);

const OutletSlot =
  mongoose.models.OutletSlot || mongoose.model("OutletSlot", OutletSlotSchema);
