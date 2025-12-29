import { User } from "../../models/userModels.js";
import Wallet from "../../models/walletModel.js";

// Get wallet
const getWallet = async (req, res) => {
  // User validation
  if (!req.session.user) {
    req.session.error = 'Please log in to access your wallet.';
    return res.redirect('/login'); 
  }

  try {
    const userEmail = req.session.user;
    const user = await User.findOne({ email: userEmail });

    if (!user) {
      req.session.error = 'User not found. Please log in again.';
      return res.redirect('/login');
    }

    const userId = user._id;

    // Find or create wallet
    let wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      wallet = new Wallet({ user: userId });
      await wallet.save();
    }

    // Limit transactions 
    const recentTransactions = wallet.transactions ? wallet.transactions.slice(0,10) : [];

    const success = req.session.success;
    const error = req.session.error;
    
    delete req.session.success;
    delete req.session.error;

    res.render('user/profile/wallet/wallet', { 
      wallet: {
        balance: wallet.balance,
        transactions: recentTransactions
      },
      user: user, 
      currentPath: req.path,
      success,
      error
    });
  } catch (err) {
    console.error('Error fetching wallet:', err);
    req.session.error = 'Failed to load wallet. Please try again.';
    res.redirect('/profile'); 
  }
};

// Get wallet history
const getWalletHistory = async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  try {
    const user = await User.findOne({ email: req.session.user });
    if (!user) return res.redirect('/login');

    const wallet = await Wallet.findOne({ user: user._id });
    
    // Pagination
    let page = parseInt(req.query.page) || 1;
    const limit = 10;
    if (page < 1) page = 1;

    let transactions = [];
    let totalPages = 0;

    if (wallet && wallet.transactions) {
        const totalTx = wallet.transactions.length;
        totalPages = Math.ceil(totalTx / limit);
        if (page > totalPages && totalPages > 0) page = totalPages;

        const skip = (page - 1) * limit;
        transactions = wallet.transactions.slice(skip, skip + limit);
    } else {
       transactions = [];
    }

    res.render('user/profile/wallet/walletHistory', {
        user,
        wallet: wallet || { balance: 0 },
        transactions,
        currentPage: page,
        totalPages,
        currentPath: '/wallet/history' 
    });

  } catch (error) {
    console.error("Wallet History Error:", error);
    res.status(500).send("Server Error");
  }
};

// Add funds
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
      type: 'credit',
      source: 'add_funds',
      date: new Date()
    });
    // Limit transactions
    if (wallet.transactions.length > 100) {
      wallet.transactions = wallet.transactions.slice(0, 100);
    }
    await wallet.save();

    
    // Set success message for reload
    req.session.success = "Funds added successfully to your wallet!";
    await new Promise((resolve, reject) => {
        req.session.save((err) => {
            if (err) reject(err);
            else resolve();
        });
    });

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

// Get wallet balance
const getWalletBalanceAPI = async (req, res) => {
  try {
    if (!req.session.user) return res.json({ balance: 0 });
    const user = await User.findOne({ email: req.session.user });
    if (!user) return res.json({ balance: 0 });
    const wallet = await Wallet.findOne({ user: user._id });
    return res.json({ balance: wallet ? wallet.balance : 0 });
  } catch (error) {
    return res.json({ balance: 0 });
  }
};

// Process wallet payment
const processWalletPayment = async (userId, amount, orderID) => {
    const wallet = await Wallet.findOne({ user: userId });
    
    if (!wallet) {
        throw new Error("Wallet not found");
    }

    if (wallet.balance < amount) {
        throw new Error("Insufficient wallet balance");
    }

    wallet.balance -= amount;
    wallet.transactions.unshift({
        description: `Purchase from wallet. Order ID: ${orderID}`,
        amount: -amount, // Storing as negative for consistency with debit
        type: 'debit',
        date: new Date(),
        source: 'purchase',
        referenceId: orderID, 
    });

    if (wallet.transactions.length > 100) {
        wallet.transactions = wallet.transactions.slice(0, 100);
    }

    await wallet.save();
    return true;
};

export {
    getWallet,
    getWalletHistory,
    addFundsToWallet,
    getWalletBalanceAPI,
    processWalletPayment
};
