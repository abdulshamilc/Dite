import { User, UserOtpVerification } from "../../models/userModels.js";
import { Address } from "../../models/addressModel.js";
import Order from "../../models/ordersModel.js";
import UserLog from "../../models/userLogModel.js";
import Product from '../../models/productsModels.js' ;
import { generateOTP } from "../../utils/genarateOtp.js";
import generateInvoice from "../../services/OrderPdfGenarator.js";
import Wallet from "../../models/walletModel.js";
import mongoose from "mongoose";
import Review from "../../models/reviewModel.js";
import Notification from "../../models/notificationModel.js";
import { SUCCESS_MESSAGES, ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";

// Get profile
const getProfile = async (req, res) => {
  try {
    const email = req.session.user;

    if (!email) {
      return res.redirect("/profile/login");
    }
    const user = await User.findOne({ email: email });
    res.render("user/profile/profile/profile", {
      user,
      currentPath: req.path,
      success: req.session.success || null,
      error: req.session.error || null,
    });

    // Delete the Error Mesage After Rendering
    delete req.session.success;
    delete req.session.error;
  } catch (error) {
    console.error(error);
  }
};

// Post profile
// Post profile
const postProfile = async (req, res) => {
  try {
    const { name, gender, email, phone } = req.body;

    const user = await User.findOne({ email: req.session.user });

    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: ERROR_MESSAGES.USER_NOT_FOUND });
    }
    
    let imageUrl = user.image; // keep existing one
    if (req.file) {
      imageUrl = req.file.secure_url || req.file.url;
    }
    
    // Phone Validation - required, Indian phone number format
    if (!phone || phone.trim() === '') {
      return res.json({ success: false, message: "Phone number is required" });
    }
    // Indian phone number: optional +91/91/0 prefix, starts with 6-9, followed by 9 digits
    const indianPhoneRegex = /^(?:\+91|91|0)?[6-9]\d{9}$/;
    if (!indianPhoneRegex.test(phone)) {
      return res.json({ success: false, message: "Please enter a valid Indian phone number" });
    }

    const isChanged =
      user.name != name ||
      user.gender != gender ||
      user.phone != phone ||
      user.image != imageUrl;

    if (isChanged) {
      // Update fields
      user.name = name;
      user.gender = gender;
      user.phone = phone || "";
      user.image = imageUrl;

      await user.save();
      return res.json({ success: true, message: SUCCESS_MESSAGES.PROFILE_UPDATED });
    } 
    
    return res.json({ success: true, message: "No changes made" });

  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: ERROR_MESSAGES.INTERNAL_ERROR });
  }
};

// Change email
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
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ success: false, message: ERROR_MESSAGES.EMAIL_REQUIRED });
    await generateOTP(
      email,
      "Verify Your Email Change",
      "Your OTP code for changing email is:",
      action
    );

    return res.status(HTTP_STATUS.OK).json({
      message: SUCCESS_MESSAGES.OTP_SENT,
      success: true,
    });
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: ERROR_MESSAGES.OTP_SEND_ERROR,
      success: false,
    });
  }
};

// Verify change email
const verifyChangeEmail = async (req, res) => {
  try {
    if (!req.session.user) return res.redirect("/login");

    const user = await User.findOne({ email: req.session.user });

    if (!user) return res.redirect("/login");

    const { otp, email, type } = req.body;

    const isUsedEmail = await User.findOne({
      email: email,
      _id: { $ne: user._id },
    });

    if (isUsedEmail)
      return res.json({
        success: false,
        redirect: "/profile",
        message: ERROR_MESSAGES.EMAIL_ALREADY_EXISTS,
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
        message: ERROR_MESSAGES.OTP_INVALID_EXPIRED,
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
        message: SUCCESS_MESSAGES.EMAIL_VERIFIED_CURRENT,
      });
    } else if (type === "new") {
      user.email = email;
      await user.save();
      req.session.user = email;
      res.json({
        success: true,
        message: SUCCESS_MESSAGES.EMAIL_VERIFIED_NEW,
      });
    } else {
      res.json({ success: false, message: "Invalid verification type." });
    }
  } catch (err) {
    console.error(err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: ERROR_MESSAGES.INTERNAL_ERROR });
  }
};

// Get address
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
      error: req.session.error || null,
    };

    // Clear session messages after passing them
    delete req.session.success;
    delete req.session.error;

    res.render("user/profile/address/address", {
      address,
      messages: messages,
      currentPath: req.path,
      user,
    });
  } catch (error) {
    console.error(error);
  }
};

// Post add address
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

    if (
      !fullName ||
      !hoNo ||
      !street ||
      !city ||
      !pin ||
      !state ||
      !country ||
      !phone
    ) {
      req.session.error = ERROR_MESSAGES.REQUIRED_FIELDS_MISSING;
      return res.redirect("/address");
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

    req.session.success = SUCCESS_MESSAGES.ADDRESS_ADDED;
    res.redirect("/address");
  } catch (error) {
    console.error(error);
    req.session.error = ERROR_MESSAGES.ADDRESS_ADD_ERROR;
    res.redirect("/address");
  }
};

