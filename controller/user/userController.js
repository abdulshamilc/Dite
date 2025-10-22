import { User, UserOtpVerification } from "../../models/userModels.js";
import bcrypt from "bcryptjs";
import { signupValidation } from "../../validators/authValidator.js";
import sendMail from "../../services/mailer.js";

const notLogginedHome = (req, res) => {
  res.render("user/home");
};
const getSignup = (req, res) => {
  res.render("user/authentications/signup", { errors: {}, oldData: {} });
};

const genarateOTP = async (email) => {
  try {
    const otp = Math.floor(1000 + Math.random() * 9000);
    console.log(`OTP = ${otp}`);

    sendMail({
      to: email,
      subject: "Your OTP Code For Creating New User",
      text: `Your OTP code For Creating Dite User Account password is ${otp}`,
      html: `<p>Your OTP code is <b>${otp}</b></p>`,
    });
    const action = "Create User";

    await UserOtpVerification.create({ email, action, otp });
  } catch (error) {
    console.log(error);
  }
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

    genarateOTP(email);
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

    genarateOTP(email);

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
    if (!req.session.tempData) return res.redirect("/signup");

    const { otp1, otp2, otp3, otp4 } = req.body;
    const enterdOtp = Number(`${otp1}${otp2}${otp3}${otp4}`);
    const newUser = req.session.tempData;
    const otpVerify = await UserOtpVerification.findOne({
      email: newUser.email,
    });
    if (!otpVerify) {
      req.session.otpError = "OTP not found or expired";
      return res.redirect("/signup/verify-otp");
    }

    if (enterdOtp != otpVerify.otp) {
      req.session.otpError = "Invalid OTP";
      return res.redirect("/signup/verify-otp");
    }

    const user = new User(newUser);
    await user.save();

    req.session.tempData = null;
    await UserOtpVerification.deleteOne({ email: newUser.email });

    req.session.user = newUser.email;
    return res.redirect("/");
  } catch (error) {
    console.log(error);
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

  req.session.user = email;
  res.redirect("/");
};

// Forget Password

const getForgotPassword = (req, res) => {
  res.render("user/authentications/forgetPassword");
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
  userBloked,
};
