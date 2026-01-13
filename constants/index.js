// HTTP Status
export { HTTP_STATUS } from "./httpStatus.js";

// Error Messages
import { AUTH_ERRORS } from "./errorMessages/authMessages.js";
import { CATEGORY_ERRORS } from "./errorMessages/categoryMessages.js";
import { COUPON_ERRORS } from "./errorMessages/couponMessages.js";
import { OFFER_ERRORS } from "./errorMessages/offerMessages.js";
import { ORDER_ERRORS } from "./errorMessages/orderMessages.js";
import { RETURN_ERRORS } from "./errorMessages/returnMessages.js";
import { CART_ERRORS } from "./errorMessages/cartMessages.js";
import { WALLET_ERRORS } from "./errorMessages/walletMessages.js";
import { CHECKOUT_ERRORS } from "./errorMessages/checkoutMessages.js";
import { PROFILE_ERRORS } from "./errorMessages/profileMessages.js";
import { WISHLIST_ERRORS } from "./errorMessages/wishlistMessages.js";
import { NOTIFICATION_ERRORS } from "./errorMessages/notificationMessages.js";
import { PRODUCT_ERRORS } from "./errorMessages/productMessages.js";
import { REVIEW_ERRORS } from "./errorMessages/reviewMessages.js";
import { PAYMENT_ERRORS } from "./errorMessages/paymentMessages.js";

export const ERROR_MESSAGES = {
  ...AUTH_ERRORS,
  ...CATEGORY_ERRORS,
  ...COUPON_ERRORS,
  ...OFFER_ERRORS,
  ...ORDER_ERRORS,
  ...RETURN_ERRORS,
  ...CART_ERRORS,
  ...WALLET_ERRORS,
  ...CHECKOUT_ERRORS,
  ...PROFILE_ERRORS,
  ...WISHLIST_ERRORS,
  ...NOTIFICATION_ERRORS,
  ...PRODUCT_ERRORS,
  ...REVIEW_ERRORS,
  ...PAYMENT_ERRORS,
};

// Success Messages
import { AUTH_SUCCESS } from "./succussMessages/authMessages.js";
import { CATEGORY_SUCCESS } from "./succussMessages/categoryMessages.js";
import { COUPON_SUCCESS } from "./succussMessages/couponMessages.js";
import { OFFER_SUCCESS } from "./succussMessages/offerMessages.js";
import { ORDER_SUCCESS } from "./succussMessages/orderMessages.js";
import { CART_SUCCESS } from "./succussMessages/cartMessages.js";
import { WALLET_SUCCESS } from "./succussMessages/walletMessages.js";
import { PROFILE_SUCCESS } from "./succussMessages/profileMessages.js";
import { WISHLIST_SUCCESS } from "./succussMessages/wishlistMessages.js";
import { NOTIFICATION_SUCCESS } from "./succussMessages/notificationMessages.js";
import { PRODUCT_SUCCESS } from "./succussMessages/productMessages.js";
import { REVIEW_SUCCESS } from "./succussMessages/reviewMessages.js";
import { PAYMENT_SUCCESS } from "./succussMessages/paymentMessages.js";

export const SUCCESS_MESSAGES = {
  ...AUTH_SUCCESS,
  ...CATEGORY_SUCCESS,
  ...COUPON_SUCCESS,
  ...OFFER_SUCCESS,
  ...ORDER_SUCCESS,
  ...CART_SUCCESS,
  ...WALLET_SUCCESS,
  ...PROFILE_SUCCESS,
  ...WISHLIST_SUCCESS,
  ...NOTIFICATION_SUCCESS,
  ...PRODUCT_SUCCESS,
  ...REVIEW_SUCCESS,
  ...PAYMENT_SUCCESS,
};
