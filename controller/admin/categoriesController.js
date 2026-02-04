import Categories from "../../models/categories.js";
import Products from "../../models/productsModels.js";
import { SUCCESS_MESSAGES, ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";

// Get categories
const getCategories = async (req, res) => {
  try {
    const errorMessage = req.session.errorMessage;
    const successMessage = req.session.successMessage;

    // Clear them so they don't reappear after refresh
    req.session.errorMessage = null;
    req.session.successMessage = null;

    // Pagination
    const { page, limit, skip } = req.pagination;

    // Fetch categories according to pagination
    const categories = await Categories.find({ isDeleted: false })
      .populate({
        path: "products",
        match: { isDeleted: false },
        select: "_id" // Only fetch _id for counting
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Total categories
    const totalCategories = await Categories.countDocuments({
      isDeleted: false,
    });

    // Find new categories in last 15 days
    const today = new Date();
    const past7Days = new Date();
    past7Days.setDate(today.getDate() - 7);

    const newCategoriesCount = await Categories.countDocuments({
      isDeleted: false,
      createdAt: { $gte: past7Days, $lte: today },
    });

    // Active categories count
    const activeCategories = await Categories.countDocuments({
      isDeleted: false,
      isActive: true,
    });

    // Inactive categories count
    const inactiveCategories = await Categories.countDocuments({
      isDeleted: false,
      isActive: false,
    });

    res.render("admin/categories/categories", {
      categories,
      newCategoriesCount,
      activeCategories,
      inactiveCategories,
      totalCategories,
      limit,
      currentPage: page,
      totalPages: Math.ceil(totalCategories / limit),
      errorMessage,
      successMessage,
    });
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Add category
const addCategorie = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !description) {
      req.session.errorMessage = ERROR_MESSAGES.NAME_DESCRIPTION_REQUIRED;
      return res.redirect("/admin/categories");
    }

    // Check if category exists (case-insensitive)
    const existingCategory = await Categories.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, "i") },
      isDeleted: false 
    });
    
    if (existingCategory) {
      req.session.errorMessage = ERROR_MESSAGES.CATEGORY_EXISTS;
      return res.redirect("/admin/categories");
    }

    const newCategories = new Categories({
      name,
      description,
    });

    await newCategories.save();
    req.session.successMessage = SUCCESS_MESSAGES.CATEGORY_ADDED;
    res.redirect("/admin/categories");
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Edit category
const editCategory = async (req, res) => {
  try {
    const categorie = await Categories.findOne({ _id: req.params.id });
    const { name, description } = req.body;

    if (!name || !description) {
      req.session.errorMessage = ERROR_MESSAGES.NAME_DESCRIPTION_REQUIRED;
      return res.redirect("/admin/categories");
    }

    // Check for duplicate name (case-insensitive), excluding current category
    const existingCategory = await Categories.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, "i") },
      isDeleted: false
    });

    if (existingCategory && existingCategory._id.toString() !== req.params.id) {
      req.session.errorMessage = ERROR_MESSAGES.CATEGORY_EXISTS;
      return res.redirect("/admin/categories");
    }
    categorie.name = name;
    categorie.description = description;

    await categorie.save();
    req.session.successMessage = SUCCESS_MESSAGES.CATEGORY_EDITED;
    res.redirect("/admin/categories");
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Deactivate category
const DeactivateCategory = async (req, res) => {
  try {
    const categorie = await Categories.findOne({ _id: req.params.id });

    categorie.isActive = !categorie.isActive;
    await categorie.save();

    // If category is deactivated, unlist all products but save their state.
    // If activated, restore their previous state.
    if (!categorie.isActive) {
        // Validation: Store 'isListed' into 'wasListed', then set 'isListed' to false.
        await Products.updateMany(
            { category: categorie._id }, 
            [ { $set: { wasListed: "$isListed", isListed: false } } ]
        );
    } else {
        // Restore: Set 'isListed' to 'wasListed' (if exists), otherwise keep current. Reset 'wasListed' to null.
        await Products.updateMany(
            { category: categorie._id }, 
            [ { $set: { isListed: { $ifNull: ["$wasListed", "$isListed"] }, wasListed: null } } ]
        );
    }

    if (categorie.isActive)
      req.session.successMessage = SUCCESS_MESSAGES.CATEGORY_ACTIVATED;
    else req.session.successMessage = SUCCESS_MESSAGES.CATEGORY_DEACTIVATED;
    res.redirect("/admin/categories");
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Delete category
const deleteCategory = async (req, res) => {
  try {
    const categorie = await Categories.findOne({ _id: req.params.id });
    

    categorie.isDeleted = !categorie.isDeleted;
    await categorie.save();

    // If category is deleted, unlist all products but save their state.
    // If restored, restore their previous state.
    if (categorie.isDeleted) {
        // Validation: Store 'isListed' into 'wasListed', then set 'isListed' to false.
        await Products.updateMany(
            { category: categorie._id }, 
            [ { $set: { wasListed: "$isListed", isListed: false } } ]
        );
    } else {
        // Restore: Set 'isListed' to 'wasListed' (if exists), otherwise keep current. Reset 'wasListed' to null.
        await Products.updateMany(
            { category: categorie._id }, 
            [ { $set: { isListed: { $ifNull: ["$wasListed", "$isListed"] }, wasListed: null } } ]
        );
    }

    req.session.successMessage = SUCCESS_MESSAGES.CATEGORY_DELETED;
    res.redirect("/admin/categories");
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Get Category Details
const getCategoryDetails = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const category = await Categories.findById(categoryId);

    if (!category) {
       // Ideally show a flash message or specific 404
      return res.status(HTTP_STATUS.NOT_FOUND).redirect('/admin/categories');
    }

    const products = await Products.find({ category: categoryId, isDeleted: false });

    res.render("admin/categories/categoryDetails", {
      category,
      products
    });
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

export {
    getCategories,
    addCategorie,
    editCategory,
    DeactivateCategory,
    deleteCategory,
    getCategoryDetails
}
