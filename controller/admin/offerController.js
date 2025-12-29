import Offer from "../../models/offerModel.js";
import Products from "../../models/productsModels.js";
import Categories from "../../models/categories.js";
import mongoose from "mongoose";

// Get offers
const getOffers = async (req, res) => {
  let successMessage = null;
  let errorMessage = null;

  try {
    // Auto-fix legacy data
    await Offer.updateMany(
      { targetModel: "Products" },
      { $set: { targetModel: "Product" } }
    );

    // Handle messages from redirects
    if (req.query.success) {
      successMessage = decodeURIComponent(req.query.success);
    }
    if (req.query.error) {
      errorMessage = decodeURIComponent(req.query.error);
    }
    if (req.session.error) {
      errorMessage = req.session.error;
      delete req.session.error; // Clear to avoid repeats
    }
    if (req.session.success) {
      successMessage = req.session.success;
      delete req.session.success;
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Total offers count
    const totalOffers = await Offer.countDocuments({ isDeleted: false });

    // Active offers count
    const activeOffersCount = await Offer.countDocuments({ 
      isActive: true, 
      isDeleted: false 
    });

    // Inactive offers count
    const inactiveOffersCount = await Offer.countDocuments({ 
        isActive: false, 
        isDeleted: false 
    });

    // Total discount value (sum of all discountValue, regardless of type)
    const totalDiscountAggregation = await Offer.aggregate([
      { $match: { isDeleted: false } }, // Ensure deleted are excluded from sum too
      {
        $group: {
          _id: null,
          totalDiscount: { $sum: "$discountValue" },
        },
      },
    ]);
    const totalDiscountCount =
      totalDiscountAggregation.length > 0
        ? totalDiscountAggregation
        : [{ totalDiscount: 0 }];

    // Fetch paginated offers with populated target
    const offers = await Offer.find({ isDeleted: false })
      .populate("targetId")
      .sort({ createdAt: -1 }) // Sort by most recent first
      .skip(skip)
      .limit(limit);

    // Calculate total pages
    const totalPages = Math.ceil(totalOffers / limit);

    // Products and details for listing
    const products = await Products.find({ isDeleted: false, isListed: true })
      .select("_id name price description images variants")
      .limit(50); // Adjust model/import
    const categories = await Categories.find({
      isActive: true,
      isDeleted: false,
    })
      .select("_id name description")
      .limit(50);

    // Render the view (adjust the view path as needed, e.g., 'admin/offers/list')
    res.render("admin/offers/offers", {
      offers,
      products,
      categories,
      totalOffers,
      activeOffersCount,
      inactiveOffersCount,
      totalDiscountCount,
      currentPage: page,
      totalPages,
      limit,
      successMessage,
      errorMessage,
    });
  } catch (error) {
    console.error("Error fetching offers:", error);
    // Re-render with empty data or redirect, but for simplicity, render with error
    res.render("admin/offers/offers", {
      offers: [],
      totalOffers: 0,
      activeOffersCount: 0,
      inactiveOffersCount: 0,
      totalDiscountCount: [{ totalDiscount: 0 }],
      currentPage: 1,
      totalPages: 1,
      limit: 10,
      successMessage: null,
      errorMessage: error.message,
    });
  }
};

// Recalculate prices
const recalculatePrices = async (targetIds, type) => {
  try {
    let products = [];
    if (type === "Product") {
      products = await Products.find({ _id: { $in: targetIds } });
    } else if (type === "Categories") {
      products = await Products.find({ category: { $in: targetIds } });
    }

    const currentDate = new Date();

    for (const product of products) {
      // Find all active offers applying to this product
      const productOffers = await Offer.find({
        targetModel: "Product",
        targetId: product._id,
        isActive: true,
        isDeleted: false,
        startDate: { $lte: currentDate },
        endDate: { $gte: currentDate },
      });

      // Find all active offers applying to this product's category
      const categoryOffers = await Offer.find({
        targetModel: "Categories",
        targetId: product.category,
        isActive: true,
        isDeleted: false,
        startDate: { $lte: currentDate },
        endDate: { $gte: currentDate },
      });

      const allOffers = [...productOffers, ...categoryOffers];

      // Calculate best discount for each variant
      product.variants.forEach((variant) => {
        let bestPrice = variant.basePrice;

        if (allOffers.length > 0) {
          // Find the offer that gives the lowest price
          const prices = allOffers.map((offer) => {
            let discounted = variant.basePrice;
            if (offer.discountType === "flat") {
              discounted = variant.basePrice - offer.discountValue;
            } else {
              discounted =
                variant.basePrice -
                (variant.basePrice * offer.discountValue) / 100;
            }
            return Math.max(0, discounted); // Ensure price doesn't go below 0
          });

          bestPrice = Math.min(variant.basePrice, ...prices);
        }

        variant.discountedPrice = Math.round(bestPrice); // Round to nearest integer
      });

      await product.save();
    }
  } catch (error) {
    console.error("Error recalculating prices:", error);
  }
};

// Create offer
const createOffer = async (req, res) => {
  try {
    const {
      name,
      description,
      discountType,
      discountValue,
      appliesTo,
      startDate,
      endDate,
    } = req.body;
    let targetId = req.body.targetId; // Could be string (category) or array (products)

    // Normalize targetId to always be an array
    let rawTargetIds = Array.isArray(targetId) ? targetId : [targetId];
    // Filter out empty or invalid strings before further processing
    const targetIds = rawTargetIds.filter((id) => id && id.trim() !== "");

    if (!name?.trim()) {
      req.session.error = "Offer name is required";
      return res.redirect("/admin/offers");
    }
    if (!discountType || !["flat", "percentage"].includes(discountType)) {
      req.session.error = "Valid discount type is required";
      return res.redirect("/admin/offers");
    }
    const discountNum = parseFloat(discountValue);
    if (isNaN(discountNum) || discountNum <= 0) {
      req.session.error = "Discount value must be greater than 0";
      return res.redirect("/admin/offers");
    }
    if (!appliesTo || !["product", "category"].includes(appliesTo)) {
      req.session.error =
        "Must specify if offer applies to product or category";
      return res.redirect("/admin/offers");
    }
    if (
      !targetIds?.length ||
      targetIds.some((id) => !mongoose.Types.ObjectId.isValid(id))
    ) {
      req.session.error = "Valid target ID(s) are required";
      return res.redirect("/admin/offers");
    }
    if (!startDate) {
      req.session.error = "Start date is required";
      return res.redirect("/admin/offers");
    }
    if (!endDate) {
      req.session.error = "End date is required";
      return res.redirect("/admin/offers");
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) {
      req.session.error = "End date must be after start date";
      return res.redirect("/admin/offers");
    }
    if (discountType === "percentage" && discountNum > 100) {
      req.session.error = "Percentage discount cannot exceed 100%";
      return res.redirect("/admin/offers");
    }

    // Validate targets (products or category)
    if (appliesTo === "product") {
      const validProducts = await Products.countDocuments({
        _id: { $in: targetIds },
        isDeleted: false,
        isListed: true,
      });
      if (validProducts !== targetIds.length) {
        req.session.error = "One or more selected products are invalid";
        return res.redirect("/admin/offers");
      }
    } else {
      const validCategory = await Categories.countDocuments({
        _id: targetIds[0],
        isActive: true,
        isDeleted: false,
      });
      if (!validCategory) {
        req.session.error = "Selected category is invalid";
        return res.redirect("/admin/offers");
      }
    }

    const targetModelName = appliesTo === "product" ? "Product" : "Categories";

    const offerData = {
      name: name.trim(),
      description: description?.trim() || undefined,
      discountType,
      discountValue: discountNum,
      appliesTo,
      targetModel: targetModelName,
      targetId: targetIds,
      startDate: start,
      endDate: end,
      isActive: true,
    };

    const offer = new Offer(offerData);
    await offer.save();

    // Recalculate prices for affected items
    await recalculatePrices(targetIds, targetModelName);

    // Redirect with success message (handled in GET)
    req.session.success = "Offer created successfully!";
    res.redirect("/admin/offers");
  } catch (error) {
    console.error("Error creating offer:", error);
    // Redirect with error message (handled in GET)
    req.session.error = error.message;
    res.redirect("/admin/offers");
  }
};
// Get offer details
const getOfferDetails = async (req, res) => {
  let successMessage = null;
  let errorMessage = null;

  try {
    // Fix legacy targetModel values
    await Offer.updateMany(
      { targetModel: "Products" },
      { $set: { targetModel: "Product" } }
    );

    // Flash messages
    if (req.session.success) {
      successMessage = req.session.success;
      delete req.session.success;
    }
    if (req.session.error) {
      errorMessage = req.session.error;
      delete req.session.error;
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.session.error = "Invalid offer ID";
      return res.redirect("/admin/offers");
    }

    const offer = await Offer.findById(id);
    if (!offer) {
      req.session.error = "Offer not found";
      return res.redirect("/admin/offers");
    }

    let targets = [];

    if (offer.targetId && offer.targetId.length > 0) {
      if (offer.appliesTo === "product") {
        targets = await Products.find({
          _id: { $in: offer.targetId },
          isDeleted: false,
        })
          .select("name images")
          .lean();
      } else {
        targets = await Categories.find({
          _id: { $in: offer.targetId },
          isDeleted: false,
        })
          .select("name")
          .lean();
      }
    }

    const offerObj = offer.toObject();
    offerObj.targets = targets;

    res.render("admin/offers/offerDetails", {
      offer: offerObj,
      success: successMessage,
      error: errorMessage,
    });
  } catch (error) {
    console.error("Error fetching offer details:", error);
    req.session.error = "Something went wrong while loading offer details";
    res.redirect("/admin/offers");
  }
};
// Toggle offer status
const toggleOfferStatus = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.session.error = "Invalid offer ID";
      return res.redirect("/admin/offers");
    }

    const offer = await Offer.findOne({ _id: req.params.id });

    if (!offer) {
      req.session.error = "Offer not found";
      return res.redirect("/admin/offers");
    }

    offer.isActive = !offer.isActive;
    await offer.save();

    await recalculatePrices(offer.targetId, offer.targetModel);

    req.session.success = offer.isActive
      ? "Offer activated successfully!"
      : "Offer deactivated successfully!";
    res.redirect(`/admin/offers/${req.params.id}`);
  } catch (error) {
    console.error("Error toggling offer status:", error);
    req.session.error = error.message;
    res.redirect("/admin/offers");
  }
};

