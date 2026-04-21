require("node:dns/promises").setServers(["1.1.1.1", "8.8.8.8"]);
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const AWS = require("aws-sdk");
const app = express();
app.use(cors());
app.use(express.json());
const auth = require("./auth");
const RecentActivity = require("./recentActivity");
const MerchAccount = require("./MerchAccount");
const ClientProfile = require("./clientProfile");
const bcrypt = require("bcryptjs");
const User = require("./users");
const AdminUser = require("./adminUsers");
const authMiddleware = require("./auth");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const nodemailer = require("nodemailer");
const Otp = require("./otp");

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "Asia/Manila";

function parsePhilippineDateTimeAlternative(dateStr, timeStr) {
  const dateTimeStr = `${dateStr} ${timeStr}`;

  // Parse using dayjs in Asia/Manila timezone
  const phTime = dayjs.tz(dateTimeStr, "YYYY-MM-DD h:mm A", "Asia/Manila");

  if (!phTime.isValid()) {
    console.error("❌ Invalid PH datetime parse:", dateStr, timeStr);
    return new Date("Invalid");
  }

  // Convert to Date object while keeping the correct local time (Asia/Manila)
  return new Date(phTime.toISOString()); // ← Safe for MongoDB, stores UTC with PH meaning
}

// MongoDB Atlas connection
const uri = process.env.uri;

mongoose
  .connect(uri)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Submission on employes requirements

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

app.post("/save-requirements-images", (req, res) => {
  const { fileName, fileType } = req.body; // get file type from frontend

  const params = {
    Bucket: "mmp-portal-docs",
    Key: fileName,
    Expires: 60,
    ContentType: fileType, // use the file's actual MIME type
  };

  s3.getSignedUrl("putObject", params, (err, url) => {
    if (err) {
      console.error("S3 Error:", err);
      return res
        .status(500)
        .json({ error: "Failed to generate pre-signed URL" });
    }

    res.json({ url });
  });
});

app.post("/save-requirements-images-client", (req, res) => {
  const { fileName, fileType } = req.body; // get file type from frontend

  const params = {
    Bucket: "mmp-portal-docs-client",
    Key: fileName,
    Expires: 60,
    ContentType: fileType, // use the file's actual MIME type
  };

  s3.getSignedUrl("putObject", params, (err, url) => {
    if (err) {
      console.error("S3 Error:", err);
      return res
        .status(500)
        .json({ error: "Failed to generate pre-signed URL" });
    }

    res.json({ url });
  });
});

// For your date field, also fix it to be in Philippine timezone
function createPhilippineAttendanceDate(input) {
  const base = typeof input === "string" ? new Date(input) : input;
  const phTime = dayjs(base).tz("Asia/Manila");
  return phTime.format("YYYY-MM-DD");
}

