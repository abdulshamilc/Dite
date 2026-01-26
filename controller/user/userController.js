import { User, UserOtpVerification } from "../../models/userModels.js";
import bcrypt from "bcryptjs";
import { signupStep1Validation, signupPasswordValidation } from "../../validators/authValidator.js";
import UserLog from "../../models/userLogModel.js";
import geoip from "geoip-lite";
import * as UAParser from "ua-parser-js";
import passwordSchema from "../../validators/resetPasswordValidator.js";
import { generateOTP } from "../../utils/genarateOtp.js";
import jwt from "jsonwebtoken";
import Cart from '../../models/cartModel.js' ;
import Wallet from '../../models/walletModel.js';
import { SUCCESS_MESSAGES, ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";
// Not logged in home
// Not logged in home
const notLogginedHome = (req, res) => {
  res.render("user/home");
};
// Get signup
const getSignup = (req, res) => {
  if (req.session.user) return res.redirect("/");
  const referralCode = req.query.ref || "";
  res.render("user/authentications/signup", { errors: {}, oldData: { referralCode } });
};

// Signup
const signup = async (req, res) => {
  try {
    const { error } = signupStep1Validation.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = {};
      error.details.forEach((detail) => {
        errors[detail.path[0]] = detail.message;
      });
      return res.status(400).render("user/authentications/signup", {
        errors,
        oldData: req.body,
      });
    }

    const { name, email, referralCode } = req.body;

    // check if the user exist
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (existingUser.isBlocked) {
        return res.status(HTTP_STATUS.BAD_REQUEST).render("user/authentications/signup", {
          errors: { userExist: ERROR_MESSAGES.ACCOUNT_BLOCKED },
          oldData: req.body,
        });
      }
        return res.status(HTTP_STATUS.BAD_REQUEST).render("user/authentications/signup", {
        errors: { userExist: ERROR_MESSAGES.EMAIL_ALREADY_EXISTS },
        oldData: req.body,
      });
    }

    // Store in session and move to Step 2
    req.session.signupStep1 = { name, email, referralCode };
    res.redirect("/set-password");
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Get set password
const getSetPassword = (req, res) => {
  if (!req.session.signupStep1) return res.redirect("/signup");
  res.render("user/authentications/signupPassword", { errors: {}, oldData: {} });
};

// Post set password
const postSetPassword = async (req, res) => {
  try {
    if (!req.session.signupStep1) return res.redirect("/signup");

    const { error } = signupPasswordValidation.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = {};
      error.details.forEach((detail) => {
        errors[detail.path[0]] = detail.message;
      });
      return res.render("user/authentications/signupPassword", {
        errors,
        oldData: req.body,
      });
    }

    const { password } = req.body;
    const { name, email, referralCode } = req.session.signupStep1;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Prepare complete new user object (Verified: false by default until OTP)
    const newUser = {
      name,
      email,
      password: hashedPassword,
      referralCode, // Assuming schema handles this if passed to User constructor
    };

    // Generate OTP
    await generateOTP(
      email,
      "Your OTP Code For Creating New User",
      "Your OTP code For Creating Dite User Account is",
      "Create User"
    );

    req.session.tempData = newUser;
    // Clear step 1 data to prevent going back easily without restarting? 
    // Usually keep it until success, but standard flow puts it in tempData now.
    delete req.session.signupStep1; 

    res.redirect("/signup/verify-otp");
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Get signup OTP verify
const getSignupOtpVerify = async (req, res) => {
  try {
    if (!req.session.tempData) return res.redirect("/signup");
    const errors = { otp: req.session.otpError };
    req.session.otpError = null; // Clear after showing once

    res.render("user/authentications/signupOtpVerify", { errors });
  } catch (error) {
    console.error(error);
  }
};

// Resend signup OTP
const resendSignupOtp = async (req, res) => {
  try {
    if (!req.session.tempData) return res.redirect("/signup");

    const { email } = req.session.tempData;

    // Delete any old OTPs for that email
    await UserOtpVerification.deleteMany({ email });

    await generateOTP(
      email,
      "Your OTP Code For Creating New User",
      "Your OTP code For Creating Dite User Account is",
      "Create User"
    );

    // Optionally set a message for feedback
    req.session.otpSuccess = "A new OTP has been sent to your email.";
    res.redirect("/signup/verify-otp");
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send("Error resending OTP");
  }
};

// Post signup OTP verify
const postSignupOtpVerify = async (req, res) => {
  try {
    if (!req.session.tempData) {
      req.session.error = "Session expired. Please sign up again.";
      return res.redirect("/signup");
    }

    const { otp1, otp2, otp3, otp4, otp5, otp6 } = req.body;

    const otpArray = [otp1, otp2, otp3, otp4, otp5, otp6];

    // Validate OTP digits
    if (!otpArray.every((otp) => /^\d$/.test(otp))) {
      req.session.otpError = ERROR_MESSAGES.OTP_INVALID_FORMAT;
      return res.redirect("/signup/verify-otp");
    }

    const enteredOtp = otpArray.join("");

    if (enteredOtp.length !== 6) {
      req.session.otpError = "OTP must be 6 digits.";
      return res.redirect("/signup/verify-otp");
    }

    const newUser = req.session.tempData;

    // Find and validate OTP within the last 5 minutes
    const otpVerify = await UserOtpVerification.findOne({
      email: newUser.email,
      createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
    });

    if (!otpVerify || Number(enteredOtp) !== otpVerify.otp) {
      req.session.otpError = ERROR_MESSAGES.OTP_INVALID_EXPIRED;
      return res.redirect("/signup/verify-otp");
    }

    // Delete OTP record
    await UserOtpVerification.deleteOne({ email: newUser.email });

    // Generate Referral Code for the new user (8 digits)
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let myReferralCode = "";
    for (let i = 0; i < 8; i++) {
        myReferralCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Check if they used a referral code
    const usedReferralCode = newUser.referralCode; // This comes from the signup form input
    let referredByCode = null;

    if (usedReferralCode) {
      const referrer = await User.findOne({ referralCode: usedReferralCode });
      if (referrer) {
        referredByCode = referrer.referralCode;
        referrer.redeemedUsers.push(newUser.email);
        await referrer.save();

        // Credit 100 Rs to Referrer Wallet
        try {
            await Wallet.creditReferral(referrer._id, 100, `Referral Bonus: ${newUser.name}`);
        } catch (err) {
            console.error("Referral Wallet Credit Error:", err);
        }
      }
    }

    // Update newUser object
    newUser.referralCode = myReferralCode;
    newUser.referredBy = referredByCode;

    // Save user
    const user = new User(newUser);
    await user.save();

    req.session.tempData = null;

    // Get IP & Location
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress ||
      req.ip;

    const geo = geoip.lookup(ip);
    const location = geo
      ? `${geo.city || geo.region || geo.country}`
      : "Unknown";

    // User-Agent Parsing (Fixed)
    const uaString = req.headers["user-agent"] || "";
    const parser = new UAParser.UAParser(uaString);
    const uaResult = parser.getResult();
    const device = `${uaResult.device.type || "Desktop"} - ${
      uaResult.os.name || ""
    } ${uaResult.os.version || ""}`.trim();

    // Logging signup
    await UserLog.create({
      userId: user._id,
      ipAddress: ip,
      browser: uaString,
      device: device,
      location: location,
    });

    // Session (Consistent format)
    req.session.user = user.email;
    req.session.authenticated = true;

    return res.redirect("/");
  } catch (error) {
    console.error("OTP Verification Error:", error);
    req.session.otpError = "An unexpected error occurred. Please try again.";
    return res.redirect("/signup/verify-otp");
  }
};

// Get login
const getLogin = async (req, res) => {
  try {
    if (req.session.user) res.render("user/home");
    else res.render("user/authentications/login", { errors: {}, oldData: {} });
  } catch (error) {}
};

// Login
const login = async (req, res) => {
  //Validating Email
  const { email, password } = req.body;

  if (email == "") {
    return res.render("user/authentications/login", {
      errors: { message: ERROR_MESSAGES.EMAIL_REQUIRED },
    });
  }
  if (password == "") {
    return res.render("user/authentications/login", {
      errors: { message: ERROR_MESSAGES.PASSWORD_REQUIRED },
    });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.render("user/authentications/login", {
      errors: { message: ERROR_MESSAGES.INVALID_EMAIL },
    });
  }

  const validatePassword = await bcrypt.compare(password, user.password);
  if (!validatePassword) {
    return res.render("user/authentications/login", {
      errors: { message: ERROR_MESSAGES.PASSWORD_MISMATCH },
    });
  }

  if (user.isBlocked) {
    return res.render("user/authentications/login", {
      errors: { message: ERROR_MESSAGES.ACCOUNT_BLOCKED },
    });
  }

  if (user.isDeleted) {
    return res.render("user/authentications/login", {
      errors: { message: "This account has been deleted." },
    });
  }

  // Check if 2FA is enabled
  if (user.twoFactorAuth && user.twoFactorSecret) {
    // Store pending login info in session
    req.session.pending2FALogin = {
      email: email,
      userId: user._id,
      returnTo: req.session.returnTo || "/",
    };
    delete req.session.returnTo;
    
    return res.redirect("/login/verify-2fa");
  }

  //Log
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress ||
    req.ip;

  // Parse location from IP
  const geo = geoip.lookup(ip);
  const location = geo ? `${geo.city || geo.region || geo.country}` : "Unknown";

  // Parse device info from User-Agent
  const parser = new UAParser.UAParser(req.headers["user-agent"]);
  const uaResult = parser.getResult();
  const device = `${uaResult.device.type || "Desktop"} - ${
    uaResult.os.name || ""
  } ${uaResult.os.version || ""}`.trim();

  // Create log
  await UserLog.create({
    userId: user._id,
    ipAddress: ip,
    browser: req.headers["user-agent"],
    device: device,
    location: location,
  });

  req.session.user = email;
  const returnTo = req.session.returnTo || "/";
  delete req.session.returnTo;
  res.redirect(returnTo);
};

// Get forgot password
const getForgotPassword = (req, res) => {
  res.render("user/authentications/forgetPassword");
};


// Forget password
const forgetPassword = async (req, res) => {
  try {
    const email = req.body.email;

    // Checking required fields
    if (!email) return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.EMAIL_REQUIRED });

    // Verifying the Email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.INVALID_EMAIL });
  

    generateOTP(email, "Forget Password" , "The OTP For Resetting Your Password" , "Forget Password");
    req.session.email = email;

    return res.json({
      message: SUCCESS_MESSAGES.OTP_SENT,
      userId: user._id,
      // redirect:"/"
      redirect: "/forgot-password/otpVerification",
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
    if (!req.session.email) return res.redirect("/forgot-password");
    res.render("user/authentications/otpForgetPassword");
  } catch (error) {
    console.error(error);
  }
};



// Post OTP verification
const PostOtpVerification = async (req, res) => {
  try {
    const EnterdOtp = req.body.otp;


    if (!EnterdOtp) return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.OTP_REQUIRED });

    if (!userOtp)
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.OTP_INVALID_EXPIRED });

    if (EnterdOtp != userOtp.otp)
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.OTP_INCORRECT });

    const email = req.session.email;
    const action = "Reset Pasword";

    //  Create JWT Reset Token (valid for 15 minutes)
    const resetToken = jwt.sign({ email: email }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    await UserOtpVerification.create({ email, action, resetToken });



    await UserOtpVerification.deleteOne({ _id: userOtp._id });

    delete req.session.email;
    return res.json({
      success: true,
      redirectUrl: `/reset-password/${resetToken}`,
    });
  } catch (error) {
    console.error("Error in PostOtpVerification:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: ERROR_MESSAGES.INTERNAL_ERROR });
  }
};


