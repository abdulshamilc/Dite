import Categories from "../../models/categories.js";
import Products from "../../models/productsModels.js";
import Wishlist from '../../models/wishlistModel.js' ;
import {User} from '../../models/userModels.js';
import Offer from "../../models/offerModel.js";
import Cart from "../../models/cartModel.js";
import Review from "../../models/reviewModel.js";
import mongoose from "mongoose";
import { SUCCESS_MESSAGES, ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";

const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Get category shop helper
const getCategoryShopHelper = async (req, res, baseQuery, pageTitle) => {
  try {
    const {
      search = "",
      sort = "",
      page = 1,
      limit = 12,
      minPrice: minPriceQuery,
      maxPrice: maxPriceQuery,
      brands,
      concentrations: concentrationsQuery,
      filter = "ALL", // stock, sale, new
    } = req.query;


    const [brandStats, uniqueConcentrations, priceStats] = await Promise.all([
      Products.aggregate([
        { $match: { ...baseQuery, isDeleted: false, isListed: true, brand: { $ne: null, $exists: true } } }, 
        { $group: { _id: { $toLower: "$brand" }, count: { $sum: 1 }, originalBrand: { $first: "$brand" } } },
        { $sort: { count: -1 } },
      ]),
      Products.distinct("concentration", { ...baseQuery, isDeleted: false, isListed: true }),
      Products.aggregate([
        { $match: { ...baseQuery, isDeleted: false, isListed: true } },
        { $unwind: "$variants" },
        {
          $group: {
            _id: null,
            minPrice: { $min: "$variants.discountedPrice" },
            maxPrice: { $max: "$variants.discountedPrice" },
          },
        },
      ]),
    ]);

    const overallMinPrice = priceStats[0]?.minPrice || 0;
    const overallMaxPrice = priceStats[0]?.maxPrice || 10000;
    const maxPriceOptions = [overallMinPrice, 1000, 3000, 5000, 10000, overallMaxPrice];
    const minPriceOptions = [5000, 10000, 15000, 30000, 50000, overallMaxPrice];
    
    const topBrands = brandStats.slice(0, 5).map(stat => stat.originalBrand);
    const otherBrands = brandStats.slice(5).map(stat => stat.originalBrand);
    const allBrands = [...topBrands, ...otherBrands];

    const queryMinPrice = minPriceQuery ? parseFloat(minPriceQuery) : undefined;
    const queryMaxPrice = maxPriceQuery ? parseFloat(maxPriceQuery) : undefined;
    const selectedBrands = brands ? brands.split(",").map((b) => b.trim().toLowerCase()).filter(Boolean) : [];
    const selectedConcentrations = concentrationsQuery ? concentrationsQuery.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean) : [];
    const effectiveSort = sort || "newest";

    // Build Query
    let query = { ...baseQuery, isDeleted: false, isListed: true };

    // Search
    if (search.trim()) {
      const escapedSearch = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: new RegExp(escapedSearch, "i") } },
        { brand: { $regex: new RegExp(escapedSearch, "i") } },
      ];
    }

    // Brands & Concentrations
    if (selectedBrands.length > 0) {
      query.brand = { $in: selectedBrands.map(b => new RegExp('^' + escapeRegex(b) + '$', 'i')) };
    }
    if (selectedConcentrations.length > 0) {
      query.concentration = { $in: selectedConcentrations.map(c => new RegExp('^' + escapeRegex(c) + '$', 'i')) };
    }

    // Variants Match (Price, Stock)
    let variantMatch = {};
    const priceMatch = {};
    if (queryMinPrice !== undefined) priceMatch.$gte = queryMinPrice;
    if (queryMaxPrice !== undefined) priceMatch.$lte = queryMaxPrice;
    
    if (Object.keys(priceMatch).length > 0) {
        variantMatch.discountedPrice = priceMatch;
    }
    if (filter === "stock") {
        variantMatch.stock = { $gt: 0 };
    }
    if (Object.keys(variantMatch).length > 0) {
        query.variants = { $elemMatch: variantMatch };
    }

    // New Arrivals
    if (filter === "new") {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        query.createdAt = { $gte: thirtyDaysAgo };
    }

    // Pipeline for Sale filter
    let aggregatePipeline = [];
    if (filter === "sale") {
         aggregatePipeline = [
            {
              $addFields: {
                hasDiscount: {
                  $anyElementTrue: {
                    $map: {
                      input: { $ifNull: ["$variants", []] },
                      as: "v",
                      in: { 
                    $and: [
                        { $gt: [ { $toDouble: { $ifNull: ["$$v.discountedPrice", 0] } }, 0 ] },
                        { $lt: [
                          { $toDouble: { $ifNull: ["$$v.discountedPrice", 0] } }, 
                          { $toDouble: { $ifNull: ["$$v.basePrice", 0] } } 
                        ] }
                    ]
                  },
                    },
                  },
                },
              },
            },
            { $match: { hasDiscount: true } },
          ];
    }

    // Sorting
    const sortOptions = {
        price_asc: { "variants.0.discountedPrice": 1 },
        price_desc: { "variants.0.discountedPrice": -1 },
        newest: { createdAt: -1 },
        popular: { views: -1 },
    };
    const sortObj = sortOptions[effectiveSort] || sortOptions.newest;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let total, products;
    if (aggregatePipeline.length > 0) {
        const aggregateResult = await Products.aggregate([
            ...aggregatePipeline,
            { $match: query },
            { $sort: sortObj },
            { $skip: skip },
            { $limit: parseInt(limit) },
            { $lookup: { from: "categories", localField: "category", foreignField: "_id", as: "category" } }
        ]);
        const countAggregate = await Products.aggregate([
            ...aggregatePipeline,
            { $match: query },
            { $count: "total" }
        ]);
        total = countAggregate[0]?.total || 0;
        products = aggregateResult;
    } else {
        total = await Products.countDocuments(query);
        products = await Products.find(query).sort(sortObj).skip(skip).limit(parseInt(limit)).populate('category');
    }

    // Wishlist
    let wishlist = [];
    if (req.session.user) {
      const user = await User.findOne({ email: req.session.user });
      if (user) {
        const wishlistDoc = await Wishlist.findOne({ userId: user._id }).populate('items.productId');
        if (wishlistDoc) {
          wishlist = wishlistDoc.items.map(item => ({ product: item.productId }));
        }
      }
    }
    
    // Render
    res.render("user/shop/categoryShop", {
        products,
        wishlist,
        name: pageTitle,
        search,
        sort: sort || "",
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit),
        total,
        error: null,
        minPrice: overallMinPrice,
        maxPrice: overallMaxPrice,
        queryMinPrice,
        queryMaxPrice,
        minPriceOptions,
        maxPriceOptions,
        topBrands,
        otherBrands,
        brands: allBrands,
        concentrations: uniqueConcentrations,
        selectedBrands,
        selectedConcentrations,
    });
  } catch (error) {
     console.error("Helper Error:", error);
     res.status(500).render("user/shop/categoryShop", {
       name: pageTitle,
       products: [],
       wishlist: [],
       error: ERROR_MESSAGES.INTERNAL_ERROR,
       minPrice: 0, maxPrice: 10000,
       minPriceOptions: [], maxPriceOptions: [],
       topBrands: [], otherBrands: [], brands: [],
       concentrations: [], selectedBrands: [], selectedConcentrations: [],
       totalPages: 0, page: 1, limit: 12, total: 0,
       search: "", sort: "",
       queryMinPrice: "", queryMaxPrice: ""
     });
  }
};
// Get shop
const getShop = async (req, res) => {
  try {
    const {
      search = "",
      gender = "ALL",
      sort = "",
      filter = "ALL",
      page = 1,
      limit = 12,
      minPrice: minPriceQuery,
      maxPrice: maxPriceQuery,
      brands,
      concentrations: concentrationsQuery,
    } = req.query;

    const pageTitle = "Shop";

    const [brandStats, uniqueConcentrations, priceStats] = await Promise.all([
      Products.aggregate([
        { $match: { isDeleted: false, isListed: true, brand: { $ne: null, $exists: true } } },
        { $group: { _id: { $toLower: "$brand" }, count: { $sum: 1 }, originalBrand: { $first: "$brand" } } },
        { $sort: { count: -1 } },
      ]),
      Products.distinct("concentration", { isDeleted: false, isListed: true }),
      Products.aggregate([
        { $match: { isDeleted: false, isListed: true } },
        { $unwind: "$variants" },
        {
          $group: {
            _id: null,
            minPrice: { $min: "$variants.discountedPrice" },
            maxPrice: { $max: "$variants.discountedPrice" },
          },
        },
      ]),
    ]);

    const overallMinPrice = priceStats[0]?.minPrice || 0;
    const overallMaxPrice = priceStats[0]?.maxPrice || 10000;

    const maxPriceOptions = [overallMinPrice, 1000, 3000, 5000, 10000, overallMaxPrice];
    const minPriceOptions = [5000, 10000, 15000, 30000, 50000, overallMaxPrice];

    const topBrands = brandStats.slice(0, 5).map(stat => stat.originalBrand);
    const otherBrands = brandStats.slice(5).map(stat => stat.originalBrand);
    const allBrands = [...topBrands, ...otherBrands];

    const queryMinPrice = minPriceQuery ? parseFloat(minPriceQuery) : undefined;
    const queryMaxPrice = maxPriceQuery ? parseFloat(maxPriceQuery) : undefined;
    const selectedBrands = brands ? brands.split(",").map((b) => b.trim().toLowerCase()).filter(Boolean) : [];
    const selectedConcentrations = concentrationsQuery ? concentrationsQuery.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean) : [];
    const effectiveSort = sort || "newest";

    let query = {
      isDeleted: false,
      isListed: true,
    };

    let searchMatch = null;
    if (search.trim()) {
      const escapedSearch = escapeRegex(search.trim());
      searchMatch = {
        $or: [
          { name: { $regex: new RegExp(escapedSearch, "i") } },
          { brand: { $regex: new RegExp(escapedSearch, "i") } },
        ],
      };
      query.$or = searchMatch.$or;
    }


    if (gender !== "ALL") {
      query.gender = gender;
    }


    if (selectedBrands.length > 0) {
      query.brand = { $in: selectedBrands.map(b => new RegExp('^' + escapeRegex(b) + '$', 'i')) };
    }
    if (selectedConcentrations.length > 0) {
      query.concentration = { $in: selectedConcentrations.map(c => new RegExp('^' + escapeRegex(c) + '$', 'i')) };
    }


    let variantMatch = {};
    if (filter === "stock") {
      variantMatch.stock = { $gt: 0 };
    }
    const priceMatch = {};
    if (queryMinPrice !== undefined) priceMatch.$gte = queryMinPrice;
    if (queryMaxPrice !== undefined) priceMatch.$lte = queryMaxPrice;
    if (Object.keys(priceMatch).length > 0) {
      variantMatch.discountedPrice = priceMatch;
    }
    if (Object.keys(variantMatch).length > 0) {
      query.variants = { $elemMatch: variantMatch };
    }

    if (filter === "new") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      query.createdAt = { $gte: thirtyDaysAgo };
    }

    // Pipeline for Sale filter (robust check)
    let aggregatePipeline = [];
    if (filter === "sale") {
         aggregatePipeline = [
            {
              $addFields: {
                hasDiscount: {
                  $anyElementTrue: {
                    $map: {
                      input: { $ifNull: ["$variants", []] },
                      as: "v",
                      in: { 
                        $and: [
                            { $gt: [ { $toDouble: { $ifNull: ["$$v.discountedPrice", 0] } }, 0 ] },
                            { $lt: [
                              { $toDouble: { $ifNull: ["$$v.discountedPrice", 0] } }, 
                              { $toDouble: { $ifNull: ["$$v.basePrice", 0] } } 
                            ] }
                        ]
                      },
                    },
                  },
                },
              },
            },
            { $match: { hasDiscount: true } },
          ];
    }


    const sortOptions = {
      price_asc: { "variants.0.discountedPrice": 1 },
      price_desc: { "variants.0.discountedPrice": -1 },
      newest: { createdAt: -1 },
      popular: { views: -1 },
    };
    const sortObj = sortOptions[effectiveSort] || sortOptions.newest;


    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalQuery = { ...query };

    let total;
    let products;
    if (aggregatePipeline.length > 0) {
      const aggregateResult = await Products.aggregate([
        ...aggregatePipeline,
        { $match: query },
        { $sort: sortObj },
        { $skip: skip },
        { $limit: parseInt(limit) },
        {
          $lookup: {
            from: "categories",
            localField: "category",
            foreignField: "_id",
            as: "category",
          },
        },
      ]);
      const countAggregate = await Products.aggregate([
        ...aggregatePipeline,
        { $match: query },
        { $count: "total" },
      ]);
      total = countAggregate[0]?.total || 0;
      products = aggregateResult;
    } else {
      total = await Products.countDocuments(totalQuery);
      products = await Products.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit))
        .populate("category");
    }


    let wishlist = [];
    if (req.session.user) {
      const user = await User.findOne({ email: req.session.user });
      if (user) {
        const wishlistDoc = await Wishlist.findOne({ userId: user._id }).populate('items.productId');
        if (wishlistDoc) {
          wishlist = wishlistDoc.items.map(item => ({ product: item.productId }));
        }
      }
    }

    const totalPages = Math.ceil(total / parseInt(limit));
    const currentPage = parseInt(page);

    res.render("user/shop/shop", {
      products,
      wishlist,
      search,
      gender,
      sort,
      filter,
      page: currentPage,
      totalPages,
      limit: parseInt(limit),
      total,
      error: null,
      minPrice: overallMinPrice,
      maxPrice: overallMaxPrice,
      queryMinPrice,
      queryMaxPrice,
      minPriceOptions,
      maxPriceOptions,
      topBrands,
      otherBrands,
      brands: allBrands,
      concentrations: uniqueConcentrations,
      selectedBrands,
      selectedConcentrations,
      pageTitle,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("user/shop/shop", {
      products: [],
      wishlist: [],
      error: ERROR_MESSAGES.INTERNAL_ERROR,
      minPrice: 0,
      maxPrice: 10000,
      minPriceOptions: [5000, 10000, 15000, 30000, 50000, 10000],
      maxPriceOptions: [0, 1000, 3000, 5000, 10000, 10000],
      topBrands: [],
      otherBrands: [],
      brands: [],
      concentrations: [],
      selectedBrands: [],
      selectedConcentrations: [],
      search: "",
      gender: "ALL",
      sort: "",
      filter: "ALL",
      page: 1,
      totalPages: 0,
      limit: 12,
      total: 0,
      queryMinPrice: "",
      queryMaxPrice: "",
      pageTitle: "Shop",
    });
  }
};

