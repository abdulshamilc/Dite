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

import Order from "../../models/ordersModel.js";
import Product from "../../models/productsModels.js";
import Category from "../../models/categories.js";
import Coupon from "../../models/couponModel.js";
import { User } from "../../models/userModels.js";

// Get dashboard
const getDashboard = async (req, res) => {
  try {
    const period = req.query.period || 'all';
    
    // Determine Date Range
    let startDate = new Date(0); // Default to beginning of time
    const currentTimestamp = new Date(); // Instance for current time
    const now = new Date(); // Instance for manipulation if needed (though avoiding mutation is better)
    
    switch (period) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        const firstDayOfWeek = now.getDate() - now.getDay();
        startDate = new Date(now.setDate(firstDayOfWeek));
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        // Placeholder for custom logic
        break;
    }

    // Common Match Stage for Aggregations
    const matchStage = { createdAt: { $gte: startDate } };

    // 1. Overview Stats
    const totalOrders = await Order.countDocuments(matchStage);
    const successfulOrders = await Order.countDocuments({ ...matchStage, orderStatus: 'Delivered' });
    const cancelledOrders = await Order.countDocuments({ ...matchStage, orderStatus: 'Cancelled' });
    const returnedOrders = await Order.countDocuments({ ...matchStage, orderStatus: 'Returned' });

    // 1.5 Sales Performance (Filtered)
    let salesGroupId = {};
    let salesSort = {};
    const timezone = '+05:30'; // IST Timezone
    
    // Define Grouping Logic
    if (period === 'today') {
       // Hourly
       salesGroupId = { 
         hour: { $hour: { date: "$createdAt", timezone: timezone } }
       };
       salesSort = { "_id.hour": 1 };
    } else if (period === 'week') {
       // Daily
       salesGroupId = {
         year: { $year: { date: "$createdAt", timezone: timezone } },
         month: { $month: { date: "$createdAt", timezone: timezone } },
         day: { $dayOfMonth: { date: "$createdAt", timezone: timezone } }
       };
       salesSort = { "_id.year": 1, "_id.month": 1, "_id.day": 1 };
    } else if (period === 'month') {
       // Custom Weekly Buckets (1-7, 8-14, 15-21, 22-End)
       // Note: $dayOfMonth needs timezone to allow correct bucketing
       salesGroupId = {
         year: { $year: { date: "$createdAt", timezone: timezone } },
         weekBucket: {
           $switch: {
             branches: [
               { case: { $lte: [{ $dayOfMonth: { date: "$createdAt", timezone: timezone } }, 7] }, then: 1 },
               { case: { $lte: [{ $dayOfMonth: { date: "$createdAt", timezone: timezone } }, 14] }, then: 2 },
               { case: { $lte: [{ $dayOfMonth: { date: "$createdAt", timezone: timezone } }, 21] }, then: 3 }
             ],
             default: 4
           }
         }
       };
       salesSort = { "_id.year": 1, "_id.weekBucket": 1 };
    } else if (period === 'year') {
       // Monthly
       salesGroupId = {
         year: { $year: { date: "$createdAt", timezone: timezone } },
         month: { $month: { date: "$createdAt", timezone: timezone } }
       };
       salesSort = { "_id.year": 1, "_id.month": 1 };
    } else {
       // All Time -> Yearly
       salesGroupId = {
         year: { $year: { date: "$createdAt", timezone: timezone } }
       };
       salesSort = { "_id.year": 1 };
    }

    const salesPerformance = await Order.aggregate([
      { $match: { 
          createdAt: { $gte: startDate },
          orderStatus: { $ne: 'Cancelled' } // Count all placed orders
      }},
      {
        $group: {
          _id: salesGroupId,
          totalSales: { $sum: "$totalAmount" },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: salesSort }
    ]);

    // Zero-filling Logic
    let finalLabels = [];
    let finalValues = [];

    if (period === 'today') {
       // Fill 0 to current hour
       const currentHour = currentTimestamp.getHours();
       for (let i = 0; i <= currentHour; i++) {
         const hour = i % 12 || 12; // Convert 0 to 12
         const ampm = i < 12 ? 'AM' : 'PM';
         const label = `${hour} ${ampm}`;
         
         const found = salesPerformance.find(item => item._id.hour === i);
         finalLabels.push(label);
         finalValues.push(found ? found.totalSales : 0);
       }
    } else if (period === 'week') {
       // Fill last 7 days including today
       for (let i = 6; i >= 0; i--) {
         const d = new Date(now);
         d.setDate(d.getDate() - i);
         const day = d.getDate();
         const month = d.getMonth() + 1;
         const label = `${day}/${month}`;
         
         const found = salesPerformance.find(item => 
            item._id.day === day && item._id.month === month
         );
         finalLabels.push(label);
         finalValues.push(found ? found.totalSales : 0);
       }
    } else if (period === 'month') {
       // Fill 4 buckets
       const buckets = [
         { id: 1, label: 'Days 1-7' },
         { id: 2, label: 'Days 8-14' },
         { id: 3, label: 'Days 15-21' },
         { id: 4, label: 'Days 22-End' }
       ];
       buckets.forEach(bucket => {
          const found = salesPerformance.find(item => item._id.weekBucket === bucket.id);
          finalLabels.push(bucket.label);
          finalValues.push(found ? found.totalSales : 0);
       });
    } else if (period === 'year') {
       // Fill Jan-Dec
       const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
       for (let i = 0; i < 12; i++) {
         const label = `${monthNames[i]} ${now.getFullYear()}`;
         const found = salesPerformance.find(item => item._id.month === (i + 1));
         finalLabels.push(label);
         finalValues.push(found ? found.totalSales : 0);
       }
    } else {
       // All Time: Fill from start year to current year
       const earliestOrder = await Order.findOne().sort({ createdAt: 1 });
       const startYear = earliestOrder ? earliestOrder.createdAt.getFullYear() : now.getFullYear();
       const currentYear = now.getFullYear();
       
       for (let year = startYear; year <= currentYear; year++) {
          const label = `${year}`;
          const found = salesPerformance.find(item => item._id.year === year);
          finalLabels.push(label);
          finalValues.push(found ? found.totalSales : 0);
       }
    }

    const salesLabels = finalLabels;
    const salesValues = finalValues;


    // 2. Best Selling Products
    const topProducts = await Order.aggregate([
      { $match: { ...matchStage, orderStatus: { $ne: 'Cancelled' } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.productId", totalSold: { $sum: "$items.quantity" }, totalRevenue: { $sum: { $multiply: ["$items.quantity", "$items.discoundedPrice"] } } } },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
      { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $project: { name: "$product.name", totalSold: 1, totalRevenue: 1 } }
    ]);

    // 3. Best Selling Categories
    const topCategories = await Order.aggregate([
      { $match: { ...matchStage, orderStatus: { $ne: 'Cancelled' } } },
      { $unwind: "$items" },
      { $lookup: { from: "products", localField: "items.productId", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $group: { _id: "$product.category", totalSold: { $sum: "$items.quantity" } } },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
      { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "category" } },
      { $unwind: "$category" },
      { $project: { name: "$category.name", totalSold: 1 } }
    ]);

    // 4. Best Selling Brands
    const topBrands = await Order.aggregate([
      { $match: { ...matchStage, orderStatus: { $ne: 'Cancelled' } } },
      { $unwind: "$items" },
      { $lookup: { from: "products", localField: "items.productId", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $group: { _id: "$product.brand", totalSold: { $sum: "$items.quantity" } } },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
      { $project: { name: "$_id", totalSold: 1 } }
    ]);

    // 5. Customer Insights
    const totalCustomers = await User.countDocuments();
    const avgOrdersPerCustomer = totalCustomers > 0 ? (totalOrders / totalCustomers).toFixed(1) : 0;
    
    // Top customers usually based on valid orders
    const topCustomers = await Order.aggregate([
      { $match: { ...matchStage, orderStatus: { $nin: ['Cancelled', 'Returned'] } } },
      { $group: { _id: "$userId", orderCount: { $sum: 1 } } },
      { $sort: { orderCount: -1 } },
      { $limit: 3 },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
      { $unwind: "$user" },
      { $project: { name: "$user.fullName", orderCount: 1, email: "$user.email" } }
    ]);

    // 6. Stock Alerts (Stock is realtime state, date filter usually doesn't apply to "Current Stock", keeping as is)
    const outOfStockDocs = await Product.find({ "variants.stock": 0, isDeleted: false, isListed: true }).limit(5).populate("category");
    const outOfStockProducts = outOfStockDocs.map(doc => {
       const variant = doc.variants.find(v => v.stock === 0);
       return {
         productId: doc._id,
         productName: doc.name,
         variant: variant ? `${variant.mlSize}ml` : 'N/A',
         stock: 0,
         category: doc.category
       };
    });

    const lowStockDocs = await Product.find({ "variants.stock": { $gt: 0, $lte: 5 }, isDeleted: false, isListed: true }).limit(5);
    const lowStockProducts = lowStockDocs.map(doc => {
       const variant = doc.variants.find(v => v.stock > 0 && v.stock <= 5);
       return {
         productId: doc._id,
         productName: doc.name,
         variant: variant ? `${variant.mlSize}ml` : 'N/A',
         stock: variant ? variant.stock : 0
       };
    });
    
    // 7. Payment Insights (Filtered)
    const paymentMethods = await Order.aggregate([
      { $match: { ...matchStage, orderStatus: { $nin: ['Cancelled'] } } }, // Assuming cancelled don't count for payment stats usually, or maybe they do? Let's exclude cancelled for cleaner "Revenue/Transaction" insight
      { $group: { _id: "$paymentMethod", count: { $sum: 1 } } }
    ]);

    // 8. Coupon Performance (Filtered)
    const couponUsage = await Order.aggregate([
      { $match: { ...matchStage, couponCode: { $ne: null }, orderStatus: { $ne: 'Cancelled' } } },
      { $group: { _id: "$couponCode", count: { $sum: 1 }, totalDiscount: { $sum: "$discountAmount" } } },
      { $sort: { count: -1 } }
    ]);
    
    // Fetch coupon details for expiry info
    const coupons = await Coupon.find({ code: { $in: couponUsage.map(c => c._id) } });
    const couponStats = couponUsage.map(usage => {
       const details = coupons.find(c => c.code === usage._id);
       return {
         code: usage._id,
         count: usage.count,
         totalDiscount: usage.totalDiscount,
         expiry: details ? details.endDate : null,
         isActive: details ? details.isActive : false
       };
    });
    
    // Least Selling Products (Optional, reusing top products logic but sort asc)
    const leastSellingProducts = await Order.aggregate([
      { $unwind: "$items" },
      { $group: { _id: "$items.productId", totalSold: { $sum: "$items.quantity" } } },
      { $sort: { totalSold: 1 } },
      { $limit: 5 },
      { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $project: { name: "$product.name", totalSold: 1 } }
    ]);

    res.render("admin/dashboard/dashboard", {
      totalOrders,
      successfulOrders,
      cancelledOrders,
      returnedOrders,
      salesLabels,
      salesValues,
      topProducts,
      topCategories,
      topBrands,
      avgOrdersPerCustomer,
      topCustomers,
      outOfStockProducts,
      lowStockProducts,
      paymentMethods,
      couponStats,
      leastSellingProducts,
      period 
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    res.render("admin/pageNotFound");
  }
};

// Logout
const logOut = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      res.send("Error logging out");
    } else {
      res.redirect("/admin");
    }
  });
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
    logOut
}
