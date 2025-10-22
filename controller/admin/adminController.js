import { User } from "../../models/userModels.js";
import { Admin, AdmiResetPassword } from "../../models/adminModels.js";
import Categories from "../../models/categories.js";
import Products from "../../models/productsModels.js";
import sendMail from "../../services/mailer.js";
import bcrypt from "bcryptjs";
import addCategoryValidation from "../../validators/addCatogoryValidation.js";
import jwt from "jsonwebtoken";
import passwordSchema from "../../validators/resetPasswordValidator.js";
const secret = process.env.JWT_SECRET;

const pageNotFound = (req, res) => {
  try {
    res.render("admin/pageNotFound");
  } catch (error) {}
};

const getLogin = (req, res) => {
  if (req.session.admin) {
    res.redirect("admin/dashboard");
  } else res.render("admin/login", { errors: {}, oldData: {} });
};

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

    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ message: "Session error" });
      }
    });

    //  If everything is correct → success response
    return res.json({
      message: "Login successful",
      adminId: admin._id,
      redirect: "admin/dashboard",
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Server error, please try again later" });
  }
};
const getForgotPassword = (req, res) => {
  res.render("admin/forgetPassword");
};

const genarateOTP = async (email) => {
  try {
    // If everything is correct → success response
    const otp = Math.floor(1000 + Math.random() * 9000);
    console.log(`OTP = ${otp}`);

    sendMail({
      to: email,
      subject: "Your OTP Code For Resetting Password",
      text: `Your OTP code For resetting Dite Admin Account password is ${otp}`,
      html: `<p>Your OTP code is <b>${otp}</b></p>`,
    });
    const action = "Forget Password";

    await AdmiResetPassword.create({ email, action, otp });
  } catch (error) {
    console.log(error);
  }
};

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

const getOtpVerification = (req, res) => {
  try {
    if (!req.session.email) return res.redirect("/admin/forgot-password");
    res.render("admin/otpForgetPassword");
  } catch (error) {
    console.log(error);
  }
};

// const resendOtp = async (req, res) => {
//   try {
//    if (!req.session.email) return res.redirect("/admin/forgot-password");

//     const  email  = req.session.email;

//     // Delete any old OTPs for that email
//     await AdmiResetPassword.deleteMany({ email });

//     genarateOTP(email);

//     // Optionally set a message for feedback
//     req.session.otpSuccess = "A new OTP has been sent to your email.";
//     res.redirect("/signup/verify-otp");
//   } catch (error) {
//     console.log(error);
//     res.status(500).send("Error resending OTP");
//   }
// };

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

    console.log(`Reset Tocken = ${resetToken}`);

    await AdmiResetPassword.deleteOne({ _id: adminOtp._id });

    delete req.session.email;
    return res.json({
      success: true,
      redirectUrl: `/admin/reset-password/${resetToken}`,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

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

    res.render("admin/resetForgetPassword", {
      email: decoded?.email || null,
      token: token,
      errorMsg: null,
      successMsg: null,
    });
  } catch (error) {
    let msg = "Invalid reset link.";
    if (error.name === "TokenExpiredError")
      msg = "Reset link expired. Please request a new one.";

    return res.render("admin/resetForgetPassword", {
      email: null,
      token: null,
      errorMsg: msg,
      successMsg: null,
    });
  }
};

