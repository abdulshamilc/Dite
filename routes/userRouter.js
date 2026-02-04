import express from "express";
import passport from "passport";
import upload from "../middlewares/uploadMulter.js";

import {
  notLogginedHome,
  getSignup,
  signup,
  getSetPassword,
  postSetPassword,
  getSignupOtpVerify,
  resendSignupOtp,
  postSignupOtpVerify,
  getLogin,
  login,
  getForgotPassword,
  forgetPassword,
  getOtpVerification,
  PostOtpVerification,
  getResetPasword,
  postResetPassword,
  restPassword,
  userBloked,
  getAbout,
  getContact,
  getPrivacy,
  getTerms,
  getFaq,
  get2FAVerify,
  post2FAVerify,
  verifyReferralCode,
} from "../controller/user/userController.js";

import {
  getProfile,
  postProfile,
  getAddress,
  postAddAddress,
  postEditAddress,
  changeEmail,
  verifyChangeEmail,
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

  getSecurity,
  getDeleteAcount,
  verifyDeletePassword,
  resendDeleteOtp,
  confirmDeleteAccount,
  generate2FASecret,
  enable2FA,
  disable2FA,
  userlogOut,
  getReferrals,
} from "../controller/user/profileController.js";

import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  addToCartFromWishlist,
} from "../controller/user/wishlistController.js";

import {
  getShop,
  getOffers,
  productDetail,
  getCollections,
  getMenShop,
  getWomenShop,
  getUnisexShop,
  getCatogoryShop,
  getProductAPI,
} from "../controller/user/shopController.js";

import {
  getCart,
  addToCart,
  deleteCart,
  updateQuantity,
} from "../controller/user/cartController.js";

import {
  getCheckout,
  addGeolocation,
  clearGeolocation,
  addNewAddress,
  getPaymentpage,
  placeOrder,
  getSuccessPage,
  getFailedPage,
// getWalletBalanceAPI, (Removed)
  applyCoupon,
} from "../controller/user/checkoutController.js";

import {
  createRazorpayOrder,
  verifyRazorpayPayment,
// addFundsToWallet, (Removed)
  retryPaymentOrder,
  verifyRetryPayment,
  retrySessionPayment
} from "../controller/user/paymentController.js"; 

import {
  getWallet,
  getWalletHistory,
  addFundsToWallet,
  getWalletBalanceAPI
} from "../controller/user/walletController.js"; 

import { addReview } from "../controller/user/reviewController.js";

import getHeaderData from "../middlewares/headerMiddleware.js";

import { isAuthenticatedUser } from "../middlewares/authMiddleware.js";

import isBlocked from "../middlewares/checkBlokedMiddleware.js";

const router = express.Router();

router.use(getHeaderData);

// Google auth
router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);


router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    req.session.user = req.user.emails[0].value;
    res.redirect("/");
  }
);

router.get("/", notLogginedHome);
router.get("/signup", getSignup);


router.post("/signup", signup);
router.post("/signup/verify-referral", verifyReferralCode);

router.get("/set-password", getSetPassword);
router.post("/set-password", postSetPassword);

router.get("/signup/verify-otp", getSignupOtpVerify);
router.get("/signup/resend-otp", resendSignupOtp);
router.post("/signup/verify-otp", postSignupOtpVerify);

router.get("/login", getLogin);
router.post("/login", login);

// 2FA Verification during login
router.get("/login/verify-2fa", get2FAVerify);
router.post("/login/verify-2fa", post2FAVerify);

router.get("/forgot-password", getForgotPassword);
router.post("/forgot-password", forgetPassword);
router.get("/forgot-password/otpVerification", getOtpVerification);
router.post("/forgot-password/otpVerification", PostOtpVerification);

router.get("/reset-password/:token", getResetPasword);
router.post("/reset-password/:token", postResetPassword);

router.post("/reset-password", restPassword);

// Static Pages
router.get("/about", getAbout);
router.get("/contact", getContact);
router.get("/privacy", getPrivacy);
router.get("/terms", getTerms);
router.get("/faq", getFaq);

router.get("/userBloked", userBloked);

// Shop routes
router.get("/shop",getShop);
router.get("/offers", getOffers);
router.get("/shop/men", getMenShop);
router.get("/shop/women", getWomenShop);
router.get("/shop/unisex", getUnisexShop);
router.get("/shop/:id", productDetail);

router.get("/categories/:id", getCatogoryShop);

router.get("/collections", getCollections);

router.get("/cart", isAuthenticatedUser, isBlocked, getCart);
router.post("/cart/add", isAuthenticatedUser, isBlocked, addToCart);
router.post("/cart/delete/:id", isAuthenticatedUser, isBlocked, deleteCart);
router.post(
  "/cart/quantity/:id",
  isAuthenticatedUser,
  isBlocked,
  updateQuantity
);

router.get("/wishlist", isAuthenticatedUser, isBlocked, getWishlist);
router.post("/wishlist/add", isAuthenticatedUser, isBlocked, addToWishlist);
router.post("/wishlist/add/:id", isAuthenticatedUser, isBlocked, addToWishlist);
router.post(
  "/wishlist/remove/:id",
  isAuthenticatedUser,
  isBlocked,
  removeFromWishlist
);
router.post('/wishlist/addToCart/:id', isAuthenticatedUser, isBlocked , addToCartFromWishlist)

router.get('/api/product/:id', isAuthenticatedUser, isBlocked, getProductAPI);

