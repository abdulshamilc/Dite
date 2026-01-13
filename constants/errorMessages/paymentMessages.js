export const PAYMENT_ERRORS = {
  USER_NOT_AUTHENTICATED: "User not authenticated. Please log in.",
  AMOUNT_TOO_LOW: "Order amount too low (min Rs. 1).",
  VARIANT_UNAVAILABLE: "Variant no longer available.",
  STOCK_INSUFFICIENT: "Insufficient stock.",
  PAYMENT_CREATION_FAILED: "Server error: Failed to create Razorpay order.",
  PAYMENT_VERIFICATION_FAILED: "Server error: Payment verification failed.",
  SIGNATURE_MISMATCH: "Invalid payment signature. Payment may be tampered.",
  ORDER_ALREADY_PAID: "Order is already paid",
  RETRY_PAYMENT_ERROR: "Failed to initiate retry payment",
};
