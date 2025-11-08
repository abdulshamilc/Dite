import express from "express";
import passport from "passport";
import upload from "../middlewares/uploadMulter.js";

import {
  notLogginedHome,
  getSignup,
  signup,
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
} from "../controller/user/userController.js";

import {
  getProfile,
  postProfile,
  getAddress,
  postAddAddress,
  postEditAddress,
  changeEmail,
  verifyChangeEmail,
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
} from "../controller/user/profileController.js";

import {
  getShop,
  productDetail,
  getCollections,
  getMenShop,
  getWomenShop,
  getUnisexShop,
  getCatogoryShop,
} from "../controller/user/shopController.js";

import {
  getCart,
  addToCart,
  deleteCart,
  updateQuatity,
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
} from "../controller/user/checkoutController.js" ;



import { isAuthenticatedUser } from "../middlewares/authMiddleware.js";

import isBlocked from "../middlewares/checkBlokedMiddleware.js";

const router = express.Router();

// Google Auth

// Start Google Login
router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google OAuth callback
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

router.get("/signup/verify-otp", getSignupOtpVerify);
router.get("/signup/resend-otp", resendSignupOtp);
router.post("/signup/verify-otp", postSignupOtpVerify);

router.get("/login", getLogin);
router.post("/login", login);

router.get("/forgot-password", getForgotPassword);
router.post("/forgot-password", forgetPassword);
router.get("/forgot-password/otpVerification", getOtpVerification);
router.post("/forgot-password/otpVerification", PostOtpVerification);

router.get("/reset-password/:token", getResetPasword);
router.post("/reset-password/:token", postResetPassword);

router.post("/reset-password", restPassword);

router.get("/userBloked", userBloked);

router.get("/shop", getShop);
router.get("/shop/men", getMenShop);
router.get("/shop/women", getWomenShop);
router.get("/shop/unisex", getUnisexShop);
router.get("/shop/:id", productDetail);

router.get("/categories/:id", getCatogoryShop);

router.get("/collections", getCollections);

router.get("/cart", isAuthenticatedUser,isBlocked, getCart);
router.post("/cart/add", isAuthenticatedUser,isBlocked, addToCart);
router.post("/cart/delete/:id", isAuthenticatedUser,isBlocked, deleteCart);
router.post("/cart/quantity/:id", isAuthenticatedUser, isBlocked, updateQuatity);  // Fixed typo in function name

router.get("/profile", isAuthenticatedUser, isBlocked, getProfile);
router.post("/profile", isAuthenticatedUser, isBlocked , upload.single("image") , postProfile);

router.post("/profile/changeEmail", isAuthenticatedUser, isBlocked , changeEmail);
router.post("/profile/verify-email", isAuthenticatedUser, isBlocked , verifyChangeEmail);

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
  postsetDefaultAdress
);
router.post(
  "/delete-address/:id",
  isAuthenticatedUser,
  isBlocked,
  postDeletetAdress
);

router.get("/security", isAuthenticatedUser, isBlocked, getSecurity);
router.get("/security/delete-account-confirm", isAuthenticatedUser, isBlocked, getDeleteAcount);

router.get("/orders", isAuthenticatedUser, isBlocked, getOrders);
router.get("/order/:id", isAuthenticatedUser, isBlocked, getOrderDetails);
router.get("/cancelOrder/:id", isAuthenticatedUser, isBlocked, getCancelOrder);
router.post("/cancelOrder/:id", isAuthenticatedUser, isBlocked, postCancelOrder);
router.get("/cancelOrder/:id/cancel-select", isAuthenticatedUser, isBlocked, getCancelSelect);
router.post("/cancelOrder/:id/cancel-select", isAuthenticatedUser, isBlocked, postCancelSelect);
router.get("/invoice/:id", isAuthenticatedUser, isBlocked, getorderInvoce);
router.get("/return/:id", isAuthenticatedUser, isBlocked, getReturn);
router.post("/return/:id", isAuthenticatedUser, isBlocked, postReturn);
router.post("/return/:id/return-confirm", isAuthenticatedUser, isBlocked, postReturnConfired);
router.get("/return/:id/return-select", isAuthenticatedUser, isBlocked, getReturnSelect);
router.post("/return/:id/return-select", isAuthenticatedUser, isBlocked, postReturnSelect);
 
router.get('/checkout/address',isAuthenticatedUser,isBlocked,getCheckout);
router.post('/checkout/address/save-location/:id',isAuthenticatedUser,isBlocked,addGeolocation);
router.post('/checkout/address/clear-location/:id',isAuthenticatedUser,isBlocked,clearGeolocation);
router.post('/checkout/address/add-newaddress',isAuthenticatedUser,isBlocked,addNewAddress);
router.post('/checkout/placeOrder',isAuthenticatedUser,isBlocked,placeOrder);

router.get('/checkout/payment/:id',isAuthenticatedUser,isBlocked,getPaymentpage);

router.get('/checkout/success',isAuthenticatedUser,isBlocked,getSuccessPage);
router.get('/checkout/failed',isAuthenticatedUser,isBlocked,getFailedPage);


router.get('/logout',userlogOut);
export default router;
