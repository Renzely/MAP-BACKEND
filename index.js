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
      { new: true }
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
      { new: true }
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
      { new: true }
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
      homeAddress: "Home Address",
      silBalance: "SIL Balance",
      clientAssigned: "Client Assigned",
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
        employeeName: `${original.firstName || ""} ${
          original.lastName || ""
        }`.trim(),
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
    const activities = await RecentActivity.find().sort({ date: -1 }).limit(50); // show most recent 50

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

app.post("/create-merch-account", async (req, res) => {
  try {
    const {
      company,
      status,
      remarks,
      employeeNo,
      firstName,
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
      dateHired,
      homeAddress,
      silBalance,
      clientAssigned,
      requirementsImages,
    } = req.body;

    // ✅ Check required fields (excluding optional ones)
    if (
      !company ||
      !status ||
      !remarks ||
      !employeeNo ||
      !firstName ||
      !lastName ||
      !modeOfDisbursement ||
      !contact ||
      !birthday ||
      !position ||
      !dateHired ||
      !homeAddress ||
      !clientAssigned ||
      !silBalance
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // ✅ Check duplicates only for non-empty optional fields
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
        message: `Duplicate found in: ${duplicateFields.join(", ")}.`,
      });
    }

    // ✅ Prepare new account data
    const newAccount = new MerchAccount({
      company,
      status,
      remarks,
      employeeNo,
      firstName,
      middleName,
      lastName,
      modeOfDisbursement,
      accountNumber:
        modeOfDisbursement === "TBA" || !accountNumber ? null : accountNumber,
      contact,
      email: email?.trim() || undefined, // undefined avoids MongoDB duplicate key error
      birthday,
      age: age || null,
      sss: sss?.trim() || undefined,
      philhealth: philhealth?.trim() || undefined,
      hdmf: hdmf?.trim() || undefined,
      tin: tin?.trim() || undefined,
      position,
      dateHired,
      homeAddress,
      silBalance,
      clientAssigned,
      requirementsImages: requirementsImages || [],
    });

    // ✅ Save account
    await newAccount.save();

    return res
      .status(200)
      .json({ message: "Account created successfully", data: newAccount });
  } catch (error) {
    console.error("Error creating merch account:", error);

    // Handle MongoDB duplicate key error for safety
    if (error.code === 11000) {
      const dupField = Object.keys(error.keyPattern)[0].toUpperCase();
      return res.status(409).json({
        message: `Duplicate found in: ${dupField}`,
      });
    }

    return res.status(500).json({ message: "Internal server error" });
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
        employeeNo: 1,
        firstName: 1,
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
        homeAddress: 1,
        silBalance: 1,
        clientAssigned: 1,
        requirementsImages: 1, // ✅ include photo field
      }
    );

    res.status(200).json(accounts);
  } catch (error) {
    console.error("Error fetching accounts:", error);
    res.status(500).json({ message: "Failed to fetch accounts" });
  }
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
      { new: true }
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
      { new: true }
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
    const user = await AdminUser.findOne({ emailAddress });

    if (!user) {
      return res.status(401).json({
        status: 401,
        data: "Email address not found",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        status: 401,
        data: "Incorrect password",
      });
    }

    // Login success
    return res.status(200).json({
      status: 200,
      data: {
        firstName: user.firstName,
        lastName: user.lastName,
        roleAccount: user.roleAccount,
        outlet: user.outlet,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      status: 500,
      data: "Internal server error",
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
    `Your OTP is ${otp}. It will expire in 5 minutes.`
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
      { $set: { password: encryptedPassword } }
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
      }
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
