const mongoose = require("mongoose");

const clientProfileSchema = new mongoose.Schema(
  {
    company: {
      type: String,
      required: true,
    },

    businessType: {
      type: String,
      required: true,
    },

    clientProfile: {
      type: String,
      required: true, // client name / profile
    },

    clientAddress: {
      type: String,
      required: true,
    },

    billingAddress: {
      type: String,
    },

    jobTitle: {
      type: String,
      required: true,
    },

    primaryContact: {
      type: Boolean,
      default: false, // true = Primary Contact
    },

    clientDepartment: {
      type: String,
      required: true,
    },

    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    middleName: {
      type: String,
      required: true,
      trim: true,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    contact: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          return /^[0-9]{11}$/.test(v);
        },
        message: "Contact number must be exactly 11 digits",
      },
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: (props) => `${props.value} is not a valid email address`,
      },
    },

    tin: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function (v) {
          return /^[0-9]{12}$/.test(v);
        },
        message: "TIN must be exactly 12 digits",
      },
    },

    paymentTerm: {
      type: String,
      enum: ["Cheque", "Online Payment", "Cash"],
    },

    contractSD: {
      type: Date,
      required: true,
    },

    contractED: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          return !this.contractSD || value >= this.contractSD;
        },
        message: "Contract end date must be after start date",
      },
    },

    clientWebsite: {
      type: String,
    },

    requirementsImages: {
      type: [String],
      default: [],
    },

    status: {
      type: String,
      default: "Active",
    },

    createdBy: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

const ClientProfile = mongoose.model("ClientProfile", clientProfileSchema);

module.exports = ClientProfile;