// Post edit address
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
    if (!address) return res.status(HTTP_STATUS.NOT_FOUND).send(ERROR_MESSAGES.ADDRESS_NOT_FOUND);

    if (
      !fullName ||
      !hoNo ||
      !street ||
      !city ||
      !pin ||
      !state ||
      !country ||
      !phone
    ) {
      req.session.error = ERROR_MESSAGES.REQUIRED_FIELDS_MISSING;
      return res.redirect("/address");
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
    console.error(error);
  }
};

// Post set default address
const postSetDefaultAddress = async (req, res) => {
  try {
    const addressId = req.body.addressId;

    const address = await Address.findOne({ _id: addressId });
    if (!address) return res.status(HTTP_STATUS.NOT_FOUND).send(ERROR_MESSAGES.ADDRESS_NOT_FOUND);

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
// Post delete address
const postDeleteAddress = async (req, res) => {
  try {
    const addressId = req.params.id;

    const address = await Address.findOne({ _id: addressId });
    if (!address) return res.status(HTTP_STATUS.NOT_FOUND).send(ERROR_MESSAGES.ADDRESS_NOT_FOUND);

    address.isDeleted = true;
    await address.save();
    res.redirect("/address");
  } catch (error) {
    console.error(error);
  }
};
// Get orders
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

    // Pagination & Filtering
    let page = parseInt(req.query.page) || 1;
    if (page < 1) page = 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    
    const search = req.query.search || "";
    const sort = req.query.sort || "date_desc";

    // Build Query
    const query = { userId: user._id };
    
    if (search) {
      query.$or = [
        { orderID: { $regex: search, $options: "i" } },
        // Also allow searching by the Mongo _id if user types it
        ...(mongoose.Types.ObjectId.isValid(search) ? [{ _id: search }] : [])
      ];
    }

    // Build Sort
    let sortOptions = { placedAt: -1 }; // Default
    if (sort === "date_asc") sortOptions = { placedAt: 1 };
    else if (sort === "amount_desc") sortOptions = { totalAmount: -1 };
    else if (sort === "amount_asc") sortOptions = { totalAmount: 1 };

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);

    // Ensure page doesn't exceed total pages
    if (page > totalPages && totalPages > 0) page = totalPages;

    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }

    const orders = await Order.find(query)
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.render("user/profile/orders/orders", {
      orders: orders || [],
      totalPages,
      currentPage: page,
      pages,
      search,
      sort,
    });
  } catch (error) {
    console.error("Error fetching order history:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};
// Get order details
const getOrderDetails = async (req, res) => {
  const orderId = req.params.id;
  if (!orderId) return res.redirect("/login");

  const user = await User.findOne({ email: req.session.user });
  if (!user) return res.redirect("/login");

  const order = await Order.findById(orderId);
  if (!order) return res.redirect("/orders");

  // Calculate subtotal using ONLY active items with paidUnitPrice
  const subTotal = order.items.reduce((acc, item) => {
    const qty = item.activeQty !== undefined ? item.activeQty : item.quantity;
    if (qty <= 0) return acc; // Skip fully canceled/returned items
    
    const price = item.paidUnitPrice !== undefined ? item.paidUnitPrice : item.discountedPrice;
    return acc + (price * qty);
  }, 0);

  // Calculate base price total (before offers/coupons) for active items only
  const basePriceTotal = order.items.reduce((acc, item) => {
    const qty = item.activeQty !== undefined ? item.activeQty : item.quantity;
    if (qty <= 0) return acc;
    return acc + (item.basePrice * qty);
  }, 0);

  // Total discount is the difference between base price and what was actually paid
  const discount = basePriceTotal - subTotal;

  // Current total amount
  const totalAmount = subTotal + (order.deliveryCharge || 0);

  const hasActiveItems = order.items.some(item => {
    const qty = item.activeQty !== undefined ? item.activeQty : item.quantity;
    return qty > 0;
  });

  const reviews = await Review.find({ orderId: orderId, userId: user._id }).lean();

  res.render("user/profile/orders/orderDetails", {
    order,
    subTotal,
    discount,
    totalAmount,
    hasActiveItems,
    reviews,
  });
};

// Get cancel order
const getCancelOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userEmail = req.session.user;

    if (!userEmail) return res.redirect("/login");

    const order = await Order.findOne({ _id: orderId });
    if (!order) {
      req.session.error = ERROR_MESSAGES.ORDER_NOT_FOUND;
      return res.redirect("/orders");
    }

    const cancelledItems = req.session.cancelledItems || [];
    let cancelSubtotal = 0;
    cancelledItems.forEach((itemCancel) => {
      const item = itemCancel.item;
      const cancelQty = itemCancel.cancelQty;

      // Fix: Subtract coupon

      // Use paidUnitPrice if available (new system), otherwise fallback to legacy calculation
      const netPerUnit = item.paidUnitPrice !== undefined ? item.paidUnitPrice : Math.max(0, (item.discountedPrice || 0) - (item.couponDiscount || 0));
      
      const itemTotal = netPerUnit * cancelQty;
      cancelSubtotal += itemTotal;
    });

    res.render("user/profile/orders/cancelOrder", {
      order,
      cancelledItems,
      cancelSubtotal,
    });
  } catch (err) {
    console.error("Error loading cancel confirmation page:", err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Post cancel order
const postCancelOrder = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) return res.redirect("/login");

    const orderId = req.params.id;
    if (!orderId) return res.redirect("/orders");

    const { cancelledItems: cancelledItemsStr } = req.body;

    if (!cancelledItemsStr) {
      return res.redirect(`/order/${orderId}`);
    }

    const parsedCancelledItems = JSON.parse(cancelledItemsStr);

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).redirect(`/order/${orderId}`);
    }

    const fullCancelledItems = parsedCancelledItems
      .map((pi) => {
        const item = order.items.find(
          (i) => i._id.toString() === pi.productId && i.mlSize === pi.mlSize
        );
        return item ? { item, cancelQty: pi.cancelQty } : null;
      })
      .filter(Boolean);

    if (fullCancelledItems.length === 0) {
      return res.redirect(`/order/${orderId}`);
    }

    // Save enriched items to session
    req.session.cancelledItems = fullCancelledItems;
    req.session.orderId = orderId;

    res.redirect(`/cancelOrder/${orderId}`);
  } catch (error) {
    console.error("Cancel select error:", error);
    res.status(500).redirect(`/order/${req.params.id}`);
  }
};
// Confirm cancel
const confirmCancel = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) return res.redirect('/login');
    const user = await User.findOne({ email: userEmail });
    if (!user) return res.redirect('/login');
    const orderId = req.params.id;
    if (!orderId) return res.redirect('/orders');
    const order = await Order.findById(orderId);
    if (!order) return res.redirect('/orders');

    // Security: Ensure user owns the order
    if (order.userId.toString() !== user._id.toString()) {
      return res.redirect('/orders');
    }

    const { cancelledItems: cancelledItemsStr, cancellationReason, confirm } = req.body;

    if (!cancelledItemsStr) {
      return res.redirect(`/cancelOrder/${orderId}/cancel-select`);
    }

    let parsedCancelledItems;
    try {
      parsedCancelledItems = JSON.parse(cancelledItemsStr);
    } catch (e) {
      return res.redirect(`/cancelOrder/${orderId}/cancel-select`);
    }

    const fullCancelledItems = parsedCancelledItems
      .map((pi) => {
        const item = order.items.find(
          (i) => i._id.toString() === (pi.item?._id || pi.productId)?.toString()
        );
        if (!item) return null;
        const cancelQty = parseInt(pi.cancelQty);
        if (cancelQty < 1) return null;
        
        // Determine active quantity to cancel from
        // If system migrated, use activeQty, else fallback to quantity
        const currentEffectiveQty = (item.activeQty !== undefined ? item.activeQty : item.quantity);
        
        if (cancelQty > currentEffectiveQty) return null;
        return { item, cancelQty };
      })
      .filter(Boolean);

    if (fullCancelledItems.length === 0) {
      return res.redirect(`/cancelOrder/${orderId}/cancel-select`);
    }

    // ---- Coupon Minimum Cart Value Enforcement ---- 
