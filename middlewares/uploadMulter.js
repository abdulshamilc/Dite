import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../services/cloudinaryStorage.js";

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    // Decide the folder dynamically
    let folder = "others";

    if (req.baseUrl.includes("/products")) folder = `products/${req.body.productId || "general"}`;
    else if (req.baseUrl.includes("/profile")) folder = `profile_pics/${req.user?._id || "unknown"}`;
    
    return {
      folder,
      allowed_formats: ["jpg", "png", "jpeg", "webp"],
    };
  },
});

const upload = multer({ storage });

export default upload;