const postResetPassword = async (req, res) => {
  try {
    console.log("Working");
    const token = req.params.token;
    const { newPassword, confirmPassword } = req.body;

    const { error } = passwordSchema.validate({ newPassword, confirmPassword });
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    console.log("Tocken = " + token);

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
      return res
        .status(400)
        .json({
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

const getDashboard = (req, res) => {
  res.render("admin/pageNotFound");
};
const getOrders = (req, res) => {
  res.render("admin/pageNotFound");
};

// Product Field

const getProducts = async (req, res) => {
  try {

    const errorMessage = req.session.errorMessage;
    const successMessage = req.session.successMessage;

    // Clear them so they don’t reappear after refresh
    req.session.errorMessage = null;
    req.session.successMessage = null;

    // pagination
    const { page, limit, skip } = req.pagination;

    const products = await Products.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("category");

    // Totel Products
    const totelProducts = await Products.countDocuments({ isDeleted: false });

    // New Products in  last 10 days
    const today = new Date();
    const past10Days = new Date();
    past10Days.setDate(today.getDate() - 10);

    const newProductsCount = await Products.countDocuments({
      isDeleted: false,
      createdAt: { $gte: past10Days, $lte: today },
    });

    // Listed Products
    const activeProductsCount = await Products.countDocuments({
      isDeleted: false,
      isListed: true,
    });

    // out Of Stock Products
    const outOfStockProducts = await Products.find({
      isDeleted: false,
      "variants.stock": { $lte: 0 },
    });

    // Catogory
    const categories = await Categories.find({
      isDeleted: false,
      isActive: false,
    });

    res.render("admin/products", {
      products,
      categories,
      totelProducts,
      newProductsCount,
      activeProductsCount,
      outOfStockProducts,
      limit,
      currentPage: page,
      totalPages: Math.ceil(totelProducts / limit),
      errorMessage,
      successMessage,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

const getAddProducts = async (req, res) => {
  try {
    const categories = await Categories.find({ isDeleted: false }).lean();
    res.render("admin/addProducts", { categories });
  } catch (error) {}
};

const toNumber = (val, zero = 0) => {
  const parsed = parseInt(val);
  return isNaN(parsed) ? zero : parsed;
};

const postAddProducts = async (req, res) => {
  try {
    const {
      name,
      description,
      notes,
      categories,
      brand,
      gender,
      concentration,
      variants,
    } = req.body;

    const imageUrls = req.files.map((file) => file.path);

    // parsing varint if it single then its object if it comes in collection it will be an array
    let parsedVariant;

    if (Array.isArray(variants)) {
      parsedVariant = variants.map((variants) => ({
        mlSize: toNumber(variants.mlSize),
        stock: toNumber(variants.stock),
        basePrice: toNumber(variants.basePrice),
        discountedPrice: toNumber(variants.discountedPrice),
      }));
    } else {
      parsedVariant = [
        {
          mlSize: toNumber(variants.mlSize),
          stock: toNumber(variants.stock) || 0,
          basePrice: toNumber(variants.basePrice),
          discountedPrice: toNumber(variants.discountedPrice),
        },
      ];
    }

    // Catogory splitting and making an array
    let category = [];
    if (categories) category = categories.split(",");

    const newProdducts = new Products({
      name,
      description,
      notes,
      brand,
      category,
      gender,
      concentration,
      images: imageUrls,
      variants: parsedVariant,
    });

    await newProdducts.save();

    //adding this product to catogory
    if (categories) {
      const categoriesIds = categories.split(",");
      await Categories.updateMany(
        { _id: { $in: categoriesIds } },
        { $push: { products: newProdducts._id } }
      );
    }

    req.session.successMessage = "New Product Has Been Added";
    res.redirect("/admin/products");
  } catch (error) {
    console.error(error);
    req.session.errorMessage = "Something Went Wrong";
    res.redirect("/admin/products");
  }
};

const getEditProducts = async (req, res) => {
  try {
    const categories = await Categories.find({ isDeleted: false }).lean();
    const product = await Products.findById(req.params.id);

    res.render("admin/editProducts", { categories, product });
  } catch (err) {
    console.error(error);
    req.session.errorMessage = "Something Went Wrong";
    res.redirect("/admin/products");
  }
};

const postEditProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    let parsedVariants = [];
    if (req.body.variants) {
      if (Array.isArray(req.body.variants)) {
        parsedVariants = req.body.variants.map((v) => ({
          mlSize: parseInt(v.mlSize),
          stock: parseInt(v.stock),
          basePrice: parseFloat(v.basePrice),
          discountedPrice: parseFloat(v.discountedPrice),
        }));
      } else {
        parsedVariants = Object.values(req.body.variants).map((v) => ({
          mlSize: parseInt(v.mlSize),
          stock: parseInt(v.stock),
          basePrice: parseFloat(v.basePrice),
          discountedPrice: parseFloat(v.discountedPrice),
        }));
      }
    }

    const product = await Products.findById(productId);
    // Handle images
    let updatedImages = [...product.images];

    if (req.files && req.files.length > 0) {
      req.files.forEach((file, index) => {
        // Update the slot with the new file if provided
        updatedImages[index] = file.path;
      });
    }

    // Update product
    product.name = req.body.name;
    product.description = req.body.description;
    product.notes = req.body.notes;
    product.brand = req.body.brand;
    product.gender = req.body.gender;
    product.concentration = req.body.concentration;
    product.images = updatedImages;
    product.variants = parsedVariants;

    await product.save();

    req.session.successMessage = "Product Has Been Edited ";
    res.redirect("/admin/products");
  } catch (err) {
    console.error(error);
    req.session.errorMessage = "Something Went Wrong";
    res.redirect("/admin/products");
  }
};

const unlistProduct = async (req, res) => {
  try {
    const product = await Products.findOne({ _id: req.params.id });

    product.isListed = !product.isListed;
    await product.save();
    req.session.successMessage = "Product Status Has Been Changed  ";
    res.redirect("/admin/products");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Products.findOne({ _id: req.params.id });

    product.isDeleted = !product.isDeleted;
    await product.save();
    req.session.successMessage = "Product Status Has Been Deleted  ";
    res.redirect("/admin/products");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

// Customer Field
const getcustomers = async (req, res) => {
  try {
    // Pagination

    const { page, limit, skip } = req.pagination;

    //fetch customers accoding to pagination

    const customers = await User.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Finding Newely Registed Customers
    const today = new Date();
    const past15Days = new Date();
    past15Days.setDate(today.getDate() - 15);

    const newCustomerCount = await User.countDocuments({
      createdAt: { $gte: past15Days, $lte: today },
    });

    // Finding Totel Orders
    const totelOrdersCount = await User.aggregate([
      {
        $group: { _id: null, totelOrders: { $sum: "$totalOrders" } },
      },
    ]);

    // Finding Totel Spend
    const totelSpentCount = await User.aggregate([
      {
        $group: { _id: null, totelSpent: { $sum: "$totalSpent" } },
      },
    ]);
    // Finding Totel customers
    const totalCustomers = await User.countDocuments();

    res.render("admin/customers", {
      customers,
      newCustomerCount,
      totelOrdersCount,
      totelSpentCount,
      totalCustomers,
      limit,
      currentPage: page,
      totalPages: Math.ceil(totalCustomers / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

const blockUser = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id });

    user.isBlocked = !user.isBlocked;
    await user.save();
    res.redirect("/admin/customers");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

const getSaleReport = async (req, res) => {
  try {
    res.render("admin/pageNotFound");
  } catch (error) {}
};

// Category fields
const getCategories = async (req, res) => {
  try {
    // ✅ Move flash messages from session → res.locals
    const errorMessage = req.session.errorMessage;
    const successMessage = req.session.successMessage;

    // Clear them so they don’t reappear after refresh
    req.session.errorMessage = null;
    req.session.successMessage = null;

    // Pagination
    const { page, limit, skip } = req.pagination;

    // Fetch categories according to pagination
    const categories = await Categories.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Total categories
    const totalCategories = await Categories.countDocuments({
      isDeleted: false,
    });

    // Find new categories in last 15 days
    const today = new Date();
    const past7Days = new Date();
    past7Days.setDate(today.getDate() - 7);

    const newCategoriesCount = await Categories.countDocuments({
      isDeleted: false,
      createdAt: { $gte: past7Days, $lte: today },
    });

    // Active categories count
    const activeCategories = await Categories.countDocuments({
      isDeleted: false,
      isActive: true,
    });

    // Inactive categories count
    const inactiveCategories = await Categories.countDocuments({
      isDeleted: false,
      isActive: false,
    });

    res.render("admin/categories", {
      categories,
      newCategoriesCount,
      activeCategories,
      inactiveCategories,
      totalCategories,
      limit,
      currentPage: page,
      totalPages: Math.ceil(totalCategories / limit),
      errorMessage,
      successMessage,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

const addCategorie = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !description) {
      req.session.errorMessage = "Both name and description are required.";
      return res.redirect("/admin/categories");
    }

    // Check if category exists
    const existingCategory = await Categories.findOne({ name });
    if (existingCategory) {
      req.session.errorMessage = "Category already exists!";
      return res.redirect("/admin/categories");
    }

    const newCategories = new Categories({
      name,
      description,
    });

    await newCategories.save();
    req.session.successMessage = "Category added successfully!";
    res.redirect("/admin/categories");
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
};

const editCategory = async (req, res) => {
  try {
    const categorie = await Categories.findOne({ _id: req.params.id });
    const { name, description } = req.body;

    if (!name || !description) {
      req.session.errorMessage = "Both name and description are required.";
      return res.redirect("/admin/categories");
    }

    const existingCategory = await Categories.findOne({ name });
    if (existingCategory && existingCategory != categorie.name) {
      req.session.errorMessage = "Category already exists!";
      return res.redirect("/admin/categories");
    }
    categorie.name = name;
    categorie.description = description;

    await categorie.save();
    req.session.successMessage = "Category Edited successfully!";
    res.redirect("/admin/categories");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};
const DeactivateCategory = async (req, res) => {
  try {
    const categorie = await Categories.findOne({ _id: req.params.id });

    categorie.isActive = !categorie.isActive;
    await categorie.save();
    if (categorie.isActive)
      req.session.successMessage = "Category Activated successfully!";
    else req.session.successMessage = "Category Deactivated successfully!";
    res.redirect("/admin/categories");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

const deleteCategory = async (req, res) => {
  try {
    const categorie = await Categories.findOne({ _id: req.params.id });

    categorie.isDeleted = !categorie.isDeleted;
    await categorie.save();
    req.session.successMessage = "Category Deleted successfully!";
    res.redirect("/admin/categories");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

const logOut = (req, res) => {
  try {
    delete req.session.admin;
    return res.redirect("/admin");
  } catch (error) {
    console.log(error);
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
  getDashboard,
  getOrders,
  getProducts,
  getAddProducts,
  postAddProducts,
  getEditProducts,
  postEditProduct,
  unlistProduct,
  deleteProduct,
  getSaleReport,
  getcustomers,
  blockUser,
  getCategories,
  addCategorie,
  editCategory,
  DeactivateCategory,
  deleteCategory,
  logOut,
};
