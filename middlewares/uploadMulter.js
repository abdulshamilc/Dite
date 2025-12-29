import multer from "multer";
import cloudinary from "../services/cloudinaryStorage.js";
import cloudinaryStorage from "multer-storage-cloudinary";

const storage = cloudinaryStorage({
  cloudinary: { v2: cloudinary },
  folder: (req, file, cb) => {
    let folderName = "others";
    if (req.baseUrl.includes("/products") || req.path.includes("/products")) {
      folderName = "products";
    } else if (req.baseUrl.includes("/profile") || req.path.includes("/profile")) {
      folderName = "profile_pics";
    }
    cb(null, folderName);
  },
  allowedFormats: ["jpg", "png", "jpeg", "webp"],
});

const upload = multer({ 
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit per file
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images allowed'), false);
    }
  }
});

export default upload;