app.get("/user/outlets", auth, async (req, res) => {
  try {
    const userEmail = req.user?.email; // Make sure this comes from decoded token

    if (!userEmail)
      return res.status(400).json({ error: "Missing user email" });

    const user = await User.findOne({ email: userEmail });

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user.outlet || []);
  } catch (error) {
    console.error("Error in /user/outlets:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ADMIN USERS

app.post("/get-admin-user", async (req, res) => {
  try {
    const users = await AdminUser.find(); // Returns all documents and fields
    return res.send({ status: 200, data: users });
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
});

app.post("/get-coordinators", async (req, res) => {
  try {
    const users = await AdminUser.find({
      roleAccount: "COORDINATOR",
    });
    return res.send({ status: 200, data: users });
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
});

app.put("/assign-coordinator-outlet", async (req, res) => {
  try {
    const { adminUserId, outletName } = req.body;

    // Add outlet to array if not already present
    await AdminUser.findByIdAndUpdate(
      adminUserId,
      { $addToSet: { outlet: outletName } }, // $addToSet prevents duplicates
      { new: true },
    );

    return res.send({ status: 200, message: "Coordinator outlet assigned" });
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
});

// ADMIN REGISTRATION

app.post("/register-user-admin", async (req, res) => {
  const {
    firstName,
    middleName,
    lastName,
    emailAddress,
    contactNum,
    password,
    roleAccount,
    outlet,
    remarks,
  } = req.body;

  try {
    // Check if user already exists
    const existingUser = await AdminUser.findOne({ emailAddress });
    if (existingUser) {
      return res.send({ status: "error", message: "User already exists!" });
    }

    // Encrypt password
    const encryptedPassword = await bcrypt.hash(password, 8);

    // Determine type based on role (you can adjust logic if needed)
    // let type = 3; // Default type
    // if (roleAccount === "Admin") {
    //   type = 1;
    // }

    // Create new user
    const newUser = await AdminUser.create({
      firstName,
      middleName,
      lastName,
      emailAddress,
      contactNum,
      password: encryptedPassword,
      roleAccount,
      remarks: remarks || "",
      isVerified: false,
      outlet: outlet || [],
      // type,
    });

    res.send({ status: 200, message: "Admin user registered", user: newUser });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).send({ status: "error", message: error.message });
  }
});

// ADMIN USER OTP

app.post("/send-otp", async (req, res) => {
  const { email } = req.body;

  try {
    var code = Math.floor(100000 + Math.random() * 900000);
    code = String(code);
    code = code.substring(0, 4);

    const info = await transporter.sendMail({
      from: {
        name: "BMPower",
        address: process.env.EMAIL_USER,
      },
      to: email,
      subject: "OTP code",
      html:
        "<b>Your OTP code is</b> " +
        code +
        "<b>. Do not share this code with others.</b>",
    });

    return res.send({ status: 200, code: code });
  } catch (error) {
    return res.send({ error: error.message });
  }
});

// ADMIN USER UPDATE STATUS

app.put("/update-admin-status", async (req, res) => {
  const { isVerified, emailAddress } = req.body;

  try {
    const updatedUser = await AdminUser.findOneAndUpdate(
      { emailAddress },
      { $set: { isVerified: isVerified } },
      { new: true },
    );

    if (!updatedUser) {
      return res
        .status(404)
        .send({ status: "error", message: "User not found" });
    }

    res.send({ status: 200, message: "Status updated", user: updatedUser });
  } catch (error) {
    res.status(500).send({ status: "error", message: error.message });
  }
});

// ADMIN USER UPDATE OUTLET

app.put("/update-admin-outlet", async (req, res) => {
  const { emailAddress, outlet } = req.body;

  try {
    const updatedUser = await AdminUser.findOneAndUpdate(
      { emailAddress },
      { $set: { outlet } },
      { new: true },
    );

    if (!updatedUser) {
      return res
        .status(404)
        .send({ status: "error", message: "User not found" });
    }

    res.send({
      status: 200,
      message: "User branches updated",
      user: updatedUser,
    });
  } catch (error) {
    res.status(500).send({ status: "error", message: error.message });
  }
});

// USERS

app.post("/get-all-user", async (req, res) => {
  try {
    const users = await User.find(); // No projection — returns all fields
    return res.send({ status: 200, data: users });
  } catch (error) {
    return res.status(500).send({ error: error.message });
  }
});

app.post("/export-merch-accounts", async (req, res) => {
  try {
    const { remarks, clientAssigned } = req.body;

    const filter = {};

    // Remarks filter (skip if UNFILTERED)
    if (remarks && remarks !== "UNFILTERED") {
      filter.remarks = remarks;
    }

    // Client filter (skip if ALL)
    if (clientAssigned && clientAssigned !== "ALL") {
      filter.clientAssigned = {
        $regex: new RegExp(`^${clientAssigned.trim()}$`, "i"),
      };
    }

    // Fetch filtered records
    const data = await MerchAccount.find(filter).lean();

    // Format output
    const formatted = data.map((emp, index) => ({
      // "#": index + 1,
      Company: emp.company,
      Client: emp.clientAssigned,
      EmployeeNo: emp.employeeNo,
      Fullname: `${emp.lastName}, ${emp.firstName} ${
        emp.middleName || ""
      }`.trim(),
      Status: emp.status,
      Remarks: emp.remarks,
      Position: emp.position,
      Region: emp.region || "",
      Outlet: emp.outlet || "",
      Contact: emp.contact,
      Email: emp.email || "",
      Birthday: emp.birthday
        ? dayjs(emp.birthday).tz(TZ).format("MM/DD/YYYY")
        : "",
      Age: emp.age,
      DateHired: emp.dateHired
        ? dayjs(emp.dateHired).tz(TZ).format("MM/DD/YYYY")
        : "",

      DateResigned: emp.dateResigned
        ? dayjs(emp.dateResigned).tz(TZ).format("MM/DD/YYYY")
        : "",
      HomeAddress: emp.homeAddress,
      ModeOfDisbursement: emp.modeOfDisbursement,
      AccountNumber: emp.accountNumber || "",
      SSS: emp.sss || "",
      PhilHealth: emp.philhealth || "",
      HDMF: emp.hdmf || "",
      Tin: emp.tin || "",
    }));

    return res.send({ status: 200, data: formatted });
  } catch (error) {
    console.error("Export Error:", error);
    return res.status(500).send({ error: error.message });
  }
});

app.put("/update-employee/:id", async (req, res) => {
  try {
    const employeeId = req.params.id;
    const updatedData = req.body;

    // ✅ Validate employee ID
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ message: "Invalid employee ID" });
    }

    // ✅ Fetch original employee data
    const original = await MerchAccount.findById(employeeId);
    if (!original) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // ✅ Update employee
    const result = await MerchAccount.findByIdAndUpdate(
      employeeId,
      { $set: updatedData },
      { new: true },
    );

    // ✅ Readable field names for tracking
    const fieldLabels = {
      company: "Company",
      status: "Status",
      remarks: "Remarks",
      employeeNo: "Employee Number",
      firstName: "First Name",
      middleName: "Middle Name",
      lastName: "Last Name",
      modeOfDisbursement: "Mode of Disbursement",
      accountNumber: "Account Number",
      contact: "Contact Number",
      email: "Email Address",
      birthday: "Birthday",
      age: "Age",
      sss: "SSS",
      philhealth: "PhilHealth",
      hdmf: "HDMF",
      tin: "TIN",
      position: "Position",
      dateHired: "Date Hired",
      dateResigned: "Date Resigned",
      reasonForLeaving: "Reason for Leaving",
      homeAddress: "Home Address",
      silBalance: "SIL Balance",
      clientAssigned: "Client Assigned",
      dateClearance: "Date Clearance Started",
      clearanceStatus: "Clearance Status",
      dateCleared: "Date Cleared",
      dateLastPay: "Date Last Pay",
      verdictCalled: "Verdict",
    };

    // ✅ Detect changes
    const changes = [];
    for (const key in updatedData) {
      const newValue = updatedData[key];
      const oldValue = original[key];

      if (
        (newValue === undefined && oldValue === undefined) ||
        (newValue === "" && oldValue === "") ||
        JSON.stringify(newValue) === JSON.stringify(oldValue)
      ) {
        continue; // Skip unchanged values
      }

      const label = fieldLabels[key] || key;
      changes.push({
        field: label,
        oldValue: oldValue ?? "N/A",
        newValue: newValue ?? "N/A",
      });
    }

    // ✅ Identify admin who made the update
    let adminName = "Unknown Admin";
    let admin = null;

    if (updatedData.updatedBy) {
      if (mongoose.Types.ObjectId.isValid(updatedData.updatedBy)) {
        admin = await AdminUser.findById(updatedData.updatedBy);
      } else {
        admin = await AdminUser.findOne({
          emailAddress: updatedData.updatedBy,
        });
      }
    }

    if (admin) {
      adminName =
        `${admin.firstName || ""} ${admin.lastName || ""}`.trim() ||
        admin.emailAddress ||
        admin.roleAccount ||
        "Unknown Admin";
    } else if (updatedData.updatedBy) {
      adminName = updatedData.updatedBy; // fallback if not found
    }

    // ✅ Save recent activity log
    if (changes.length > 0) {
      await RecentActivity.create({
        employeeName:
          `${original.firstName || ""} ${original.lastName || ""}`.trim(),
        updatedBy: adminName,
        changes,
        date: new Date(),
      });
    }

    // ✅ Send success response
    res.status(200).json({
      message: "Employee details updated successfully!",
      updatedEmployee: result,
    });
  } catch (error) {
    console.error("❌ Error updating employee:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

app.get("/recent-activities", async (req, res) => {
  try {
    const activities = await RecentActivity.find().sort({ date: -1 });

    res.status(200).json({ data: activities });
  } catch (error) {
    console.error("❌ Error fetching recent activities:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

app.post("/check-duplicate-ids", async (req, res) => {
  try {
    const { sss, philhealth, hdmf, tin } = req.body;

    const conditions = [];
    if (sss?.trim()) conditions.push({ sss });
    if (philhealth?.trim()) conditions.push({ philhealth });
    if (hdmf?.trim()) conditions.push({ hdmf });
    if (tin?.trim()) conditions.push({ tin });

    if (conditions.length === 0) {
      return res.status(200).json({ message: "No duplicates found." });
    }

    // Check any record that matches any of the given numbers
    const existing = await MerchAccount.find({
      $or: conditions,
    });

    if (existing.length > 0) {
      const duplicates = {};
      existing.forEach((record) => {
        if (sss && record.sss === sss)
          duplicates.sss = "SSS number already exists.";
        if (philhealth && record.philhealth === philhealth)
          duplicates.philhealth = "PhilHealth number already exists.";
        if (hdmf && record.hdmf === hdmf)
          duplicates.hdmf = "HDMF number already exists.";
        if (tin && record.tin === tin)
          duplicates.tin = "TIN number already exists.";
      });

      return res.status(409).json({
        message: "Duplicate detected.",
        duplicates,
      });
    }

    res.status(200).json({ message: "No duplicates found." });
  } catch (error) {
    console.error("Error checking duplicates:", error);
    res.status(500).json({ message: "Server error." });
  }
});

app.put("/update-client-profile/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Optional: prevent updating system fields
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.createdBy;

    const updatedClient = await ClientProfile.findByIdAndUpdate(
      id,
      {
        ...updateData,
        updatedAt: new Date(),
      },
      {
        new: true, // return updated document
        runValidators: true,
      },
    );

    if (!updatedClient) {
      return res.status(404).json({
        message: "Client profile not found",
      });
    }

    res.status(200).json({
      message: "Client profile updated successfully",
      data: updatedClient,
    });
  } catch (error) {
    console.error("Update client profile error:", error);

    res.status(500).json({
      message: "Failed to update client profile",
      error: error.message,
    });
  }
});

// fetch client profile

app.get("/get-client-profiles", async (req, res) => {
  try {
    const clients = await ClientProfile.find().sort({ createdAt: -1 });
    res.status(200).json(clients);
  } catch (error) {
    console.error("Error fetching client profiles:", error);
    res.status(500).json({ message: "Failed to fetch client profiles" });
  }
});

// ClientProfile

app.post("/create-client-profile", async (req, res) => {
  try {
    const {
      company,
      businessType,
      clientProfile,
      clientAddress,
      billingAddress,
      firstName,
      middleName,
      lastName,
      jobTitle,
      primaryContact,
      clientDepartment,
      contact,
      email,
      tin,
      paymentTerm,
      contractSD,
      contractED,
      clientWebsite,
      createdBy,
      requirementsImages,
    } = req.body;

    // ✅ FIX 1: Proper required-field check
    if (
      !company ||
      !businessType ||
      !clientProfile ||
      !clientAddress ||
      !firstName ||
      !middleName ||
      !lastName ||
      !jobTitle ||
      typeof primaryContact === "undefined" || // ✅ boolean-safe
      !clientDepartment ||
      !contact ||
      // !email ||
      !tin ||
      !contractSD ||
      !contractED ||
      !createdBy
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // ✅ FIX 2: Convert primaryContact safely
    const isPrimaryContact =
      primaryContact === true ||
      primaryContact === "true" ||
      primaryContact === "Primary";

    // ✅ CONTACT FORMAT
    if (!/^[0-9]{11}$/.test(contact)) {
      return res.status(400).json({
        message: "Contact number must be exactly 11 digits",
      });
    }

    // ✅ TIN FORMAT
    if (!/^[0-9]{12}$/.test(tin)) {
      return res.status(400).json({
        message: "TIN must be exactly 12 digits",
      });
    }

    // ✅ CONTRACT DATE VALIDATION
    if (new Date(contractED) < new Date(contractSD)) {
      return res.status(400).json({
        message: "Contract end date must be after start date",
      });
    }

    // ✅ DUPLICATE CHECKS
    const duplicateFields = [];
    const fieldsToCheck = { tin, email, contact };

    for (const [key, value] of Object.entries(fieldsToCheck)) {
      if (value?.trim()) {
        const exists = await ClientProfile.findOne({ [key]: value });
        if (exists) duplicateFields.push(key.toUpperCase());
      }
    }

    if (duplicateFields.length > 0) {
      return res.status(409).json({
        message: `Duplicate found in: ${duplicateFields.join(", ")}`,
      });
    }

    // ✅ CREATE CLIENT PROFILE
    const newClientProfile = new ClientProfile({
      company,
      businessType,
      clientProfile,
      clientAddress,
      billingAddress: billingAddress || "",
      firstName,
      middleName,
      lastName,
      jobTitle,
      primaryContact: isPrimaryContact, // ✅ FIXED
      clientDepartment,
      contact,
      email: email.trim(),
      tin: tin.trim(),
      paymentTerm,
      contractSD,
      contractED,
      clientWebsite: clientWebsite || "",
      requirementsImages: requirementsImages || [],
      createdBy,
      status: "Active",
    });

    await newClientProfile.save();

    return res.status(200).json({
      message: "Client profile created successfully",
      data: newClientProfile,
    });
  } catch (error) {
    console.error("Error creating client profile:", error);

    if (error.code === 11000) {
      const dupField = Object.keys(error.keyPattern)[0].toUpperCase();
      return res.status(409).json({
        message: `Duplicate found in: ${dupField}`,
      });
    }

    return res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/get-employee-counts-by-client", async (req, res) => {
  try {
    const counts = await MerchAccount.aggregate([
      {
        $match: {
          status: "Active",
        },
      },
      {
        $group: {
          _id: {
            company: "$company",
            clientAssigned: "$clientAssigned",
          },
          employeeCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          company: "$_id.company",
          clientAssigned: "$_id.clientAssigned",
          employeeCount: 1,
        },
      },
    ]);

    res.status(200).json(counts);
  } catch (error) {
    console.error("Error fetching employee counts:", error);
    res.status(500).json({ message: "Failed to fetch employee counts" });
  }
});

app.post("/create-merch-account", async (req, res) => {
  try {
    const {
      company,
      status,
      remarks,
      riderid,
      employeeNo,
      firstName,
      suffix,
      middleName,
      lastName,
      modeOfDisbursement,
      accountNumber,
      contact,
      email,
      birthday,
      age,
      sss,
      philhealth,
      hdmf,
      tin,
      position,
      contract,
      dateHired,
      dateResigned,
      homeAddress,
      silBalance,
      clientAssigned,
      outlet,
      region,
      requirementsImages,
      createdBy,
    } = req.body;

    const isApplicant = status === "Applicant";

    /* ---------------- REQUIRED FIELD VALIDATION ---------------- */

    if (!company || !status || !remarks || !firstName || !lastName) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (isApplicant) {
      // Applicant-specific required fields
      if (
        !contact ||
        !birthday ||
        !position ||
        !homeAddress ||
        !clientAssigned
      ) {
        return res
          .status(400)
          .json({ message: "Missing required Applicant fields" });
      }
    } else {
      // Employee required fields
      if (
        // !employeeNo ||
        !modeOfDisbursement ||
        !contact ||
        !birthday ||
        !position ||
        !dateHired ||
        !homeAddress ||
        !clientAssigned ||
        silBalance === undefined
      ) {
        return res
          .status(400)
          .json({ message: "Missing required Employee fields" });
      }
    }

    // 🆕 Validate outlet for ECOSSENTIAL FOODS CORP and SPX EXPRESS
    // 🆕 Only require outlet/hub for SPX for now
    if (clientAssigned === "SPX EXPRESS" && (!outlet || outlet.trim() === "")) {
      return res.status(400).json({
        message: "Hub is required for SPX EXPRESS",
      });
    }

    // Optional for EFC and others
    // if needed later, uncomment for next update
    // if (clientAssigned === "ECOSSENTIAL FOODS CORP" && (!outlet || outlet.trim() === "")) {
    //   return res.status(400).json({ message: "Outlet is required for ECOSSENTIAL FOODS CORP" });
    // }

    if (!createdBy) {
      return res.status(400).json({ message: "Missing admin creator info" });
    }

    /* ---------------- DUPLICATE CHECKS ---------------- */

    const duplicateFields = [];
    const optionalFields = { email, sss, philhealth, hdmf, tin };

    for (const [key, value] of Object.entries(optionalFields)) {
      if (value?.trim()) {
        const exists = await MerchAccount.findOne({ [key]: value });
        if (exists) duplicateFields.push(key.toUpperCase());
      }
    }

    if (duplicateFields.length > 0) {
      return res.status(409).json({
        message: `Duplicate found in: ${duplicateFields.join(", ")}`,
      });
    }

    /* ---------------- CREATE ACCOUNT ---------------- */

    const newAccount = new MerchAccount({
      company,
      status,
      remarks,
      employeeNo: isApplicant ? null : employeeNo,
      riderid,
      firstName,
      suffix,
      middleName,
      lastName,
      modeOfDisbursement: isApplicant ? null : modeOfDisbursement,
      accountNumber:
        isApplicant || modeOfDisbursement === "TBA" || !accountNumber
          ? null
          : accountNumber,
      contact,
      email: email?.trim() || undefined,
      birthday,
      age: age || null,
      sss: sss?.trim() || undefined,
      philhealth: philhealth?.trim() || undefined,
      hdmf: hdmf?.trim() || undefined,
      tin: tin?.trim() || undefined,
      position,
      contract: isApplicant ? null : contract,
      dateHired: isApplicant ? null : dateHired,
      dateResigned,
      homeAddress,
      silBalance: isApplicant ? null : silBalance,
      clientAssigned,
      outlet: outlet?.trim() || undefined,
      region: region?.trim() || undefined,
      requirementsImages: requirementsImages || [],
      createdBy,
    });

    await newAccount.save();

    return res.status(200).json({
      message: "Account created successfully",
      data: newAccount,
    });
  } catch (error) {
    console.error("Error creating merch account:", error);

    if (error.code === 11000) {
      const dupField = Object.keys(error.keyPattern)[0].toUpperCase();
      return res.status(409).json({
        message: `Duplicate found in: ${dupField}`,
      });
    }

    return res.status(500).json({ message: "Internal server error" });
  }
});

app.put("/assign-outlet-spx", async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const {
      outletName,
      region,
      employeeId,
      deployStatus,
      deployDate,
      undeployDate,
      updatedBy,
    } = req.body;

    if (!outletName || !deployStatus || !employeeId) {
      return res.status(400).json({
        success: false,
        message: "outletName, deployStatus, and employeeId are required.",
      });
    }

    let empObjectId;
    try {
      empObjectId = new mongoose.Types.ObjectId(employeeId);
    } catch (e) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid employeeId format." });
    }

    const currentDoc = await MerchAccount.collection.findOne({
      _id: empObjectId,
    });
    if (!currentDoc) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found." });
    }

    // ── SPX: Always save deployDate regardless of deployStatus ────────────────
    const setFields = {
      outlet: outletName, // single outlet field
      region: region || "",
      deployStatus,
      deployDate: deployDate ? new Date(deployDate) : null, // ← always set
      undeployDate: undeployDate ? new Date(undeployDate) : null,
      updatedAt: new Date(),
    };

    // Keep outletsAssigned in sync too
    const existingOutlets = Array.isArray(currentDoc.outletsAssigned)
      ? currentDoc.outletsAssigned.filter(Boolean)
      : [];
    setFields.outletsAssigned = existingOutlets.includes(outletName)
      ? existingOutlets
      : [...existingOutlets, outletName];

    const historyEntry = {
      _id: new mongoose.Types.ObjectId(),
      outletName,
      deployStatus,
      deployDate: deployDate ? new Date(deployDate) : null,
      undeployDate: undeployDate ? new Date(undeployDate) : null,
      applicantStatus: "",
      updatedBy: updatedBy || "Unknown",
      updatedAt: new Date(),
    };

    await MerchAccount.collection.updateOne(
      { _id: empObjectId },
      {
        $set: setFields,
        $push: { outletAssignmentHistory: historyEntry },
      },
    );

    const verified = await MerchAccount.collection.findOne({
      _id: empObjectId,
    });
    return res.status(200).json({
      success: true,
      message: "SPX outlet assignment saved.",
      data: verified,
    });
  } catch (error) {
    console.error("Error in /assign-outlet-spx:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
});

app.put("/assign-outlet", async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const {
      outletName,
      employeeId,
      deployStatus,
      deployDate,
      undeployDate,
      applicantStatus,
      updatedBy,
    } = req.body;

    if (!outletName || !deployStatus) {
      return res.status(400).json({
        success: false,
        message: "outletName and deployStatus are required.",
      });
    }

    if (!employeeId) {
      await MerchAccount.collection.updateMany(
        {
          clientAssigned: { $regex: /ECOSSENTIAL FOODS CORP/i },
          outletsAssigned: outletName,
        },
        { $pull: { outletsAssigned: outletName } },
      );
      return res
        .status(200)
        .json({ success: true, message: "Outlet assignment cleared." });
    }

    let empObjectId;
    try {
      empObjectId = new mongoose.Types.ObjectId(employeeId);
    } catch (e) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid employeeId format." });
    }

    // ── Step 1: Remove outlet from any OTHER employee ─────────────────────────
    await MerchAccount.collection.updateMany(
      {
        clientAssigned: { $regex: /ECOSSENTIAL FOODS CORP/i },
        outletsAssigned: outletName,
        _id: { $ne: empObjectId },
      },
      { $pull: { outletsAssigned: outletName } },
    );

    // ── Step 2: Get current outletsAssigned for this employee ─────────────────
    const currentDoc = await MerchAccount.collection.findOne({
      _id: empObjectId,
    });
    if (!currentDoc) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found." });
    }

    // ── Step 3: Build the new outletsAssigned array manually ─────────────────
    const existingOutlets = Array.isArray(currentDoc.outletsAssigned)
      ? currentDoc.outletsAssigned.filter(Boolean) // remove nulls/empty
      : [];
    const newOutletsAssigned = existingOutlets.includes(outletName)
      ? existingOutlets
      : [...existingOutlets, outletName];

    // ── Step 4: Build $set fields ─────────────────────────────────────────────
    const setFields = {
      deployStatus,
      outletsAssigned: newOutletsAssigned, // ← FORCE SET the full array
      updatedAt: new Date(),
    };

    if (deployStatus === "Deployed") {
      setFields.applicantStatus = "";
      setFields.undeployDate = null;
      if (deployDate) setFields.deployDate = new Date(deployDate);
    } else {
      setFields.applicantStatus = applicantStatus || "";
      setFields.deployDate = null;
      if (undeployDate) setFields.undeployDate = new Date(undeployDate);
    }

    const historyEntry = {
      _id: new mongoose.Types.ObjectId(),
      outletName,
      deployStatus,
      deployDate: deployDate ? new Date(deployDate) : null,
      undeployDate: undeployDate ? new Date(undeployDate) : null,
      applicantStatus: applicantStatus || "",
      updatedBy: updatedBy || "Unknown",
      updatedAt: new Date(),
    };

    // ── Step 5: Update using $set for everything including outletsAssigned ────
    const updateResult = await MerchAccount.collection.updateOne(
      { _id: empObjectId },
      {
        $set: setFields,
        $push: { outletAssignmentHistory: historyEntry },
      },
    );

    // ── Step 6: Verify what was actually saved ────────────────────────────────
    const verified = await MerchAccount.collection.findOne({
      _id: empObjectId,
    });
    return res.status(200).json({
      success: true,
      message: "Outlet assignment saved.",
      data: verified,
    });
  } catch (error) {
    console.error("Error in /assign-outlet:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
});

app.put("/promote-applicant", async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const { employeeId, updatedBy } = req.body;

    if (!employeeId) {
      return res
        .status(400)
        .json({ success: false, message: "employeeId is required." });
    }

    let empObjectId;
    try {
      empObjectId = new mongoose.Types.ObjectId(employeeId);
    } catch (e) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid employeeId format." });
    }

    const doc = await MerchAccount.collection.findOne({ _id: empObjectId });
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found." });
    }

    await MerchAccount.collection.updateOne(
      { _id: empObjectId },
      {
        $set: {
          status: "Active",
          remarks: "Employed",
          applicantStatus: "", // clear pipeline status
          updatedAt: new Date(),
        },
        $push: {
          outletAssignmentHistory: {
            _id: new mongoose.Types.ObjectId(),
            outletName: doc.outletsAssigned?.[0] || "",
            deployStatus: doc.deployStatus || "Deployed",
            applicantStatus: "Onboarded",
            note: "Promoted from Applicant to Employed",
            updatedBy: updatedBy || "Unknown",
            updatedAt: new Date(),
          },
        },
      },
    );

    const updated = await MerchAccount.collection.findOne({ _id: empObjectId });

    return res.status(200).json({
      success: true,
      message: `${doc.firstName} ${doc.lastName} has been promoted to Active / Employed.`,
      data: updated,
    });
  } catch (error) {
    console.error("Error in /promote-applicant:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
});

app.put("/remove-outlet-assignment", async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const { outletName, employeeId, remarks, dateResigned, updatedBy } =
      req.body;

    if (!outletName || !employeeId) {
      return res.status(400).json({
        success: false,
        message: "outletName and employeeId are required.",
      });
    }

    let empObjectId;
    try {
      empObjectId = new mongoose.Types.ObjectId(employeeId);
    } catch (e) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid employeeId format." });
    }

    const doc = await MerchAccount.collection.findOne({ _id: empObjectId });
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found." });
    }

    // Remove outletName from outletsAssigned array
    const updatedOutlets = (doc.outletsAssigned || []).filter(
      (n) => n !== outletName,
    );

    await MerchAccount.collection.updateOne(
      { _id: empObjectId },
      {
        $set: {
          outletsAssigned: updatedOutlets,
          deployStatus: "Undeployed",
          undeployDate: new Date(),
          status: "Inactive", // ← set Inactive
          remarks: remarks || "Resign", // ← Account Supervisor's selected remarks
          dateResigned: dateResigned ? new Date(dateResigned) : new Date(), // ← today
          updatedAt: new Date(),
        },
        $push: {
          outletAssignmentHistory: {
            _id: new mongoose.Types.ObjectId(),
            outletName: outletName,
            deployStatus: "Undeployed",
            deployDate: doc.deployDate || null,
            undeployDate: new Date(),
            applicantStatus: "",
            note: `Removed — replaced by incoming applicant. Remarks: ${remarks || "Resign"}`,
            updatedBy: updatedBy || "Unknown",
            updatedAt: new Date(),
          },
        },
      },
    );

    return res.status(200).json({
      success: true,
      message: `${doc.firstName} ${doc.lastName} removed from "${outletName}" and set to Inactive / ${remarks || "Resign"}.`,
    });
  } catch (error) {
    console.error("Error in /remove-outlet-assignment:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
});

app.put("/assign-coordinator", async (req, res) => {
  try {
    const { outletName, employeeId, deployStatus, updatedBy } = req.body;

    if (!outletName || !deployStatus) {
      return res.status(400).json({
        success: false,
        message: "outletName and deployStatus are required.",
      });
    }

    if (!employeeId) {
      await MerchAccount.updateMany(
        {
          clientAssigned: { $regex: /ECOSSENTIAL FOODS CORP/i },
          outletsAssigned: outletName,
        },
        {
          $pull: { outletsAssigned: outletName },
          $unset: { [`outletStatusMap.${outletName.replace(/\./g, "_")}`]: "" },
        },
      );
      return res
        .status(200)
        .json({ success: true, message: "Coordinator assignment cleared." });
    }

    // ── Remove outlet from any OTHER coordinator ───────────────────────────────
    await MerchAccount.updateMany(
      {
        clientAssigned: { $regex: /ECOSSENTIAL FOODS CORP/i },
        outletsAssigned: outletName,
        _id: { $ne: employeeId },
      },
      { $pull: { outletsAssigned: outletName } },
    );

    // ── Save outlet + per-outlet status ───────────────────────────────────────
    // Use a safe key (dots not allowed in MongoDB keys)
    const safeKey = outletName.replace(/\./g, "_");

    const updated = await MerchAccount.findByIdAndUpdate(
      employeeId,
      {
        $addToSet: { outletsAssigned: outletName },
        $set: { [`outletStatusMap.${safeKey}`]: deployStatus },
        $push: {
          outletAssignmentHistory: {
            outletName,
            deployStatus,
            updatedBy: updatedBy || "Unknown",
            updatedAt: new Date(),
          },
        },
      },
      { new: true, runValidators: false },
    );

    if (!updated)
      return res
        .status(404)
        .json({ success: false, message: "Coordinator not found." });

    return res.status(200).json({
      success: true,
      message: "Coordinator assignment saved.",
      data: updated,
    });
  } catch (error) {
    console.error("Error in /assign-coordinator:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
});

app.get("/get-merch-accounts-dashboard", async (req, res) => {
  try {
    const { company, clientAssigned, year } = req.query;

    const baseFilter = {};

    if (company && company !== "All") {
      baseFilter.company = { $regex: new RegExp(`^${company.trim()}$`, "i") };
    }

    if (clientAssigned) {
      baseFilter.clientAssigned = {
        $regex: new RegExp(`^${clientAssigned.trim()}$`, "i"),
      };
    }

    const projection = {
      company: 1,
      clientAssigned: 1,
      remarks: 1,
      status: 1,
      employeeNo: 1,
      firstName: 1,
      lastName: 1,
      middleName: 1,
      position: 1,
      dateHired: 1,
      dateResigned: 1,
      createdBy: 1,
      createdAt: 1,
      outletsAssigned: 1,
    };

    const mapStatus = (remarks) => {
      if (!remarks) return "unknown";
      switch (remarks.toLowerCase()) {
        case "active":
        case "employed":
          return "employed";
        case "resign":
        case "resigned": // ← add this
          return "resigned"; // ← return "resigned" (lowercase, consistent)
        case "applicant":
          return "applicant";
        case "terminate":
        case "terminated": // ← add this
          return "terminate";
        case "end of contract":
          return "end of contract";
        default:
          return "unknown";
      }
    };

    let accounts;

    if (year && year !== "All") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const yearStart = new Date(`${year}-01-01T00:00:00.000+08:00`); // PH time
      const yearEnd = new Date(`${year}-12-31T23:59:59.999+08:00`); // PH time

      const [yearAccounts, recentAccounts] = await Promise.all([
        MerchAccount.find(
          {
            ...baseFilter,
            $or: [
              { dateHired: { $gte: yearStart, $lte: yearEnd } },
              { dateResigned: { $gte: yearStart, $lte: yearEnd } },
              { createdAt: { $gte: yearStart, $lte: yearEnd } },
            ],
          },
          projection,
        ),
        MerchAccount.find(
          {
            ...baseFilter,
            createdAt: { $gte: sevenDaysAgo },
          },
          projection,
        ),
      ]);

      const map = new Map();
      [...yearAccounts, ...recentAccounts].forEach((a) =>
        map.set(a._id.toString(), a),
      );
      accounts = Array.from(map.values());
    } else {
      accounts = await MerchAccount.find(baseFilter, projection);
    }

    const normalizedAccounts = accounts.map((a) => ({
      ...a._doc,
      remarks: mapStatus(a.remarks),
      dateHired: a.dateHired ? new Date(a.dateHired) : null,
      dateResigned: a.dateResigned ? new Date(a.dateResigned) : null,
    }));

    res.status(200).json(normalizedAccounts);
  } catch (error) {
    console.error("Error fetching accounts:", error);
    res.status(500).json({ message: "Failed to fetch accounts" });
  }
});

app.get("/get-merch-accounts", async (req, res) => {
  try {
    const accounts = await MerchAccount.find(
      {},
      {
        company: 1,
        status: 1,
        remarks: 1,
        riderid: 1,
        employeeNo: 1,
        firstName: 1,
        suffix: 1,
        middleName: 1,
        lastName: 1,
        modeOfDisbursement: 1,
        accountNumber: 1,
        contact: 1,
        email: 1,
        birthday: 1,
        age: 1,
        sss: 1,
        philhealth: 1,
        hdmf: 1,
        tin: 1,
        position: 1,
        dateHired: 1,
        dateResigned: 1,
        homeAddress: 1,
        silBalance: 1,

        reasonForLeaving: 1,
        dateClearance: 1,
        clearanceStatus: 1,
        dateCleared: 1,
        dateLastPay: 1,
        verdictCalled: 1,

        clientAssigned: 1,
        region: 1,
        outlet: 1,
        outletAssigned: 1,
        outletsAssigned: 1,
        outletStatusMap: 1,
        deployStatus: 1,
        deployDate: 1,
        undeployDate: 1,
        applicantStatus: 1,
        outletAssignmentHistory: 1,
        requirementsImages: 1,
      },
    );

    res.status(200).json(accounts);
  } catch (error) {
    console.error("Error fetching accounts:", error);
    res.status(500).json({ message: "Failed to fetch accounts" });
  }
});

app.put("/update-employee-remarks", async (req, res) => {
  const { employeeId, remarks, updatedBy } = req.body;
  await MerchAccount.findByIdAndUpdate(employeeId, {
    remarks,
    updatedAt: new Date(),
  });
  res.json({ success: true });
});

app.put("/update-employee-status", async (req, res) => {
  const { employeeId, status, updatedBy } = req.body;
  await MerchAccount.findByIdAndUpdate(employeeId, {
    status,
    updatedAt: new Date(),
  });
  res.json({ success: true });
});

// UPDATE USER STATUS

app.put("/update-user-status", async (req, res) => {
  const { email, isVerified } = req.body;

  if (!email || typeof isVerified !== "boolean") {
    return res.status(400).send({
      status: "error",
      data: "Missing or invalid email / isVerified",
    });
  }

  try {
    const result = await User.findOneAndUpdate(
      { email: email },
      { $set: { isVerified: isVerified } },
      { new: true },
    );

    if (!result) {
      return res.status(404).send({
        status: "error",
        data: "User not found",
      });
    }

    console.log("Updated user:", result);
    res.send({
      status: 200,
      data: "Status updated",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      status: "error",
      data: error.message,
    });
  }
});

// UPDATE USERS OUTLET
app.put("/update-user-branch", async (req, res) => {
  const { email, outlet } = req.body;

  try {
    const updatedUser = await User.findOneAndUpdate(
      { email },
      { $set: { outlet } }, // No need to join, just save the array
      { new: true },
    );

    if (!updatedUser) {
      return res
        .status(404)
        .send({ status: "error", message: "User not found" });
    }

    res.send({ status: 200, data: "User branches updated", user: updatedUser });
  } catch (error) {
    res.status(500).send({ status: "error", message: error.message });
  }
});

// ADMIN LOGIN

app.post("/login-admin", async (req, res) => {
  const { emailAddress, password } = req.body;

  try {
    // 🔹 1. Validate required fields
    if (!emailAddress && !password) {
      return res.status(400).json({
        status: 400,
        message: "Email address and password are required",
      });
    }

    if (!emailAddress) {
      return res.status(400).json({
        status: 400,
        message: "Email address is required",
      });
    }

    if (!password) {
      return res.status(400).json({
        status: 400,
        message: "Password is required",
      });
    }

    // 🔹 2. Check if email exists
    const user = await AdminUser.findOne({ emailAddress });

    if (!user) {
      return res.status(404).json({
        status: 404,
        message: "Email address does not exist",
      });
    }

    // 🔹 3. Validate password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        status: 401,
        message: "Incorrect password",
      });
    }

    // 🔹 4. Login success
    return res.status(200).json({
      status: 200,
      message: "Login successful",
      data: {
        firstName: user.firstName,
        lastName: user.lastName,
        roleAccount: user.roleAccount,
        outlet: user.outlet,
        emailAddress: user.emailAddress,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal server error",
    });
  }
});

//SIGN UP

app.post("/signup", async (req, res) => {
  const {
    role,
    outlet,
    firstName,
    middleName,
    lastName,
    email,
    contactNumber,
    password,
  } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ message: "Email already registered" });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create new user with isVerified set to false
  const newUser = new User({
    role, // Include role
    outlet,
    firstName,
    middleName,
    lastName,
    email,
    contactNumber,
    password: hashedPassword,
    isVerified: false,
  });

  await newUser.save();

  // Generate and send OTP (6 digits only)
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // Generates a 6-digit number
  const newOtp = new Otp({ email, otp });
  await newOtp.save();
  await sendEmail(
    email,
    "Your OTP Code",
    `Your OTP is ${otp}. It will expire in 5 minutes.`,
  );

  res.status(201).json({ message: "User registered. OTP sent to email." });
});

