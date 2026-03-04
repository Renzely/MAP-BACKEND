const mongoose = require("mongoose");

const merchAccountSchema = new mongoose.Schema(
  {
    company: { type: String, required: true },
    status: { type: String, required: true },
    remarks: { type: String, required: true },
    employeeNo: {
      type: String,
      required: function () {
        return this.status !== "Applicant";
      },
    },

    firstName: { type: String, required: true },
    middleName: { type: String },
    lastName: { type: String, required: true },
    modeOfDisbursement: {
      type: String,
      required: function () {
        return this.status !== "Applicant";
      },
    },
    accountNumber: {
      type: String,
      default: null,
    },
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
    dateHired: {
      type: Date,
      required: function () {
        return this.status !== "Applicant";
      },
    },
    dateResigned: { type: Date },
    homeAddress: { type: String, required: true },
    silBalance: {
      type: Number,
      required: function () {
        return this.status !== "Applicant";
      },
    },

    clientAssigned: { type: String, required: true },

    region: {
      type: String,
      required: function () {
        const client = this.clientAssigned?.toUpperCase();
        return (
          // client === "ECOSSENTIAL FOODS CORP" ||
          client === "SPX EXPRESS"
        );
      },
    },

    outlet: {
      type: String,
      required: function () {
        const client = this.clientAssigned?.toUpperCase();
        return (
          // client === "ECOSSENTIAL FOODS CORP" ||
          client === "SPX EXPRESS"
        );
      },
    },

    account: {
      type: String,
      default: null,
    },

    outletAssigned: {
      type: String,
      default: null,
    },

    outletsAssigned: [{ type: String }],

    outletStatusMap: {
      type: Map,
      of: String,
      default: {},
    },

    deployStatus: {
      type: String,
      enum: ["Deployed", "Undeployed"],
      default: "Undeployed",
    },

    outletAssignmentHistory: [
      {
        outletName: { type: String },
        deployStatus: { type: String },
        updatedBy: { type: String },
        updatedAt: { type: Date, default: Date.now },
      },
    ],

    // 🆕 Add this line to store S3 image URL
    requirementsImages: [{ type: String }],

    createdBy: {
      type: String, // or change to ObjectId if you want relation later
      required: true,
    },
  },

  { timestamps: true },
);

const MerchAccount = mongoose.model("MerchAccount", merchAccountSchema);
module.exports = MerchAccount;
