import { Address } from "../../models/addressModel.js";
import Cart from "../../models/cartModel.js";
import { User } from "../../models/userModels.js";
import Order from "../../models/ordersModel.js";
import { nanoid } from "nanoid";
import Products from "../../models/productsModels.js";
// import Wallet from '../../models/walletModel.js'; (Removed)
import { processWalletPayment } from './walletController.js';
import Coupon from "../../models/couponModel.js";
import Offer from "../../models/offerModel.js";

// Get checkout
const getCheckout = async (req, res) => {
  const userEmail = req.session.user;
  if (!userEmail) return res.redirect("/login");

  const user = await User.findOne({ email: userEmail });
  if (!user) return res.redirect("/login");
  
  const cart = await Cart.findOne({ userId: user._id }).populate("items.productId");
  if (!cart) return res.redirect("/cart");
  if (cart.items.length <= 0) {
    req.session.error = "The Cart Does Not Have Any Product To CheckOut";
    return res.redirect("/cart");
  } 

  // Validate Stock before proceeding
  for (const item of cart.items) {
    const product = item.productId;
    if (!product || product.isDeleted || !product.isListed) {
       req.session.error = `Item ${item.name} is currently unavailable.`;
       return res.redirect("/cart");
    }
    const variant = product.variants.find(v => v.mlSize === Number(item.size));
    if (!variant || variant.stock < item.quantity) {
       req.session.error = `Item ${item.name} (Size: ${item.size}) is out of stock.`;
       return res.redirect("/cart");
    }
  }

  const addresses = await Address.find({ userId: user._id , isDeleted:false}); ;

  // Calculate Subtotal with Offers
  let subtotal = 0;
  let total = 0;

  if (cart && cart.items.length > 0) {
      const currentDate = new Date();
      const productIds = cart.items.map(item => item.productId._id);
      const categoryIds = cart.items.map(item => item.productId.category);
       
      const offers = await Offer.find({
        $or: [
          { targetModel: 'Product', targetId: { $in: productIds } },
          { targetModel: 'Categories', targetId: { $in: categoryIds } }
        ],
        isActive: true,
        isDeleted: false,
        startDate: { $lte: currentDate },
        endDate: { $gte: currentDate }
      });

      for (const item of cart.items) {
          const product = item.productId;
          const size = Number(item.size);
          const variant = product.variants.find(v => v.mlSize === size);
          
          let price = item.discountedPrice; // Default
          if (variant) {
               price = variant.basePrice; // Start with fresh base price
               
               let bestOfferDiscount = 0;
               const applicableOffers = offers.filter(offer => 
                  (offer.targetModel === 'Product' && offer.targetId.toString() === product._id.toString()) ||
                  (offer.targetModel === 'Categories' && offer.targetId.toString() === product.category.toString())
               );
               
               if (applicableOffers.length > 0) {
                   applicableOffers.forEach(offer => {
                        let discount = 0;
                        if (offer.discountType === 'flat') {
                            discount = offer.discountValue;
                        } else {
                            discount = (price * offer.discountValue) / 100;
                        }
                        if (discount > bestOfferDiscount) {
                            bestOfferDiscount = discount;
                        }
                   });
                   price = Math.max(0, price - bestOfferDiscount);
               }
          }
          
          subtotal += price * item.quantity;
      }
      total = subtotal + 40; // Add fixed delivery charge
  }

  res.render("user/checkout/selectAddress", {
    cart,
    addresses,
    subtotal,
    total,
  });
};

// Add geolocation
const addGeolocation = async (req, res) => {
  try {
    const addressId = req.params.id;
    const { link } = req.body;

    const address = await Address.findById(addressId);
    address.geolocation = link;

    await address.save();
  } catch (error) {
    console.error(error);
  }
};

// Clear geolocation
const clearGeolocation = async (req, res) => {
  try {
    const addressId = req.params.id;

    const address = await Address.findById(addressId);
    address.geolocation = "";

    await address.save();
  } catch (error) {
    console.error(error);
  }
};

// Add new address
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
    console.error(error);
  }
};

