import Categories from "../../models/categories.js";
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

    // Check if category exists
    const existingCategory = await Categories.findOne({ name });
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

    const existingCategory = await Categories.findOne({ name });
    if (existingCategory && existingCategory != categorie.name) {
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
    req.session.successMessage = SUCCESS_MESSAGES.CATEGORY_DELETED;
    res.redirect("/admin/categories");
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
    deleteCategory
}