const couponMin = order.couponMinCartValue || 0;
if (couponMin > 0) {
  // Calculate remaining subtotal after applying the requested cancellations
  let remainingSubTotal = 0;
  order.items.forEach(item => {
    const currentQty = item.activeQty !== undefined ? item.activeQty : item.quantity;
    const cancelled = fullCancelledItems.find(c => c.item._id.toString() === item._id.toString());
    const cancelQty = cancelled ? cancelled.cancelQty : 0;
    const newQty = Math.max(0, currentQty - cancelQty);
    if (newQty > 0) {
      const pricePerUnit = item.paidUnitPrice !== undefined ? item.paidUnitPrice : (item.discountedPrice || 0);
      remainingSubTotal += pricePerUnit * newQty;
    }
  });

  const totalActiveItems = order.items.reduce((acc, i) => {
    const qty = i.activeQty !== undefined ? i.activeQty : i.quantity;
    return acc + qty;
  }, 0);

  const totalCancelQty = fullCancelledItems.reduce((acc, c) => acc + c.cancelQty, 0);
  const isFullCancel = totalCancelQty >= totalActiveItems;

  if (remainingSubTotal < couponMin && !isFullCancel) {
    return res.status(400).json({
      ok: false,
      message: `Cancelling the selected item(s) would reduce the order subtotal below the coupon's minimum cart value of ₹${couponMin}. Please cancel the entire order instead.`
    });
  }
}
// Confirmation step
    if (confirm === "true") {
      let cancelSubtotal = 0;

      fullCancelledItems.forEach(({ item, cancelQty }) => {
        // Use paidUnitPrice if available (new system), else legacy fallback
        let refundUnitPrice = 0;
        
        if (item.paidUnitPrice !== undefined) {
             refundUnitPrice = item.paidUnitPrice;
        } else {
             // Legacy Fallback: compute as before
             const price = item.discountedPrice || 0;
             const perUnitCouponDiscount = item.couponDiscount || 0;
             refundUnitPrice = Math.max(0, price - perUnitCouponDiscount);
        }

        const itemTotal = refundUnitPrice * cancelQty;
        cancelSubtotal += itemTotal;

        // Record Cancellation
        const existingCancel = order.cancelProducts.find(
          (cp) => cp.productId.toString() === item.productId.toString() && cp.mlSize === item.mlSize
        );

        if (existingCancel) {
          existingCancel.canceledQuantity += cancelQty;
          existingCancel.reason = cancellationReason || "";
          existingCancel.canceledAt = new Date();
        } else {
          order.cancelProducts.push({
            productId: item.productId,
            name: item.name,
            mlSize: item.mlSize,
            basePrice: item.basePrice,
            paidUnitPrice: refundUnitPrice, // Store accurate refund price
            discountedPrice: item.discountedPrice, // Legacy
            canceledQuantity: cancelQty,
            image: item.image,
            reason: cancellationReason || "",
            canceledAt: new Date(),
          });
        }

        // Update active quantity
        if (item.activeQty !== undefined) {
            item.activeQty -= cancelQty;
            item.quantity = item.activeQty; // Sync legacy
        } else {
            item.quantity -= cancelQty;
        }
      });

      // Filter out items that are fully exhausted
      // But we should keep them if we want history? 
      // Existing logic filtered them out: `order.items = order.items.filter(item => (item.quantity || 0) > 0);`
      // Better to check activeQty > 0
      order.items = order.items.filter(item => {
           const qty = item.activeQty !== undefined ? item.activeQty : item.quantity;
           return qty > 0;
      });

      // Check if order is fully cancelled
      const isEmpty = order.items.length === 0; // If all items removed
      
      // Also Delivery Charge Refund if FULL cancel
      if (isEmpty) {
         cancelSubtotal += (order.deliveryCharge || 0);
         order.orderStatus = "Cancelled";
      } else {
         // order.orderStatus = "Partially Cancelled"; // Not a standard enum value in typical systems, usually keeps "Placed" or Custom
      }
      
      order.cancelledAt = new Date();

      order.tracking.push({
        status: isEmpty ? "Cancelled" : "Placed", // Keep status valid enum or update if enum supports partial
        date: new Date(),
        message: `Cancellation processed. Refund: ₹${cancelSubtotal.toFixed(2)}`
      });

      // Recalc Order Total (Remaining)
      let remainingTotal = 0;
      order.items.forEach(item => {
          const qty = item.activeQty !== undefined ? item.activeQty : item.quantity;
          const price = item.paidUnitPrice !== undefined ? item.paidUnitPrice : (item.discountedPrice - (item.couponDiscount || 0));
          remainingTotal += (price * qty);
      });
      order.totalAmount = remainingTotal + (order.deliveryCharge || 0);
      
      // If full cancel, totalAmount = 0? Or keeps record of what it WAS?
      // Usually totalAmount reflects current payable.
      if (isEmpty) order.totalAmount = 0;

      await order.save();

      // Stock Restoration
      try {
        await Promise.all(
          fullCancelledItems.map(async ({ item, cancelQty }) => {
            if (cancelQty > 0) {
              await Product.updateOne(
                { _id: item.productId, "variants.mlSize": Number(item.mlSize) },
                { $inc: { "variants.$.stock": cancelQty } }
              );
            }
          })
        );
      } catch (stockErr) {
        console.error("Stock update error:", stockErr); 
      }

      // Wallet Refund
      if (cancelSubtotal > 0) {
        if (order.paymentMethod === 'online' || order.paymentMethod === 'Wallet' || order.paymentMethod === 'wallet') {
          await Wallet.refundToWallet(user._id, cancelSubtotal, `Refund for cancelled order ${order.orderID}`, order._id.toString());
        }
      }

      return res.redirect(
        `/order/${orderId}?cancelled=true&subtotal=${cancelSubtotal}`
      );
    }

    res.redirect(`/cancelOrder/${orderId}/cancel-select`);
  } catch (error) {
    console.error("Confirm cancel error:", error);
    res.status(500).redirect(`/order/${req.params.id}`);
  }
};

