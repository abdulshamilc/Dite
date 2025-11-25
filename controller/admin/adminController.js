import { User } from "../../models/userModels.js";
import { Admin, AdmiResetPassword } from "../../models/adminModels.js";
import Categories from "../../models/categories.js";
import Products from "../../models/productsModels.js";
import Orders from "../../models/ordersModel.js";
import sendMail from "../../services/mailer.js";
import bcrypt from "bcryptjs";
import addCategoryValidation from "../../validators/addCatogoryValidation.js";
import jwt from "jsonwebtoken";
import passwordSchema from "../../validators/resetPasswordValidator.js";
import { nanoid } from "nanoid";
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
};const getAddProducts = async (req, res) => {
  try {
    const categories = await Categories.find({ isDeleted: false }).lean();
    const products = await Products.find({ isDeleted: false }).select('name').lean();
    res.render("admin/addProducts", { categories, products });
  } catch (error) {
    console.error('Error fetching categories and products:', error);
    res.status(500).json({ success: false, error: 'Failed to load page data.' });
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
      return res.status(400).json({ success: false, error: "Product name is required." });
    }

    // Specific validation for product description
    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, error: "Product description is required." });
    }

    // Specific validation for category
    const category = rawCategory ? rawCategory.trim() : '';
    if (!category) {
      return res.status(400).json({ success: false, error: "Category is required." });
    }

    // Specific validation for gender
    if (!gender) {
      return res.status(400).json({ success: false, error: "Gender is required." });
    }

    // Specific validation for concentration
    if (!concentration) {
      return res.status(400).json({ success: false, error: "Concentration is required." });
    }

    // Specific validation for variants existence
    if (!variants) {
      return res.status(400).json({ success: false, error: "Variants are required." });
    }

    // Specific validation for images
    if (imageUrls.length !== 4) {
      return res.status(400).json({ success: false, error: "Exactly 4 images are required." });
    }

    // Parse variants - frontend sends as array of objects
    let parsedVariants = [];
    if (Array.isArray(variants)) {
      parsedVariants = variants
        .map((v, index) => {
          // Check structure first
          if (!v || !v.mlSize || !v.stock || !v.basePrice || !v.discountedPrice) {
            return null;
          }
          return {
            mlSize: toNumber(v.mlSize),
            stock: toNumber(v.stock),
            basePrice: parseFloat(v.basePrice) || 0,
            discountedPrice: parseFloat(v.discountedPrice) || 0,
            index, // Keep original index for error reporting
          };
        })
        .filter(v => v !== null);
    } else if (variants && variants.mlSize && variants.stock && variants.basePrice && variants.discountedPrice) {
      // Fallback for single object
      const singleVariant = {
        mlSize: toNumber(variants.mlSize),
        stock: toNumber(variants.stock),
        basePrice: parseFloat(variants.basePrice) || 0,
        discountedPrice: parseFloat(variants.discountedPrice) || 0,
        index: 0,
      };
      parsedVariants = [singleVariant];
    }

    // Per-variant validation (mirroring frontend field checks)
    let variantErrors = [];
    parsedVariants.forEach((v) => {
      const variantNum = v.index + 1;
      if (v.mlSize <= 0) {
        variantErrors.push(`Variant ${variantNum} size must be greater than 0.`);
      }
      if (v.stock < 1) {
        variantErrors.push(`Variant ${variantNum} stock must be at least 1.`);
      }
      if (v.basePrice <= 1) {
        variantErrors.push(`Variant ${variantNum} base price must be greater than 1.`);
      }
      if (v.discountedPrice < 0) {
        variantErrors.push(`Variant ${variantNum} discounted price must be at least 0.`);
      }
      if (v.discountedPrice > v.basePrice) {
        variantErrors.push(`Variant ${variantNum} discounted price must be less than or equal to base price.`);
      }
    });

    if (variantErrors.length > 0) {
      return res.status(400).json({ success: false, error: variantErrors.join(' ') });
    }

    if (parsedVariants.length === 0) {
      return res.status(400).json({ success: false, error: "At least one valid variant is required." });
    }

    // Description word count validation
    const wordCountDesc = description.trim().split(/\s+/).length;
    if (wordCountDesc < 10 || wordCountDesc > 150) {
      return res.status(400).json({ success: false, error: "Description must be between 10 and 150 words." });
    }

    // Notes word count validation
    const wordCountNotes = notes ? notes.trim().split(/\s+/).length : 0;
    if (wordCountNotes > 150 || (wordCountNotes > 0 && wordCountNotes < 5)) {
      return res.status(400).json({ success: false, error: "Notes must be either empty or at least 5 words, and no more than 150 words." });
    }

    // Brand validation
    if (brand && !/^[A-Z\s]+$/.test(brand.trim())) {
      return res.status(400).json({ success: false, error: "Brand name must be uppercase letters only." });
    }

    // Check duplicate name (case-insensitive, only non-deleted products)
    const existingProduct = await Products.findOne({ 
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      isDeleted: false 
    });
    if (existingProduct) {
      return res.status(400).json({ success: false, error: "Product name already exists. Please choose a unique name." });
    }

    const newProduct = new Products({
      name: name.trim(),
      description: description.trim(),
      notes: notes ? notes.trim() : '',
      brand: brand ? brand.trim() : '',
      category, // Single string (ObjectId)
      gender,
      concentration,
      images: imageUrls,
      variants: parsedVariants.map(v => ({ // Strip index for save
        mlSize: v.mlSize,
        stock: v.stock,
        basePrice: v.basePrice,
        discountedPrice: v.discountedPrice,
      })),
    });
    await newProduct.save();

    // Update category with product reference (single category)
    if (category) {
      await Categories.findByIdAndUpdate(
        category,
        { $push: { products: newProduct._id } }
      );
    }

    res.json({ success: true, message: "New Product Has Been Added Successfully" });
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ success: false, error: "Something went wrong while adding the product. Please try again." });
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
    const products = await Products.find({ isDeleted: false }).select('name _id').lean();
    res.render("admin/editProducts", { categories, product, products });
  } catch (err) {
    console.error(err);
    req.session.errorMessage = "Something Went Wrong";
    res.redirect("/admin/products");
  }
};const postEditProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const oldProduct = await Products.findById(productId);
    if (!oldProduct) {
      return res.status(404).json({ success: false, error: 'Product not found' });
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
    const existingImages = Array.isArray(req.body.existingImages) ? req.body.existingImages : [];

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
    if (updatedImages.length !== 4 || updatedImages.some(img => !img)) {
      return res.status(400).json({ success: false, error: "Exactly 4 valid images are required." });
    }

    // Validate required fields (final values)
    const finalName = name ? name.trim() : oldProduct.name;
    if (!finalName) {
      return res.status(400).json({ success: false, error: "Product name is required." });
    }

    const finalDescription = description ? description.trim() : oldProduct.description;
    if (!finalDescription) {
      return res.status(400).json({ success: false, error: "Product description is required." });
    }

    const finalCategory = rawCategory ? rawCategory.trim() : oldProduct.category;
    if (!finalCategory) {
      return res.status(400).json({ success: false, error: "Category is required." });
    }

    const finalGender = gender || oldProduct.gender;
    if (!finalGender) {
      return res.status(400).json({ success: false, error: "Gender is required." });
    }

    const finalConcentration = concentration || oldProduct.concentration;
    if (!finalConcentration) {
      return res.status(400).json({ success: false, error: "Concentration is required." });
    }

    // Parse variants if provided, else keep old
    let parsedVariants = [...oldProduct.variants];
    if (rawVariants) {
      if (Array.isArray(rawVariants)) {
        parsedVariants = rawVariants
          .map((v, index) => {
            if (!v || !v.mlSize || !v.stock || !v.basePrice || !v.discountedPrice) {
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
          .filter(v => v !== null);
      } else if (rawVariants && rawVariants.mlSize && rawVariants.stock && rawVariants.basePrice && rawVariants.discountedPrice) {
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
        variantErrors.push(`Variant ${variantNum} size must be greater than 0.`);
      }
      if (v.stock < 1) {
        variantErrors.push(`Variant ${variantNum} stock must be at least 1.`);
      }
      if (v.basePrice <= 1) {
        variantErrors.push(`Variant ${variantNum} base price must be greater than 1.`);
      }
      if (v.discountedPrice < 0) {
        variantErrors.push(`Variant ${variantNum} discounted price must be at least 0.`);
      }
      if (v.discountedPrice > v.basePrice) {
        variantErrors.push(`Variant ${variantNum} discounted price must be less than or equal to base price.`);
      }
    });

    if (variantErrors.length > 0) {
      return res.status(400).json({ success: false, error: variantErrors.join(' ') });
    }

    if (parsedVariants.length === 0) {
      return res.status(400).json({ success: false, error: "At least one valid variant is required." });
    }

    // Description word count
    const wordCountDesc = finalDescription.split(/\s+/).length;
    if (wordCountDesc < 10 || wordCountDesc > 150) {
      return res.status(400).json({ success: false, error: "Description must be between 10 and 150 words." });
    }

    // Notes word count
    const finalNotes = notes ? notes.trim() : oldProduct.notes;
    const wordCountNotes = finalNotes.split(/\s+/).length;
    if (wordCountNotes > 150 || (wordCountNotes > 0 && wordCountNotes < 5)) {
      return res.status(400).json({ success: false, error: "Notes must be either empty or at least 5 words, and no more than 150 words." });
    }

    // Brand validation
    const finalBrand = brand ? brand.trim() : oldProduct.brand;
    if (finalBrand && !/^[A-Z\s]+$/.test(finalBrand)) {
      return res.status(400).json({ success: false, error: "Brand name must be uppercase letters only." });
    }

    // Check duplicate name (exclude current product)
    if (finalName.toLowerCase() !== oldProduct.name.toLowerCase()) {
      const existingProduct = await Products.findOne({ 
        name: { $regex: new RegExp(`^${finalName}$`, 'i') },
        _id: { $ne: productId },
        isDeleted: false 
      });
      if (existingProduct) {
        return res.status(400).json({ success: false, error: "Product name already exists. Please choose a unique name." });
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
    oldProduct.variants = parsedVariants.map(v => ({ // Strip index
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
      await Categories.findByIdAndUpdate(
        oldCategory,
        { $pull: { products: productId } }
      );
      // Add to new category
      await Categories.findByIdAndUpdate(
        finalCategory,
        { $push: { products: productId } }
      );
    }

    res.json({ success: true, message: 'Product Has Been Edited' });
  } catch (err) {
    console.error('Error editing product:', err);
    res.status(500).json({ success: false, error: 'Something went wrong while editing the product. Please try again.' });
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
    const order = await Orders.findById(orderId).populate('userId', 'name email phone');
    if (!order) {
      req.session.error = 'Order not found';
      return res.redirect('/admin/returns');
    }

    const user = order.userId;
    const returnItem = order.returndProduct[0];
    if (!returnItem) {
      req.session.error = 'Return not found';
      return res.redirect('/admin/returns');
    }

    // Add missing fields virtually
    const enhancedReturnItem = {
      ...returnItem.toObject(),
      returnId: nanoid(6),
      images: [],
      rejectReason: returnItem.adminApproved === 'Rejected' ? 'No reason provided' : '',
      approvedAt: returnItem.adminApproved === 'Approved' ? new Date() : null,
      rejectedAt: returnItem.adminApproved === 'Rejected' ? new Date() : null,
      processingAt: returnItem.adminApproved === 'Processing' ? new Date() : null,
      completedAt: returnItem.adminApproved === 'Completed' ? new Date() : null,
      returndQuantity: returnItem.returndQuantity || 1,
    };

    const successMessage = req.session.success;
    const errorMessage = req.session.error;

    delete req.session.success;
    delete req.session.error;

    res.render('admin/returnDetails', {
      order,
      returnItem: enhancedReturnItem,
      user,
      successMessage,
      errorMessage,
    });
  } catch (error) {
    console.error(error);
    req.session.error = 'Failed to fetch return details';
    res.redirect('/admin/returns');
  }
}

const returnApprove = async (req, res) => {
  const { orderId } = req.params;
  try {
    const order = await Orders.findById(orderId);
    if (!order) {
      req.session.error = 'Order not found';
      return res.redirect(`/admin/return/${orderId}`);
    }

    const returnItem = order.returndProduct[0];
    if (!returnItem || returnItem.adminApproved !== 'Requested') {
      req.session.error = 'Invalid return or already processed';
      return res.redirect(`/admin/return/${orderId}`);
    }

    // Update return status
    returnItem.adminApproved = 'Approved';

    // Update order status to Returned
    order.orderStatus = 'Returned';

    // Update original item status to Returned and reduce quantity
    const originalItem = order.items.find(item => 
      item.productId.toString() === returnItem.productId.toString() && 
      item.mlSize === returnItem.mlSize
    );
    if (originalItem) {
      originalItem.productStatus = 'Returned';
      originalItem.quantity -= returnItem.returndQuantity;
    }

    // Add tracking entry for return approval
    order.tracking.push({
      status: 'Return Approved',
      date: new Date(),
      message: 'Return approved by admin and stock updated'
    });

    // Increase stock in specific variant
    await Products.findOneAndUpdate(
      { 
        _id: returnItem.productId, 
        'variants.mlSize': returnItem.mlSize 
      },
      { 
        $inc: { 'variants.$.stock': returnItem.returndQuantity } 
      }
    );

    await order.save();

    req.session.success = 'Return approved, order status updated, and stock restored successfully';
    res.redirect(`/admin/return/${orderId}`);
  } catch (error) {
    console.error(error);
    req.session.error = 'Failed to approve return';
    res.redirect(`/admin/return/${orderId}`);
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
  getReturn,
  getReturnDetails,
  returnApprove,
  logOut,
};
