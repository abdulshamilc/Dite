import crypto from "crypto";
import razorpay from '../../config/razorpay.js';
import {User} from '../../models/userModels.js'
import Wallet from "../../models/walletModel.js";

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

const addFundsToWallet = async (req, res) => {
  try {
    // Fetch user from session
    const user = await User.findOne({ email: req.session.user });
    if (!user) {
      console.error("Wallet Error [Anonymous User]: User not authenticated");
      return res.status(401).json({ success: false, message: "User not authenticated. Please log in." });
    }
    const { amount, razorpayPaymentId, razorpayOrderId } = req.body;
    if (!amount || amount < 100) { // Minimum 100 as per frontend
      console.error(`Wallet Error [User: ${user._id}]: Invalid amount ${amount}`);
      return res.status(400).json({ success: false, message: "Amount too low (min Rs. 100)." });
    }
    if (!razorpayPaymentId || !razorpayOrderId) {
      console.error(`Wallet Error [User: ${user._id}]: Missing payment details`);
      return res.status(400).json({ success: false, message: "Missing payment details." });
    }
    // Find or create user's wallet
    let wallet = await Wallet.findOne({ user: user._id });
    if (!wallet) {
      wallet = new Wallet({
        user: user._id,
        balance: 0,
        transactions: []
      });
    }
    // Update balance
    const oldBalance = wallet.balance;
    wallet.balance += amount;
    // Add transaction
    wallet.transactions.unshift({
      description: `Added funds via Razorpay (Payment ID: ${razorpayPaymentId})`,
      amount: amount,
      date: new Date()
    });
    // Optionally limit transactions array to last 100 or so
    if (wallet.transactions.length > 100) {
      wallet.transactions = wallet.transactions.slice(0, 100);
    }
    await wallet.save();
    console.log(`Wallet Updated [User: ${user._id}]: Added ₹${amount} (Old: ₹${oldBalance}, New: ₹${wallet.balance})`);
    return res.json({
      success: true,
      message: "Funds added successfully to your wallet!",
      balance: wallet.balance
    });
  } catch (error) {
    console.error(`Wallet Error [User: ${req.session.user}]:`, error);
    return res.status(500).json({ success: false, message: "Server error: Failed to add funds. Please contact support." });
  }
};



export {
    createRazorpayOrder,
    verifyRazorpayPayment,
    addFundsToWallet,
}