import mongoose from "mongoose";
const variantSchema = new mongoose.Schema(
  {
    mlSize: {
      type: Number,
      required: true,
    },
    stock: {
      type: Number,
      required: true,
      default: 0,
    },
    basePrice: {
      type: Number,
      required: true,
    },
    discountedPrice: {
      type: Number,
      required: true,
    },
    isDeleted: {
      type: Boolean,
      required: true,
      default: false,
    },
    isListed: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: true, // automatically adds createdAt and updatedAt
  }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    notes: {
      type: String,
      required: true,
    },
    brand: {
      type: String,
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Categories",
    },
    images: {
      type: [String],
      required: true,
    },
    gender: {
      type: String,
      enum: ["MEN", "WOMEN", "UNISEX"],
      required: true,
    },
    concentration: {
      type: String,
      enum: [
        "Parfum",
        "Eau de Parfum",
        "Eau de Toilette",
        "Eau de Cologne",
        "Eau Fraiche",
      ],
      required: true,
    },

    variants: [variantSchema],

    isDeleted: {
      type: Boolean,
      required: true,
      default: false,
    },
    isListed: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: true, // automatically adds createdAt and updatedAt
  }
);

export default mongoose.model("Product", productSchema);
