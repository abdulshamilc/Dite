import crypto from "crypto";
import razorpay from '../../config/razorpay.js';
import {User} from '../../models/userModels.js'
import Wallet from "../../models/walletModel.js";
import Order from "../../models/ordersModel.js";
import Cart from "../../models/cartModel.js";
import Products from "../../models/productsModels.js";

// Create Razorpay Order (for /createOrder)
const createRazorpayOrder = async (req, res) => {
  try {
    // Fetch user from session (same as in placeOrder)
    const user = await User.findOne({ email: req.session.user });
    if (!user) {
      console.error("Payment Error [Anonymous User]: User not authenticated");
      return res.status(401).json({ success: false, message: "User not authenticated. Please log in." });
    }
    const { amount } = req.body;
    if (!amount || amount < 1) {
      console.error(`Payment Error [User: ${user._id}]: Invalid amount ${amount}`);
      return res.status(400).json({ success: false, message: "Order amount too low (min Rs. 1)." });
    }

    // Pre-Payment Stock Validation
    const cart = await Cart.findOne({ userId: user._id }).populate("items.productId");
    if (cart && cart.items.length > 0) {
        for (const item of cart.items) {
            const product = await Products.findById(item.productId._id);
            if (!product || product.isDeleted || !product.isListed) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Product ${product ? product.name : 'Unknown'} is currently unavailable.` 
                });
            }
            const variant = product.variants.find(v => v.mlSize === Number(item.size));
            if (!variant) {
                 return res.status(400).json({ 
                    success: false, 
                    message: `Variant (Size: ${item.size}) for ${product.name} is no longer available.` 
                });
            }
            if (variant.stock < item.quantity) {
                 return res.status(400).json({ 
                    success: false, 
                    message: `Sorry, only ${variant.stock} units of ${product.name} (Size: ${item.size}) are left in stock.` 
                });
            }
        }
    }
    
    // Create Razorpay order (amount in paise)
    const order = await razorpay.orders.create({
      amount: amount * 100, // Convert rupees to paise
      currency: 'INR',
      receipt: "rcpt_" + Date.now().toString(),
      notes: {
        userId: user._id.toString()
      }
    });
    return res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount, // In paise—your frontend expects this
        currency: order.currency
      }
    });
  } catch (error) {
    console.error(`Payment Error [User: ${user?._id || 'anonymous'}]:`, error);
    res.status(500).json({ success: false, message: "Server error: Failed to create Razorpay order. Please try again later." });
  }
};

// Verify Razorpay Payment (for /verifyPayment)
const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      console.error("Payment Error [Missing Details]: Invalid payment data");
      return res.status(400).json({ success: false, message: "Missing payment details for verification." });
    }
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    if (expectedSignature === razorpay_signature) {
      return res.json({ success: true });
    } else {
      console.error(`Payment Error [Signature Mismatch]: Invalid signature for payment ${razorpay_payment_id}`);
      return res.status(400).json({ success: false, message: "Invalid payment signature. Payment may be tampered." });
    }
  } catch (error) {
    console.error("Payment Error [Verification]:", error);
    return res.status(500).json({ success: false, message: "Server error: Payment verification failed. Contact support." });
  }
};

// addFundsToWallet removed and moved to walletController.js

// Retry Payment: Create Razorpay Order for Existing DB Order
const retryPaymentOrder = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.session.user });
    if (!user) return res.status(401).json({ success: false, message: "Authentication required" });

    const orderId = req.params.id;
    const order = await Order.findById(orderId);

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (order.userId.toString() !== user._id.toString()) return res.status(403).json({ success: false, message: "Unauthorized" });

    if (order.paymentInfo.paymentStatus === 'Paid') {
      return res.status(400).json({ success: false, message: "Order is already paid" });
    }
    
    // Create Razorpay order
    // Ensure amount is integer paise
    const amountInPaise = Math.round(order.totalAmount * 100);
    
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `retry_${order._id.toString()}`,
      notes: {
        orderId: order._id.toString(),
        userId: user._id.toString()
      }
    });

    res.json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID,
      order: razorpayOrder,
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });

  } catch (error) {
    console.error("Retry Payment Creation Error:", error);
    res.status(500).json({ success: false, message: "Failed to initiate retry payment" });
  }
};

// Verify Retry Payment
const verifyRetryPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, orderId } = req.body;

    const signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (signature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid payment signature" });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    // Update order
    order.paymentInfo.paymentStatus = 'Paid';
    order.paymentInfo.razorpayPaymentId = razorpay_payment_id;
    order.paymentInfo.paymentTime = new Date();
    
    // If it was failed/pending, move to Placed
    if (order.orderStatus === 'Placed' || order.orderStatus === 'Pending') { // Or if it was marked as something else indicating failure
        order.orderStatus = 'Placed'; 
    }

    // Add info to tracking
    order.tracking.push({
      status: "Payment Retry Success",
      date: new Date(),
      message: `Payment retried and successful via Razorpay (ID: ${razorpay_payment_id})`
    });

    await order.save();

    res.json({ success: true, message: "Payment successful" });

  } catch (error) {
    console.error("Verify Retry Error:", error);
    res.status(500).json({ success: false, message: "Payment verification failed" });
  }
};

export {
    createRazorpayOrder,
    verifyRazorpayPayment,
    // addFundsToWallet, (Removed)
    retryPaymentOrder,
    verifyRetryPayment
}