import { Address } from "../../models/addressModel.js";
import Cart from "../../models/cartModel.js";
import { User } from "../../models/userModels.js";
import Order from "../../models/ordersModel.js";
import { nanoid } from "nanoid";
import Products from "../../models/productsModels.js";
import { processWalletPayment } from './walletController.js';
import Coupon from "../../models/couponModel.js";
import Offer from "../../models/offerModel.js";
import Notification from "../../models/notificationModel.js";
import { SUCCESS_MESSAGES, ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";

// Get checkout
const getCheckout = async (req, res) => {
  const userEmail = req.session.user;
  if (!userEmail) return res.redirect("/login");

  const user = await User.findOne({ email: userEmail });
  if (!user) return res.redirect("/login");
  
  const cart = await Cart.findOne({ userId: user._id }).populate("items.productId");
  if (!cart) return res.redirect("/cart");
  if (cart.items.length <= 0) {
    req.session.error = ERROR_MESSAGES.CART_EMPTY;
    return res.redirect("/cart");
  } 

  // Validate Stock & Availability
  for (const item of cart.items) {
    const product = item.productId;
    if (!product || product.isDeleted || !product.isListed) {
       req.session.error = `Product ${item.name} is currently unavailable. Please remove it to proceed.`;
       return req.session.save(() => res.redirect("/cart"));
    }
    const variant = product.variants.find(v => v.mlSize === Number(item.size));
    if (!variant) {
        req.session.error = `Variant for ${item.name} (Size: ${item.size}) is unavailable.`;
        return req.session.save(() => res.redirect("/cart"));
    }
    if (variant.stock < item.quantity) {
       req.session.error = `Product ${item.name} (Size: ${item.size}) is out of stock.`;
       return req.session.save(() => res.redirect("/cart"));
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
               
               // Apply manual variant discount if lower (e.g. Sale Price)
               const manualPrice = variant.discountedPrice || variant.basePrice;
               price = Math.min(price, manualPrice);
          }
          
          item.discountedPrice = price;
          subtotal += price * item.quantity;
      }
      await cart.save();
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

    if (!selectedAddress) return res.status(HTTP_STATUS.NOT_FOUND).send(ERROR_MESSAGES.ADDRESS_NOT_FOUND);

    if (!cart || cart.items.length === 0) {
        return res.redirect("/cart");
    }

    // Validate Stock & Availability
    for (const item of cart.items) {
        const product = item.productId;
        if (!product || product.isDeleted || !product.isListed) {
            req.session.error = `Product ${item.name} is currently unavailable. Please remove it to proceed.`;
            return req.session.save(() => res.redirect("/cart"));
        }
        const variant = product.variants.find(v => v.mlSize === Number(item.size));
        if (!variant) {
            req.session.error = `Variant for ${item.name} (Size: ${item.size}) is unavailable.`;
            return req.session.save(() => res.redirect("/cart"));
        }
        if (variant.stock < item.quantity) {
            req.session.error = `Product ${item.name} (Size: ${item.size}) is out of stock.`;
            return req.session.save(() => res.redirect("/cart"));
        }
    }

    // Recalculate Prices & Update Cart before rendering (Fix for Admin price changes not reflecting)
    let subtotal = 0;
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
            
            let price = item.discountedPrice; 
            if (variant) {
                price = variant.basePrice; 
                
                let bestOfferDiscount = 0;
                const applicableOffers = offers.filter(offer => 
                    (offer.targetModel === 'Product' && offer.targetId.toString() === product._id.toString()) ||
                    (offer.targetModel === 'Categories' && offer.targetId.toString() === product.category.toString())
                );
                
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

                // Apply manual variant discount if lower (e.g. Sale Price)
                const manualPrice = variant.discountedPrice || variant.basePrice;
                price = Math.min(price, manualPrice);
            }
            item.discountedPrice = price;
            subtotal += price * item.quantity;
        }
        await cart.save();
    }

    // Fetch available coupons matched with minCartValue
    const currentDate = new Date();
    const coupons = await Coupon.find({
      isActive: true,
      isDeleted: false,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
      minCartValue: { $lte: subtotal }
    });

    res.render("user/checkout/finalChekout", { 
      user, 
      cart, 
      selectedAddress,
      razorpayKey: process.env.RAZORPAY_KEY_ID,
      coupons 
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

    if (!userEmail) return res.json({ success: false, message: ERROR_MESSAGES.LOGIN_REQUIRED });

    const coupon = await Coupon.findOne({ code: couponCode, isDeleted: false });

    if (!coupon) {
      return res.json({ success: false, message: ERROR_MESSAGES.INVALID_COUPON });
    }

    if (!coupon.isActive) {
      return res.json({ success: false, message: ERROR_MESSAGES.COUPON_INACTIVE });
    }

    const currentDate = new Date();
    if (currentDate < coupon.startDate || currentDate > coupon.endDate) {
      return res.json({ success: false, message: ERROR_MESSAGES.COUPON_EXPIRED });
    }

    if (coupon.usageLimit <= 0) {
      return res.json({ success: false, message: ERROR_MESSAGES.COUPON_USAGE_LIMIT });
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
      message: SUCCESS_MESSAGES.COUPON_APPLIED,
      discountAmount,
      newTotal,
      couponCode: coupon.code
    });

  } catch (error) {
    console.error("Error applying coupon:", error);
    return res.json({ success: false, message: ERROR_MESSAGES.COUPON_APPLY_ERROR });
  }
};

