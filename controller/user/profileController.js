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
const postProfile = async (req, res) => {
  try {
    const { name, gender, email, phone } = req.body;

    const user = await User.findOne({ email: req.session.user });

    if (!user) {
      return res.status(404).send("User not found");
    }

    let imageUrl = user.image; // keep existing one
    if (req.file) {
      imageUrl = req.file.path || req.file.secure_url || req.file.url;

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
    console.error(error);
    req.session.error = "Something went wrong while updating profile";
    res.status(500).send("Something went wrong");
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
      req.session.error = "Please fill in required fields !!";
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

    req.session.success = "Address added successfully!";
    res.redirect("/address");
  } catch (error) {
    console.error(error);
    req.session.error = "Something Occure While Adding New Adress";
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
    if (!address) return res.status(404).send("Address not found");

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
      req.session.error = "Please fill in required fields !!";
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
// Post delete address
const postDeleteAddress = async (req, res) => {
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
    res.status(500).send("Internal Server Error");
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
      req.session.error = "Order not found.";
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
    res.status(500).send("Internal Server Error");
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
    res.status(500).send("Internal Server Error");
  }
};

// Post cancel select
const postCancelSelect = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { cancelledItems: cancelledItemsStr } = req.body;

    if (!cancelledItemsStr) {
      req.session.error = "No items selected for cancellation.";
      return res.redirect(`/orders/${orderId}`);
    }

    let parsedCancelledItems;
    try {
      parsedCancelledItems = JSON.parse(cancelledItemsStr);
    } catch (e) {
      req.session.error = "Invalid data format.";
      return res.redirect(`/orders/${orderId}`);
    }

    if (
      !Array.isArray(parsedCancelledItems) ||
      parsedCancelledItems.length === 0
    ) {
      req.session.error = "Invalid selection. Please try again.";
      return res.redirect(`/orders/${orderId}`);
    }

    const order = await Order.findById(orderId);
    if (!order) {
      req.session.error = "Order not found.";
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
      req.session.error = "No valid items to cancel. Please try again.";
      return res.redirect(`/cancelOrder/${orderId}`);
    }

    req.session.cancelledItems = fullCancelledItems;

    res.redirect(`/cancelOrder/${orderId}`);
  } catch (error) {
    console.error("Cancel order error:", error);
    req.session.error = "An error occurred. Please try again.";
    res.status(500).redirect(`/orders/${req.params.id}`);
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
    res.status(500).send("Error generating invoice");
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
      req.session.error = "Order not found.";
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
    res.status(500).send("Internal Server Error");
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
    res.status(500).send("Internal Server Error");
  }
};

// Post return select
const postReturnSelect = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { returnedItems: returnedItemsStr } = req.body;

    if (!returnedItemsStr) {
      req.session.error = "No items selected for return.";
      return res.redirect(`/orders/${orderId}`);
    }

    let parsedReturnedItems;
    try {
      parsedReturnedItems = JSON.parse(returnedItemsStr);
    } catch (e) {
      req.session.error = "Invalid data format.";
      return res.redirect(`/orders/${orderId}`);
    }

    if (
      !Array.isArray(parsedReturnedItems) ||
      parsedReturnedItems.length === 0
    ) {
      req.session.error = "Invalid selection. Please try again.";
      return res.redirect(`/orders/${orderId}`);
    }

    const order = await Order.findById(orderId);
    if (!order) {
      req.session.error = "Order not found.";
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
      req.session.error = "No valid items to return. Please try again.";
      return res.redirect(`/return/${orderId}`);
    }

    req.session.returnItems = fullReturnItems;

    res.redirect(`/return/${orderId}`);
  } catch (error) {
    console.error("Return order error:", error);
    req.session.error = "An error occurred. Please try again.";
    res.status(500).redirect(`/orders/${req.params.id}`);
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
      "Failed to send verification code. Please try again."
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

    // Fetch details of referred users
    const referredUsers = await User.find({ email: { $in: user.redeemedUsers || [] } })
      .select("name email createdAt")
      .lean();
    
    // Sort by date desc
    referredUsers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.render("user/profile/referandearn/reffer", {
      user,
      referredUsers,
      referredCount: referredUsers.length,
      currentPath: req.path,
    });
  } catch (error) {
    console.error("Error fetching referrals:", error);
    res.status(500).redirect("/profile");
  }
};

// User logout
const userlogOut = (req, res) => {
  try {
    delete req.session.user;
    return res.redirect("/");
  } catch (error) {
    console.error(error);
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
  userlogOut,
};
