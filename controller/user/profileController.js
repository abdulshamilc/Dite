import { User, UserOtpVerification } from "../../models/userModels.js";
import { Address } from "../../models/addressModel.js";
import Order from "../../models/ordersModel.js";
import UserLog from "../../models/userLogModel.js";
import Return from "../../models/returnModel.js";
import { generateOTP } from "../../utils/genarateOtp.js";
import generateInvoice from "../../services/OrderPdfGenarator.js";

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
    console.log(error);
    req.session.error = "Something Occure While Adding New Adress";
    res.redirect("/address");
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
      .lean();

    res.render("user/profile/orders", {
      orders: orders || [],
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

  const totalAmount = order.items.reduce(
    (acc, ele) => acc + ele.discoundedPrice * ele.quantity,
    0
  );

  const discount = subTotal - totalAmount;

  const hasActiveItems = order.items.some((item) => !item.canceled);

  res.render("user/profile/orderDetails", {
    order,
    subTotal,
    discount,
    totalAmount,
    hasActiveItems,
  });
};
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
      const itemTotal = (item.basePrice || 0) * cancelQty;
      cancelSubtotal += itemTotal;
    });

    res.render("user/profile/cancellOrder", {
      order,
      cancelledItems,
      cancelSubtotal,
    });
  } catch (err) {
    console.error("Error loading cancel confirmation page:", err);
    res.status(500).send("Internal Server Error");
  }
};

const postCancelOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const {
      cancelledItems: cancelledItemsStr,
      cancellationReason,
      confirm,
    } = req.body;

    console.log(
      "POST /cancelOrder: Received confirm=",
      confirm,
      "Body:",
      req.body
    ); // DEBUG

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

    // Confirmation step
    if (confirm === "true") {
      console.log("Entering confirmation: Updating DB..."); // DEBUG
      let cancelSubtotal = 0;
      const updatedItems = [...order.items];

      fullCancelledItems.forEach(({ item, cancelQty }) => {
        const matchingItemIndex = updatedItems.findIndex(
          (i) => i._id.toString() === item._id.toString()
        );

        if (matchingItemIndex !== -1) {
          const currentItem = updatedItems[matchingItemIndex];
          const itemTotal = (currentItem.basePrice || 0) * cancelQty;
          cancelSubtotal += itemTotal;

          updatedItems[matchingItemIndex].productStatus = "Cancelled";
          updatedItems[matchingItemIndex].quantity -= cancelQty;

          if (updatedItems[matchingItemIndex].quantity <= 0) {
            updatedItems[matchingItemIndex].quantity = 0;
          }
        }
      });

      // Stock restoration (wrapped for safety)
      try {
        await Promise.all(
          fullCancelledItems.map(async ({ item, cancelQty }) => {
            const product = await Product.findById(item.productId);
            if (product && cancelQty > 0) {
              product.stock = (product.stock || 0) + cancelQty;
              await product.save();
            }
          })
        );
      } catch (stockErr) {
        console.error("Stock update error:", stockErr); // Log but don't block
      }

      // Update order
      order.items = updatedItems;
      order.cancelStatus = "Active";
      const allCancelled = updatedItems.every(
        (item) => item.productStatus === "Cancelled" || item.quantity <= 0
      );
      order.orderStatus = allCancelled ? "Cancelled" : "Partially Cancelled";
      order.cancelledAt = new Date();

      order.tracking.push({
        status: "Cancelled",
        date: new Date(),
        message: `Partial/Full cancellation requested by user. Reason: ${
          cancellationReason || "Not provided"
        }. Subtotal cancelled: ₹${cancelSubtotal.toFixed(2)}`,
      });

      if (order.paymentMethod === "cod") {
        console.log(
          `COD order ${order.orderID} partially cancelled. Handle manual adjustment.`
        );
      }

      const remainingSubtotal = updatedItems.reduce((sum, item) => {
        return (
          sum + (item.discountedPrice || item.basePrice || 0) * item.quantity
        );
      }, 0);
      order.totalAmount = remainingSubtotal;

      await order.save();
      console.log("Order saved successfully."); // DEBUG

      // Clear session explicitly
      delete req.session.cancelledItems;
      delete req.session.orderId;
      await req.session.save(); // ENSURE SESSION PERSISTED

      console.log(
        `Redirecting to /order/${orderId}?cancelled=true&subtotal=${cancelSubtotal}`
      ); // DEBUG
      return res.redirect(
        `/order/${orderId}?cancelled=true&subtotal=${cancelSubtotal}`
      );
    }

    // Selection step
    console.log("Selection step: Saving to session..."); // DEBUG
    req.session.cancelledItems = fullCancelledItems;
    req.session.orderId = orderId;
    await req.session.save(); // ENSURE SESSION PERSISTED

    res.redirect(`/cancelOrder/${orderId}`);
  } catch (error) {
    console.error("Cancel order error:", error);
    res.status(500).redirect(`/order/${req.params.id}`);
  }
};

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

    res.render("user/profile/selectCancelProdcurs", {
      order,
      isEdit,
      cancelledItems,
    });
  } catch (err) {
    console.error("Error loading cancel select page:", err);
    res.status(500).send("Internal Server Error");
  }
};

