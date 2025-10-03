import express from "express";
import passport from "passport";

import {
  notLogginedHome,
  getSignup,
  signup,
  getLogin,
  login,
  userBloked,
} from "../controller/user/userController.js";

import {
  getProfile,
  postProfile,
  getAddress,
  postAddAddress,
  postEditAddress,
  postsetDefaultAdress,
  postDeletetAdress,
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
router.get("/login", getLogin);
router.post("/login", login);

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
router.post("/cart/quantity/:id", isAuthenticatedUser,isBlocked, updateQuatity);

router.get("/profile", isAuthenticatedUser, isBlocked, getProfile);
router.post("/profile", isAuthenticatedUser, isBlocked, postProfile);

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


router.get('/checkout/address',getCheckout);
router.post('/checkout/address/save-location/:id',addGeolocation);
router.post('/checkout/address/clear-location/:id',clearGeolocation);
router.post('/checkout/address/add-newaddress',addNewAddress);

router.get('/checkout/payment/:id',getPaymentpage);

export default router;
