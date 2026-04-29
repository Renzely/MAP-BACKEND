const mongoose = require("mongoose");

const merchAccountSchema = new mongoose.Schema(
  {
    company: { type: String, required: true },
    status: { type: String, required: true },
    remarks: { type: String, required: true },
    employeeNo: { type: String, required: false, default: null },
    riderid: { type: String, required: false, default: null },
    firstName: { type: String, required: true },
    suffix: { type: String },
    middleName: { type: String },
    lastName: { type: String, required: true },
    modeOfDisbursement: {
      type: String,
      required: function () {
        return this.status !== "Applicant";
      },
    },
    accountNumber: { type: String, default: null },
    contact: { type: String, required: true },
    email: {
      type: String,
      required: false,
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
    proviDate: {
      type: Date,
      required: function () {
        return this.client === "SPX EXPRESS" && this.status !== "Applicant";
      },
    },
    dateHired: {
      type: Date,
      required: function () {
        return this.status !== "Applicant";
      },
    },
    dateResigned: { type: Date },
    reasonForLeaving: { type: String, default: null },
    homeAddress: { type: String, required: true },
    silBalance: {
      type: Number,
      required: function () {
        return this.status !== "Applicant";
      },
    },

    dateClearance: { type: Date, default: null },
    clearanceStatus: { type: String, default: null },
    dateCleared: { type: Date, default: null },
    dateLastPay: { type: Date, default: null },
    verdictCalled: { type: String, default: null },

    clientAssigned: { type: String, required: true },

    region: {
      type: String,
      required: function () {
        const client = this.clientAssigned?.toUpperCase();
        return client === "SPX EXPRESS";
      },
    },

    outlet: {
      type: String,
      required: function () {
        const client = this.clientAssigned?.toUpperCase();
        return client === "SPX EXPRESS";
      },
    },

    account: { type: String, default: null },
    outletAssigned: { type: String, default: null },
    outletsAssigned: [{ type: String }],

    outletStatusMap: { type: Map, of: String, default: {} },

    deployStatus: {
      type: String,
      enum: ["Deployed", "Undeployed"],
      default: "Undeployed",
    },

    deployDate: { type: Date, default: null },
    temporaryDeployEndDate: { type: Date, default: null },
    undeployDate: { type: Date, default: null },
    applicantStatus: { type: String, default: "" },
    backOutReason: { type: String, default: "" },
    targetOnboardDate: { type: Date, default: null },
    terminateReason: { type: String, default: "" },
    outletAssignmentHistory: [
      {
        outletName: String,
        deployStatus: String,
        deployDate: Date,
        undeployDate: Date,
        applicantStatus: String,
        backOutReason: String,
        targetOnboardDate: Date,
        terminateReason: String,
        updatedBy: String,
        updatedAt: Date,
      },
    ],

    requirementsImages: [{ type: String }],

    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

const MerchAccount = mongoose.model("MerchAccount", merchAccountSchema);
module.exports = MerchAccount;