const postCancelSelect = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { cancelledItems: cancelledItemsStr } = req.body;

    if (!cancelledItemsStr) {
      req.session.error = "No items selected for cancellation.";
      return res.redirect(`/orders/${orderId}`);
    }

    const parsedCancelledItems = JSON.parse(cancelledItemsStr);

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
      const itemTotal = (item.basePrice || 0) * returnQty;
      returnSubtotal += itemTotal;
    });

    res.render("user/profile/retrunOrder", {
      order,
      returnItems,
      returnSubtotal,
    });
  } catch (err) {
    console.error("Error loading return confirmation page:", err);
    res.status(500).send("Internal Server Error");
  }
};

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

    const parsedReturnedItems = JSON.parse(returnedItemsStr);

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

const postReturnConfired = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { returnItems: itemsJson, returnReason, comments } = req.body;

    if (!orderId || !req.user?._id) {
      return res.status(400).redirect(`/orders/${orderId}?error=missing_data`);
    }

    const items = JSON.parse(itemsJson || "[]");
    if (items.length === 0) {
      return res.status(400).redirect(`/orders/${orderId}?error=no_items`);
    }

    // Process items to match schema
    const processedItems = [];
    let subtotal = 0;

    for (const itemReturn of items) {
      const { item: orderItem, returnQty } = itemReturn;
      if (!orderItem?._id || !orderItem.basePrice || !returnQty) {
        return res
          .status(400)
          .redirect(`/orders/${orderId}?error=invalid_item`);
      }

      const itemId = new mongoose.Types.ObjectId(orderItem._id);
      const basePrice = parseFloat(orderItem.basePrice);
      const itemTotal = basePrice * returnQty;

      processedItems.push({
        item: itemId,
        returnQty: parseInt(returnQty),
        basePrice,
      });

      subtotal += itemTotal;
    }

    // Validate reason
    if (!returnReason) {
      return res.status(400).redirect(`/orders/${orderId}?error=no_reason`);
    }

    const newReturn = new Return({
      order: new mongoose.Types.ObjectId(orderId),
      user: req.user._id,
      items: processedItems,
      subtotal,
      reason: returnReason,
      comments: comments || "",
      status: "pending",
      estimatedRefund: subtotal,
    });

    await newReturn.save();


    res.redirect(`/orders/${orderId}`);
  } catch (error) {
    console.error("Error creating return:", error);
    res
      .status(500)
      .redirect(`/orders/${req.params.orderId || ""}?error=server_error`);
  }
};

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

    res.render("user/profile/selectReturnProduct", {
      order,
      isEdit,
      returnItems,
    });
  } catch (err) {
    console.error("Error loading return select page:", err);
    res.status(500).send("Internal Server Error");
  }
};

const postReturnSelect = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { returnedItems: returnedItemsStr } = req.body;

    if (!returnedItemsStr) {
      req.session.error = "No items selected for return.";
      return res.redirect(`/orders/${orderId}`);
    }

    const parsedReturnedItems = JSON.parse(returnedItemsStr);

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
};

const getSecurity = async (req, res) => {
  const userEmail = req.session.user;
  if (!userEmail) return res.redirect("/login");
  const user = await User.findOne({ email: userEmail });
  if (!user) return res.redirect("/login");

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
  getCancelOrder,
  postCancelOrder,
  getCancelSelect,
  postCancelSelect,
  getorderInvoce,
  getReturn,
  postReturn,
  postReturnConfired,
  getReturnSelect,
  postReturnSelect,
  getSecurity,
  getDeleteAcount,
  userlogOut,
};
