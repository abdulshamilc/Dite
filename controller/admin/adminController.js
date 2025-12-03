import mongoose from "mongoose";
import { User } from "../../models/userModels.js";
import { Admin, AdmiResetPassword } from "../../models/adminModels.js";
import Categories from "../../models/categories.js";
import Products from "../../models/productsModels.js";
import Orders from "../../models/ordersModel.js";
import Offer from "../../models/offerModel.js";
import sendMail from "../../services/mailer.js";
import bcrypt from "bcryptjs";
import addCategoryValidation from "../../validators/addCatogoryValidation.js";
import jwt from "jsonwebtoken";
import passwordSchema from "../../validators/resetPasswordValidator.js";
import { nanoid } from "nanoid";
import moment from "moment";
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

const getDashboard = (req, res) => {
  res.render("admin/pageNotFound");
};
const getOrders = async (req, res) => {
  try {
    if (!req.session.admin) return res.redirect("/login");
    const errorMessage = req.session.errorMessage;
    const successMessage = req.session.successMessage;
    req.session.errorMessage = null;
    req.session.successMessage = null;

    const { page, limit, skip } = req.pagination;

    const orders = await Orders.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalOrders = await Orders.countDocuments();

    const pendingOrdersCount = await Orders.countDocuments({
      orderStatus: { $in: ["Placed", "Shipped"] },
    });
    const completedOrdersCount = await Orders.countDocuments({
      orderStatus: "Delivered",
    });

    const revenueResult = await Orders.aggregate([
      { $match: { orderStatus: "Delivered" } },
      { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
    ]);
    const totalRevenueCount =
      revenueResult.length > 0 ? revenueResult : [{ totalRevenue: 0 }];

    const totalPages = Math.ceil(totalOrders / limit);
    const currentPage = page;

    res.render("admin/orders", {
      orders,
      totalOrders,
      pendingOrdersCount,
      completedOrdersCount,
      totalRevenueCount,
      currentPage,
      totalPages,
      limit,
      errorMessage,
      successMessage,
    });
  } catch (error) {
    console.error("Error loading orders page:", error);
    return res.redirect("/admin");
  }
};

const getViewOrders = async (req, res) => {
  try {
    const orderId = req.params.id;

    // Fetch the order with populated fields if needed (e.g., address if it's a ref, items with product details)
    const order = await Orders.findById(orderId);

    if (!order) {
      req.session.error = "Order Not Found";
      return res.redirect("/orders");
    }
    const user = await User.findById(order.userId);

    let subTotal = 0;
    let discountedPriceTotal = 0;

    if (order.items && order.items.length > 0) {
      // Base price subtotal
      subTotal = order.items
        .filter((item) => !item.canceled)
        .reduce(
          (sum, item) => sum + (item.basePrice || 0) * (item.quantity || 1),
          0
        );

      // Discounted price subtotal
      discountedPriceTotal = order.items
        .filter((item) => !item.canceled)
        .reduce(
          (sum, item) =>
            sum + (item.discoundedPrice || 0) * (item.quantity || 1),
          0
        );
    }

    const discount = subTotal - discountedPriceTotal || 0; // Or compute if needed

    const totalAmount =
      subTotal + (order.shipping || 0) + (order.tax || 0) - discount;

    res.render("admin/orderDetails", {
      user,
      order,
      subTotal: subTotal.toFixed(2),
      discount: discount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
    });
  } catch (error) {
    console.error("Error fetching order:", error);
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status against schema enum
    const validStatuses = [
      "Placed",
      "Shipped",
      "Out for Delivery",
      "Delivered",
      "Cancelled",
      "Returned",
    ];
    if (!validStatuses.includes(status)) {
      req.session.error = "Invalid status provided.";
      return res.redirect(`/admin/orders/${id}`);
    }

    // Find and update order
    const updateData = {
      orderStatus: status,
      updatedAt: new Date(),
      // Add to tracking history
      $push: {
        tracking: {
          status: status,
          date: new Date(),
          message: `Status updated to ${status} by admin`,
        },
      },
    };

    // Handle special timestamps
    if (status === "Cancelled") {
      updateData.cancelledAt = new Date();
    } else if (status === "Delivered") {
      updateData.deliveredAt = new Date();
    }

    const order = await Orders.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("userId", "name email")
      .populate("items.productId"); // Populate as needed

    if (!order) {
      req.session.error = "Order not found.";
      return res.redirect("/admin/orders");
    }

    // Optional: Handle special logic for certain statuses
    // Example: If Cancelled or Returned, adjust totalAmount or add refund logic
    if (status === "Cancelled" || status === "Returned") {
      // Optional: Set totalAmount to 0 or trigger refund
      order.totalAmount = 0;
      await order.save();
    }

    req.session.success = `Order status updated to ${status}.`;
    res.redirect(`/admin/orders/view/${id}`);
  } catch (error) {
    console.error("Error updating order status:", error);
    req.session.error = "Failed to update order status. Please try again.";
    res.redirect(`/admin/orders/${id}`);
  }
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
    const products = await Products.find({ isDeleted: false })
      .select("name")
      .lean();
    res.render("admin/addProducts", { categories, products });
  } catch (error) {
    console.error("Error fetching categories and products:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to load page data." });
  }
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
      category: rawCategory, // Single category ID from frontend
      brand,
      gender,
      concentration,
      variants,
    } = req.body;
    const imageUrls = req.files?.map((file) => file.path) || [];

    // Specific validation for product name
    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "Product name is required." });
    }

    // Specific validation for product description
    if (!description || !description.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "Product description is required." });
    }

    // Specific validation for notes (now required)
    if (!notes || !notes.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "Notes are required." });
    }
    const wordCountNotes = notes.trim().split(/\s+/).length;
    if (wordCountNotes < 5 || wordCountNotes > 150) {
      return res.status(400).json({
        success: false,
        error: "Notes must have between 5 and 150 words.",
      });
    }

    // Specific validation for category
    const category = rawCategory ? rawCategory.trim() : "";
    if (!category) {
      return res
        .status(400)
        .json({ success: false, error: "Category is required." });
    }

    // Specific validation for brand (now required)
    if (!brand || !brand.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "Brand name is required." });
    }
    if (!/^[A-Z\s]+$/.test(brand.trim())) {
      return res.status(400).json({
        success: false,
        error: "Brand name must be uppercase letters only.",
      });
    }

    // Specific validation for gender
    if (!gender) {
      return res
        .status(400)
        .json({ success: false, error: "Gender is required." });
    }

    // Specific validation for concentration
    if (!concentration) {
      return res
        .status(400)
        .json({ success: false, error: "Concentration is required." });
    }

    // Specific validation for variants existence
    if (!variants) {
      return res
        .status(400)
        .json({ success: false, error: "Variants are required." });
    }

    // Specific validation for images
    if (imageUrls.length !== 4) {
      return res
        .status(400)
        .json({ success: false, error: "Exactly 4 images are required." });
    }

    // Parse variants - frontend sends as object with numeric string keys e.g. { '0': {mlSize: '5', ...} }
    let parsedVariants = [];
    if (variants && typeof variants === "object" && !Array.isArray(variants)) {
      Object.keys(variants).forEach((key) => {
        const v = variants[key];
        // Check structure first
        if (
          v &&
          v.mlSize &&
          v.stock &&
          v.basePrice !== undefined &&
          v.discountedPrice !== undefined
        ) {
          parsedVariants.push({
            mlSize: toNumber(v.mlSize),
            stock: toNumber(v.stock),
            basePrice: parseFloat(v.basePrice) || 0,
            discountedPrice: parseFloat(v.discountedPrice) || 0,
            index: parseInt(key), // Use key as index
          });
        }
      });
      // Sort by index to maintain order
      parsedVariants.sort((a, b) => a.index - b.index);
    } else if (Array.isArray(variants)) {
      // Fallback for array (unlikely)
      parsedVariants = variants
        .map((v, index) => {
          if (
            v &&
            v.mlSize &&
            v.stock &&
            v.basePrice !== undefined &&
            v.discountedPrice !== undefined
          ) {
            return {
              mlSize: toNumber(v.mlSize),
              stock: toNumber(v.stock),
              basePrice: parseFloat(v.basePrice) || 0,
              discountedPrice: parseFloat(v.discountedPrice) || 0,
              index,
            };
          }
          return null;
        })
        .filter((v) => v !== null);
    }

    // Per-variant validation (mirroring frontend field checks)
    let variantErrors = [];
    parsedVariants.forEach((v) => {
      const variantNum = v.index + 1;
      if (v.mlSize <= 0) {
        variantErrors.push(
          `Variant ${variantNum} size must be greater than 0.`
        );
      }
      if (v.stock < 1) {
        variantErrors.push(`Variant ${variantNum} stock must be at least 1.`);
      }
      if (v.basePrice <= 1) {
        variantErrors.push(
          `Variant ${variantNum} base price must be greater than 1.`
        );
      }
      if (v.discountedPrice < 0) {
        variantErrors.push(
          `Variant ${variantNum} discounted price must be at least 0.`
        );
      }
      if (v.discountedPrice > v.basePrice) {
        variantErrors.push(
          `Variant ${variantNum} discounted price must be less than or equal to base price.`
        );
      }
    });

    if (variantErrors.length > 0) {
      return res
        .status(400)
        .json({ success: false, error: variantErrors.join(" ") });
    }

    if (parsedVariants.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one valid variant is required.",
      });
    }

    // Description word count validation
    const wordCountDesc = description.trim().split(/\s+/).length;
    if (wordCountDesc < 10 || wordCountDesc > 150) {
      return res.status(400).json({
        success: false,
        error: "Description must be between 10 and 150 words.",
      });
    }

    // Check duplicate name (case-insensitive, only non-deleted products)
    const existingProduct = await Products.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
      isDeleted: false,
    });
    if (existingProduct) {
      return res.status(400).json({
        success: false,
        error: "Product name already exists. Please choose a unique name.",
      });
    }

    const newProduct = new Products({
      name: name.trim(),
      description: description.trim(),
      notes: notes.trim(),
      brand: brand.trim(),
      category, // Single string (ObjectId)
      gender,
      concentration,
      images: imageUrls,
      variants: parsedVariants.map((v) => ({
        // Strip index for save
        mlSize: v.mlSize,
        stock: v.stock,
        basePrice: v.basePrice,
        discountedPrice: v.discountedPrice,
      })),
    });
    await newProduct.save();

    // Update category with product reference (single category)
    if (category) {
      await Categories.findByIdAndUpdate(category, {
        $push: { products: newProduct._id },
      });
    }

    res.json({
      success: true,
      message: "New Product Has Been Added Successfully",
    });
  } catch (error) {
    console.error("Error adding product:", error);
    res.status(500).json({
      success: false,
      error: "Something went wrong while adding the product. Please try again.",
    });
  }
};
const getEditProducts = async (req, res) => {
  try {
    const categories = await Categories.find({ isDeleted: false }).lean();
    const product = await Products.findById(req.params.id);
    if (!product || product.isDeleted) {
      req.session.errorMessage = "Product not found.";
      return res.redirect("/admin/products");
    }
    const products = await Products.find({ isDeleted: false })
      .select("name _id")
      .lean();
    res.render("admin/editProducts", { categories, product, products });
  } catch (err) {
    console.error(err);
    req.session.errorMessage = "Something Went Wrong";
    res.redirect("/admin/products");
  }
};
const postEditProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const oldProduct = await Products.findById(productId);
    if (!oldProduct) {
      return res
        .status(404)
        .json({ success: false, error: "Product not found" });
    }

    const {
      name,
      description,
      notes,
      category: rawCategory,
      brand,
      gender,
      concentration,
      variants: rawVariants,
    } = req.body;
    const imageFiles = req.files?.map((file) => file.path) || [];
    const existingImages = Array.isArray(req.body.existingImages)
      ? req.body.existingImages
      : [];

    // Build updated images
    let updatedImages = [...(oldProduct.images || [])];
    imageFiles.forEach((filePath, index) => {
      if (index < 4) {
        updatedImages[index] = filePath;
      }
    });
    // Fill remaining slots with existing images if available
    let existingIdx = 0;
    for (let i = 0; i < 4; i++) {
      if (!updatedImages[i] && existingIdx < existingImages.length) {
        updatedImages[i] = existingImages[existingIdx++];
      }
    }
    // Trim to exactly 4
    updatedImages = updatedImages.slice(0, 4);

    // Validate images: exactly 4 valid paths
    if (updatedImages.length !== 4 || updatedImages.some((img) => !img)) {
      return res.status(400).json({
        success: false,
        error: "Exactly 4 valid images are required.",
      });
    }

    // Validate required fields (final values)
    const finalName = name ? name.trim() : oldProduct.name;
    if (!finalName) {
      return res
        .status(400)
        .json({ success: false, error: "Product name is required." });
    }

    const finalDescription = description
      ? description.trim()
      : oldProduct.description;
    if (!finalDescription) {
      return res
        .status(400)
        .json({ success: false, error: "Product description is required." });
    }

    const finalCategory = rawCategory
      ? rawCategory.trim()
      : oldProduct.category;
    if (!finalCategory) {
      return res
        .status(400)
        .json({ success: false, error: "Category is required." });
    }

    const finalGender = gender || oldProduct.gender;
    if (!finalGender) {
      return res
        .status(400)
        .json({ success: false, error: "Gender is required." });
    }

    const finalConcentration = concentration || oldProduct.concentration;
    if (!finalConcentration) {
      return res
        .status(400)
        .json({ success: false, error: "Concentration is required." });
    }

    // Parse variants if provided, else keep old
    let parsedVariants = [...oldProduct.variants];
    if (rawVariants) {
      if (Array.isArray(rawVariants)) {
        parsedVariants = rawVariants
          .map((v, index) => {
            if (
              !v ||
              !v.mlSize ||
              !v.stock ||
              !v.basePrice ||
              !v.discountedPrice
            ) {
              return null;
            }
            return {
              mlSize: parseInt(v.mlSize),
              stock: parseInt(v.stock),
              basePrice: parseFloat(v.basePrice) || 0,
              discountedPrice: parseFloat(v.discountedPrice) || 0,
              index, // For error reporting
            };
          })
          .filter((v) => v !== null);
      } else if (
        rawVariants &&
        rawVariants.mlSize &&
        rawVariants.stock &&
        rawVariants.basePrice &&
        rawVariants.discountedPrice
      ) {
        // Fallback for single object (unlikely in edit, but handle)
        const singleVariant = {
          mlSize: parseInt(rawVariants.mlSize),
          stock: parseInt(rawVariants.stock),
          basePrice: parseFloat(rawVariants.basePrice) || 0,
          discountedPrice: parseFloat(rawVariants.discountedPrice) || 0,
          index: 0,
        };
        parsedVariants = [singleVariant];
      }
    }

    // Per-variant validation
    let variantErrors = [];
    parsedVariants.forEach((v) => {
      const variantNum = v.index + 1;
      if (v.mlSize <= 0) {
        variantErrors.push(
          `Variant ${variantNum} size must be greater than 0.`
        );
      }
      if (v.stock < 1) {
        variantErrors.push(`Variant ${variantNum} stock must be at least 1.`);
      }
      if (v.basePrice <= 1) {
        variantErrors.push(
          `Variant ${variantNum} base price must be greater than 1.`
        );
      }
      if (v.discountedPrice < 0) {
        variantErrors.push(
          `Variant ${variantNum} discounted price must be at least 0.`
        );
      }
      if (v.discountedPrice > v.basePrice) {
        variantErrors.push(
          `Variant ${variantNum} discounted price must be less than or equal to base price.`
        );
      }
    });

    if (variantErrors.length > 0) {
      return res
        .status(400)
        .json({ success: false, error: variantErrors.join(" ") });
    }

    if (parsedVariants.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one valid variant is required.",
      });
    }

    // Description word count
    const wordCountDesc = finalDescription.split(/\s+/).length;
    if (wordCountDesc < 10 || wordCountDesc > 150) {
      return res.status(400).json({
        success: false,
        error: "Description must be between 10 and 150 words.",
      });
    }

    // Notes word count
    const finalNotes = notes ? notes.trim() : oldProduct.notes;
    const wordCountNotes = finalNotes.split(/\s+/).length;
    if (wordCountNotes > 150 || (wordCountNotes > 0 && wordCountNotes < 5)) {
      return res.status(400).json({
        success: false,
        error:
          "Notes must be either empty or at least 5 words, and no more than 150 words.",
      });
    }

    // Brand validation
    const finalBrand = brand ? brand.trim() : oldProduct.brand;
    if (finalBrand && !/^[A-Z\s]+$/.test(finalBrand)) {
      return res.status(400).json({
        success: false,
        error: "Brand name must be uppercase letters only.",
      });
    }

    // Check duplicate name (exclude current product)
    if (finalName.toLowerCase() !== oldProduct.name.toLowerCase()) {
      const existingProduct = await Products.findOne({
        name: { $regex: new RegExp(`^${finalName}$`, "i") },
        _id: { $ne: productId },
        isDeleted: false,
      });
      if (existingProduct) {
        return res.status(400).json({
          success: false,
          error: "Product name already exists. Please choose a unique name.",
        });
      }
    }

    // Update product
    oldProduct.name = finalName;
    oldProduct.description = finalDescription;
    oldProduct.notes = finalNotes;
    oldProduct.brand = finalBrand;
    oldProduct.category = finalCategory;
    oldProduct.gender = finalGender;
    oldProduct.concentration = finalConcentration;
    oldProduct.images = updatedImages;
    oldProduct.variants = parsedVariants.map((v) => ({
      // Strip index
      mlSize: v.mlSize,
      stock: v.stock,
      basePrice: v.basePrice,
      discountedPrice: v.discountedPrice,
    }));

    await oldProduct.save();

    // Handle category change
    const oldCategory = oldProduct.category; // Already saved, but was set before save
    if (oldCategory && oldCategory !== finalCategory) {
      // Remove from old category
      await Categories.findByIdAndUpdate(oldCategory, {
        $pull: { products: productId },
      });
      // Add to new category
      await Categories.findByIdAndUpdate(finalCategory, {
        $push: { products: productId },
      });
    }

    res.json({ success: true, message: "Product Has Been Edited" });
  } catch (err) {
    console.error("Error editing product:", err);
    res.status(500).json({
      success: false,
      error:
        "Something went wrong while editing the product. Please try again.",
    });
  }
};

const getProductDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch product with populated categories
    const product = await Products.findById(id)
      .populate("category", "name") // Populate category names
      .lean(); // Use lean for better performance since we're not modifying

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // You can add more data processing here if needed, e.g., calculate totals

    // Render the view
    res.render("admin/productDetails", {
      title: "Product Details - Admin",
      product,
      // Add other locals if needed, e.g., categories: await Category.find()
    });
  } catch (error) {
    console.error("Error fetching product details:", error);
    (req.session.error = "error"), "Failed to load product details.";
    res.redirect("/admin/products");
  }
};
const unlistProduct = async (req, res) => {
  try {
    const product = await Products.findOne({ _id: req.params.id });

    product.isListed = !product.isListed;
    await product.save();
    req.session.successMessage = "Product Status Has Been Changed  ";
    res.redirect(`/admin/products/${req.params.id}`);
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
const formatRevenue = (amount) => {
  if (amount >= 100000) {
    return (amount / 100000).toFixed(2) + "L";
  }
  return amount.toLocaleString();
};
const getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.body || {}; // For filtered reports
    const PRICE_FIELD = "$items.discoundedPrice"; // Fixed to match schema: discoundedPrice

    let totalRevenue = 0;
    let totalOrders = 0;
    let successfulOrders = 0;
    let deliveredCount = 0;
    let totalDeliveryDays = 0;
    const userSet = new Set();
    const monthlyRevenue = {}; // Keyed by "MMM YYYY" for cross-year accuracy
    const statusCounts = {
      Placed: 0,
      Shipped: 0,
      "Out for Delivery": 0,
      Delivered: 0,
      Cancelled: 0,
      Returned: 0,
    };

    // Build date filter
    const dateFilter = {};
    if (startDate)
      dateFilter.placedAt = {
        ...dateFilter.placedAt,
        $gte: new Date(startDate),
      };
    if (endDate)
      dateFilter.placedAt = { ...dateFilter.placedAt, $lte: new Date(endDate) };

    const orders = await Orders.find(dateFilter).populate("items.productId");

    if (orders.length === 0) {
      return res.render("admin/salesReport", {
        totalRevenue: "₹0",
        avgOrderValue: "₹0",
        totalOrders: 0,
        newCustomers: 0,
        revenueData: JSON.stringify({ labels: [], datasets: [] }),
        topProductsData: JSON.stringify({ labels: [], datasets: [] }),
        categoryData: JSON.stringify({ labels: [], datasets: [] }),
        genderData: JSON.stringify({
          labels: ["Men", "Women", "Unisex"],
          datasets: [
            {
              data: [0, 0, 0],
              backgroundColor: ["#3b82f6", "#ec4899", "#10b981"],
              borderColor: ["#1f2937", "#1f2937", "#1f2937"],
              borderWidth: 1,
            },
          ],
        }),
        statusData: JSON.stringify({
          labels: [
            "Placed",
            "Shipped",
            "Out for Delivery",
            "Delivered",
            "Cancelled",
            "Returned",
          ],
          datasets: [
            {
              data: [0, 0, 0, 0, 0, 0],
              backgroundColor: [
                "#f59e0b",
                "#3b82f6",
                "#10b981",
                "#10b981",
                "#ef4444",
                "#8b5cf6",
              ],
              borderColor: "#1f2937",
              borderWidth: 2,
            },
          ],
        }),
        menSales: 0,
        womenSales: 0,
        unisexSales: 0,
        groupedSalesData: [],
      });
    }

    orders.forEach((order) => {
      totalOrders++;
      if (order.orderStatus) {
        statusCounts[order.orderStatus] =
          (statusCounts[order.orderStatus] || 0) + 1;
      }

      const monthKey = moment(order.placedAt).format("MMM YYYY"); // Accurate key
      if (order.orderStatus === "Delivered") {
        totalRevenue += order.totalAmount || 0;
        successfulOrders++;
        monthlyRevenue[monthKey] =
          (monthlyRevenue[monthKey] || 0) + (order.totalAmount || 0);
        userSet.add(order.userId.toString());

        if (order.deliveredAt) {
          deliveredCount++;
          let diff = moment(order.deliveredAt).diff(
            moment(order.placedAt),
            "days"
          );
          if (diff < 0) diff = 0; // Clamp negatives
          totalDeliveryDays += diff;
        }
      }
    });

    const newCustomers = userSet.size;
    const avgOrderValue =
      successfulOrders > 0
        ? Math.round(totalRevenue / successfulOrders).toString()
        : "0";

    // Sort chronologically, limit to last 12 months
    const sortedMonths = Object.keys(monthlyRevenue)
      .map((key) => ({ key, date: moment(key, "MMM YYYY") }))
      .sort((a, b) => a.date - b.date)
      .slice(-12); // Adjust slice(-N) for more/fewer months
    const revenueLabels = sortedMonths.map((m) => m.key);
    const revenueValues = sortedMonths.map((m) => monthlyRevenue[m.key] || 0);

    const revenueData = {
      labels: revenueLabels.length > 0 ? revenueLabels : [], // Empty if no data
      datasets: [
        {
          label: "Revenue",
          data: revenueValues,
          backgroundColor: "#c5a987",
          borderColor: "#c5a987",
          borderWidth: 1,
        },
      ],
    };

    // Top Products (units sold, limited to 7) - add date filter
    const topProductsAgg = await Orders.aggregate([
      { $match: { ...dateFilter, orderStatus: "Delivered" } },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$items.productId",
          name: { $first: { $ifNull: ["$product.name", "$items.name"] } }, // Fallback to items.name if available
          totalUnits: { $sum: "$items.quantity" },
        },
      },
      { $sort: { totalUnits: -1 } },
      { $limit: 7 },
    ]);

    const topProductsData = {
      labels: topProductsAgg.map((p) =>
        p.name ? p.name.substring(0, 15) : "Unknown"
      ),
      datasets: [
        {
          label: "Units Sold",
          data: topProductsAgg.map((p) => p.totalUnits || 0),
          backgroundColor: "#c5a987",
          borderColor: "#c5a987",
          borderWidth: 1,
        },
      ],
    };

    // Category (fixed PRICE_FIELD) - add date filter
    const categoryAgg = await Orders.aggregate([
      { $match: { ...dateFilter, orderStatus: "Delivered" } },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $unwind: {
          path: "$product.category",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "product.category",
          foreignField: "_id",
          as: "categoryDoc",
        },
      },
      { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ["$categoryDoc.name", "Uncategorized"] },
          totalSales: { $sum: { $multiply: ["$items.quantity", PRICE_FIELD] } },
        },
      },
      { $sort: { totalSales: -1 } },
      { $limit: 5 },
    ]);

    const categoryData = {
      labels: categoryAgg.map((c) => c._id || "Uncategorized"),
      datasets: [
        {
          data: categoryAgg.map((c) => c.totalSales || 0),
          backgroundColor: [
            "#3b82f6",
            "#10b981",
            "#f59e0b",
            "#ef4444",
            "#8b5cf6",
          ],
          borderColor: "#1f2937",
          borderWidth: 2,
        },
      ],
    };

    // Gender (fixed PRICE_FIELD) - add date filter
    const genderAgg = await Orders.aggregate([
      { $match: { ...dateFilter, orderStatus: "Delivered" } },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ["$product.gender", "unknown"] },
          totalSales: { $sum: { $multiply: ["$items.quantity", PRICE_FIELD] } },
        },
      },
    ]);

    let menSales = 0,
      womenSales = 0,
      unisexSales = 0;

    genderAgg.forEach((g) => {
      if (g._id === "MEN") menSales = g.totalSales || 0;
      if (g._id === "WOMEN") womenSales = g.totalSales || 0;
      if (g._id === "UNISEX") unisexSales = g.totalSales || 0;
    });

    const genderData = {
      labels: ["Men", "Women", "Unisex"],
      datasets: [
        {
          data: [menSales, womenSales, unisexSales],
          backgroundColor: ["#3b82f6", "#ec4899", "#10b981"],
          borderColor: ["#1f2937", "#1f2937", "#1f2937"],
          borderWidth: 1,
        },
      ],
    };

    // Status (unchanged) - add date filter
    const statusAgg = await Orders.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$orderStatus",
          count: { $sum: 1 },
        },
      },
    ]);
    statusAgg.forEach((stat) => {
      statusCounts[stat._id] = stat.count;
    });

    const statusData = {
      labels: [
        "Placed",
        "Shipped",
        "Out for Delivery",
        "Delivered",
        "Cancelled",
        "Returned",
      ],
      datasets: [
        {
          data: [
            statusCounts.Placed || 0,
            statusCounts.Shipped || 0,
            statusCounts["Out for Delivery"] || 0,
            statusCounts.Delivered || 0,
            statusCounts.Cancelled || 0,
            statusCounts.Returned || 0,
          ],
          backgroundColor: [
            "#f59e0b",
            "#3b82f6",
            "#10b981",
            "#10b981",
            "#ef4444",
            "#8b5cf6",
          ],
          borderColor: "#1f2937",
          borderWidth: 2,
        },
      ],
    };

    // Aggregates for sales data (delivered, returns) - fixed PRICE_FIELD, add date filter
    const deliveredAgg = await Orders.aggregate([
      { $match: { ...dateFilter, orderStatus: "Delivered" } },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            productId: "$items.productId",
            mlSize: "$items.mlSize",
          },
          productName: { $first: "$product.name" },
          mlSize: { $first: "$items.mlSize" },
          soldQuantity: { $sum: "$items.quantity" },
          revenue: {
            $sum: { $multiply: ["$items.quantity", PRICE_FIELD] },
          },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    const returnedAgg = await Orders.aggregate([
      { $match: { ...dateFilter, orderStatus: "Returned" } },
      { $unwind: "$returndProduct" },
      {
        $group: {
          _id: {
            productId: "$returndProduct.productId",
            mlSize: "$returndProduct.mlSize",
          },
          returns: { $sum: "$returndProduct.returndQuantity" },
        },
      },
    ]);

    // Maps for quick lookup (using string keys with ObjectId.toString())
    const deliveredMap = new Map();
    deliveredAgg.forEach((item) => {
      const key = `${item._id.productId.toString()}_${item.mlSize}`;
      deliveredMap.set(key, {
        soldQuantity: item.soldQuantity || 0,
        revenue: item.revenue || 0,
      });
    });

    const returnsMap = new Map();
    returnedAgg.forEach((r) => {
      const key = `${r._id.productId.toString()}_${r._id.mlSize}`;
      returnsMap.set(key, r.returns || 0);
    });

    // Fetch all listed, non-deleted products
    const allProducts = await Products.find({
      isListed: true,
      isDeleted: false,
    });

    // Build groupedSalesData: one entry per product, with its variants
    const groupedSalesData = [];
    for (const product of allProducts) {
      const productVariants = [];
      let productTotalRevenue = 0;

      for (const variant of product.variants) {
        if (variant.isListed && !variant.isDeleted) {
          const mlSizeStr = String(variant.mlSize);
          const key = `${product._id.toString()}_${mlSizeStr}`;
          const delivered = deliveredMap.get(key) || {
            soldQuantity: 0,
            revenue: 0,
          };
          const returns = returnsMap.get(key) || 0;

          const variantData = {
            mlSize: variant.mlSize,
            soldQuantity: delivered.soldQuantity,
            returns,
            revenue: delivered.revenue,
            stock: variant.stock || 0,
          };

          productVariants.push(variantData);
          productTotalRevenue += delivered.revenue;
        }
      }

      if (productVariants.length > 0) {
        // Sort variants by mlSize ascending
        productVariants.sort((a, b) => a.mlSize - b.mlSize);
        groupedSalesData.push({
          name: product.name || "Unknown",
          variants: productVariants,
          totalRevenue: productTotalRevenue,
        });
      }
    }

    // Sort products by totalRevenue descending
    groupedSalesData.sort((a, b) => b.totalRevenue - a.totalRevenue);

    res.render("admin/salesReport", {
      totalRevenue: `₹${totalRevenue.toLocaleString()}`,
      avgOrderValue: `₹${avgOrderValue}`,
      totalOrders,
      newCustomers,

      revenueData,
      topProductsData,
      categoryData,
      genderData,
      statusData,

      menSales,
      womenSales,
      unisexSales,
      groupedSalesData,
    });
  } catch (error) {
    console.error("Sales Report Error:", error);
    res.status(500).send("Server Error");
  }
};

