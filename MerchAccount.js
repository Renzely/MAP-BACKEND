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
    modeOfDisbursement: { type: String, required: true },
    accountNumber: { type: String, required: false },
    contact: { type: String, required: true },
    email: {
      type: String,
      required: false, // allow missing email
      // unique: true,  <-- remove this
      validate: {
        validator: function (v) {
          return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: (props) => `${props.value} is not a valid email address!`,
      },
    },

    birthday: { type: Date, required: true },
    age: { type: Number },
    sss: { type: String },
    philhealth: { type: String },
    hdmf: { type: String },
    tin: { type: String },
    position: { type: String, required: true },
    dateHired: { type: Date, required: true },
    dateResigned: { type: Date },
    homeAddress: { type: String, required: true },
    silBalance: { type: String },
    clientAssigned: { type: String, required: true },

    // 🆕 Add this line to store S3 image URL
    requirementsImages: [{ type: String }],

    createdBy: {
      type: String, // or change to ObjectId if you want relation later
      required: true,
    },
  },
  { timestamps: true }
);

const MerchAccount = mongoose.model("MerchAccount", merchAccountSchema);
module.exports = MerchAccount;