// Get cancel select
const getCancelSelect = async (req, res) => {
  try {
    const orderId = req.params.id;
    if (!orderId) return res.redirect("/login");

    const user = await User.findOne({ email: req.session.user });
    if (!user) return res.redirect("/login");

    const order = await Order.findById(orderId);
    if (!order) return res.redirect("/orders");

    const isEdit = req.query.edit === "true";
    let cancelledItems = [];
    if (isEdit) {
      cancelledItems = req.session.cancelledItems || [];
    }

    res.render("user/profile/orders/selectCancelProdcurs", {
      order,
      isEdit,
      cancelledItems,
    });
  } catch (err) {
    console.error("Error loading cancel select page:", err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Post cancel select
const postCancelSelect = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { cancelledItems: cancelledItemsStr } = req.body;

    if (!cancelledItemsStr) {
      req.session.error = ERROR_MESSAGES.CANCEL_NO_SELECTION;
      return res.redirect(`/orders/${orderId}`);
    }

    let parsedCancelledItems;
    try {
      parsedCancelledItems = JSON.parse(cancelledItemsStr);
    } catch (e) {
      req.session.error = ERROR_MESSAGES.INVALID_DATA;
      return res.redirect(`/orders/${orderId}`);
    }

    if (
      !Array.isArray(parsedCancelledItems) ||
      parsedCancelledItems.length === 0
    ) {
      req.session.error = ERROR_MESSAGES.INVALID_SELECTION;
      return res.redirect(`/orders/${orderId}`);
    }

    const order = await Order.findById(orderId);
    if (!order) {
      req.session.error = ERROR_MESSAGES.ORDER_NOT_FOUND;
      return res.status(404).redirect("/orders");
    }

    const user = await User.findOne({ email: req.session.user });
    if (!user || order.userId.toString() !== user._id.toString()) {
      return res.redirect("/orders");
    }

    const fullCancelledItems = parsedCancelledItems
      .map((pi) => {
        const orderItem = order.items.find(
          (i) => i._id.toString() === pi.item._id.toString()
        );
        if (!orderItem) {
          return null;
        }

        const cancelQty = parseInt(pi.cancelQty);
        if (cancelQty < 1 || cancelQty > orderItem.quantity) {
          return null;
        }

        return {
          item: {
            _id: orderItem._id,
            name: pi.item.name,
            mlSize: orderItem.mlSize || 0,
            basePrice: orderItem.basePrice || 0,
            discountedPrice: orderItem.discountedPrice || 0,
            image: orderItem.image || pi.item.image,
          },
          cancelQty: cancelQty,
        };
      })
      .filter(Boolean);

    if (fullCancelledItems.length === 0) {
      req.session.error = ERROR_MESSAGES.CANCEL_NO_VALID_ITEMS;
      return res.redirect(`/cancelOrder/${orderId}`);
    }

    req.session.cancelledItems = fullCancelledItems;

    res.redirect(`/cancelOrder/${orderId}`);
  } catch (error) {
    console.error("Cancel order error:", error);
    req.session.error = ERROR_MESSAGES.INTERNAL_ERROR;
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).redirect(`/orders/${req.params.id}`);
  }
};