// Place order
const placeOrder = async (req, res) => {
  try {
    // Fetch user from session
    const user = await User.findOne({ email: req.session.user });
    if (!user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, message: ERROR_MESSAGES.UNAUTHORIZED_ACCESS });
    }

    const { addressId, items, paymentMethod, razorpayPaymentId, razorpayOrderId, couponCode } = req.body;

    // Basic Validation
    if (!items || items.length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: ERROR_MESSAGES.NO_ITEMS_IN_ORDER });
    }
    if (!addressId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: ERROR_MESSAGES.MISSING_ADDRESS });
    }

    // Address Validation
    const selectedAddress = await Address.findById(addressId);
    if (!selectedAddress || selectedAddress.userId.toString() !== user._id.toString()) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: ERROR_MESSAGES.INVALID_ADDRESS });
    }
    const address = selectedAddress.toObject();
    delete address._id;
    delete address.__v;

    // ===== DATA PREPARATION =====
    const currentDate = new Date();
    const productIds = items.map(item => item.productId || item._id);
    const uniqueProductIds = [...new Set(productIds)];
    
    // Fetch Products & Offers
    const products = await Products.find({ _id: { $in: uniqueProductIds } });
    const productMap = new Map(products.map(p => [p._id.toString(), p]));
    
    const categoryIds = products.map(p => p.category);
    const applicableOffers = await Offer.find({
        $or: [
          { targetModel: 'Product', targetId: { $in: uniqueProductIds } },
          { targetModel: 'Categories', targetId: { $in: categoryIds } }
        ],
        isActive: true,
        isDeleted: false,
        startDate: { $lte: currentDate },
        endDate: { $gte: currentDate }
    });

    // ===== STEP 1: PRICE ENGINE (Calculate Offer Price) =====
    const validatedItems = [];
    let orderSubtotal = 0;

    for (const item of items) {
       // Handle ID variations
       const productIdVal = item.productId && item.productId._id ? item.productId._id : (item.productId || item._id);
       const productIdStr = productIdVal.toString();
       const product = productMap.get(productIdStr);

       if (!product || product.isDeleted || !product.isListed) {
           return res.status(400).json({ success: false, message: `Product ${product ? product.name : 'Unknown'} is unavailable.` });
       }

       const mlSize = Number(item.mlSize || item.size);
       const variant = product.variants.find(v => v.mlSize === mlSize);
       
       if (!variant) {
           return res.status(400).json({ success: false, message: `Variant (Size: ${mlSize}) for ${product.name} is unavailable.` });
       }
       if (variant.stock < item.quantity) {
           return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name} (Size: ${mlSize}). Only ${variant.stock} left.` });
       }

       let offerPrice = variant.basePrice;

       // Find best offer
       let bestOffer = 0;
       const itemOffers = applicableOffers.filter(offer => 
          (offer.targetModel === 'Product' && offer.targetId.toString() === productIdStr) ||
          (offer.targetModel === 'Categories' && offer.targetId.toString() === product.category.toString())
       );

       itemOffers.forEach(offer => {
            const discount = offer.discountType === 'flat'
              ? offer.discountValue
              : (variant.basePrice * offer.discountValue) / 100;
            bestOffer = Math.max(bestOffer, discount);
       });

       offerPrice = Math.max(0, offerPrice - bestOffer);

       // Apply manual sale price if better
       // Note: variant.discountedPrice might be 0 or undefined, check properly
       if (variant.discountedPrice && variant.discountedPrice < variant.basePrice) {
          offerPrice = Math.min(offerPrice, variant.discountedPrice);
       }

       orderSubtotal += offerPrice * item.quantity;

       validatedItems.push({
           productId: product._id,
           name: product.name,
           mlSize: mlSize.toString(), // Ensure string for consistency
           image: item.image || product.images[0] || "",
           
           basePrice: variant.basePrice,
           offerPrice,
           
           orderedQty: item.quantity,
           // Will set paidUnitPrice and couponPerUnit in next pass
       });
    }

    // ===== STEP 2: COUPON APPLICATION (Once) =====
    let couponDiscountTotal = 0;
    let appliedCouponCode = null;
    let appliedCouponMinCart = 0;

    if (couponCode) {
        const coupon = await Coupon.findOne({ code: couponCode, isDeleted: false });
        // Validate coupon
        if (coupon && coupon.isActive && 
            currentDate >= coupon.startDate && currentDate <= coupon.endDate && 
            coupon.usageLimit > 0 && orderSubtotal >= coupon.minCartValue) {
            
             let calculatedDiscount = 0;
             if (coupon.discountType === 'percentage') {
                calculatedDiscount = (orderSubtotal * coupon.discountValue) / 100;
                if (coupon.maxDiscountAmount) {
                    calculatedDiscount = Math.min(calculatedDiscount, coupon.maxDiscountAmount);
                }
             } else {
                calculatedDiscount = coupon.discountValue;
             }
             
             couponDiscountTotal = Math.min(calculatedDiscount, orderSubtotal);
             appliedCouponCode = coupon.code;
             appliedCouponMinCart = coupon.minCartValue;

             // Decrement Usage
             await Coupon.findByIdAndUpdate(coupon._id, { $inc: { usageLimit: -1 } });
        }
    }

    // ===== STEP 3: FREEZE FINAL PAID PRICES (Immutable Record) =====
    const finalItems = validatedItems.map(item => {
        const itemTotal = item.offerPrice * item.orderedQty;
        // Distribute coupon proportionally: (Item Share / Total Subtotal) * Total Coupon Discount
        const share = orderSubtotal > 0 ? (itemTotal / orderSubtotal) * couponDiscountTotal : 0;
        const couponPerUnit = item.orderedQty > 0 ? (share / item.orderedQty) : 0;
        
        const paidUnitPrice = Number(Math.max(0, item.offerPrice - couponPerUnit).toFixed(2));

        return {
            ...item,
            couponPerUnit,
            paidUnitPrice,
            
            // Map to schema expectations
            activeQty: item.orderedQty,
            quantity: item.orderedQty,           // Legacy support
            discountedPrice: paidUnitPrice,      // Legacy support (paid price)
            discoundedPrice: paidUnitPrice,      // Legacy support (typo version)
            couponDiscount: couponPerUnit * item.orderedQty, // Legacy: Line total coupon
            productStatus: 'Placed'
        };
    });

    // ===== STEP 4: ORDER TOTAL (Final) =====
    const deliveryCharge = 40;
    // Recalculate total strictly from paidUnitPrices to avoid rounding gaps
    const finalTotal = finalItems.reduce(
        (sum, i) => sum + (i.paidUnitPrice * i.orderedQty),
        0
    ) + deliveryCharge;


    // ===== STEP 5: SAVE ORDER =====
    const normalizedPaymentMethod = paymentMethod === 'razorpay' ? 'online' : paymentMethod;
    const orderID = `ORD-${nanoid(8)}`;

    const paymentInfo = {
        paymentStatus: normalizedPaymentMethod === 'online' ? 'Paid' : 'Pending',
        paymentTime: new Date()
    };
    if (normalizedPaymentMethod === 'online') {
         if (!razorpayPaymentId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: ERROR_MESSAGES.PAYMENT_FAILED });
         paymentInfo.razorpayPaymentId = razorpayPaymentId;
         paymentInfo.razorpayOrderId = razorpayOrderId;
    }

    // COD Validation
    if (normalizedPaymentMethod === 'cod' && finalTotal > 1000) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: ERROR_MESSAGES.COD_LIMIT_EXCEEDED });
    }

    // Wallet Deduction
    if (normalizedPaymentMethod === 'wallet' || normalizedPaymentMethod === 'Wallet') {
         await processWalletPayment(user._id, finalTotal, orderID);
         paymentInfo.paymentStatus = 'Paid';
    }

    const newOrder = new Order({
        orderID,
        userId: user._id,
        address,
        items: finalItems,
        
        paymentMethod: normalizedPaymentMethod,
        paymentInfo,
        
        totalAmount: finalTotal,
        discountAmount: couponDiscountTotal,
        deliveryCharge,
        couponCode: appliedCouponCode,
        couponMinCartValue: appliedCouponMinCart,
        orderStatus: 'Placed',
        
        placedAt: new Date(),
        tracking: [{ status: 'Placed', message: SUCCESS_MESSAGES.ORDER_PLACED, date: new Date() }]
    });

    await newOrder.save();

    // ===== POST-SAVE OPERATIONS =====
    
    // 1. Stock Update
    // Using mapping to update variants safely
    for (const item of finalItems) {
        await Products.updateOne(
            { _id: item.productId, "variants.mlSize": Number(item.mlSize) },
            { $inc: { "variants.$.stock": -item.orderedQty } }
        );
        
        // Check low stock
        // (Optional: Re-fetch or trust memory, for now simplistic check)
    }

    // 2. Clear Cart
    await Cart.findOneAndUpdate({ userId: user._id }, { $set: { items: [] } });

    // 3. User Stats
    await User.findByIdAndUpdate(user._id, { 
        $inc: { totalOrders: 1, totalSpent: finalTotal } 
    });

    delete req.session.checkoutBackup;
    req.session.orderplaced = true;
    req.session.orderId = orderID;

    res.json({ success: true, message: SUCCESS_MESSAGES.ORDER_PLACED, orderId: orderID });

  } catch (error) {
    console.error("Place Order Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: ERROR_MESSAGES.INTERNAL_ERROR });
  }
};

// Get success page
const getSuccessPage = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.session.user });
    if (!user) return res.redirect("/login");

    if (!req.session.orderplaced) return res.redirect("/cart");

    // Stock deduction is handled in placeOrder. 

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

  if (!errorMessage && !req.session.orderplaced) { 
    return res.redirect("/cart");
  }

  // Only delete cart on "hard" failures (as passed via query)
  if (deleteCart) {
    await Cart.deleteMany({ userId: user._id });
  }

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
  placeOrder,
  getSuccessPage,
  getFailedPage,
  applyCoupon,
};
