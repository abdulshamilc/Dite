import { User, UserOtpVerification } from "../../models/userModels.js";
import { Address } from "../../models/addressModel.js";
import Order from "../../models/ordersModel.js";
import UserLog from "../../models/userLogModel.js";
import Product from '../../models/productsModels.js' ;
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

  const itemTotal = order.items.reduce(
    (acc, ele) => acc + (ele.discountedPrice || ele.basePrice) * ele.quantity,
    0
  );

  const discount = subTotal - itemTotal;

  const totalAmount = itemTotal + (order.shipping || 0) + (order.tax || 0);

  const hasActiveItems = order.items.some((item) => item.quantity > 0);

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
      const itemTotal = (item.discountedPrice || item.basePrice || 0) * cancelQty;
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

    const parsedCancelledItems = JSON.parse(cancelledItemsStr);

    const fullCancelledItems = parsedCancelledItems
      .map((pi) => {
        const item = order.items.find(
          (i) => i._id.toString() === (pi.item?._id || pi.productId)?.toString()
        );
        if (!item) return null;
        const cancelQty = parseInt(pi.cancelQty);
        if (cancelQty < 1) return null;
        let approvedReturnQty = 0;
        if (order.returndProduct && order.returndProduct.length > 0) {
          approvedReturnQty = order.returndProduct
            .filter(rp => rp.adminApproved === 'Approved' &&
              rp.productId.toString() === item.productId.toString() &&
              rp.mlSize === item.mlSize)
            .reduce((sum, rp) => sum + (rp.returndQuantity || 0), 0);
        }
        const currentEffectiveQty = (item.quantity || 0) - approvedReturnQty;
        if (cancelQty > currentEffectiveQty) return null;
        return { item, cancelQty };
      })
      .filter(Boolean);

    if (fullCancelledItems.length === 0) {
      return res.redirect(`/cancelOrder/${orderId}/cancel-select`);
    }

    // Confirmation step
    if (confirm === "true") {
      let cancelSubtotal = 0;

      fullCancelledItems.forEach(({ item, cancelQty }) => {
        const itemTotal = (item.discountedPrice || item.basePrice || 0) * cancelQty;
        cancelSubtotal += itemTotal;

        let existingCancel = order.cancelProducts.find(
          (cp) => cp.productId.toString() === item.productId.toString() && cp.mlSize === item.mlSize
        );

        if (existingCancel) {
          existingCancel.canceledQuantity += cancelQty;
          existingCancel.reason = cancellationReason || "";
          existingCancel.canceledAt = new Date();
        } else {
          
          const canceledProduct = {
            productId: item.productId,
            name: item.name,
            mlSize: item.mlSize,
            basePrice: item.basePrice,
            discountedPrice: item.discountedPrice || 0,
            canceledQuantity: cancelQty,
            image: item.image,
            reason: cancellationReason || "",
            canceledAt: new Date(),
          };

          order.cancelProducts.push(canceledProduct);
        }

        // Update item quantity to reflect cancellation (remove from active)
        item.quantity -= cancelQty;
      });

      // Remove items with zero or negative quantity
      order.items = order.items.filter(item => (item.quantity || 0) > 0);

      // Compute effective total quantity after cancels and approved returns
      let totalEffectiveQty = 0;
      order.items.forEach((item) => {
        let approvedReturnForThis = 0;
        if (order.returndProduct && order.returndProduct.length > 0) {
          approvedReturnForThis = order.returndProduct
            .filter(rp => rp.adminApproved === 'Approved' &&
              rp.productId.toString() === item.productId.toString() &&
              rp.mlSize === item.mlSize)
            .reduce((sum, rp) => sum + (rp.returndQuantity || 0), 0);
        }
        totalEffectiveQty += Math.max(0, (item.quantity || 0) - approvedReturnForThis);
      });
      const allCancelled = totalEffectiveQty <= 0;

      // Update order status
      order.orderStatus = allCancelled ? "Cancelled" : order.orderStatus;
      order.cancelledAt = new Date();

      order.tracking.push({
        status: allCancelled ? "Cancelled" : "Partially Cancelled",
        date: new Date(),
        message: `Cancellation processed by user. ${allCancelled ? 'Full' : 'Partial'} order affected. Reason: ${
          cancellationReason || "Not provided"
        }. Subtotal cancelled: ₹${cancelSubtotal.toFixed(2)}`,
      });

      // Compute remainingSubtotal based on effective quantities (cancels already subtracted from items)
      let remainingSubtotal = 0;
      order.items.forEach((item) => {
        let approvedReturnForThis = 0;
        if (order.returndProduct && order.returndProduct.length > 0) {
          approvedReturnForThis = order.returndProduct
            .filter(rp => rp.adminApproved === 'Approved' &&
              rp.productId.toString() === item.productId.toString() &&
              rp.mlSize === item.mlSize)
            .reduce((sum, rp) => sum + (rp.returndQuantity || 0), 0);
        }
        let effQty = Math.max(0, (item.quantity || 0) - approvedReturnForThis);
        remainingSubtotal += ((item.discountedPrice || item.basePrice || 0) * effQty);
      });
      order.subTotal = remainingSubtotal;  // Set subTotal for consistency
      order.totalAmount = remainingSubtotal + (order.shipping || 0) + (order.tax || 0);

      await order.save();

      // Stock restoration (wrapped for safety)
      try {
        await Promise.all(
          fullCancelledItems.map(async ({ item, cancelQty }) => {
            const product = await Product.findById(item.productId);
            if (product && cancelQty > 0) {

              product.variants.map(v=> {
                if(v.mlSize == item.mlSize){
                  v.stock = (v.stock || 0 ) + cancelQty ;
                }
              })
              await product.save();
            }
          })
        );
      } catch (stockErr) {
        console.error("Stock update error:", stockErr); 
      }

      // Clear session 
      delete req.session.cancelledItems;
      delete req.session.orderId;

      await req.session.save(); 

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
};const confirmReturn = async (req, res) => {
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

    const parsedReturnItems = JSON.parse(returnItemsStr);

    const fullReturnItems = parsedReturnItems
      .map((pi) => {
        const item = order.items.find(
          (i) => i._id.toString() === (pi.item?._id || pi.productId)?.toString()
        );
        if (!item) return null;
        const returnQty = parseInt(pi.returnQty);
        if (returnQty < 1 || returnQty > item.quantity) return null;
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
        const itemTotal = (item.discountedPrice || item.basePrice || 0) * returnQty;
        returnSubtotal += itemTotal;

        // Check for existing return request for this product variant
        let existingReturn = order.returndProduct.find(
          (rp) => rp.productId.toString() === item.productId.toString() && 
                  rp.mlSize === item.mlSize &&
                  rp.adminApproved === "Requested" // Only append to pending requests
        );

        if (existingReturn) {
          // Append to existing pending request
          existingReturn.returndQuantity += returnQty;
          existingReturn.reason = returnReason; // Update reason if needed
          existingReturn.returnedAt = new Date();
        } else {
          // Create new return request
          const returnedProduct = {
            productId: item.productId,
            name: item.name,
            mlSize: item.mlSize,
            basePrice: item.basePrice,
            discountedPrice: item.discountedPrice || 0,
            returndQuantity: returnQty,
            image: item.image,
            reason: returnReason,
            returnedAt: new Date(),
            adminApproved: "Requested", // Set as requested
          };

          order.returndProduct.push(returnedProduct);
        }
      });
      // Add to tracking
      order.tracking.push({
        status: "Return Requested",
        date: new Date(),
        message: `Return request submitted for ${fullReturnItems.length} item(s). Reason: ${returnReason}. Estimated subtotal: ₹${returnSubtotal.toFixed(2)}. Awaiting admin approval.`,
      });

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
  confirmCancel,
  getCancelSelect,
  postCancelSelect,
  getorderInvoce,
  getReturn,
  postReturn,
  confirmReturn,
  getReturnSelect,
  postReturnSelect,
  getSecurity,
  getDeleteAcount,
  userlogOut,
};
