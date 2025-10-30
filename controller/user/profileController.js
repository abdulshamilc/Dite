import { User, UserOtpVerification } from "../../models/userModels.js";
import { Address } from "../../models/addressModel.js";
import Order from "../../models/ordersModel.js";
import UserLog from "../../models/userLogModel.js";
import { generateOTP } from "../../utils/genarateOtp.js";

const getProfile = async (req, res) => {
  try {
    const email = req.session.user;

    if (!email) {
      return res.redirect("/profile/login");
    }
    const user = await User.findOne({ email: email });
    res.render("user/profile/profile", {
      user,
      currentPath: req.path,
      success: req.session.success || null,
      error: req.session.error || null,
    });

    // Delete the Error Mesage After Rendering
    delete req.session.success;
    delete req.session.error;
  } catch (error) {
    console.log(error);
  }
};

const postProfile = async (req, res) => {
  try {
    const { name, gender, email, phone } = req.body;

    const user = await User.findOne({ email: req.session.user });

    if (!user) {
      return res.status(404).send("User not found");
    }

    let imageUrl = user.image; // keep existing one
    if (req.file) {
      imageUrl = req.file.path;
    }

    // Phone Validation
    const phoneRegex = /^(?!.*(\d)\1{5,})(?!0+$)[+]?[0-9]{6,15}$/;
    if (!phoneRegex.test(phone)) {
      req.session.error = "Enter a valid phone number (min 6 digits)";
      return res.redirect("/profile");
    }

    const isChanged =
      user.name !== name ||
      user.gender !== gender ||
      user.phone !== phone ||
      user.image !== imageUrl;

    if (isChanged) {
      // Update fields

      user.name = name;
      user.gender = gender;
      user.phone = phone || "";
      user.image = imageUrl;

      await user.save();
      req.session.success = "Profile Has Been Updated";
    } else req.session.success = null;

    res.redirect("/profile");
  } catch (error) {
    console.log(error);
    req.session.error = "Something went wrong while updating profile";
    res.status(500).send("Something went wrong");
  }
};

const changeEmail = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) return res.redirect("/login");

    const user = await User.findOne({ email: userEmail });
    if (!user) return res.redirect("/login");

    // Action indicates why we are generating OTP
    const action = "change_email";
    const { email } = req.body;

    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "Enter New Email" });
    await generateOTP(
      email,
      "Verify Your Email Change",
      "Your OTP code for changing email is:",
      action
    );

    return res.status(200).json({
      message: "OTP sent to your current email",
      success: true,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to send OTP",
      success: false,
    });
  }
};