// Get payment page
const getPaymentpage = async (req, res) => {
  try {
    const userEmail = req.session.user;
    const addressId = req.params.id;

    if (!userEmail) return res.redirect("/login");

    const user = await User.findOne({ email: userEmail });
    const cart = await Cart.findOne({ userId: user._id }).populate("items.productId");
    const selectedAddress = await Address.findById(addressId);

    if (!selectedAddress) return res.status(404).send("Address not found");

    if (!cart || cart.items.length === 0) {
        return res.redirect("/cart");
    }

    // Validate Stock before proceeding
    for (const item of cart.items) {
        const product = item.productId;
        if (!product || product.isDeleted || !product.isListed) {
            req.session.error = `Item ${item.name} is currently unavailable.`;
            return res.redirect("/cart");
        }
        const variant = product.variants.find(v => v.mlSize === Number(item.size));
        if (!variant || variant.stock < item.quantity) {
            req.session.error = `Item ${item.name} (Size: ${item.size}) is out of stock.`;
            return res.redirect("/cart");
        }
    }

    res.render("user/checkout/finalChekout", { 
      user, 
      cart, 
      selectedAddress,
      razorpayKey: process.env.RAZORPAY_KEY_ID 
    });
  } catch (error) {
    console.error(error);
    res.redirect("/cart");
  }
};

// Apply coupon
const applyCoupon = async (req, res) => {
  try {
    const { couponCode, subtotal } = req.body;
    const userEmail = req.session.user;

    if (!userEmail) return res.json({ success: false, message: "User not logged in" });

    const coupon = await Coupon.findOne({ code: couponCode, isDeleted: false });

    if (!coupon) {
      return res.json({ success: false, message: "Invalid coupon code" });
    }

    if (!coupon.isActive) {
      return res.json({ success: false, message: "Coupon is inactive" });
    }

    const currentDate = new Date();
    if (currentDate < coupon.startDate || currentDate > coupon.endDate) {
      return res.json({ success: false, message: "Coupon is expired" });
    }

    if (coupon.usageLimit <= 0) {
      return res.json({ success: false, message: "Coupon usage limit reached" });
    }

    if (subtotal < coupon.minCartValue) {
      return res.json({ success: false, message: `Minimum cart value of ${coupon.minCartValue} required` });
    }

    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = (subtotal * coupon.discountValue) / 100;
      if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
        discountAmount = coupon.maxDiscountAmount;
      }
    } else if (coupon.discountType === 'flat') {
      discountAmount = coupon.discountValue;
    }

    // Ensure discount doesn't exceed subtotal
    if (discountAmount > subtotal) {
      discountAmount = subtotal;
    }

    const newTotal = subtotal - discountAmount;

    return res.json({
      success: true,
      message: "Coupon applied successfully",
      discountAmount,
      newTotal,
      couponCode: coupon.code
    });

  } catch (error) {
    console.error("Error applying coupon:", error);
    return res.json({ success: false, message: "Error applying coupon" });
  }
};