// Get reset password
const getResetPasword = async (req, res) => {

  const { token } = req.params;
  try {
    // Check if token exists in DB
    const tokenExist = await UserOtpVerification.findOne({ resetToken: token });
    if (!tokenExist) {
      return res.render("pageNotFoundAdmin");
    }
    

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
  
    res.render("user/authentications/resetPassword", {
      email: decoded?.email || null,
      token: token,
      errorMsg: null,
      successMsg: null,
    });
  } catch (error) {
    let msg = ERROR_MESSAGES.RESET_LINK_INVALID;
    if (error.name === "TokenExpiredError")
      msg = ERROR_MESSAGES.RESET_LINK_EXPIRED;

    return res.render("user/authentications/resetPassword", {
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

    const user = await User.findOne({ email: email });
    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) {
      return res
        .status(400)
        .json({
          message: ERROR_MESSAGES.PASSWORD_SAME,
        });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    await UserOtpVerification.deleteOne({ resetToken: token });

    return res.json({
      success: true,
      message: SUCCESS_MESSAGES.PASSWORD_RESET_SUCCESS,
    });
  } catch (error) {
    console.error("Error in postResetPassword:", error);
    return res
      .status(500)
      .json({ message: ERROR_MESSAGES.INTERNAL_ERROR, error: error.message });
  }
};



// Reset password
const restPassword = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: ERROR_MESSAGES.UNAUTHORIZED_ACCESS });

    const user = await User.findOne({ email: userEmail });
    if (!user) return res.status(HTTP_STATUS.NOT_FOUND).json({ message: ERROR_MESSAGES.USER_NOT_FOUND });

    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validate new password and confirm password using your Joi schema
    const { error } = passwordSchema.validate({ newPassword, confirmPassword });
    if (error)
      return res.status(400).json({ message: error.details[0].message });

    // Check if current password matches database
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch)
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.CURRENT_PASSWORD_INCORRECT });

    // Ensure new password is different from current
    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: ERROR_MESSAGES.NEW_PASSWORD_DIFFERENT,
      });
    }

    //  Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password
    user.password = hashedPassword;
    await user.save();

    return res.status(HTTP_STATUS.OK).json({ message: SUCCESS_MESSAGES.PASSWORD_UPDATED });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: ERROR_MESSAGES.INTERNAL_ERROR });
  }
};

