import Products from "../../models/productsModels.js";
import Categories from "../../models/categories.js";

const toNumber = (val) => {
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
};

// Get products
const getProducts = async (req, res) => {
  try {
    const errorMessage = req.session.errorMessage;
    const successMessage = req.session.successMessage;

    // Clear them so they don't reappear after refresh
    req.session.errorMessage = null;
    req.session.successMessage = null;

    // pagination
    const { page, limit, skip } = req.pagination;

    const products = await Products.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("category");

    // Totel Products
    const totelProducts = await Products.countDocuments({ isDeleted: false });

    // New Products in  last 10 days
    const today = new Date();
    const past10Days = new Date();
    past10Days.setDate(today.getDate() - 10);

    const newProductsCount = await Products.countDocuments({
      isDeleted: false,
      createdAt: { $gte: past10Days, $lte: today },
    });

    // Listed Products
    const activeProductsCount = await Products.countDocuments({
      isDeleted: false,
      isListed: true,
    });

    // out Of Stock Products
    const outOfStockProducts = await Products.find({
      isDeleted: false,
      "variants.stock": { $lte: 0 },
    });

    // Catogory
    const categories = await Categories.find({
      isDeleted: false,
      isActive: false,
    });

    res.render("admin/products/products", {
      products,
      categories,
      totelProducts,
      newProductsCount,
      activeProductsCount,
      outOfStockProducts,
      limit,
      currentPage: page,
      totalPages: Math.ceil(totelProducts / limit),
      errorMessage,
      successMessage,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};
// Get add products
const getAddProducts = async (req, res) => {
  try {
    const categories = await Categories.find({ isDeleted: false }).lean();
    const products = await Products.find({ isDeleted: false })
      .select("name")
      .lean();
    res.render("admin/products/addProducts", { categories, products });
  } catch (error) {
    console.error("Error fetching categories and products:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to load page data." });
  }
};

// Post add products
const postAddProducts = async (req, res) => {

  try {

    let {
      name,
      description,
      notes,
      category,
      brand,
      gender,
      concentration,
      variants,
    } = req.body;


    if (!name || !category || !brand || !gender || !concentration) {
      return res.status(400).json({
        success: false,
        error: "Required fields are missing",
      });
    }


    const imageUrls =
      req.files?.map((file) => file.path || file.secure_url || file.url) || [];

    if (imageUrls.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one product image is required",
      });
    }


    if (!variants) {
      const manualVariants = {};

      Object.keys(req.body).forEach((key) => {
        const match = key.match(/^variants\[(\d+)\]\[(\w+)\]$/);
        if (match) {
          const index = match[1];
          const field = match[2];
          if (!manualVariants[index]) manualVariants[index] = {};
          manualVariants[index][field] = req.body[key];
        }
      });

      if (Object.keys(manualVariants).length > 0) {
        variants = Object.values(manualVariants);
      }
    }


    let parsedVariants = [];

    // CASE 1: variants is ARRAY
    if (Array.isArray(variants)) {
      parsedVariants = variants
        .map((v, index) => {
          if (v && (v.mlSize || v.stock || v.basePrice || v.discountedPrice)) {
            return {
              mlSize: toNumber(v.mlSize),
              stock: toNumber(v.stock),
              basePrice: parseFloat(v.basePrice) || 0,
              discountedPrice: parseFloat(v.discountedPrice) || 0,
              index,
            };
          }
          return null;
        })
        .filter(Boolean);
    }

    // CASE 2: variants is OBJECT (indexed)
    else if (typeof variants === "object" && variants !== null) {
      Object.keys(variants).forEach((key) => {
        const v = variants[key];
        if (v) {
          parsedVariants.push({
            mlSize: toNumber(v.mlSize),
            stock: toNumber(v.stock),
            basePrice: parseFloat(v.basePrice) || 0,
            discountedPrice: parseFloat(v.discountedPrice) || 0,
            index: parseInt(key),
          });
        }
      });

      parsedVariants.sort((a, b) => a.index - b.index);
    }

    // CASE 3: variants is JSON STRING
    else if (typeof variants === "string") {
      try {
        const parsed = JSON.parse(variants);
        if (Array.isArray(parsed)) {
          parsedVariants = parsed.map((v, index) => ({
            mlSize: toNumber(v.mlSize),
            stock: toNumber(v.stock),
            basePrice: parseFloat(v.basePrice) || 0,
            discountedPrice: parseFloat(v.discountedPrice) || 0,
            index,
          }));
        }
      } catch (err) {
        return res.status(400).json({
          success: false,
          error: "Invalid variants JSON format",
        });
      }
    }

    if (parsedVariants.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one valid variant is required",
      });
    }




    const categoryExists = await Categories.findById(category);
    if (!categoryExists) {
      return res.status(400).json({
        success: false,
        error: "Invalid category selected",
      });
    }


    const newProduct = new Products({
      name: name.trim(),
      description,
      notes,
      category,
      brand: brand.trim().toUpperCase(),
      gender,
      concentration,
      images: imageUrls,
      variants: parsedVariants,
    });

    await newProduct.save();


    categoryExists.products.push(newProduct._id);
    await categoryExists.save();


    res.status(201).json({
      success: true,
      message: "Product added successfully",
      productId: newProduct._id,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: error.message || "Failed to add product",
    });
  }
};
// Get edit products
const getEditProducts = async (req, res) => {
  try {
    const categories = await Categories.find({ isDeleted: false }).lean();
    const product = await Products.findById(req.params.id);
    if (!product || product.isDeleted) {
      req.session.errorMessage = "Product not found.";
      return res.redirect("/admin/products");
    }
    const products = await Products.find({ isDeleted: false })
      .select("name _id")
      .lean();
    const successMessage = req.session.successMessage;
    const errorMessage = req.session.errorMessage;
    req.session.successMessage = null;
    req.session.errorMessage = null;
    
    res.render("admin/products/editProducts", { categories, product, products, successMessage, errorMessage });
  } catch (err) {
    console.error(err);
    req.session.errorMessage = "Something Went Wrong";
    res.redirect("/admin/products");
  }
};
// Post edit product
const postEditProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const oldProduct = await Products.findById(productId);
    if (!oldProduct) {
      return res
        .status(404)
        .json({ success: false, error: "Product not found" });
    }

    const {
      name,
      description,
      notes,
      category: rawCategory,
      brand,
      gender,
      concentration,
      variants: rawVariants,
    } = req.body;
    const imageFiles =
      req.files?.map((file) => file.path || file.secure_url || file.url) || [];
    const existingImages = Array.isArray(req.body.existingImages)
      ? req.body.existingImages
      : [];


    let updatedImages = [...(oldProduct.images || [])];
    imageFiles.forEach((filePath, index) => {
      if (index < 4) {
        updatedImages[index] = filePath;
      }
    });

    let existingIdx = 0;
    for (let i = 0; i < 4; i++) {
      if (updatedImages[i] === undefined && existingIdx < existingImages.length) {
         // This logic in original code was: 
         // if (!updatedImages[i] && existingIdx < existingImages.length)
         // Assuming undefined/null/empty string checks.
         // Let's stick to original logic:
         if (!updatedImages[i]) updatedImages[i] = existingImages[existingIdx++];
      } else if (!updatedImages[i] && existingIdx < existingImages.length) {
         updatedImages[i] = existingImages[existingIdx++];
      }
    }

    let idx = 0;
    for (let i = 0; i < 4; i++) {
      if (!updatedImages[i] && idx < existingImages.length) {
        updatedImages[i] = existingImages[idx++];
      }
    }
    
    // Trim to exactly 4
    updatedImages = updatedImages.slice(0, 4);


    if (updatedImages.length !== 4 || updatedImages.some((img) => !img)) {
      return res.status(400).json({
        success: false,
        error: "Exactly 4 valid images are required.",
      });
    }

    // Validate required fields (final values)
    const finalName = name ? name.trim() : oldProduct.name;
    if (!finalName) {
      return res
        .status(400)
        .json({ success: false, error: "Product name is required." });
    }

    const finalDescription = description
      ? description.trim()
      : oldProduct.description;
    if (!finalDescription) {
      return res
        .status(400)
        .json({ success: false, error: "Product description is required." });
    }


    let oldCategoryValue = oldProduct.category;
    if (Array.isArray(oldCategoryValue)) {
      oldCategoryValue = oldCategoryValue[0];
    }

    const finalCategory = rawCategory ? rawCategory.trim() : oldCategoryValue;
    if (!finalCategory) {
      return res
        .status(400)
        .json({ success: false, error: "Category is required." });
    }

    const finalGender = gender || oldProduct.gender;
    if (!finalGender) {
      return res
        .status(400)
        .json({ success: false, error: "Gender is required." });
    }

    const finalConcentration = concentration || oldProduct.concentration;
    if (!finalConcentration) {
      return res
        .status(400)
        .json({ success: false, error: "Concentration is required." });
    }


    let parsedVariants = [...oldProduct.variants];
    if (rawVariants) {
      if (Array.isArray(rawVariants)) {
        parsedVariants = rawVariants
          .map((v, index) => {
            if (
              !v ||
              !v.mlSize ||
              !v.stock ||
              !v.basePrice ||
              !v.discountedPrice
            ) {
              return null;
            }
            return {
              mlSize: parseInt(v.mlSize),
              stock: parseInt(v.stock),
              basePrice: parseFloat(v.basePrice) || 0,
              discountedPrice: parseFloat(v.discountedPrice) || 0,
              index, // For error reporting
            };
          })
          .filter((v) => v !== null);
      } else if (
        rawVariants &&
        rawVariants.mlSize &&
        rawVariants.stock &&
        rawVariants.basePrice &&
        rawVariants.discountedPrice
      ) {
        // Fallback for single object (unlikely in edit, but handle)
        const singleVariant = {
          mlSize: parseInt(rawVariants.mlSize),
          stock: parseInt(rawVariants.stock),
          basePrice: parseFloat(rawVariants.basePrice) || 0,
          discountedPrice: parseFloat(rawVariants.discountedPrice) || 0,
          index: 0,
        };
        parsedVariants = [singleVariant];
      }
    }


    let variantErrors = [];
    parsedVariants.forEach((v) => {
      const variantNum = v.index + 1;
      if (v.mlSize <= 0) {
        variantErrors.push(
          `Variant ${variantNum} size must be greater than 0.`
        );
      }
      if (v.stock < 1) {
        variantErrors.push(`Variant ${variantNum} stock must be at least 1.`);
      }
      if (v.basePrice <= 1) {
        variantErrors.push(
          `Variant ${variantNum} base price must be greater than 1.`
        );
      }
      if (v.discountedPrice < 0) {
        variantErrors.push(
          `Variant ${variantNum} discounted price must be at least 0.`
        );
      }
      if (v.discountedPrice > v.basePrice) {
        variantErrors.push(
          `Variant ${variantNum} discounted price must be less than or equal to base price.`
        );
      }
    });

    if (variantErrors.length > 0) {
      return res
        .status(400)
        .json({ success: false, error: variantErrors.join(" ") });
    }

    if (parsedVariants.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one valid variant is required.",
      });
    }


    const wordCountDesc = finalDescription.split(/\s+/).length;
    if (wordCountDesc < 10 || wordCountDesc > 150) {
      return res.status(400).json({
        success: false,
        error: "Description must be between 10 and 150 words.",
      });
    }


    const finalNotes = notes ? notes.trim() : oldProduct.notes;
    const wordCountNotes = finalNotes.split(/\s+/).length;
    if (wordCountNotes > 150 || (wordCountNotes > 0 && wordCountNotes < 5)) {
      return res.status(400).json({
        success: false,
        error:
          "Notes must be either empty or at least 5 words, and no more than 150 words.",
      });
    }

    // Brand validation
    const finalBrand = brand ? brand.trim().toUpperCase() : oldProduct.brand;
    // Regex validation removed as we force uppercase now


    if (finalName.toLowerCase() !== oldProduct.name.toLowerCase()) {
      const existingProduct = await Products.findOne({
        name: { $regex: new RegExp(`^${finalName}$`, "i") },
        _id: { $ne: productId },
        isDeleted: false,
      });
      if (existingProduct) {
        return res.status(400).json({
          success: false,
          error: "Product name already exists. Please choose a unique name.",
        });
      }
    }


    oldProduct.name = finalName;
    oldProduct.description = finalDescription;
    oldProduct.notes = finalNotes;
    oldProduct.brand = finalBrand;
    oldProduct.category = finalCategory;
    oldProduct.gender = finalGender;
    oldProduct.concentration = finalConcentration;
    oldProduct.images = updatedImages;
    oldProduct.variants = parsedVariants.map((v) => ({
      // Strip index
      mlSize: v.mlSize,
      stock: v.stock,
      basePrice: v.basePrice,
      discountedPrice: v.discountedPrice,
    }));

    await oldProduct.save();


    // Compare using string conversion to handle ObjectId comparison
    const oldCategoryStr = oldCategoryValue
      ? oldCategoryValue.toString()
      : null;
    const finalCategoryStr = finalCategory ? finalCategory.toString() : null;
    if (
      oldCategoryStr &&
      finalCategoryStr &&
      oldCategoryStr !== finalCategoryStr
    ) {
      // Remove from old category
      await Categories.findByIdAndUpdate(oldCategoryValue, {
        $pull: { products: productId },
      });
      // Add to new category
      await Categories.findByIdAndUpdate(finalCategory, {
        $push: { products: productId },
      });
    } else if (!oldCategoryStr && finalCategoryStr) {
      // Product didn't have a category before, just add to new one
      await Categories.findByIdAndUpdate(finalCategory, {
        $push: { products: productId },
      });
    }

    res.json({ success: true, message: "Product Has Been Edited" });
  } catch (err) {
    console.error("Error editing product:", err);
    res.status(500).json({
      success: false,
      error:
        "Something went wrong while editing the product. Please try again.",
    });
  }
};