// Export handler for Excel
const exportSalesReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const PRICE_FIELD = "$items.discoundedPrice";

    // Build date filter
    const dateFilter = {};
    if (startDate)
      dateFilter.placedAt = {
        ...dateFilter.placedAt,
        $gte: new Date(startDate),
      };
    if (endDate)
      dateFilter.placedAt = { ...dateFilter.placedAt, $lte: new Date(endDate) };

    // Compute data similar to getSalesReport (reuse logic if possible, but for brevity, recompute key parts)
    const orders = await Orders.find(dateFilter).populate("items.productId");

    let totalRevenue = 0;
    let totalOrders = 0;
    let successfulOrders = 0;
    const userSet = new Set();

    orders.forEach((order) => {
      totalOrders++;
      if (order.orderStatus === "Delivered") {
        totalRevenue += order.totalAmount || 0;
        successfulOrders++;
        userSet.add(order.userId.toString());
      }
    });

    const newCustomers = userSet.size;
    const avgOrderValue =
      successfulOrders > 0 ? Math.round(totalRevenue / successfulOrders) : 0;

    // Detailed data
    const deliveredAgg = await Orders.aggregate([
      { $match: { ...dateFilter, orderStatus: "Delivered" } },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            productId: "$items.productId",
            mlSize: "$items.mlSize",
          },
          productName: { $first: "$product.name" },
          mlSize: { $first: "$items.mlSize" },
          soldQuantity: { $sum: "$items.quantity" },
          revenue: {
            $sum: { $multiply: ["$items.quantity", PRICE_FIELD] },
          },
        },
      },
    ]);

    const returnedAgg = await Orders.aggregate([
      { $match: { ...dateFilter, orderStatus: "Returned" } },
      { $unwind: "$returndProduct" },
      {
        $group: {
          _id: {
            productId: "$returndProduct.productId",
            mlSize: "$returndProduct.mlSize",
          },
          returns: { $sum: "$returndProduct.returndQuantity" },
        },
      },
    ]);

    const deliveredMap = new Map();
    deliveredAgg.forEach((item) => {
      const key = `${item._id.productId.toString()}_${item.mlSize}`;
      deliveredMap.set(key, {
        soldQuantity: item.soldQuantity || 0,
        revenue: item.revenue || 0,
        productName: item.productName,
      });
    });

    const returnsMap = new Map();
    returnedAgg.forEach((r) => {
      const key = `${r._id.productId.toString()}_${r._id.mlSize}`;
      returnsMap.set(key, r.returns || 0);
    });

    const allProducts = await Products.find({
      isListed: true,
      isDeleted: false,
    });

    // Flatten data for Excel (repeat product name)
    const exportData = [];
    allProducts.forEach((product) => {
      product.variants.forEach((variant) => {
        if (variant.isListed && !variant.isDeleted) {
          const mlSizeStr = String(variant.mlSize);
          const key = `${product._id.toString()}_${mlSizeStr}`;
          const delivered = deliveredMap.get(key) || {
            soldQuantity: 0,
            revenue: 0,
            productName: product.name,
          };
          const returns = returnsMap.get(key) || 0;

          exportData.push({
            productName: product.name,
            mlSize: variant.mlSize,
            soldQuantity: delivered.soldQuantity,
            returns,
            revenue: delivered.revenue,
            stock: variant.stock || 0,
          });
        }
      });
    });

    exportData.sort((a, b) => b.revenue - a.revenue);

    // Use exceljs to generate file (assume installed: npm i exceljs)
    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    // Add summary row
    worksheet.addRow(["Summary"]);
    worksheet.addRow(["Total Revenue", `₹${totalRevenue.toLocaleString()}`]);
    worksheet.addRow(["Avg Order Value", `₹${avgOrderValue.toLocaleString()}`]);
    worksheet.addRow(["Total Orders", totalOrders]);
    worksheet.addRow(["Total Customers", newCustomers]);
    worksheet.addRow([]);

    // Add headers
    worksheet.addRow([
      "Product Name",
      "ML Size",
      "Sold Quantity",
      "Returns",
      "Revenue",
      "Current Stock",
    ]);

    // Add data
    exportData.forEach((row) => {
      worksheet.addRow([
        row.productName,
        `${row.mlSize}ml`,
        row.soldQuantity,
        row.returns,
        `₹${row.revenue.toLocaleString()}`,
        row.stock,
      ]);
    });

    // Style headers
    worksheet.getRow(8).font = { bold: true };
    worksheet.columns = [
      { width: 30 },
      { width: 10 },
      { width: 15 },
      { width: 10 },
      { width: 15 },
      { width: 15 },
    ];

    // Set response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=sales-report-${startDate || "full"}-to-${
        endDate || "full"
      }.xlsx`
    );

    // Send workbook
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ message: "Export failed" });
  }
};

// Category fields
const getCategories = async (req, res) => {
  try {
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

const getReturn = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Prepare messages from session
    const successMessage = req.session.success;
    const errorMessage = req.session.error;
    delete req.session.success;
    delete req.session.error;

    // Total Returns Count (only those with returndProduct)
    const totalReturnsResult = await Orders.aggregate([
      {
        $unwind: { path: "$returndProduct", preserveNullAndEmptyArrays: false },
      },
      { $match: { "returndProduct.adminApproved": { $exists: true } } },
      { $count: "total" },
    ]);
    const totalReturns = totalReturnsResult[0]?.total || 0;

    // Requested Returns Count
    const requestedResult = await Orders.aggregate([
      {
        $unwind: { path: "$returndProduct", preserveNullAndEmptyArrays: false },
      },
      { $match: { "returndProduct.adminApproved": "Requested" } },
      { $count: "count" },
    ]);
    const requestedReturnsCount = requestedResult[0]?.count || 0;

    // Approved Returns Count
    const approvedResult = await Orders.aggregate([
      {
        $unwind: { path: "$returndProduct", preserveNullAndEmptyArrays: false },
      },
      { $match: { "returndProduct.adminApproved": "Approved" } },
      { $count: "count" },
    ]);
    const approvedReturnsCount = approvedResult[0]?.count || 0;

    // Total Refund Amount
    const totalRefundResult = await Orders.aggregate([
      {
        $unwind: { path: "$returndProduct", preserveNullAndEmptyArrays: false },
      },
      { $match: { "returndProduct.adminApproved": "Approved" } },
      {
        $group: {
          _id: null,
          totalRefund: {
            $sum: {
              $multiply: [
                "$returndProduct.discountedPrice",
                "$returndProduct.returndQuantity",
              ],
            },
          },
        },
      },
    ]);
    const totalRefundAmount =
      totalRefundResult.length > 0
        ? [{ totalRefund: totalRefundResult[0].totalRefund.toFixed(2) }]
        : [{ totalRefund: "0.00" }];

    // Returns Pipeline (fixed: unwind with preserve false, match exists, sort before skip/limit, project order_id for EJS link)
    const returnsPipeline = [
      {
        $unwind: { path: "$returndProduct", preserveNullAndEmptyArrays: false },
      },
      { $match: { "returndProduct.adminApproved": { $exists: true } } },
      { $sort: { "returndProduct.returnedAt": -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: "$returndProduct._id", // Subdoc _id for potential use
          order_id: "$_id", // Order's MongoDB _id for EJS link (/admin/return/<%= returnItem.order_id %>)
          returnID: { $concat: ["R-", { $toString: "$returndProduct._id" }] }, // Enhanced returnID for display
          orderID: "$orderID", // Original orderID (nanoid)
          address: "$address",
          returnedAt: "$returndProduct.returnedAt",
          refundAmount: {
            $multiply: [
              "$returndProduct.discountedPrice",
              "$returndProduct.returndQuantity",
            ],
          },
          name: "$returndProduct.name",
          mlSize: "$returndProduct.mlSize",
          quantity: "$returndProduct.returndQuantity",
          adminApproved: "$returndProduct.adminApproved",
          reason: "$returndProduct.reason",
          image: "$returndProduct.image",
          productId: "$returndProduct.productId",
          basePrice: "$returndProduct.basePrice",
          discountedPrice: "$returndProduct.discountedPrice",
        },
      },
    ];

    const returns = await Orders.aggregate(returnsPipeline);
    // console.log('Debug Returns:', returns);  // Remove after testing

    const totalPages = Math.ceil(totalReturns / limit);

    res.render("admin/return", {
      title: "Returns Management",
      totalReturns,
      requestedReturnsCount,
      approvedReturnsCount,
      totalRefundAmount,
      returns,
      currentPage: page,
      totalPages,
      limit,
      successMessage,
      errorMessage,
    });
  } catch (error) {
    console.error("Error fetching returns:", error);
    req.session.error = "Failed to load returns data.";
    res.redirect("/admin/return");
  }
};

const getReturnDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Orders.findById(orderId).populate(
      "userId",
      "name email phone"
    );
    if (!order) {
      req.session.error = "Order not found";
      return res.redirect("/admin/returns");
    }

    const user = order.userId;
    const returnItem = order.returndProduct[0];
    if (!returnItem) {
      req.session.error = "Return not found";
      return res.redirect("/admin/returns");
    }

    // Add missing fields virtually
    const enhancedReturnItem = {
      ...returnItem.toObject(),
      returnId: nanoid(6),
      images: [],
      rejectReason:
        returnItem.adminApproved === "Rejected" ? "No reason provided" : "",
      approvedAt: returnItem.adminApproved === "Approved" ? new Date() : null,
      rejectedAt: returnItem.adminApproved === "Rejected" ? new Date() : null,
      processingAt:
        returnItem.adminApproved === "Processing" ? new Date() : null,
      completedAt: returnItem.adminApproved === "Completed" ? new Date() : null,
      returndQuantity: returnItem.returndQuantity || 1,
    };

    const successMessage = req.session.success;
    const errorMessage = req.session.error;

    delete req.session.success;
    delete req.session.error;

    res.render("admin/returnDetails", {
      order,
      returnItem: enhancedReturnItem,
      user,
      successMessage,
      errorMessage,
    });
  } catch (error) {
    console.error(error);
    req.session.error = "Failed to fetch return details";
    res.redirect("/admin/returns");
  }
};

const returnApprove = async (req, res) => {
  const { orderId } = req.params;
  try {
    const order = await Orders.findById(orderId);
    if (!order) {
      req.session.error = "Order not found";
      return res.redirect(`/admin/return/${orderId}`);
    }

    const returnItem = order.returndProduct[0];
    if (!returnItem || returnItem.adminApproved !== "Requested") {
      req.session.error = "Invalid return or already processed";
      return res.redirect(`/admin/return/${orderId}`);
    }

    // Update return status
    returnItem.adminApproved = "Approved";

    // Update order status to Returned
    order.orderStatus = "Returned";

    // Update original item status to Returned and reduce quantity
    const originalItem = order.items.find(
      (item) =>
        item.productId.toString() === returnItem.productId.toString() &&
        item.mlSize === returnItem.mlSize
    );
    if (originalItem) {
      originalItem.productStatus = "Returned";
      originalItem.quantity -= returnItem.returndQuantity;
    }

    // Add tracking entry for return approval
    order.tracking.push({
      status: "Return Approved",
      date: new Date(),
      message: "Return approved by admin and stock updated",
    });

    // Increase stock in specific variant
    await Products.findOneAndUpdate(
      {
        _id: returnItem.productId,
        "variants.mlSize": returnItem.mlSize,
      },
      {
        $inc: { "variants.$.stock": returnItem.returndQuantity },
      }
    );

    await order.save();

    req.session.success =
      "Return approved, order status updated, and stock restored successfully";
    res.redirect(`/admin/return/${orderId}`);
  } catch (error) {
    console.error(error);
    req.session.error = "Failed to approve return";
    res.redirect(`/admin/return/${orderId}`);
  }
};
const getOffers = async (req, res) => {
  let successMessage = null;
  let errorMessage = null;

  try {
    // Handle messages from redirects
    if (req.query.success) {
      successMessage = decodeURIComponent(req.query.success);
    }
    if (req.query.error) {
      errorMessage = decodeURIComponent(req.query.error);
    }
    if (req.session.error) {
      errorMessage = req.session.error;
      delete req.session.error; // Clear to avoid repeats
    }
    if (req.session.success) {
      successMessage = req.session.success;
      delete req.session.success;
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Total offers count
    const totalOffers = await Offer.countDocuments({});

    // Active offers count
    const activeOffersCount = await Offer.countDocuments({ isActive: true });

    // Inactive offers count
    const inactiveOffersCount = totalOffers - activeOffersCount;

    // Total discount value (sum of all discountValue, regardless of type)
    const totalDiscountAggregation = await Offer.aggregate([
      {
        $group: {
          _id: null,
          totalDiscount: { $sum: "$discountValue" },
        },
      },
    ]);
    const totalDiscountCount =
      totalDiscountAggregation.length > 0
        ? totalDiscountAggregation
        : [{ totalDiscount: 0 }];

    // Fetch paginated offers with populated target
    const offers = await Offer.find({ isDeleted: false })
      .populate("targetId")
      .sort({ createdAt: -1 }) // Sort by most recent first
      .skip(skip)
      .limit(limit);

    // Calculate total pages
    const totalPages = Math.ceil(totalOffers / limit);

    // Products and details for listing
    const products = await Products.find({ isDeleted: false, isListed: true })
      .select("_id name price description images variants")
      .limit(50); // Adjust model/import
    const categories = await Categories.find({
      isActive: true,
      isDeleted: false,
    })
      .select("_id name description")
      .limit(50);

    // Render the view (adjust the view path as needed, e.g., 'admin/offers/list')
    res.render("admin/offers", {
      offers,
      products,
      categories,
      totalOffers,
      activeOffersCount,
      inactiveOffersCount,
      totalDiscountCount,
      currentPage: page,
      totalPages,
      limit,
      successMessage,
      errorMessage,
    });
  } catch (error) {
    console.error("Error fetching offers:", error);
    // Re-render with empty data or redirect, but for simplicity, render with error
    res.render("admin/offers", {
      offers: [],
      totalOffers: 0,
      activeOffersCount: 0,
      inactiveOffersCount: 0,
      totalDiscountCount: [{ totalDiscount: 0 }],
      currentPage: 1,
      totalPages: 1,
      limit: 10,
      successMessage: null,
      errorMessage: error.message,
    });
  }
};

const createOffer = async (req, res) => {
  try {
    const {
      name,
      description,
      discountType,
      discountValue,
      appliesTo,
      startDate,
      endDate,
    } = req.body;
    let targetId = req.body.targetId; // Could be string (category) or array (products)

    // Normalize targetId to always be an array
    let rawTargetIds = Array.isArray(targetId) ? targetId : [targetId];
    // Filter out empty or invalid strings before further processing
    const targetIds = rawTargetIds.filter((id) => id && id.trim() !== "");

    if (!name?.trim()) {
      req.session.error = "Offer name is required";
      return res.redirect("/admin/offers");
    }
    if (!discountType || !["flat", "percentage"].includes(discountType)) {
      req.session.error = "Valid discount type is required";
      return res.redirect("/admin/offers");
    }
    const discountNum = parseFloat(discountValue);
    if (isNaN(discountNum) || discountNum <= 0) {
      req.session.error = "Discount value must be greater than 0";
      return res.redirect("/admin/offers");
    }
    if (!appliesTo || !["product", "category"].includes(appliesTo)) {
      req.session.error =
        "Must specify if offer applies to product or category";
      return res.redirect("/admin/offers");
    }
    if (
      !targetIds?.length ||
      targetIds.some((id) => !mongoose.Types.ObjectId.isValid(id))
    ) {
      req.session.error = "Valid target ID(s) are required";
      return res.redirect("/admin/offers");
    }
    if (!startDate) {
      req.session.error = "Start date is required";
      return res.redirect("/admin/offers");
    }
    if (!endDate) {
      req.session.error = "End date is required";
      return res.redirect("/admin/offers");
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) {
      req.session.error = "End date must be after start date";
      return res.redirect("/admin/offers");
    }
    if (discountType === "percentage" && discountNum > 100) {
      req.session.error = "Percentage discount cannot exceed 100%";
      return res.redirect("/admin/offers");
    }

    // Validate targets (products or category)
    if (appliesTo === "product") {
      const validProducts = await Products.countDocuments({
        _id: { $in: targetIds },
        isDeleted: false,
        isListed: true,
      });
      if (validProducts !== targetIds.length) {
        req.session.error = "One or more selected products are invalid";
        return res.redirect("/admin/offers");
      }
    } else {
      const validCategory = await Categories.countDocuments({
        _id: targetIds[0],
        isActive: true,
        isDeleted: false,
      });
      if (!validCategory) {
        req.session.error = "Selected category is invalid";
        return res.redirect("/admin/offers");
      }
    }

    const offerData = {
      name: name.trim(),
      description: description?.trim() || undefined,
      discountType,
      discountValue: discountNum,
      appliesTo,
      targetModel: appliesTo === "product" ? "Products" : "Categories",
      targetId: targetIds,
      startDate: start,
      endDate: end,
      isActive: true,
    };

    const offer = new Offer(offerData);
    await offer.save();

    // Redirect with success message (handled in GET)
    req.session.success = "Offer created successfully!";
    res.redirect("/admin/offers");
  } catch (error) {
    console.error("Error creating offer:", error);
    // Redirect with error message (handled in GET)
    req.session.error = error.message;
    res.redirect("/admin/offers");
  }
};
const getOfferDetails = async (req, res) => {
  let successMessage = null;
  let errorMessage = null;

  try {
    // Handle messages from redirects
    if (req.session.success) {
      successMessage = req.session.success;
      delete req.session.success;
    }
    if (req.session.error) {
      errorMessage = req.session.error;
      delete req.session.error;
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.session.error = "Invalid offer ID";
      return res.redirect("/admin/offers");
    }

    // Fetch offer with populated targets (uses refPath: "targetModel" from schema)
    const offer = await Offer.findById(id).populate("targetId");

    if (!offer) {
      console.error(`Offer not found for ID: ${id}`); // Log for server-side debug
      req.session.error = "Offer not found";
      return res.redirect("/admin/offers");
    }

    // Log for debugging (now includes populated targets)
    console.log(
      "Offer with populated targets:",
      JSON.stringify(offer, null, 2)
    );

    res.render("admin/offerDetails", {
      offer,
      success: successMessage,
      error: errorMessage,
    });
  } catch (error) {
    console.error("Error fetching offer details:", error); // This already exists, but ensure it's visible in your logs (e.g., console or file)
    req.session.error = error.message;
    res.redirect("/admin/offers");
  }
};
const toggleOfferStatus = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.session.error = "Invalid offer ID";
      return res.redirect("/admin/offers");
    }

    const offer = await Offer.findOne({ _id: req.params.id });

    if (!offer) {
      req.session.error = "Offer not found";
      return res.redirect("/admin/offers");
    }

    offer.isActive = !offer.isActive;
    await offer.save();
    req.session.success = offer.isActive
      ? "Offer activated successfully!"
      : "Offer deactivated successfully!";
    res.redirect(`/admin/offers/${req.params.id}`);
  } catch (error) {
    console.error("Error toggling offer status:", error);
    req.session.error = error.message;
    res.redirect("/admin/offers");
  }
};

const updateOfferEndDate = async (req, res) => {
  try {
    const { id } = req.params;
    const { endDate } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.session.error = "Invalid offer ID";
      return res.redirect("/admin/offers");
    }

    if (!endDate) {
      req.session.error = "End date is required";
      return res.redirect(`/admin/offers/${id}`);
    }

    const offer = await Offer.findById(id);

    if (!offer) {
      req.session.error = "Offer not found";
      return res.redirect("/admin/offers");
    }

    const newEnd = new Date(endDate);
    if (newEnd <= offer.startDate) {
      req.session.error = "End date must be after start date";
      return res.redirect(`/admin/offers/${id}`);
    }

    offer.endDate = newEnd;
    await offer.save();

    req.session.success = "Offer end date updated successfully!";
    res.redirect(`/admin/offers/${id}`);
  } catch (error) {
    console.error("Error updating offer end date:", error);
    req.session.error = error.message;
    res.redirect("/admin/offers");
  }
};
const deleteOffer = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.session.error = "Invalid offer ID";
      return res.redirect("/admin/offers");
    }

    const offer = await Offer.findById(id);

    if (!offer) {
      req.session.error = "Offer not found";
      return res.redirect("/admin/offers");
    }

    offer.isDeleted = true;
    await offer.save();

    req.session.success = "Offer deleted successfully!";
    res.redirect("/admin/offers");
  } catch (error) {
    console.error("Error deleting offer:", error);
    req.session.error = error.message;
    res.redirect("/admin/offers");
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
  getViewOrders,
  updateOrderStatus,
  getProducts,
  getProductDetails,
  getAddProducts,
  postAddProducts,
  getEditProducts,
  postEditProduct,
  unlistProduct,
  deleteProduct,
  getSalesReport,
  exportSalesReport,
  getcustomers,
  blockUser,
  getCategories,
  addCategorie,
  editCategory,
  DeactivateCategory,
  deleteCategory,
  getReturn,
  getReturnDetails,
  returnApprove,
  getOffers,
  createOffer,
  getOfferDetails,
  toggleOfferStatus,
  updateOfferEndDate,
  deleteOffer,
  logOut,
};