// Place order
const placeOrder = async (req, res) => {
  try {
    // Fetch user from session (email-based auth)
    const user = await User.findOne({ email: req.session.user });
    if (!user) {
      return res.status(401).json({ success: false, message: "User not authenticated. Please log in." });
    }

    const { addressId, items, paymentMethod, razorpayPaymentId, razorpayOrderId, couponCode } = req.body;

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

    // Optimize: Fetch all products and active offers at once
    const currentDate = new Date();
    const productIds = items.map(item => item.productId || item._id);
    const uniqueProductIds = [...new Set(productIds)];
    
    // Fetch Products to get fresh prices and validate stock
    const products = await Products.find({ _id: { $in: uniqueProductIds } });
    const productMap = new Map(products.map(p => [p._id.toString(), p]));
    
    // Fetch Active Offers
    const categoryIds = products.map(p => p.category);
    const offers = await Offer.find({
        $or: [
          { targetModel: 'Product', targetId: { $in: uniqueProductIds } },
          { targetModel: 'Categories', targetId: { $in: categoryIds } }
        ],
        isActive: true,
        isDeleted: false,
        startDate: { $lte: currentDate },
        endDate: { $gte: currentDate }
    });

    const validatedItems = [];
    let totalAmount = 0;

    // Pass 1: Validate Stock, Calculate Offer Prices, and Build Items Tuple
    for (const item of items) {
       // Robustly extract product ID: handle both string/ObjectId and populated object (e.g. from cart)
       const productIdVal = item.productId && item.productId._id ? item.productId._id : (item.productId || item._id);
       const productIdStr = productIdVal.toString();
       
       const product = productMap.get(productIdStr);
       
       if (!product || product.isDeleted || !product.isListed) {
           return res.status(400).json({ success: false, message: `Product ${product ? product.name : 'Unknown'} is no longer available.` });
       }
       const size = Number(item.mlSize || item.size);
       const variant = product.variants.find(v => v.mlSize === size);
       if (!variant || variant.stock < item.quantity) {
           return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name} (Size: ${size}).` });
       }

       // Calculate Best Offer for this Item
       let bestOfferDiscount = 0;
       const applicableOffers = offers.filter(offer => 
          (offer.targetModel === 'Product' && offer.targetId.toString() === productIdStr) ||
          (offer.targetModel === 'Categories' && offer.targetId.toString() === product.category.toString())
       );
       
       applicableOffers.forEach(offer => {
            let discount = 0;
            if (offer.discountType === 'flat') {
                discount = offer.discountValue;
            } else {
                discount = (variant.basePrice * offer.discountValue) / 100;
            }
            if (discount > bestOfferDiscount) {
                bestOfferDiscount = discount;
            }
       });

       // Effective Price = Base Price - Offer Discount. 
       // We must also consider the variant.discountedPrice (manual sale) if it's lower than the calculated offer price.
       const calculatedOfferPrice = Math.max(0, variant.basePrice - bestOfferDiscount);
       const manualPrice = variant.discountedPrice || variant.basePrice;
       
       const finalProductPrice = Math.min(calculatedOfferPrice, manualPrice);
       
       totalAmount += finalProductPrice * item.quantity;
       
       validatedItems.push({
           productId: product._id,
           name: product.name,
           mlSize: size,
           quantity: (item.quantity),
           basePrice: variant.basePrice,
           discountedPrice: finalProductPrice, // For calculation
           discoundedPrice: finalProductPrice, // For Schema (typo fix)
           image: item.image || product.images[0] || "",
           productStatus: "Placed"
       });
    }

    let finalDiscountAmount = 0;
    let appliedCouponCode = null;

    // Apply Coupon Logic (on top of total offer price)
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode, isDeleted: false });
      if (coupon && coupon.isActive) {
        if (currentDate >= coupon.startDate && currentDate <= coupon.endDate && coupon.usageLimit > 0) {
           if (totalAmount >= coupon.minCartValue) {
             let discount = 0;
             if (coupon.discountType === 'percentage') {
                discount = (totalAmount * coupon.discountValue) / 100;
                if (coupon.maxDiscountAmount && discount > coupon.maxDiscountAmount) {
                  discount = coupon.maxDiscountAmount;
                }
             } else if (coupon.discountType === 'flat') {
                discount = coupon.discountValue;
             }
             
             if (discount > totalAmount) discount = totalAmount;

             totalAmount -= discount;
             finalDiscountAmount = discount;
             appliedCouponCode = coupon.code;

             const updatedCoupon = await Coupon.findOneAndUpdate(
               { _id: coupon._id, usageLimit: { $gt: 0 } }, 
               { $inc: { usageLimit: -1 } }, 
               { new: true }
             );

             if (!updatedCoupon) {
                 return res.status(400).json({ success: false, message: "Coupon limit reached just now. Please remove it or try another." });
             }

             if (updatedCoupon.usageLimit <= 0) {
                 await Coupon.updateOne({ _id: coupon._id }, { $set: { isActive: false } });
             }
           }
        }
      }
    }

    // Pass 2: Distribute Coupon Discount and Create Mapped Items
    const currentSubtotal = validatedItems.reduce((acc, i) => acc + (i.discountedPrice * i.quantity), 0);

    const mappedItems = validatedItems.map((item) => {
      let itemCouponDiscount = 0;
       if (currentSubtotal > 0 && finalDiscountAmount > 0) {
          itemCouponDiscount = (item.discountedPrice / currentSubtotal) * finalDiscountAmount;
       }
      
      const distinctPaidPrice = Math.max(0, item.discountedPrice - itemCouponDiscount);

      return {
        ...item,
        discountedPrice: distinctPaidPrice,
        discoundedPrice: distinctPaidPrice, // Update legacy typo field too
        couponDiscount: itemCouponDiscount
      };
    });

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
    // Generate Order ID early
    const orderID = `ORD-${nanoid(8)}`;

    // Add Delivery Charge
    const deliveryCharge = 40;
    totalAmount += deliveryCharge;

    // Validate COD Limit
    if (normalizedPaymentMethod === 'cod' && totalAmount > 1000) {
        return res.status(400).json({ success: false, message: "Cash on Delivery is not available for orders above Rs. 1000." });
    }

    // For Wallet: Deduction
    if (normalizedPaymentMethod === 'wallet' || normalizedPaymentMethod === 'Wallet') {
        try {
            await processWalletPayment(user._id, totalAmount, orderID);
            paymentInfo.paymentStatus = 'Paid'; // Mark as paid
        } catch (err) {
             return res.status(400).json({ success: false, message: err.message || "Wallet payment failed" });
        }
    }

    // Create order (use schema defaults; orderStatus always starts as "Placed")
    const newOrder = new Order({
      orderID: orderID,
      userId: user._id,
      address, // Embedded object
      items: mappedItems,
      paymentMethod: normalizedPaymentMethod, // "online", "cod", or "Wallet"
      paymentInfo, // Structured as per schema
      totalAmount,
      discountAmount: finalDiscountAmount,
      deliveryCharge,
      couponCode: appliedCouponCode,
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

    // Increment user stats
    await User.updateOne(
      { _id: user._id },
      { 
        $inc: { 
          totalOrders: 1,
          totalSpent: totalAmount
        } 
      }
    );

    // Decrease stock immediately (for both COD and Online; assumes Products model with variants)
    // Decrease stock immediately using atomic update
    await Promise.all(
      mappedItems.map(async (item) => {
        const mlSizeNum = parseInt(item.mlSize) || 0;
        await Products.updateOne(
          { _id: item.productId, "variants.mlSize": mlSizeNum },
          { $inc: { "variants.$.stock": -item.quantity } }
        );
      })
    );

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

// Get success page
const getSuccessPage = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.session.user });
    if (!user) return res.redirect("/login");

    if (!req.session.orderplaced) return res.redirect("/cart");

    // Decrease stock for the latest placed order
    // Stock deduction is handled in placeOrder. Removing duplicate logic here.

    await Cart.deleteMany({ userId: user._id });

    delete req.session.orderplaced;
    res.render("user/checkout/succuss");
  } catch (error) {
    console.error(error)
  }
};
// Get failed page
const getFailedPage = async (req, res) => {
  const user = await User.findOne({ email: req.session.user });
  if (!user) return res.redirect("/login");

  const errorMessage = req.query.error ? decodeURIComponent(req.query.error) : null;
  const errorType = req.query.type ? decodeURIComponent(req.query.type) : null;
  const deleteCart = req.query.deleteCart === 'true';
  const addressId = req.query.addressId || null;

  if (!errorMessage && !req.session.orderplaced) {  // Fallback: require one or the other
    return res.redirect("/cart");
  }

  // Only delete cart on "hard" failures (as passed via query)
  if (deleteCart) {
    await Cart.deleteMany({ userId: user._id });
  }

  // Clear any lingering session flags to avoid stale state
  // Clear any lingering session flags to avoid stale state
  req.session.orderplaced = false;

  res.render("user/checkout/failed", { errorMessage, errorType, addressId });
};

export {
  getCheckout,
  addGeolocation,
  clearGeolocation,
  addNewAddress,
  getPaymentpage,
  // getWalletBalanceAPI, (Removed)
  placeOrder,
  getSuccessPage,
  getFailedPage,
  applyCoupon,
};