// Update offer end date
const updateOfferEndDate = async (req, res) => {
  try {
    const { id } = req.params;
    const { endDate } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.session.error = "Invalid offer ID";
      return res.redirect("/admin/offers");
    }

    if (!endDate) {
      req.session.error = "End date is required";
      return res.redirect(`/admin/offers/${id}`);
    }

    const offer = await Offer.findById(id);

    if (!offer) {
      req.session.error = "Offer not found";
      return res.redirect("/admin/offers");
    }

    const newEnd = new Date(endDate);
    if (newEnd <= offer.startDate) {
      req.session.error = "End date must be after start date";
      return res.redirect(`/admin/offers/${id}`);
    }

    offer.endDate = newEnd;
    await offer.save();

    await recalculatePrices(offer.targetId, offer.targetModel);

    res.redirect(`/admin/offers/${id}`);
  } catch (error) {
    console.error("Error updating offer end date:", error);
    req.session.error = error.message;
    res.redirect("/admin/offers");
  }
};

// Get edit offer
const getEditOffer = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.session.error = "Invalid offer ID";
      return res.redirect("/admin/offers");
    }

    const offer = await Offer.findById(id).populate("targetId");
    if (!offer) {
      req.session.error = "Offer not found";
      return res.redirect("/admin/offers");
    }

    const products = await Products.find({
      isDeleted: false,
      isListed: true,
    }).select("_id name price images");
    const categories = await Categories.find({
      isActive: true,
      isDeleted: false,
    }).select("_id name");

    res.render("admin/offers/editOffers", {
      offer,
      products,
      categories,
    });
  } catch (error) {
    console.error("Error fetching offer for edit:", error);
    req.session.error = "Failed to load offer for editing";
    res.redirect("/admin/offers");
  }
};