// Get product details
const getProductDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch product with populated categories
    const product = await Products.findById(id)
      .populate("category", "name") // Populate category names
      .lean(); // Use lean for better performance since we're not modifying

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // You can add more data processing here if needed, e.g., calculate totals

    // Verify messages from session
    const successMessage = req.session.successMessage;
    const errorMessage = req.session.errorMessage;
    req.session.successMessage = null;
    req.session.errorMessage = null;

    // Render the view
    res.render("admin/products/productDetails", {
      title: "Product Details - Admin",
      product,
      successMessage,
      errorMessage,
      // Add other locals if needed, e.g., categories: await Category.find()
    });
  } catch (error) {
    console.error("Error fetching product details:", error);
    (req.session.error = "error"), "Failed to load product details.";
    res.redirect("/admin/products");
  }
};
// Unlist product
const unlistProduct = async (req, res) => {
  try {
    const product = await Products.findOne({ _id: req.params.id });

    product.isListed = !product.isListed;
    await product.save();
    req.session.successMessage = "Product Status Has Been Changed  ";
    res.redirect(`/admin/products/${req.params.id}`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

// Delete product
const deleteProduct = async (req, res) => {
  try {
    const product = await Products.findOne({ _id: req.params.id });

    product.isDeleted = !product.isDeleted;
    await product.save();
    req.session.successMessage = "Product Status Has Been Deleted  ";
    res.redirect("/admin/products");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

export {
    getProducts,
    getAddProducts,
    toNumber,
    postAddProducts,
    getEditProducts,
    postEditProduct,
    getProductDetails,
    unlistProduct,
    deleteProduct
}