router.get("/profile", isAuthenticatedUser, isBlocked, getProfile);
router.post(
  "/profile",
  isAuthenticatedUser,
  isBlocked,
  upload.single("image"),
  postProfile
);

router.get("/referrals", isAuthenticatedUser, isBlocked, getReferrals);

router.post(
  "/profile/changeEmail",
  isAuthenticatedUser,
  isBlocked,
  changeEmail
);
router.post(
  "/profile/verify-email",
  isAuthenticatedUser,
  isBlocked,
  verifyChangeEmail
);

router.get("/address", isAuthenticatedUser, isBlocked, getAddress);
router.post("/add-address", isAuthenticatedUser, isBlocked, postAddAddress);
router.post(
  "/edit-address/:id",
  isAuthenticatedUser,
  isBlocked,
  postEditAddress
);
router.post(
  "/address/set-default",
  isAuthenticatedUser,
  isBlocked,
  postSetDefaultAddress
);
router.post(
  "/delete-address/:id",
  isAuthenticatedUser,
  isBlocked,
  postDeleteAddress
);

router.get("/security", isAuthenticatedUser, isBlocked, getSecurity);
router.get(
  "/security/delete-account-confirm",
  isAuthenticatedUser,
  isBlocked,
  getDeleteAcount
);
router.post(
  "/security/delete-account/verify-password",
  isAuthenticatedUser,
  isBlocked,
  verifyDeletePassword
);
router.post(
  "/security/delete-account/resend-otp",
  isAuthenticatedUser,
  isBlocked,
  resendDeleteOtp
);
router.post(
  "/security/delete-account/confirm",
  isAuthenticatedUser,
  isBlocked,
  confirmDeleteAccount
);

// 2FA Routes
router.post(
  "/security/2fa/generate",
  isAuthenticatedUser,
  isBlocked,
  generate2FASecret
);
router.post(
  "/security/2fa/enable",
  isAuthenticatedUser,
  isBlocked,
  enable2FA
);
router.post(
  "/security/2fa/disable",
  isAuthenticatedUser,
  isBlocked,
  disable2FA
);

router.get("/orders", isAuthenticatedUser, isBlocked, getOrders);
router.get("/order/:id", isAuthenticatedUser, isBlocked, getOrderDetails);

router.get("/cancelOrder/:id", isAuthenticatedUser, isBlocked, getCancelOrder);
router.post(
  "/cancelOrder/:id",
  isAuthenticatedUser,
  isBlocked,
  postCancelOrder
);
router.post(
  "/cancelOrder/:id/confirm",
  isAuthenticatedUser,
  isBlocked,
  confirmCancel
);

router.get(
  "/cancelOrder/:id/cancel-select",
  isAuthenticatedUser,
  isBlocked,
  getCancelSelect
);
router.post(
  "/cancelOrder/:id/cancel-select",
  isAuthenticatedUser,
  isBlocked,
  postCancelSelect
);

router.get("/invoice/:id", isAuthenticatedUser, isBlocked, getorderInvoce);

router.get("/return/:id", isAuthenticatedUser, isBlocked, getReturn);
router.post("/return/:id", isAuthenticatedUser, isBlocked, postReturn);
router.post(
  "/return/:id/return-confirm",
  isAuthenticatedUser,
  isBlocked,
  confirmReturn
);
router.get(
  "/return/:id/return-select",
  isAuthenticatedUser,
  isBlocked,
  getReturnSelect
);
router.post(
  "/return/:id/return-select",
  isAuthenticatedUser,
  isBlocked,
  postReturnSelect
);

router.get("/checkout/address", isAuthenticatedUser, isBlocked, getCheckout);
router.post(
  "/checkout/address/save-location/:id",
  isAuthenticatedUser,
  isBlocked,
  addGeolocation
);
router.post(
  "/checkout/address/clear-location/:id",
  isAuthenticatedUser,
  isBlocked,
  clearGeolocation
);
router.post(
  "/checkout/address/add-newaddress",
  isAuthenticatedUser,
  isBlocked,
  addNewAddress
);
router.post("/checkout/placeOrder", isAuthenticatedUser, isBlocked, placeOrder);
router.post("/checkout/apply-coupon", isAuthenticatedUser, isBlocked, applyCoupon);

router.post(
  "/checkout/payment",
  isAuthenticatedUser,
  isBlocked,
  getPaymentpage
);

router.post(
  "/createOrder",
  isAuthenticatedUser,
  isBlocked,
  createRazorpayOrder
);

router.post(
  "/verifyPayment",
  isAuthenticatedUser,
  isBlocked,
  verifyRazorpayPayment
);

router.post("/checkout/payment/retry/:id", isAuthenticatedUser, isBlocked, retryPaymentOrder);
router.post("/checkout/payment/retry-session", isAuthenticatedUser, isBlocked, retrySessionPayment);
router.post("/checkout/payment/verify-retry", isAuthenticatedUser, isBlocked, verifyRetryPayment);


router.get("/checkout/success", isAuthenticatedUser, isBlocked, getSuccessPage);
router.get("/checkout/failed", isAuthenticatedUser, isBlocked, getFailedPage);


router.get('/wallet',isAuthenticatedUser, isBlocked, getWallet)
router.get('/wallet/history',isAuthenticatedUser, isBlocked, getWalletHistory)
router.post('/wallet/add-funds', isAuthenticatedUser, isBlocked, addFundsToWallet);
router.get('/wallet/api/balance', getWalletBalanceAPI); // For checkout wallet fetch


router.post('/rate-product', isAuthenticatedUser, isBlocked, addReview);

router.get("/logout", userlogOut);
export default router;
