import { Admin, AdmiResetPassword } from "../../models/adminModels.js";
import sendMail from "../../services/mailer.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import passwordSchema from "../../validators/resetPasswordValidator.js";
import { SUCCESS_MESSAGES, ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";

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

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Checking required fields
    if (!email) return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.EMAIL_REQUIRED });
    if (!password)
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.PASSWORD_REQUIRED });

    // Verifying Admin Email
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.INVALID_EMAIL });

    // Validating the password
    const validatePassword = await bcrypt.compare(password, admin.password);
    if (!validatePassword)
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.INVALID_PASSWORD });

    // Check 2FA
    if (admin.twoFactorAuth && admin.twoFactorSecret) {
      req.session.pendingAdmin2FA = {
        adminId: admin._id,
        returnTo: req.session.returnToAdmin || "/admin/dashboard"
      };
      delete req.session.returnToAdmin;

      return res.json({
         success: true,
         redirect: "/admin/verify-2fa"
      });
    }

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
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: ERROR_MESSAGES.SESSION_ERROR });
      }
      //  success response
      return res.json({
        message: SUCCESS_MESSAGES.LOGIN_SUCCESS,
        adminId: admin._id,
        redirect: returnTo,
      });
    });
  } catch (error) {
    console.error(error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ message: ERROR_MESSAGES.INTERNAL_ERROR });
  }
};


// Get 2FA verification page
const get2FAVerify = (req, res) => {
  if (!req.session.pendingAdmin2FA) {
    return res.redirect("/admin");
  }
  res.render("admin/auth/verify2FA");
};

// Post 2FA verification
const post2FAVerify = async (req, res) => {
  try {
    const { code } = req.body;
    const pending = req.session.pendingAdmin2FA;

    if (!pending) {
      return res.status(400).json({ success: false, message: "Session expired. Please login again." });
    }

    const admin = await Admin.findById(pending.adminId);
    if (!admin) return res.status(400).json({ success: false, message: "Admin not found." });

    const speakeasy = await import("speakeasy");
    const verified = speakeasy.default.totp.verify({
      secret: admin.twoFactorSecret,
      encoding: 'base32',
      token: code
    });

    if (verified) {
      // Login Success
      req.session.admin = {
        id: admin._id,
        email: admin.email,
        role: admin.role,
      };
      const returnTo = pending.returnTo;
      delete req.session.pendingAdmin2FA;

      return res.json({
        success: true,
        redirect: returnTo
      });
    } else {
      return res.status(400).json({ success: false, message: "Invalid OTP code." });
    }

  } catch (error) {
    console.error("2FA Error", error);
    return res.status(500).json({ success: false, message: "Server error" });
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
    if (!email) return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.EMAIL_REQUIRED });

    // Verifying the Email
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.INVALID_EMAIL });

    // validating Role
    if (admin.role != "admin")
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.ACCESS_DENIED });

    await genarateOTP(email);
    req.session.email = email;

    return res.json({
      message: SUCCESS_MESSAGES.OTP_SENT,
      adminId: admin._id,
      // redirect:"/"
      redirect: "/admin/verify-otp",
    });
  } catch (error) {
    console.error("Error in forgetPassword:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json({ message: ERROR_MESSAGES.INTERNAL_ERROR, error: error.message });
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

    if (!EnterdOtp) return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.OTP_REQUIRED });

    if (!adminOtp)
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.OTP_INVALID_EXPIRED });

    if (EnterdOtp != adminOtp.otp)
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.OTP_INCORRECT });

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
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: ERROR_MESSAGES.INTERNAL_ERROR });
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
    let msg = ERROR_MESSAGES.RESET_LINK_INVALID;
    if (error.name === "TokenExpiredError")
      msg = ERROR_MESSAGES.RESET_LINK_EXPIRED;

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
          .status(HTTP_STATUS.BAD_REQUEST)
          .json({ message: ERROR_MESSAGES.RESET_LINK_EXPIRED });
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.RESET_LINK_INVALID });
    }

    const email = decoded.email;

    const admin = await Admin.findOne({ email: email });
    const isSame = await bcrypt.compare(newPassword, admin.password);
    if (isSame) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: ERROR_MESSAGES.PASSWORD_SAME,
      });
    }

    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();

    await AdmiResetPassword.deleteOne({ resetToken: token });

    return res.json({
      success: true,
      message: SUCCESS_MESSAGES.PASSWORD_RESET_SUCCESS,
      redirect: "/admin/login",
    });
  } catch (error) {
    console.error("Error in postResetPassword:", error);
    return res
      .status(500)
      .json({ message: ERROR_MESSAGES.INTERNAL_ERROR, error: error.message });
  }
};





// Logout
const logOut = (req, res) => {
  try {
    delete req.session.admin;
    return res.redirect("/admin");
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
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

    logOut,
    get2FAVerify,
    post2FAVerify
}