// Get order invoice
const getorderInvoce = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    const user = await User.findById(order.userId);

    const pdfBuffer = await generateInvoice(order, user);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=invoice-${order._id}.pdf`,
    });

    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INVOICE_ERROR);
  }
};

// Get return
const getReturn = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userEmail = req.session.user;

    if (!userEmail) return res.redirect("/login");

    const order = await Order.findById(orderId);
    if (!order) {
      req.session.error = ERROR_MESSAGES.ORDER_NOT_FOUND;
      return res.redirect("/orders");
    }

    const returnItems = req.session.returnItems || [];
    let returnSubtotal = 0;
    returnItems.forEach((itemReturn) => {
      const item = itemReturn.item;
      const returnQty = itemReturn.returnQty;
      // Fix: Subtract coupon
      const price = item.discountedPrice || item.basePrice || 0;
      const perUnitCoupon = item.couponDiscount || 0;
      const netPerUnit = Math.max(0, price - perUnitCoupon);
      
      const itemTotal = netPerUnit * returnQty;
      returnSubtotal += itemTotal;
    });

    res.render("user/profile/orders/returnOrder", {
      order,
      returnItems,
      returnSubtotal,
    });
  } catch (err) {
    console.error("Error loading return confirmation page:", err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Post return
const postReturn = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) return res.redirect("/login");

    const orderId = req.params.id;
    if (!orderId) return res.redirect("/orders");

    const { returnedItems: returnedItemsStr } = req.body;

    if (!returnedItemsStr) {
      return res.redirect(`/order/${orderId}`);
    }

    let parsedReturnedItems;
    try {
      parsedReturnedItems = JSON.parse(returnedItemsStr);
    } catch (e) {
      return res.redirect(`/order/${orderId}`);
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).redirect(`/order/${orderId}`);
    }

    const fullReturnItems = parsedReturnedItems
      .map((pi) => {
        const item = order.items.find(
          (i) => i._id.toString() === pi.productId && i.mlSize === pi.mlSize
        );
        return item ? { item, returnQty: pi.returnQty } : null;
      })
      .filter(Boolean);

    if (fullReturnItems.length === 0) {
      return res.redirect(`/order/${orderId}`);
    }

    // Save enriched items to session
    req.session.returnItems = fullReturnItems;
    req.session.orderId = orderId;

    res.redirect(`/return/${orderId}`);
  } catch (error) {
    console.error("Return select error:", error);
    res.status(500).redirect(`/order/${req.params.id}`);
  }
};

// Get return select
const getReturnSelect = async (req, res) => {
  try {
    const orderId = req.params.id;
    if (!orderId) return res.redirect("/login");

    const user = await User.findOne({ email: req.session.user });
    if (!user) return res.redirect("/login");

    const order = await Order.findById(orderId);
    if (!order) return res.redirect("/orders");

    const isEdit = req.query.edit === "true";
    let returnItems = [];
    if (isEdit) {
      returnItems = req.session.returnItems || [];
    }

    res.render("user/profile/orders/selectReturnProduct", {
      order,
      isEdit,
      returnItems,
    });
  } catch (err) {
    console.error("Error loading return select page:", err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Post return select
const postReturnSelect = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { returnedItems: returnedItemsStr } = req.body;

    if (!returnedItemsStr) {
      req.session.error = ERROR_MESSAGES.RETURN_NO_SELECTION;
      return res.redirect(`/orders/${orderId}`);
    }

    let parsedReturnedItems;
    try {
      parsedReturnedItems = JSON.parse(returnedItemsStr);
    } catch (e) {
      req.session.error = ERROR_MESSAGES.INVALID_DATA;
      return res.redirect(`/orders/${orderId}`);
    }

    if (
      !Array.isArray(parsedReturnedItems) ||
      parsedReturnedItems.length === 0
    ) {
      req.session.error = ERROR_MESSAGES.INVALID_SELECTION;
      return res.redirect(`/orders/${orderId}`);
    }

    const order = await Order.findById(orderId);
    if (!order) {
      req.session.error = ERROR_MESSAGES.ORDER_NOT_FOUND;
      return res.status(404).redirect("/orders");
    }

    const user = await User.findOne({ email: req.session.user });
    if (!user || order.userId.toString() !== user._id.toString()) {
      return res.redirect("/orders");
    }

    const fullReturnItems = parsedReturnedItems
      .map((pi) => {
        const orderItem = order.items.find(
          (i) => i._id.toString() === pi.item._id.toString()
        );
        if (!orderItem) {
          return null;
        }

        const returnQty = parseInt(pi.returnQty);
        if (returnQty < 1 || returnQty > orderItem.quantity) {
          return null;
        }

        return {
          item: {
            _id: orderItem._id,
            name: pi.item.name,
            mlSize: orderItem.mlSize || 0,
            basePrice: orderItem.basePrice || 0,
            discountedPrice: orderItem.discountedPrice || orderItem.basePrice || 0,
            image: orderItem.image || pi.item.image,
          },
          returnQty: returnQty,
        };
      })
      .filter(Boolean);

    if (fullReturnItems.length === 0) {
      req.session.error = ERROR_MESSAGES.RETURN_NO_VALID_ITEMS;
      return res.redirect(`/return/${orderId}`);
    }

    req.session.returnItems = fullReturnItems;

    res.redirect(`/return/${orderId}`);
  } catch (error) {
    console.error("Return order error:", error);
    req.session.error = ERROR_MESSAGES.INTERNAL_ERROR;
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).redirect(`/orders/${req.params.id}`);
  }
};// Confirm return
const confirmReturn = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) return res.redirect('/login');
    const user = await User.findOne({ email: userEmail });
    if (!user) return res.redirect('/login');
    const orderId = req.params.id;
    if (!orderId) return res.redirect('/orders');
    const order = await Order.findById(orderId);
    if (!order) return res.redirect('/orders');

    // Security: Ensure user owns the order
    if (order.userId.toString() !== user._id.toString()) {
      return res.redirect('/orders');
    }

    const { returnItems: returnItemsStr, returnReason, confirm } = req.body;

    if (!returnItemsStr) {
      return res.redirect(`/return/${orderId}/return-select`);
    }

    let parsedReturnItems;
    try {
      parsedReturnItems = JSON.parse(returnItemsStr);
    } catch (e) {
       return res.redirect(`/return/${orderId}/return-select`);
    }

    const fullReturnItems = parsedReturnItems
      .map((pi) => {
        const item = order.items.find(
          (i) => i._id.toString() === (pi.item?._id || pi.productId)?.toString()
        );
        if (!item) return null;
        const returnQty = parseInt(pi.returnQty);
        
        // Validate against active quantity
        const activeQty = item.activeQty !== undefined ? item.activeQty : item.quantity;
        if (returnQty < 1 || returnQty > activeQty) return null;
        
        return { item, returnQty };
      })
      .filter(Boolean);

    if (fullReturnItems.length === 0) {
      return res.redirect(`/return/${orderId}/return-select`);
    }

    // Confirmation step
    if (confirm === "true") {
      if (!returnReason) {
        return res.redirect(`/return/${orderId}/return-select?error=reason`);
      }

      let returnSubtotal = 0;

      fullReturnItems.forEach(({ item, returnQty }) => {
        // Calculate refund UNIT price
        let refundUnitPrice = 0;
        if (item.paidUnitPrice !== undefined) {
             refundUnitPrice = item.paidUnitPrice;
        } else {
             // Legacy
             const price = item.discountedPrice || item.basePrice || 0;
             const perUnitCouponDiscount = item.couponDiscount || 0;
             refundUnitPrice = Math.max(0, price - perUnitCouponDiscount);
        }

        const itemTotal = refundUnitPrice * returnQty;
        returnSubtotal += itemTotal;

        // Create new return request 
        const returnedProduct = {
          productId: item.productId,
          name: item.name,
          mlSize: item.mlSize,
          basePrice: item.basePrice,
          paidUnitPrice: refundUnitPrice, // Accurate paid price
          discountedPrice: refundUnitPrice, // Legacy support
          returndQuantity: returnQty,
          image: item.image,
          reason: returnReason,
          returnedAt: new Date(),
          adminApproved: "Requested",
        };

        order.returndProduct.push(returnedProduct);
        
        // We do NOT decrement activeQty here yet. 
        // ActiveQty should only be decremented upon Admin Approval.
        // However, to prevent double return request, we might need a "requestedQty" tracking 
        // OR rely on admin to reject duplicate requests.
        // For now, following standard flow: User requests -> Admin approves -> Qty deduction.
      });

      // Add to tracking
      order.tracking.push({
        status: "Return Requested",
        date: new Date(),
        message: `Return requested for ${fullReturnItems.length} items. Refund Est: ₹${returnSubtotal.toFixed(2)}`
      });

      // Create Notification for Admin
      try {
        await Notification.create({
            type: 'return',
            message: `New Return Request for Order ${order.orderID} by ${user.name || user.email}.`,
            metadata: { 
                orderId: order._id, 
                userId: user._id, 
                returnCount: fullReturnItems.length 
            }
        });
      } catch (notifErr) {
          console.error("Error creating return notification:", notifErr);
      }

      await order.save();

      // Clear session 
      delete req.session.returnItems;
      delete req.session.orderId;

      await req.session.save(); 

      return res.redirect(
        `/order/${orderId}?returnRequested=true&subtotal=${returnSubtotal}`
      );
    }

    // If not confirmed, redirect back to select
    return res.redirect(`/return/${orderId}/return-select`);
  } catch (error) {
    console.error("Return request submission error:", error);
    return res.redirect(`/orders?error=return`);
  }
};
// Get security
const getSecurity = async (req, res) => {
  const userEmail = req.session.user;
  if (!userEmail) return res.redirect("/login");
  const user = await User.findOne({ email: userEmail });
  if (!user) return res.redirect("/login");

  const logHistory = await UserLog.find({ userId: user._id })
    .sort({ loginTime: -1 })
    .limit(6);

  const is2FAEnabled = !!user.twoFactorSecret;

  res.render("user/profile/security/security", {
    user,
    logHistory,
    is2FAEnabled,
    currentPath: req.originalUrl,
  });
};

// Get delete account
const getDeleteAcount = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) res.redirect("/login");
    const user = await User.findOne({ email: userEmail });
    if (!user) res.redirect("/login");

    res.render("user/profile/security/deleteAcount", {
      user,
      currentPath: req.originalUrl,
    });
  } catch (error) {
    console.error("Error sending OTP:", error);
    req.flash(
      "errorMsg",
      ERROR_MESSAGES.OTP_SEND_ERROR
    );
    res.render("user/deleteAccount", {
      title: "Delete Account",
      successMsg: null,
      errorMsg: req.flash("errorMsg")[0],
    });
  }
};

// Get referrals
const getReferrals = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) return res.redirect("/login");

    const user = await User.findOne({ email: userEmail });
    if (!user) return res.redirect("/login");

    // Generate referral code if missing (for existing users)
    if (!user.referralCode) {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let newCode = "";
      for (let i = 0; i < 8; i++) {
        newCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      user.referralCode = newCode;
      await user.save();
    }

    // Fetch details of referred users (users who used THIS user's referral code)
    const referredUsers = await User.find({ email: { $in: user.redeemedUsers || [] } })
      .select("name email createdAt")
      .lean();
    
    // Sort by date desc
    referredUsers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Fetch the referrer (the user who referred THIS user, if any)
    let referrer = null;
    if (user.referredBy) {
      referrer = await User.findOne({ referralCode: user.referredBy })
        .select("name email")
        .lean();
    }

    res.render("user/profile/referandearn/reffer", {
      user,
      referredUsers,
      referredCount: referredUsers.length,
      referrer, // The user who referred the current user
      currentPath: req.path,
    });
  } catch (error) {
    console.error("Error fetching referrals:", error);
    res.status(500).redirect("/profile");
  }
};

// Verify delete password and send OTP
const verifyDeletePassword = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        success: false, 
        message: ERROR_MESSAGES.UNAUTHORIZED_ACCESS 
      });
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ 
        success: false, 
        message: ERROR_MESSAGES.USER_NOT_FOUND 
      });
    }

    const { password } = req.body;

    if (!password) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "Password is required." 
      });
    }

    if (password.length < 8) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "Password must be at least 8 characters long." 
      });
    }

    // Verify password
    const bcrypt = await import("bcryptjs");
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "Incorrect password. Please try again." 
      });
    }

    // Delete any existing OTPs for this email
    await UserOtpVerification.deleteMany({ email: userEmail, action: "Delete Account" });

    // Generate and send OTP
    const { generateOTP } = await import("../../utils/genarateOtp.js");
    await generateOTP(
      userEmail,
      "Account Deletion Verification",
      "Your OTP code for deleting your Dité account is",
      "Delete Account"
    );

    // Store delete account confirmation in session
    req.session.deleteAccountPending = true;

    return res.status(HTTP_STATUS.OK).json({ 
      success: true, 
      message: "OTP sent to your email." 
    });
  } catch (error) {
    console.error("Verify delete password error:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
      success: false, 
      message: ERROR_MESSAGES.INTERNAL_ERROR 
    });
  }
};

// Resend delete account OTP
const resendDeleteOtp = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        success: false, 
        message: ERROR_MESSAGES.UNAUTHORIZED_ACCESS 
      });
    }

    // Check if delete account process is pending
    if (!req.session.deleteAccountPending) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "Please verify your password first." 
      });
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ 
        success: false, 
        message: ERROR_MESSAGES.USER_NOT_FOUND 
      });
    }

    // Delete any existing OTPs for this email
    await UserOtpVerification.deleteMany({ email: userEmail, action: "Delete Account" });

    // Generate and send new OTP
    const { generateOTP } = await import("../../utils/genarateOtp.js");
    await generateOTP(
      userEmail,
      "Account Deletion Verification",
      "Your OTP code for deleting your Dité account is",
      "Delete Account"
    );

    return res.status(HTTP_STATUS.OK).json({ 
      success: true, 
      message: "New OTP sent to your email." 
    });
  } catch (error) {
    console.error("Resend delete OTP error:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
      success: false, 
      message: ERROR_MESSAGES.INTERNAL_ERROR 
    });
  }
};

// Confirm delete account
const confirmDeleteAccount = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        success: false, 
        message: ERROR_MESSAGES.UNAUTHORIZED_ACCESS 
      });
    }

    // Check if delete account process is pending
    if (!req.session.deleteAccountPending) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "Please complete the verification process first." 
      });
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ 
        success: false, 
        message: ERROR_MESSAGES.USER_NOT_FOUND 
      });
    }

    const { otp } = req.body;

    // Validate OTP format
    if (!otp) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "OTP is required." 
      });
    }

    if (otp.length !== 6) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "OTP must be 6 digits." 
      });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "OTP must contain only numbers." 
      });
    }

    // Find OTP record within 5 minutes
    const otpRecord = await UserOtpVerification.findOne({
      email: userEmail,
      action: "Delete Account",
      createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "OTP has expired. Please request a new one." 
      });
    }

    if (Number(otp) !== otpRecord.otp) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "Invalid OTP. Please try again." 
      });
    }

    // Delete OTP records
    await UserOtpVerification.deleteMany({ email: userEmail });

    // Soft delete - mark user as deleted instead of removing
    user.isDeleted = true;
    user.deletedAt = new Date();
    await user.save();

    // Clear session
    delete req.session.user;
    delete req.session.deleteAccountPending;
    
    return res.status(HTTP_STATUS.OK).json({ 
      success: true, 
      message: "Account deleted successfully.",
      redirectUrl: "/" 
    });
  } catch (error) {
    console.error("Confirm delete account error:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
      success: false, 
      message: ERROR_MESSAGES.INTERNAL_ERROR 
    });
  }
};

// User logout
const userlogOut = (req, res) => {
  try {
    delete req.session.user;
    return res.redirect("/");
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Generate 2FA Secret and QR Code
const generate2FASecret = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        success: false, 
        message: ERROR_MESSAGES.UNAUTHORIZED_ACCESS 
      });
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ 
        success: false, 
        message: ERROR_MESSAGES.USER_NOT_FOUND 
      });
    }

    const speakeasy = await import("speakeasy");
    const QRCode = await import("qrcode");

    // Generate secret
    const secret = speakeasy.default.generateSecret({
      name: `Dité (${user.email})`,
      issuer: "Dité",
      length: 20,
    });

    // Store temp secret in session for verification
    req.session.temp2FASecret = secret.base32;

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.default.toDataURL(secret.otpauth_url);

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      qrCode: qrCodeDataUrl,
    });
  } catch (error) {
    console.error("Generate 2FA error:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
      success: false, 
      message: ERROR_MESSAGES.INTERNAL_ERROR 
    });
  }
};

// Enable 2FA after verification
const enable2FA = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        success: false, 
        message: ERROR_MESSAGES.UNAUTHORIZED_ACCESS 
      });
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ 
        success: false, 
        message: ERROR_MESSAGES.USER_NOT_FOUND 
      });
    }

    const { code } = req.body;
    const tempSecret = req.session.temp2FASecret;

    if (!tempSecret) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "Please generate a QR code first." 
      });
    }

    if (!code || code.length !== 6) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "Please enter a valid 6-digit code." 
      });
    }

    const speakeasy = await import("speakeasy");

    // Verify code
    const verified = speakeasy.default.totp.verify({
      secret: tempSecret,
      encoding: "base32",
      token: code,
      window: 1, // Allow 1 step before/after for clock drift
    });

    if (!verified) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "Invalid code. Please try again." 
      });
    }

    // Save secret and enable 2FA
    user.twoFactorSecret = tempSecret;
    user.twoFactorAuth = true;
    await user.save();

    // Clear temp secret from session
    delete req.session.temp2FASecret;

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Two-factor authentication enabled successfully!",
    });
  } catch (error) {
    console.error("Enable 2FA error:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
      success: false, 
      message: ERROR_MESSAGES.INTERNAL_ERROR 
    });
  }
};

// Disable 2FA
const disable2FA = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
        success: false, 
        message: ERROR_MESSAGES.UNAUTHORIZED_ACCESS 
      });
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ 
        success: false, 
        message: ERROR_MESSAGES.USER_NOT_FOUND 
      });
    }

    if (!user.twoFactorAuth || !user.twoFactorSecret) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "2FA is not enabled on this account." 
      });
    }

    const { code } = req.body;

    if (!code || code.length !== 6) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "Please enter a valid 6-digit code." 
      });
    }

    const speakeasy = await import("speakeasy");

    // Verify code
    const verified = speakeasy.default.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: code,
      window: 1,
    });

    if (!verified) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "Invalid code. Please try again." 
      });
    }

    // Disable 2FA
    user.twoFactorSecret = null;
    user.twoFactorAuth = false;
    await user.save();

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Two-factor authentication disabled successfully!",
    });
  } catch (error) {
    console.error("Disable 2FA error:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
      success: false, 
      message: ERROR_MESSAGES.INTERNAL_ERROR 
    });
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
  postSetDefaultAddress,
  postDeleteAddress,
  getOrders,
  getOrderDetails,
  getCancelOrder,
  postCancelOrder,
  confirmCancel,
  getCancelSelect,
  postCancelSelect,
  getorderInvoce,
  getReturn,
  postReturn,
  confirmReturn,
  getReturnSelect,
  postReturnSelect,
// getWallet, (Removed)
// getWalletHistory, (Removed)
  getReferrals,
  getSecurity,
  getDeleteAcount,
  verifyDeletePassword,
  resendDeleteOtp,
  confirmDeleteAccount,
  generate2FASecret,
  enable2FA,
  disable2FA,
  userlogOut,
};
