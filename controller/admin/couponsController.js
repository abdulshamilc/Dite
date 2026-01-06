import Coupon from "../../models/couponModel.js";
import Orders from "../../models/ordersModel.js";
import mongoose from "mongoose";

const getCoupons = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Fetch paginated coupons (filter non-deleted, show all statuses)
    const coupons = await Coupon.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCoupons = await Coupon.countDocuments({ isDeleted: false });
    const activeCouponsCount = await Coupon.countDocuments({
      isActive: true,
      isDeleted: false,
    });
    const inactiveCouponsCount = await Coupon.countDocuments({
      isActive: false,
      isDeleted: false,
    });

    // Total discount sum (simple sum, even for percentage; filter non-deleted)
    const totalDiscountAggregation = await Coupon.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: null, totalDiscount: { $sum: "$discountValue" } } },
    ]);
    const totalDiscountCount =
      totalDiscountAggregation.length > 0
        ? totalDiscountAggregation[0]
        : { totalDiscount: 0 }; // Default to 0 if no coupons

    // Total pages
    const totalPages = Math.ceil(totalCoupons / limit);

    // Get session messages
    const errorMessage = req.session.error;
    const successMessage = req.session.success;

    // Clear session messages
    delete req.session.error;
    delete req.session.success;

    res.render("admin/coupons/coupon", {
      coupons,
      totalCoupons,
      activeCouponsCount,
      inactiveCouponsCount,
      totalDiscountCount,
      currentPage: page,
      totalPages,
      limit,
      errorMessage,
      successMessage,
    });
  } catch (error) {
    console.error("Error fetching coupons:", error);
    req.session.error = "Error loading coupons";
    res.redirect("/admin/coupons");
  }
};

const generateRandomCode = (name) => {
  const upperName = name.trim().toUpperCase();
  let prefix = upperName.substring(0, Math.min(4, upperName.length));
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const all = letters + numbers;

  // Generate remaining characters to make total 8
  const remainingLength = 8 - prefix.length;
  let randomPart = "";
  for (let i = 0; i < remainingLength; i++) {
    randomPart += all[Math.floor(Math.random() * all.length)];
  }

  // Combine and shuffle
  let code = prefix + randomPart;
  return code
    .split("")
    .sort(() => 0.5 - Math.random())
    .join("");
};

