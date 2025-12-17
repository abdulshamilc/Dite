import multer from "multer";
import cloudinary from "../services/cloudinaryStorage.js";
import cloudinaryStorage from "multer-storage-cloudinary";

const storage = cloudinaryStorage({
  cloudinary: cloudinary,

  folder: (req, file) => {
    // Decide folder dynamically
    if (req.baseUrl.includes("/products")) {
      console.log("Reached")
      return `products/${req.body.productId || "general"}`;
    } else if (req.baseUrl.includes("/profile")) {
      return `profile_pics/${req.user?._id || "unknown"}`;
    }
    return "others";
  },

  allowedFormats: ["jpg", "png", "jpeg", "webp"],
});

const upload = multer({ storage });

export default upload;