const verifyChangeEmail = async (req, res) => {
  try {
    if (!req.session.user) return res.redirect("/login");

    const user = await User.findOne({ email: req.session.user });

    if (!user) return res.redirect("/login");

    const { otp, email, type } = req.body;

    const isUsedEmail = await User.findOne({
      email: email,
      _id: { $ne: user._id }
    });

    if (isUsedEmail)
      return res.json({
        success: false,
        redirect: "/profile",
        message: "Email Already Exists",
      });

    if (!otp || otp.length !== 6) {
      return res.json({ success: false, message: "Enter a valid 6-digit OTP" });
    }

    const otpRecord = await UserOtpVerification.findOne({ email }).sort({
      createdAt: -1,
    });

    if (!otpRecord) {
      return res.json({
        success: false,
        message: "OTP Not found Or Expired",
      });
    }

    if (otp != otpRecord.otp) {
      return res.json({ success: false, message: "Incorrect OTP" });
    }

    // Delete the OTP record
    await UserOtpVerification.deleteOne({ email: email });

    // Set session flags based on type
    if (type === "current") {
      req.session.currentEmailVerified = true;
      res.json({
        success: true,
        message: "Current Email OTP Verification Completed!",
      });
    } else if (type === "new") {
      user.email = email;
      await user.save();
      req.session.user = email;
      res.json({
        success: true,
        message: "New Email OTP Verification Completed!",
      });
    } else {
      res.json({ success: false, message: "Invalid verification type." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

const getAddress = async (req, res) => {
  try {
    const email = req.session.user;
    if (!email) {
      return res.redirect("/login");
    }
    const user = await User.findOne({ email: email });
    const address = await Address.find({ userId: user._id, isDeleted: false });

    // Prepare messages object from session
    const messages = {
      success: req.session.success || null,
      error: req.session.error || null
    };

    // Clear session messages after passing them
    delete req.session.success;
    delete req.session.error;

    res.render("user/profile/address", {
      address,
      messages: messages,
      currentPath: req.path,
      user,
    });
  } catch (error) {
    console.log(error);
  }
};

const postAddAddress = async (req, res) => {
  try {
    const email = req.session.user;
    const {
      fullName,
      hoNo,
      street,
      city,
      state,
      pin,
      country,
      phone,
      altPhone,
      isDefault,
    } = req.body;

    if (!fullName || !hoNo || !street || !city || !pin || !state || !country || !phone ) {
      req.session.error = 'Please fill in required fields !!';
      return res.redirect('/address');
    }


    const user = await User.findOne({ email: email });

    if (isDefault) {
      await Address.updateMany(
        { userId: user._id, isDeleted: false },
        { $set: { isDefault: false } }
      );
    }

    const newAdress = new Address({
      userId: user._id,
      fullName,
      hoNo,
      street,
      city,
      state,
      pin,
      country,
      phone,
      altPhone,
      isDefault: !!isDefault,
    });

    await newAdress.save();

    req.session.success = 'Address added successfully!';
    res.redirect("/address");
  } catch (error) {
    console.log(error);
    req.session.error = "Something Occure While Adding New Adress"
    res.redirect('/address')
  }
};

const postEditAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    const {
      fullName,
      hoNo,
      street,
      city,
      state,
      pin,
      country,
      phone,
      altPhone,
      isDefault,
    } = req.body;

    const address = await Address.findOne({ _id: addressId });
    if (!address) return res.status(404).send("Address not found");

    if (!fullName || !hoNo || !street || !city || !pin || !state || !country || !phone ) {
      req.session.error = 'Please fill in required fields !!';
      return res.redirect('/address');
    }

    if (isDefault) {
      await Address.updateMany(
        { userId: address.userId, isDeleted: false },
        { $set: { isDefault: false } }
      );
    }
    address.fullName = fullName;
    address.hoNo = hoNo;
    address.street = street;
    address.city = city;
    address.state = state;
    address.pin = pin;
    address.country = country;
    address.phone = phone;
    address.altPhone = altPhone;
    address.phone = phone;
    address.isDefault = !!isDefault;

    await address.save();

    res.redirect("/address");
  } catch (error) {
    console.log(error);
  }
};

const postsetDefaultAdress = async (req, res) => {
  try {
    const addressId = req.body.addressId;

    const address = await Address.findOne({ _id: addressId });
    if (!address) return res.status(404).send("Address not found");

    await Address.updateMany(
      { userId: address.userId, isDeleted: false },
      { $set: { isDefault: false } }
    );

    address.isDefault = true;
    await address.save();
    res.redirect("/address");
  } catch (error) {
    console.error(error);
  }
};
const postDeletetAdress = async (req, res) => {
  try {
    const addressId = req.params.id;

    const address = await Address.findOne({ _id: addressId });
    if (!address) return res.status(404).send("Address not found");

    address.isDeleted = true;
    await address.save();
    res.redirect("/address");
  } catch (error) {
    console.error(error);
  }
};
const getOrders = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) {
      return res.redirect("/login");
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.redirect("/login");
    }

    // Pagination
    let page = parseInt(req.query.page) || 1;
    if (page < 1) page = 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const totalOrders = await Order.countDocuments({ userId: user._id });
    const totalPages = Math.ceil(totalOrders / limit);

    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }

    const orders = await Order.find({ userId: user._id })
      .sort({ placedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Faster reads

    // Pass raw orders (handle formatting in EJS)
    res.render("user/profile/orders", {
      orders: orders || [], // Ensure array
      totalPages,
      currentPage: page,
      pages,
    });
  } catch (error) {
    console.error("Error fetching order history:", error);
    res.status(500).send("Internal Server Error");
  }
};

const getOrderDetails = async (req, res) => {
  const orderId = req.params.id;
  if (!orderId) return res.redirect("/login");

  const user = await User.findOne({ email: req.session.user });
  if (!user) return res.redirect("/login");

  const order = await Order.findById(orderId);
  if (!order) return res.redirect("/orders");

  const subTotal = order.items.reduce(
    (acc, ele) => acc + ele.basePrice * ele.quantity,
    0
  );

  const discount =
    order.items.reduce(
      (acc, ele) => acc + ele.discoundedPrice * ele.quantity,
      0
    ) - subTotal;

  const totalAmount = order.items.reduce(
    (acc, ele) => acc + ele.discoundedPrice * ele.quantity,
    0
  );

  res.render("user/profile/orderDetails", {
    order,
    subTotal,
    discount,
    totalAmount,
  });
};

const getSecurity = async (req, res) => {
  const userEmail = req.session.user;
  if (!userEmail) res.redirect("/login");
  const user = await User.findOne({ email: userEmail });
  if (!user) res.redirect("/login");

  const logHistory = await UserLog.find({ userId: user._id })
    .sort({ loginTime: -1 })
    .limit(6);

  const is2FAEnabled = !!user.twoFactorSecret;

  res.render("user/profile/security", {
    user,
    logHistory,
    is2FAEnabled,
    currentPath: req.originalUrl,
  });
};

const getDeleteAcount = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) res.redirect("/login");
    const user = await User.findOne({ email: userEmail });
    if (!user) res.redirect("/login");

    res.render("user/profile/deleteAcount", {
      user,
      currentPath: req.originalUrl,
    });
  } catch (error) {
    console.error("Error sending OTP:", error);
    req.flash(
      "errorMsg",
      "Failed to send verification code. Please try again."
    );
    res.render("user/deleteAccount", {
      title: "Delete Account",
      successMsg: null,
      errorMsg: req.flash("errorMsg")[0],
    });
  }
};

const userlogOut = (req, res) => {
  try {
    delete req.session.user;
    return res.redirect("/");
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal server error");
  }
};

export {
  getProfile,
  postProfile,
  changeEmail,
  verifyChangeEmail,
  getAddress,
  postAddAddress,
  postEditAddress,
  postsetDefaultAdress,
  postDeletetAdress,
  getOrders,
  getOrderDetails,
  getSecurity,
  getDeleteAcount,
  userlogOut,
};
