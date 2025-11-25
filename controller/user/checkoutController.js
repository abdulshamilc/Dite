import { Address } from "../../models/addressModel.js";
import Cart from "../../models/cartModel.js";
import { User } from "../../models/userModels.js";
import Order from "../../models/ordersModel.js";
import { nanoid } from "nanoid";
import Products from "../../models/productsModels.js";

const getCheckout = async (req, res) => {
  const userEmail = req.session.user;
  if (!userEmail) return res.redirect("/login");

  const user = await User.findOne({ email: userEmail });
  if (!user) return res.redirect("/login");
  const cart = await Cart.findOne({ userId: user._id });
  if (!cart) return res.redirect("/cart");
  if (cart.items.length <= 0) {
    req.session.error = "The Cart Does Not Have Any Product To CheckOut";
    return res.redirect("/cart");
  }
  const addresses = await Address.find({ userId: user._id , isDeleted:false}); ;

  let subtotal = 0;
  let total = 0;
  if (cart && cart.items.length > 0) {
    subtotal = cart.items.reduce(
      (acc, item) => acc + item.basePrice * item.quantity,
      0
    );
    total = subtotal;
  }

  res.render("user/checkout/selectAddress", {
    cart,
    addresses,
    subtotal,
    total,
  });
};

const addGeolocation = async (req, res) => {
  try {
    const addressId = req.params.id;
    const { link } = req.body;

    const address = await Address.findById(addressId);
    address.geolocation = link;

    await address.save();
  } catch (error) {
    console.log(error);
  }
};

const clearGeolocation = async (req, res) => {
  try {
    const addressId = req.params.id;

    const address = await Address.findById(addressId);
    address.geolocation = "";

    await address.save();
  } catch (error) {
    console.log(error);
  }
};

const addNewAddress = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) res.redirect("/login");
    const {
      fullName,
      phone,
      altPhone,
      hoNo,
      street,
      city,
      state,
      pin,
      country,
    } = req.body;
    const user = await User.findOne({ email: userEmail });
    const existingAddress = await Address.findOne({
      userId: user._id,
      fullName,
      phone,
      altPhone,
      hoNo,
      street,
      city,
      state,
      pin,
      country,
    });

    if (existingAddress) {
      return res.redirect("/checkout/address");
    }

    const newAddress = new Address({
      userId: user._id,
      fullName,
      phone,
      altPhone: altPhone || null,
      hoNo,
      street,
      city,
      state,
      pin,
      country,
    });

    await newAddress.save();

    res.redirect("/checkout/address");
  } catch (error) {
    console.log(error);
  }
};