// FORGOT PASSWORD ADMIN

app.post("/send-otp-forgotpassword", async (req, res) => {
  const { emailAddress } = req.body;

  const oldUser = await AdminUser.findOne({ emailAddress: emailAddress });

  if (!oldUser) {
    return res.status(404).json({ error: "Email does not exist" });
  }

  try {
    var code = Math.floor(100000 + Math.random() * 900000);
    code = String(code);
    code = code.substring(0, 4);

    const info = await transporter.sendMail({
      from: {
        name: "BMPower",
        address: process.env.EMAIL_USER,
      },
      to: emailAddress,
      subject: "OTP code",
      html:
        "<b>Your OTP code is</b> " +
        code +
        "<b>. Do not share this code with others.</b>",
    });

    return res.status(200).json({
      status: 200,
      data: info,
      emailAddress: emailAddress,
      code: code,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Failed to send OTP. Please try again." });
  }
});

app.put("/forgot-password-reset", async (req, res) => {
  const { password, emailAddress } = req.body;

  const encryptedPassword = await bcrypt.hash(password, 8);

  console.log(emailAddress);
  try {
    await AdminUser.findOneAndUpdate(
      { emailAddress: emailAddress },
      { $set: { password: encryptedPassword } },
    );
    res.send({ status: 200, data: "Password updated" });
  } catch (error) {
    res.send({ status: "error", data: error });
  }
});

// FORGOT PASSWORD

app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ message: "User not found" });

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save OTP in the Otp collection with purpose "reset-password"
    await Otp.create({
      email,
      otp,
      purpose: "reset-password",
      createdAt: new Date(),
    });

    // Send OTP via email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset OTP",
      text: `Your OTP is: ${otp}`,
    });

    res.status(200).json({ message: "OTP sent to email" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to send OTP" });
  }
});