const createCoupon = async (req, res) => {
  try {
    const {
      name,
      description,
      code: providedCode,
      codeType,
      discountType,
      discountValue,
      minCartValue,
      maxDiscountAmount,
      usageLimit,
      startDate,
      endDate,
    } = req.body;

    // Basic validation
    if (!name?.trim()) {
      req.session.error = "Coupon name is required.";
      return res.redirect("/admin/coupons");
    }

    if (description?.trim().length > 1000) {
      req.session.error = "Description must be less than 1000 characters.";
      return res.redirect("/admin/coupons");
    }

    if (!codeType || !["auto", "custom"].includes(codeType)) {
      req.session.error = "Valid code type is required.";
      return res.redirect("/admin/coupons");
    }

    if (!discountType || !["flat", "percentage"].includes(discountType)) {
      req.session.error = "Valid discount type is required.";
      return res.redirect("/admin/coupons");
    }

    const discountNum = parseFloat(discountValue);
    if (isNaN(discountNum) || discountNum <= 0) {
      req.session.error = "Discount value must be greater than 0.";
      return res.redirect("/admin/coupons");
    }

    if (discountType === "percentage" && discountNum > 100) {
      req.session.error = "Percentage discount cannot exceed 100%.";
      return res.redirect("/admin/coupons");
    }

    const minCartNum = parseInt(minCartValue) || 0;
    if (minCartNum < 0) {
      req.session.error = "Min cart value must be 0 or greater.";
      return res.redirect("/admin/coupons");
    }

    let maxDiscountNum;
    if (discountType === "percentage") {
      maxDiscountNum = parseInt(maxDiscountAmount) || 0;
      if (maxDiscountNum < 0) {
        req.session.error = "Max discount amount must be 0 or greater.";
        return res.redirect("/admin/coupons");
      }
    }

    const usageNum = parseInt(usageLimit);
    if (isNaN(usageNum) || usageNum < 1) {
      req.session.error = "Usage limit must be 1 or greater.";
      return res.redirect("/admin/coupons");
    }

    if (!startDate || !endDate) {
      req.session.error = "Start and end dates are required.";
      return res.redirect("/admin/coupons");
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) {
      req.session.error = "End date must be after start date.";
      return res.redirect("/admin/coupons");
    }

    // Handle code
    let finalCode;
    const tempProvidedCode = providedCode?.trim().toUpperCase();

    if (codeType === "custom") {
      if (!tempProvidedCode) {
        req.session.error = "Custom code is required.";
        return res.redirect("/admin/coupons");
      }
      if (tempProvidedCode.length < 4 || tempProvidedCode.length > 20) {
        req.session.error = "Custom code must be 4-20 characters.";
        return res.redirect("/admin/coupons");
      }
      if (!/^[A-Z0-9]+$/.test(tempProvidedCode)) {
        req.session.error =
          "Custom code must be uppercase letters and numbers only.";
        return res.redirect("/admin/coupons");
      }
      finalCode = tempProvidedCode;
    } else {
      // auto
      finalCode = generateRandomCode(name);
    }

    // Check uniqueness
    let existing = await Coupon.findOne({ code: finalCode });
    if (existing) {
      if (codeType === "custom") {
        req.session.error =
          "Coupon code already exists. Please choose another.";
        return res.redirect("/admin/coupons");
      } else {
        // Retry for auto
        let attempts = 0;
        while (attempts < 5) {
          finalCode = generateRandomCode(name);
          existing = await Coupon.findOne({ code: finalCode });
          if (!existing) break;
          attempts++;
        }
        if (attempts >= 5) {
          req.session.error =
            "Failed to generate unique code after several attempts.";
          return res.redirect("/admin/coupons");
        }
      }
    }

    const newCouponData = {
      name: name.trim(),
      description: description?.trim() || "",
      code: finalCode,
      discountType,
      discountValue: discountNum,
      minCartValue: minCartNum,
      usageLimit: usageNum,
      startDate: start,
      endDate: end,
      isActive: true,
    };

    if (discountType === "percentage") {
      newCouponData.maxDiscountAmount = maxDiscountNum;
    }

    const newCoupon = new Coupon(newCouponData);

    await newCoupon.save();

    req.session.success = "Coupon created successfully!";
    res.redirect("/admin/coupons");
  } catch (error) {
    console.error("Error creating coupon:", error);
    req.session.error = "Error creating coupon: " + error.message;
    res.redirect("/admin/coupons");
  }
};
const getCouponDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch coupon by ID, exclude deleted
    const coupon = await Coupon.findOne({ _id: id, isDeleted: false }).lean();

    if (!coupon) {
      req.session.error = "Coupon not found.";
      return res.redirect("/admin/coupons");
    }

    // Fetch users who used this coupon (via Orders)
    const ordersWithCoupon = await Orders.find({ couponCode: coupon.code })
      .populate("userId", "name email")
      .select("userId totalAmount placedAt orderID")
      .lean();

    const usedByUsers = ordersWithCoupon.map((order) => ({
      user: order.userId,
      orderID: order.orderID,
      date: order.placedAt,
      amount: order.totalAmount,
    }));

    const usedCount = usedByUsers.length;
    
    const remainingUses = coupon.usageLimit;

    // Get session messages
    const error = req.session.error;
    const success = req.session.success;

    // Clear session messages
    delete req.session.error;
    delete req.session.success;

    res.render("admin/coupons/couponDetails", {
      coupon,
      usedByUsers,
      usedCount,
      remainingUses,
      error,
      success,
    });
  } catch (error) {
    console.error("Error fetching coupon details:", error);
    req.session.error = "Error loading coupon details.";
    res.redirect("/admin/coupons");
  }
};

