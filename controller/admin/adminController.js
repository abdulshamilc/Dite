import { Admin, AdmiResetPassword } from "../../models/adminModels.js";
import sendMail from "../../services/mailer.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import passwordSchema from "../../validators/resetPasswordValidator.js";

// Page not found
const pageNotFound = (req, res) => {
  try {
    res.render("admin/pageNotFound");
  } catch (error) {}
};

// Get login
const getLogin = (req, res) => {
  if (req.session.admin) {
    res.redirect("admin/dashboard");
  } else res.render("admin/auth/login", { errors: {}, oldData: {} });
};

// Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Checking required fields
    if (!email) return res.status(400).json({ message: "Email is required" });
    if (!password)
      return res.status(400).json({ message: "Password is required" });

    // Verifying Admin Email
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) return res.status(400).json({ message: "Invalid Email" });

    // Validating the password
    const validatePassword = await bcrypt.compare(password, admin.password);
    if (!validatePassword)
      return res.status(400).json({ message: "Invalid Password" });

    // Saving admin On session
    req.session.admin = {
      id: admin._id,
      email: admin.email,
      role: admin.role,
    };

    const returnTo = req.session.returnToAdmin || "/admin/dashboard";
    delete req.session.returnToAdmin;

    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ message: "Session error" });
      }
      //  success response
      return res.json({
        message: "Login successful",
        adminId: admin._id,
        redirect: returnTo,
      });
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Server error, please try again later" });
  }
};
// Get forgot password
const getForgotPassword = (req, res) => {
  res.render("admin/auth/forgetPassword");
};

// Generate OTP
const genarateOTP = async (email) => {
  try {
    // success response
    const otp = Math.floor(1000 + Math.random() * 9000);


    sendMail({
      to: email,
      subject: "Your OTP Code For Resetting Password",
      text: `Your OTP code For resetting Dite Admin Account password is ${otp}`,
      html: `<p>Your OTP code is <b>${otp}</b></p>`,
    });
    const action = "Forget Password";

    await AdmiResetPassword.create({ email, action, otp });
  } catch (error) {
    console.error(error);
  }
};

// Forget password
const forgetPassword = async (req, res) => {
  try {
    const email = req.body.email;

    // Checking required fields
    if (!email) return res.status(400).json({ message: "Email is required" });

    // Verifying the Email
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) return res.status(400).json({ message: "Invalid Email" });

    // validating Role
    if (admin.role != "admin")
      return res.status(400).json({ message: "Access Denied " });

    await genarateOTP(email);
    req.session.email = email;

    return res.json({
      message: "OTP sent successfully to your email",
      adminId: admin._id,
      // redirect:"/"
      redirect: "/admin/verify-otp",
    });
  } catch (error) {
    console.error("Error in forgetPassword:", error);
    return res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};

// Get OTP verification
const getOtpVerification = (req, res) => {
  try {
    if (!req.session.email) return res.redirect("/admin/forgot-password");
    res.render("admin/auth/otpForgetPassword");
  } catch (error) {
    console.error(error);
  }
};
// Post OTP verification
const PostOtpVerification = async (req, res) => {
  try {
    const EnterdOtp = req.body.otp;
    const adminOtp = await AdmiResetPassword.findOne({
      email: req.session.email,
    }).sort({ createdAt: -1 });

    if (!EnterdOtp) return res.status(400).json({ message: "OTP is required" });

    if (!adminOtp)
      return res.status(400).json({ message: "OTP expired or not found" });

    if (EnterdOtp != adminOtp.otp)
      return res.status(400).json({ message: "OTP is Incorrect" });

    const email = req.session.email;
    const action = "Reset Pasword";

    //  Create JWT Reset Token (valid for 15 minutes)
    const resetToken = jwt.sign({ email: email }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    await AdmiResetPassword.create({ email, action, resetToken });



    await AdmiResetPassword.deleteOne({ _id: adminOtp._id });

    delete req.session.email;
    return res.json({
      success: true,
      redirectUrl: `/admin/reset-password/${resetToken}`,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Get reset password
const getResetPasword = async (req, res) => {
  const { token } = req.params;
  try {
    // Check if token exists in DB
    const tokenExist = await AdmiResetPassword.findOne({ resetToken: token });
    if (!tokenExist) {
      return res.render("pageNotFoundAdmin");
    }

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    res.render("admin/auth/resetForgetPassword", {
      email: decoded?.email || null,
      token: token,
      errorMsg: null,
      successMsg: null,
    });
  } catch (error) {
    let msg = "Invalid reset link.";
    if (error.name === "TokenExpiredError")
      msg = "Reset link expired. Please request a new one.";

    return res.render("admin/auth/resetForgetPassword", {
      email: null,
      token: null,
      errorMsg: msg,
      successMsg: null,
    });
  }
};

// Post reset password
const postResetPassword = async (req, res) => {
  try {
    const token = req.params.token;
    const { newPassword, confirmPassword } = req.body;

    const { error } = passwordSchema.validate({ newPassword, confirmPassword });
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }



    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res
          .status(400)
          .json({ message: "Reset link expired. Please request a new one." });
      }
      return res.status(400).json({ message: "Invalid reset token." });
    }

    const email = decoded.email;

    const admin = await Admin.findOne({ email: email });
    const isSame = await bcrypt.compare(newPassword, admin.password);
    if (isSame) {
      return res.status(400).json({
        message: "New password cannot be the same as the old password.",
      });
    }

    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();

    await AdmiResetPassword.deleteOne({ resetToken: token });

    return res.json({
      success: true,
      message: "Password reset successful. You can now log in.",
      redirect: "/admin/login",
    });
  } catch (error) {
    console.error("Error in postResetPassword:", error);
    return res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};





// Logout
const logOut = (req, res) => {
  try {
    delete req.session.admin;
    return res.redirect("/admin");
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal server error");
  }
};

export {
    pageNotFound,
    login,
    getLogin,
    getForgotPassword,
    forgetPassword,
    genarateOTP,
    getOtpVerification,
    PostOtpVerification,
    getResetPasword,
    postResetPassword,

    logOut
}