// VERIFY OTP

app.post("/verify-otp", async (req, res) => {
  const { email, otp, purpose } = req.body;

  const otpEntry = await Otp.findOne({ email, otp, purpose });
  if (!otpEntry) {
    return res.status(400).json({ message: "Invalid or expired OTP" });
  }

  if (purpose === "verify-email") {
    await User.updateOne({ email }, { isVerified: true });
  }

  // For reset-password, don’t delete OTP yet. Just return success.
  if (purpose === "verify-email") {
    await Otp.deleteOne({ _id: otpEntry._id });
  }

  return res.status(200).json({ message: "OTP verified successfully" });
});

const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async (to, subject, text) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
  };
  await transporter.sendMail(mailOptions);
};

// RESET PASSWORD

app.post("/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: "Password has been reset successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Reset failed" });
  }
});

//PROFILE

app.get("/profile", authMiddleware, async (req, res) => {
  try {
    // req.user is set by authMiddleware after verifying token
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

//LOGIN

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const payload = {
      user: {
        id: user.id,
        email: user.email, // ✅ added for middleware
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "180d" }, // 6-month token
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            outlet: user.outlet,
            role: user.role,
          },
        });
      },
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Auth

app.get("/auth", authMiddleware, async (req, res) => {
  try {
    // req.user is set by authMiddleware after verifying token
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