// Post edit offer
const postEditOffer = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.session.error = "Invalid offer ID";
      return res.redirect("/admin/offers");
    }

    const {
      name,
      description,
      discountType,
      discountValue,
      appliesTo,
      startDate,
      endDate,
    } = req.body;
    let targetId = req.body.targetId;

    let rawTargetIds = Array.isArray(targetId) ? targetId : [targetId];
    const targetIds = rawTargetIds.filter((id) => id && id.trim() !== "");

    // Validation (similar to create)
    if (
      !name?.trim() ||
      !discountType ||
      !discountValue ||
      !appliesTo ||
      !startDate ||
      !endDate
    ) {
      req.session.error = "All required fields must be filled.";
      return res.redirect(`/admin/offers/edit/${id}`);
    }

    const offer = await Offer.findById(id);
    if (!offer) {
      req.session.error = "Offer not found";
      return res.redirect("/admin/offers");
    }

    // Update fields
    offer.name = name.trim();
    offer.description = description?.trim();
    offer.discountType = discountType;
    offer.discountValue = parseFloat(discountValue);
    offer.appliesTo = appliesTo;
    offer.targetModel = appliesTo === "product" ? "Product" : "Categories";
    offer.targetId = targetIds;
    offer.startDate = new Date(startDate);
    offer.endDate = new Date(endDate);

    await offer.save();
    await recalculatePrices(targetIds, offer.targetModel);

    req.session.success = "Offer updated successfully";
    res.redirect("/admin/offers");
  } catch (error) {
    console.error("Error updating offer:", error);
    req.session.error = "Failed to update offer";
    res.redirect("/admin/offers");
  }
};
// Delete offer
const deleteOffer = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.session.error = "Invalid offer ID";
      return res.redirect("/admin/offers");
    }

    const offer = await Offer.findById(id);

    if (!offer) {
      req.session.error = "Offer not found";
      return res.redirect("/admin/offers");
    }

    offer.isDeleted = true;
    await offer.save();

    await recalculatePrices(offer.targetId, offer.targetModel);

    req.session.success = "Offer deleted successfully!";
    res.redirect("/admin/offers");
  } catch (error) {
    console.error("Error deleting offer:", error);
    req.session.error = error.message;
    res.redirect("/admin/offers");
  }
};

export {
    getOffers,
    createOffer,
    getOfferDetails,
    toggleOfferStatus,
    updateOfferEndDate,
    getEditOffer,
    postEditOffer,
    deleteOffer
}