// User blocked
const userBloked = (req, res) => {
  try {
    res.render("user/authentications/userblocked");
  } catch (error) {
    console.error(error);
  }
};

// Get About Us
const getAbout = (req, res) => {
  res.render("user/about");
};

// Get Contact Us
const getContact = (req, res) => {
  res.render("user/contact");
};

// Get Privacy Policy
const getPrivacy = (req, res) => {
  res.render("user/privacy");
};

// Get Terms & Conditions
const getTerms = (req, res) => {
  res.render("user/terms");
};

// Get FAQ
const getFaq = (req, res) => {
  res.render("user/faq");
};

// Get 2FA Verification Page (during login)
const get2FAVerify = (req, res) => {
  if (!req.session.pending2FALogin) {
    return res.redirect("/login");
  }
  res.render("user/authentications/verify2FA", {
    email: req.session.pending2FALogin.email,
  });
};

// Post 2FA Verification (during login)
const post2FAVerify = async (req, res) => {
  try {
    const pendingLogin = req.session.pending2FALogin;
    
    if (!pendingLogin) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "No pending login found. Please login again.",
      });
    }

    const { code } = req.body;

    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Please enter a valid 6-digit code.",
      });
    }

    const user = await User.findById(pendingLogin.userId);
    if (!user || !user.twoFactorSecret) {
      delete req.session.pending2FALogin;
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Invalid session. Please login again.",
      });
    }

    const speakeasy = await import("speakeasy");
    
    const verified = speakeasy.default.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: code,
      window: 1,
    });

    if (!verified) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Invalid code. Please try again.",
      });
    }

    // 2FA verified - complete login
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress ||
      req.ip;

    const geo = geoip.lookup(ip);
    const location = geo ? `${geo.city || geo.region || geo.country}` : "Unknown";

    const parser = new UAParser.UAParser(req.headers["user-agent"]);
    const uaResult = parser.getResult();
    const device = `${uaResult.device.type || "Desktop"} - ${
      uaResult.os.name || ""
    } ${uaResult.os.version || ""}`.trim();

    // Create log
    await UserLog.create({
      userId: user._id,
      ipAddress: ip,
      browser: req.headers["user-agent"],
      device: device,
      location: location,
    });

    // Set session and clear pending login
    req.session.user = pendingLogin.email;
    const returnTo = pendingLogin.returnTo || "/";
    delete req.session.pending2FALogin;

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Verification successful!",
      redirectUrl: returnTo,
    });
  } catch (error) {
    console.error("2FA verify error:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: ERROR_MESSAGES.INTERNAL_ERROR,
    });
  }
};

// Verify Referral Code
const verifyReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;

    if (!referralCode || referralCode.trim() === "") {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Referral code is required.",
      });
    }

    // Find user with this referral code
    const referrer = await User.findOne({ 
      referralCode: referralCode.trim().toUpperCase(),
      isDeleted: { $ne: true },
      isBlocked: { $ne: true },
    });

    if (!referrer) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Invalid referral code.",
      });
    }

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      referrerName: referrer.name.toLowerCase(),
    });
  } catch (error) {
    console.error("Verify referral code error:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: ERROR_MESSAGES.INTERNAL_ERROR,
    });
  }
};

export {
  notLogginedHome,
  getSignup,
  signup,
  getSetPassword,
  postSetPassword,
  getSignupOtpVerify,
  resendSignupOtp,
  postSignupOtpVerify,
  getLogin,
  login,
  getForgotPassword,
  forgetPassword,
  getOtpVerification,
  PostOtpVerification,
  getResetPasword,
  postResetPassword,
  restPassword,
  userBloked,
  getAbout,
  getContact,
  getPrivacy,
  getTerms,
  getFaq,
  get2FAVerify,
  post2FAVerify,
  verifyReferralCode,
};
