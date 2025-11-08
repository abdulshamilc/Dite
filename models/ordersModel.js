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
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  image: String,
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
    cancelStatus: {
      type: String,
      enum: ["Active", "Partially Cancelled", "Cancelled"],
      default: "Active",
    },

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