const getPaymentpage = async (req, res) => {
  try {
    const userEmail = req.session.user;
    const addressId = req.params.id;

    if (!userEmail) return res.redirect("/login");

    const user = await User.findOne({ email: userEmail });
    const cart = await Cart.findOne({ userId: user._id });
    const selectedAddress = await Address.findById(addressId);

    if (!selectedAddress) return res.status(404).send("Address not found");

    res.render("user/checkout/finalChekout", { user, cart, selectedAddress });
  } catch (error) {
    console.log(error);
  }
};const placeOrder = async (req, res) => {
  try {
    // Fetch user from session (email-based auth)
    const user = await User.findOne({ email: req.session.user });
    if (!user) {
      return res.status(401).json({ success: false, message: "User not authenticated. Please log in." });
    }

    const { addressId, items, paymentMethod, razorpayPaymentId, razorpayOrderId } = req.body;

    // Validation
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: "No items in order" });
    }
    if (!addressId) {
      return res.status(400).json({ success: false, message: "Missing address" });
    }

    // Fetch and validate address
    const selectedAddress = await Address.findById(addressId);
    if (!selectedAddress || selectedAddress.userId.toString() !== user._id.toString()) {
      return res.status(404).json({ success: false, message: "Invalid or unauthorized address" });
    }
    // Convert to plain object for embedding (remove MongoDB metadata)
    const address = selectedAddress.toObject();
    delete address._id;
    delete address.__v;

    // Calculate totalAmount (prioritize discountedPrice if available)
    const totalAmount = items.reduce((acc, item) => {
      const price = item.discountedPrice || item.basePrice || 0;
      return acc + (price * item.quantity);
    }, 0);

    // Map items to schema format (fix field names, add defaults)
    const mappedItems = items.map((item) => ({
      productId: item.productId || item._id, // Fallback if needed
      name: item.name,
      mlSize: item.mlSize || item.size, // Map size to mlSize
      basePrice: item.basePrice || 0,
      discountedPrice: item.discountedPrice || item.basePrice || 0, // Fixed: Use 'discountedPrice' (update schema too!)
      quantity: item.quantity,
      image: item.image || "",
      productStatus: "Placed" // Default as per schema
    }));

    // Normalize paymentMethod to schema enum (map 'razorpay' to 'online')
    const normalizedPaymentMethod = paymentMethod === 'razorpay' ? 'online' : paymentMethod;

    // Prepare paymentInfo as per schema
    const paymentInfo = {
      paymentStatus: normalizedPaymentMethod === 'online' ? 'Paid' : 'Pending',
      paymentTime: new Date()
    };
    if (normalizedPaymentMethod === 'online') {
      if (!razorpayPaymentId || !razorpayOrderId) {
        return res.status(400).json({ success: false, message: "Missing payment details for online payment" });
      }
      paymentInfo.razorpayPaymentId = razorpayPaymentId;
      paymentInfo.razorpayOrderId = razorpayOrderId; // Requires schema field: razorpayOrderId: { type: String }
    }
    // For Wallet: Add deduction logic here if needed (e.g., update user.wallet -= totalAmount)

    // Create order (use schema defaults; orderStatus always starts as "Placed")
    const newOrder = new Order({
      orderID: `ORD-${nanoid(8)}`, // Custom ID as in your code
      userId: user._id,
      address, // Embedded object
      items: mappedItems,
      paymentMethod: normalizedPaymentMethod, // "online", "cod", or "Wallet"
      paymentInfo, // Structured as per schema
      totalAmount,
      orderStatus: "Placed", // Schema default; separate from paymentStatus
      tracking: [
        {
          status: "Placed",
          message: `Your order has been placed successfully`,
          date: new Date() // Add date as per schema
        }
      ],
      placedAt: new Date()
    });

    await newOrder.save();

    // Decrease stock immediately (for both COD and Online; assumes Products model with variants)
    for (const item of mappedItems) {
      const product = await Products.findById(item.productId);
      if (product && product.variants) {
        const mlSizeNum = parseInt(item.mlSize) || 0;
        const variantIndex = product.variants.findIndex(v => v.mlSize === mlSizeNum);
        if (variantIndex !== -1 && product.variants[variantIndex].stock >= item.quantity) {
          product.variants[variantIndex].stock -= item.quantity;
          await product.save();
        } else {
          console.warn(`Stock insufficient for product ${item.productId}, variant ${mlSizeNum}`);
          // Optional: Rollback order or mark as backordered
        }
      }
    }

    // Clear user's cart (use findOneAndUpdate for safety; assumes single cart per user)
    await Cart.findOneAndUpdate(
      { userId: user._id },
      { $set: { items: [] } },
      { upsert: true }
    );

    // Set session flag for success page
    req.session.orderplaced = true;
    req.session.orderId = newOrder.orderID; // Optional: Pass order ID for success page

    res.json({ 
      success: true, 
      message: "Order placed successfully", 
      orderId: newOrder.orderID // Return for frontend redirect if needed
    });

  } catch (error) {
    console.error("Error in placeOrder:", error);
    res.status(500).json({ success: false, message: "Internal server error. Please try again." });
  }
};

const getSuccessPage = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.session.user });
    if (!user) return res.redirect("/login");

    if (!req.session.orderplaced) return res.redirect("/cart");

    // Decrease stock for the latest placed order
    const latestOrder = await Order.findOne({ userId: user._id }).sort({ placedAt: -1 });
    if (latestOrder && latestOrder.orderStatus === "Placed") {
      for (const item of latestOrder.items) {
        const product = await Products.findById(item.productId);
        if (product && product.variants) {
          const mlSizeNum = parseInt(item.mlSize);
          const variantIndex = product.variants.findIndex(v => v.mlSize === mlSizeNum);
          if (variantIndex !== -1) {
            product.variants[variantIndex].stock -= item.quantity;
            await product.save();
          }
        }
      }
    }

    await Cart.deleteMany({ userId: user._id });

    delete req.session.orderplaced;
    res.render("user/checkout/succuss");
  } catch (error) {
    console.log(error)
  }
};const getFailedPage = async (req, res) => {
  const user = await User.findOne({ email: req.session.user });
  if (!user) return res.redirect("/login");

  const errorMessage = req.query.error ? decodeURIComponent(req.query.error) : null;
  const errorType = req.query.type ? decodeURIComponent(req.query.type) : null;
  const deleteCart = req.query.deleteCart === 'true';

  if (!errorMessage && !req.session.orderplaced) {  // Fallback: require one or the other
    return res.redirect("/cart");
  }

  // Only delete cart on "hard" failures (as passed via query)
  if (deleteCart) {
    await Cart.deleteMany({ userId: user._id });
  }

  // Clear any lingering session flags to avoid stale state
  req.session.orderplaced = false;
  req.session.regenerate((err) => {
    if (err) console.error('Session regeneration error:', err);
  });

  res.render("user/checkout/failed", { errorMessage, errorType });
};

export {
  getCheckout,
  addGeolocation,
  clearGeolocation,
  addNewAddress,
  getPaymentpage,
  placeOrder,
  getSuccessPage,
  getFailedPage,
};
