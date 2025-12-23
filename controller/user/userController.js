import { User, UserOtpVerification } from "../../models/userModels.js";
import bcrypt from "bcryptjs";
import { signupValidation } from "../../validators/authValidator.js";
import UserLog from "../../models/userLogModel.js";
import geoip from "geoip-lite";
import * as UAParser from "ua-parser-js";
import passwordSchema from "../../validators/resetPasswordValidator.js";
import { generateOTP } from "../../utils/genarateOtp.js";
import jwt from "jsonwebtoken";
import Cart from '../../models/cartModel.js' ;
const notLogginedHome = (req, res) => {
  const cartLength = 0 ;
  

  res.render("user/home" , {cartLength});
};
const getSignup = (req, res) => {
  if (req.session.user) return res.redirect("/");
  31;
  res.render("user/authentications/signup", { errors: {}, oldData: {} });
};

const signup = async (req, res) => {
  try {
    //Validation Using Joi
    const { error } = signupValidation.validate(req.body);
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

    const { name, email, password } = req.body;

    //check if the user exist
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      const errors = {};
      errors.userExist = "User Already Exists ";

      return res.status(400).render("user/authentications/signup", {
        errors,
        oldData: req.body,
      });
    }
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Creating User
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
    });

    await generateOTP(
      email,
      "Your OTP Code For Creating New User",
      "Your OTP code For Creating Dite User Account is",
      "Create User"
    );
    req.session.tempData = newUser;

    res.redirect("/signup/verify-otp");
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
};

const getSignupOtpVerify = async (req, res) => {
  try {
    if (!req.session.tempData) return res.redirect("/signup");
    const errors = { otp: req.session.otpError };
    req.session.otpError = null; // Clear after showing once

    res.render("user/authentications/signupOtpVerify", { errors });
  } catch (error) {
    console.log(error);
  }
};

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
    console.log(error);
    res.status(500).send("Error resending OTP");
  }
};

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
      req.session.otpError = "Invalid OTP format. Please enter 6 digits.";
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
      req.session.otpError = "Invalid or expired OTP.";
      return res.redirect("/signup/verify-otp");
    }

    // Delete OTP record
    await UserOtpVerification.deleteOne({ email: newUser.email });

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

const getLogin = async (req, res) => {
  try {
    if (req.session.user) res.render("user/home");
    else res.render("user/authentications/login", { errors: {}, oldData: {} });
  } catch (error) {}
};

const login = async (req, res) => {
  //Validating Email
  const { email, password } = req.body;

  if (email == "") {
    return res.render("user/authentications/login", {
      errors: { message: "Email Required " },
    });
  }
  if (password == "") {
    return res.render("user/authentications/login", {
      errors: { message: "Password Required " },
    });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.render("user/authentications/login", {
      errors: { message: "Invalid email " },
    });
  }

  const validatePassword = await bcrypt.compare(password, user.password);
  if (!validatePassword) {
    return res.render("user/authentications/login", {
      errors: { message: "Invalid Password " },
    });
  }

  if (user.isBlocked) {
    return res.render("user/authentications/login", {
      errors: { message: "User Is Blocked By Admin " },
    });
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

// Forget Password

const getForgotPassword = (req, res) => {
  res.render("user/authentications/forgetPassword");
};


const forgetPassword = async (req, res) => {
  try {
    const email = req.body.email;

    // Checking required fields
    if (!email) return res.status(400).json({ message: "Email is required" });

    // Verifying the Email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(400).json({ message: "Invalid Email" });
  

    generateOTP(email, "Forget Password" , "The OTP For Resetting Your Password" , "Forget Password");
    req.session.email = email;

    return res.json({
      message: "OTP sent successfully to your email",
      userId: user._id,
      // redirect:"/"
      redirect: "/forgot-password/otpVerification",
    });
  } catch (error) {
    console.error("Error in forgetPassword:", error);
    return res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};

const getOtpVerification = (req, res) => {
  try {
    if (!req.session.email) return res.redirect("/forgot-password");
    res.render("user/authentications/otpForgetPassword");
  } catch (error) {
    console.log(error);
  }
};



const PostOtpVerification = async (req, res) => {
  try {
    const EnterdOtp = req.body.otp;
    console.log(req.session.email)
    const userOtp = await UserOtpVerification.findOne({
      email: req.session.email,
    }).sort({ createdAt: -1 });

    console.log(EnterdOtp)
    console.log(userOtp)

    if (!EnterdOtp) return res.status(400).json({ message: "OTP is required" });

    if (!userOtp)
      return res.status(400).json({ message: "OTP expired or not found" });

    if (EnterdOtp != userOtp.otp)
      return res.status(400).json({ message: "OTP is Incorrect" });

    const email = req.session.email;
    const action = "Reset Pasword";

    //  Create JWT Reset Token (valid for 15 minutes)
    const resetToken = jwt.sign({ email: email }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    await UserOtpVerification.create({ email, action, resetToken });

    console.log(`Reset Tocken = ${resetToken}`);

    await UserOtpVerification.deleteOne({ _id: userOtp._id });

    delete req.session.email;
    return res.json({
      success: true,
      redirectUrl: `/reset-password/${resetToken}`,
    });
  } catch (error) {
    console.error("Error in PostOtpVerification:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


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
    let msg = "Invalid reset link.";
    if (error.name === "TokenExpiredError")
      msg = "Reset link expired. Please request a new one.";

    return res.render("user/authentications/resetPassword", {
      email: null,
      token: null,
      errorMsg: msg,
      successMsg: null,
    });
  }
};


const postResetPassword = async (req, res) => {
  try {
  console.log("Chekck Point 1")
    const token = req.params.token;
    const { newPassword, confirmPassword } = req.body;

    const { error } = passwordSchema.validate({ newPassword, confirmPassword });
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    console.log("Tocken = " + token);
  console.log("Chekck Point 2")
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
  console.log("Chekck Point 2")

    const email = decoded.email;

    const user = await User.findOne({ email: email });
    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) {
      return res
        .status(400)
        .json({
          message: "New password cannot be the same as the old password.",
        });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    await UserOtpVerification.deleteOne({ resetToken: token });

    return res.json({
      success: true,
      message: "Password reset successful. You can now log in.",
    });
  } catch (error) {
    console.error("Error in postResetPassword:", error);
    return res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};



const restPassword = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findOne({ email: userEmail });
    if (!user) return res.status(404).json({ message: "User not found" });

    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validate new password and confirm password using your Joi schema
    const { error } = passwordSchema.validate({ newPassword, confirmPassword });
    if (error)
      return res.status(400).json({ message: error.details[0].message });

    // Check if current password matches database
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Current password is incorrect" });

    // Ensure new password is different from current
    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: "New password must be different from current password",
      });
    }

    //  Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password
    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({ message: "Password updated successfully!" });
  } catch (error) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Server error. Please try again later." });
  }
};

// Blocked User

const userBloked = (req, res) => {
  try {
    res.render("user/authentications/userblocked");
  } catch (error) {
    console.log(error);
  }
};

export {
  notLogginedHome,
  getSignup,
  signup,
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
};