const toggleCouponStatus = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.session.error = "Invalid coupon ID";
      return res.redirect("/admin/coupons");
    }

    const coupon = await Coupon.findOne({
      _id: req.params.id,
      isDeleted: false,
    });

    if (!coupon) {
      req.session.error = "Coupon not found";
      return res.redirect("/admin/coupons");
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    req.session.success = coupon.isActive
      ? "Coupon activated successfully!"
      : "Coupon deactivated successfully!";
    res.redirect(`/admin/coupons/${req.params.id}`);
  } catch (error) {
    console.error("Error toggling coupon status:", error);
    req.session.error = error.message;
    res.redirect("/admin/coupons");
  }
};

const updateCouponEndDate = async (req, res) => {
  try {
    const { id } = req.params;
    const { endDate } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.session.error = "Invalid coupon ID";
      return res.redirect("/admin/coupons");
    }

    if (!endDate) {
      req.session.error = "End date is required";
      return res.redirect(`/admin/coupons/${id}`);
    }

    const coupon = await Coupon.findOne({ _id: id, isDeleted: false });

    if (!coupon) {
      req.session.error = "Coupon not found";
      return res.redirect("/admin/coupons");
    }

    const newEnd = new Date(endDate);
    if (newEnd <= coupon.startDate) {
      req.session.error = "End date must be after start date";
      return res.redirect(`/admin/coupons/${id}`);
    }

    coupon.endDate = newEnd;
    await coupon.save();

    res.redirect(`/admin/coupons/${id}`);
  } catch (error) {
    console.error("Error updating coupon end date:", error);
    req.session.error = error.message;
    res.redirect("/admin/coupons");
  }
};

const getEditCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.session.error = "Invalid coupon ID";
      return res.redirect("/admin/coupons");
    }

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      req.session.error = "Coupon not found";
      return res.redirect("/admin/coupons");
    }

    res.render("admin/coupons/editCoupons", {
      // Using the filename we created
      coupon,
    });
  } catch (error) {
    console.error("Error fetching coupon for edit:", error);
    req.session.error = "Failed to load coupon for editing";
    res.redirect("/admin/coupons");
  }
};

const postEditCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.session.error = "Invalid coupon ID";
      return res.redirect("/admin/coupons");
    }

    const {
      name,
      description,
      discountType,
      discountValue,
      minCartValue,
      maxDiscountAmount,
      usageLimit,
      startDate,
      endDate,
    } = req.body;

    // Validation
    if (
      !name?.trim() ||
      !discountType ||
      !discountValue ||
      !usageLimit ||
      !startDate ||
      !endDate
    ) {
      req.session.error = "All required fields must be filled.";
      return res.redirect(`/admin/coupons/edit/${id}`);
    }

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      req.session.error = "Coupon not found";
      return res.redirect("/admin/coupons");
    }

    coupon.name = name.trim();
    coupon.description = description?.trim();
    coupon.discountType = discountType;
    coupon.discountValue = parseFloat(discountValue);
    coupon.minCartValue = parseInt(minCartValue) || 0;
    coupon.maxDiscountAmount = parseInt(maxDiscountAmount) || 0;
    coupon.usageLimit = parseInt(usageLimit);
    coupon.startDate = new Date(startDate);
    coupon.endDate = new Date(endDate);

    // Code type and actual Code are generally not editable to maintain integrity,
    // unless requirement specified. User only asked to "edit coupen like add coupen".

    await coupon.save();

    req.session.success = "Coupon updated successfully";
    res.redirect("/admin/coupons");
  } catch (error) {
    console.error("Error updating coupon:", error);
    req.session.error = "Failed to update coupon";
    res.redirect("/admin/coupons");
  }
};

const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.session.error = "Invalid coupon ID";
      return res.redirect("/admin/coupons");
    }

    const coupon = await Coupon.findOne({ _id: id, isDeleted: false });

    if (!coupon) {
      req.session.error = "Coupon not found";
      return res.redirect("/admin/coupons");
    }

    coupon.isDeleted = true;
    await coupon.save();

    req.session.success = "Coupon deleted successfully!";
    res.redirect("/admin/coupons");
  } catch (error) {
    console.error("Error deleting coupon:", error);
    req.session.error = error.message;
    res.redirect("/admin/coupons");
  }
};

export {
    getCoupons,
    createCoupon,
    getCouponDetails,
    toggleCouponStatus,
    updateCouponEndDate,
    getEditCoupon,
    postEditCoupon,
    deleteCoupon
}