// Get offers
const getOffers = async (req, res) => {
  try {
      const currentDate = new Date();
      const activeOffers = await Offer.find({
        isActive: true,
        isDeleted: false,
        startDate: { $lte: currentDate },
        endDate: { $gte: currentDate }
      });

      let targetProductIds = [];
      let targetCategoryIds = [];

      activeOffers.forEach(offer => {
        if (offer.appliesTo === 'product' || offer.targetModel === 'Product') {
           if (offer.targetId && Array.isArray(offer.targetId)) {
               targetProductIds.push(...offer.targetId);
           }
        } else if (offer.appliesTo === 'category' || offer.targetModel === 'Categories') {
           if (offer.targetId && Array.isArray(offer.targetId)) {
               targetCategoryIds.push(...offer.targetId);
           }
        }
      });
      
      const baseQuery = {
            $or: [
              { _id: { $in: targetProductIds } },
              { category: { $in: targetCategoryIds } }
            ]
      };
      
      // Override filter to 'sale' to ensure helper applies price validation if needed
      // Or we can rely on baseQuery filtering active offers.
      // But keeping 'sale' adds the Strict Price Check which is good.
      req.query.filter = "sale";

      await getCategoryShopHelper(req, res, baseQuery, "Exclusive Offers");

  } catch (error) {
      console.error(error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Product detail
const productDetail = async (req, res) => {
  try {
    const id = req.params.id
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).render("pageNotFound");
    }
    const product = await Products.findById(id);
    if (!product || product.isDeleted) {
      return res.status(404).render("pageNotFound");
    }

    let categoryId = product.category;
    if (Array.isArray(categoryId)) {
      categoryId = categoryId[0];
    }

    const currentDate = new Date();
    const productOffers = await Offer.find({
      targetModel: 'Product',
      targetId: product._id,
      isActive: true,
      isDeleted: false,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate }
    });
    
    const categoryOffers = await Offer.find({
      targetModel: 'Categories',
      targetId: categoryId,
      isActive: true,
      isDeleted: false,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate }
    });
    
    const activeOffers = [...productOffers, ...categoryOffers];

    // Real-time price correction check
    let productModified = false;
    if (product.variants && product.variants.length > 0) {
        product.variants.forEach(variant => {
            let bestPrice = variant.basePrice;
            
            if (activeOffers.length > 0) {
                 const prices = activeOffers.map((offer) => {
                    let discounted = variant.basePrice;
                    if (offer.discountType === "flat") {
                      discounted = variant.basePrice - offer.discountValue;
                    } else {
                      discounted = variant.basePrice - (variant.basePrice * offer.discountValue) / 100;
                    }
                    return Math.max(0, discounted);
                  });
                  bestPrice = Math.min(variant.basePrice, ...prices);
            }
            
            const roundedBestPrice = Math.round(bestPrice);
            if (variant.discountedPrice !== roundedBestPrice) {
                variant.discountedPrice = roundedBestPrice;
                productModified = true;
            }
        });
        
        if (productModified) {
            await product.save();
        }
    }


    const suggestions = await Products.find({
      category: categoryId,
      _id: { $ne: product._id },
      isDeleted: false,
      isListed: true,
    }).limit(3);
    const representativePrice = product.variants && product.variants.length > 0 ? product.variants[0].basePrice : 0;
    let bestOffer = null;
    let maxDiscountAmount = 0;

    activeOffers.forEach(offer => {
      let discountAmount = 0;
      if (offer.discountType === 'percentage') {
        discountAmount = (representativePrice * offer.discountValue) / 100;
      } else {
        discountAmount = offer.discountValue;
      }

      if (discountAmount > maxDiscountAmount) {
        maxDiscountAmount = discountAmount;
        bestOffer = offer;
      }
    });

    let totalCartQty = 0;
    if (req.session.user) {
        const user = await User.findOne({ email: req.session.user });
        if (user) {
            const cart = await Cart.findOne({ userId: user._id });
            if (cart) {
                totalCartQty = cart.items.reduce((acc, item) => acc + item.quantity, 0);
            }
        }
    }

    const reviews = await Review.find({ productId: product._id, isDeleted: false }).sort({ createdAt: -1 });
    
    // Calculate Review Stats
    let totalReviews = reviews.length;
    let averageRating = 0;
    let starCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    
    if (totalReviews > 0) {
        const sum = reviews.reduce((acc, curr) => {
            if (curr.rating >= 1 && curr.rating <= 5) {
                starCounts[curr.rating]++;
            }
            return acc + curr.rating;
        }, 0);
        averageRating = (sum / totalReviews).toFixed(1);
    }

    const reviewStats = {
        totalReviews,
        averageRating,
        starCounts,
        percentages: {
            5: totalReviews ? Math.round((starCounts[5] / totalReviews) * 100) : 0,
            4: totalReviews ? Math.round((starCounts[4] / totalReviews) * 100) : 0,
            3: totalReviews ? Math.round((starCounts[3] / totalReviews) * 100) : 0,
            2: totalReviews ? Math.round((starCounts[2] / totalReviews) * 100) : 0,
            1: totalReviews ? Math.round((starCounts[1] / totalReviews) * 100) : 0,
        }
    };

    res.render("user/shop/productDetail", {
      product,
      suggestions,
      activeOffers: bestOffer ? [bestOffer] : [],
      totalCartQty,
      reviews,
      reviewStats,
      error: req.query.error || null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("user/shop/productDetail", {
      product: null,
      suggestions: [],
      error: ERROR_MESSAGES.INTERNAL_ERROR,
    });
  }
};

// Get collections
const getCollections = async (req, res) => {
  try {
    const categories = await Categories.find({
      isActive: true,
      isDeleted: false,
    });
    const products = await Products.find({ isDeleted: false, isListed: true });
    res.render("user/shop/collection", { products, categories });
  } catch (error) {
    console.error(error);
  }
};

// Get men shop
const getMenShop = async (req, res) => {
  await getCategoryShopHelper(req, res, { gender: "MEN" }, "MEN");
};

// Get women shop
const getWomenShop = async (req, res) => {
    await getCategoryShopHelper(req, res, { gender: "WOMEN" }, "WOMEN");
};

// Get unisex shop
const getUnisexShop = async (req, res) => {
    await getCategoryShopHelper(req, res, { gender: "UNISEX" }, "UNISEX");
};

// Get category shop
const getCatogoryShop = async (req, res) => {
  try {
    const categorie = await Categories.findOne({ name: req.params.id });
    if (!categorie) {
      return res.status(404).render("user/shop/categoryShop", {
        name: "Category Not Found",
        products: [],
        wishlist: [],
        error: ERROR_MESSAGES.CATEGORY_NOT_FOUND,
        minPrice: 0, maxPrice: 10000,
        minPriceOptions: [], maxPriceOptions: [],
        topBrands: [], otherBrands: [], brands: [],
        concentrations: [], selectedBrands: [], selectedConcentrations: [],
        totalPages: 0, page: 1, limit: 12, total: 0,
        search: "", sort: ""
      });
    }
    await getCategoryShopHelper(req, res, { _id: { $in: categorie.products } }, categorie.name.toUpperCase());
  } catch (error) {
    console.error(error);
      res.status(500).render("user/shop/categoryShop", {
        name: "Error",
        products: [],
        wishlist: [],
        error: ERROR_MESSAGES.INTERNAL_ERROR,
        minPrice: 0, maxPrice: 10000,
        minPriceOptions: [], maxPriceOptions: [],
        topBrands: [], otherBrands: [], brands: [],
        concentrations: [], selectedBrands: [], selectedConcentrations: [],
        totalPages: 0, page: 1, limit: 12, total: 0,
        search: "", sort: ""
      });
  }
};

// Get product API
const getProductAPI = async (req, res) => {
  try {
    const product = await Products.findById(req.params.id);
    if (!product || product.isDeleted || !product.isListed) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: ERROR_MESSAGES.PRODUCT_UNAVAILABLE });
    }
    res.json({ success: true, product });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: ERROR_MESSAGES.INTERNAL_ERROR });
  }
};

export {
  getShop,
  getOffers,
  productDetail,
  getCollections,
  getMenShop,
  getWomenShop,
  getUnisexShop,
  getCatogoryShop,
  getProductAPI,
};
