import mongoose from "mongoose";
import { nanoid } from "nanoid";
import { addressSchemaExport } from "./addressModel.js";

const orderedProductSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  name: String,
  mlSize: String,
  basePrice: Number,
  discoundedPrice: Number,
  productStatus: {
    type: String,
    enum: ["Placed", "Delivered", "Cancelled", "Returned"],
    default: "Placed",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
  },
  image: String,
});

const canceledProductSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  mlSize: {
    type: String,
    required: true,
  },
  basePrice: {
    type: Number,
    required: true,
  },
  discountedPrice: {
    type: Number,
    required: true,
  },
  canceledQuantity: {
    type: Number,
    required: true,
    min: 1,
  },
  image: {
    type: String,
  },
  reason: {
    type: String,
    default: "",
  },
  canceledAt: {
    type: Date,
    default: Date.now,
  },
});

const returndProductSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  mlSize: {
    type: String,
    required: true,
  },
  basePrice: {
    type: Number,
    required: true,
  },
  discountedPrice: {
    type: Number,
    required: true,
  },
  returndQuantity: {
    type: Number,
    required: true,
    min: 1,
  },
  image: {
    type: String,
  },
  reason: {
    type: String,
    required: true,
  },
  returnedAt: {
    type: Date,
    default: Date.now,
  },
  adminApproved: {
    type: String,
    enum: ["Requested", "Approved", "Rejected"],
    required: true,
    default: "Requested",
  },
});

const orderSchema = new mongoose.Schema(
  {
    orderID: { type: String, default: () => nanoid(10), unique: true },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    address: {
      type: addressSchemaExport,
      required: true,
    },
    items: [orderedProductSchema],
    paymentMethod: {
      type: String,
      enum: ["cod", "online", "Wallet"],
      required: true,
    },
    paymentInfo: {
      razorpayPaymentId: { type: String },
      paymentStatus: {
        type: String,
        enum: ["Pending", "Paid", "Failed"],
      },
      paymentTime: { type: Date },
    },

    orderStatus: {
      type: String,
      enum: [
        "Placed",
        "Shipped",
        "Out for Delivery",
        "Delivered",
        "Cancelled",
        "Returned",
      ],
      default: "Placed",
    },
    cancelProducts: [canceledProductSchema],

    returndProduct: [returndProductSchema],

    tracking: [
      {
        status: String,
        date: { type: Date, default: Date.now },
        message: String,
      },
    ],

    placedAt: {
      type: Date,
      default: Date.now,
    },
    totalAmount: {
      type: Number,
      required: true,
    },

    deliveredAt: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);
export default Order;
