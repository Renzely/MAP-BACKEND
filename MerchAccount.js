const mongoose = require("mongoose");

const merchAccountSchema = new mongoose.Schema(
  {
    company: { type: String, required: true },
    status: { type: String, required: true },
    remarks: { type: String, required: true },
    employeeNo: { type: String, required: true },
    firstName: { type: String, required: true },
    middleName: { type: String },
    lastName: { type: String, required: true },
    contact: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    birthday: { type: Date, required: true },
    age: { type: Number },
    sss: { type: String, required: false },
    philhealth: { type: String, required: false },
    hdmf: { type: String, required: false },
    tin: { type: String, required: false },
    position: { type: String, required: true },
    dateHired: { type: Date, required: true },
    homeAddress: { type: String, required: true },
    silBalance: { type: String },
    clientAssigned: { type: String, required: true },
  },
  { timestamps: true }
);

const MerchAccount = mongoose.model("MerchAccount", merchAccountSchema);

module.exports = MerchAccount;
