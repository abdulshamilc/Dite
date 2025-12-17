import mongoose from "mongoose";

const offerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Offer name is required"],
      maxlength: [255, "Name cannot exceed 255 characters"],
    },
    description: {
      type: String,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    discountType: {
      type: String,
      enum: ["flat", "percentage"],
      default: "percentage",
      required: [true, "Discount type (flat or percentage) is required"],
    },
    discountValue: {
      type: Number,
      required: [true, "Discount value is required"],
      min: [0, "Discount value must be positive"],
    },
    appliesTo: {
      type: String,
      enum: ["product", "category"],
      required: [true, "Must specify if offer applies to product or category"],
    },
    targetModel: {
      type: String,
      enum: ["Product", "Categories"], 
      required: [true, "Target model is required"],
    },
    targetId: {
      type: [mongoose.Schema.Types.ObjectId],
      required: [true, "Target ID (product or category) is required"],
      refPath: "targetModel",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      required: true,
      default: false,
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
    },
  },
  {
    timestamps: true,
  }
);

const Offer = mongoose.model("Offer", offerSchema);

export default Offer;