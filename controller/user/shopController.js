import Categories from "../../models/categories.js";
import Products from "../../models/productsModels.js";

const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

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

    // Fetch unique values and price stats
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

    // Predefined price options
    const maxPriceOptions = [overallMinPrice, 1000, 3000, 5000, 10000, overallMaxPrice];
    const minPriceOptions = [5000, 10000, 15000, 30000, 50000, overallMaxPrice];

    const topBrands = brandStats.slice(0, 5).map(stat => stat.originalBrand);
    const otherBrands = brandStats.slice(5).map(stat => stat.originalBrand);
    const allBrands = [...topBrands, ...otherBrands];

    const queryMinPrice = minPriceQuery ? parseFloat(minPriceQuery) : undefined;
    const queryMaxPrice = maxPriceQuery ? parseFloat(maxPriceQuery) : undefined;
    const selectedBrands = brands ? brands.split(",").map((b) => b.trim().toLowerCase()).filter(Boolean) : [];
    const selectedConcentrations = concentrationsQuery ? concentrationsQuery.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean) : [];

    // Effective sort
    const effectiveSort = sort || "newest";

    // Build the base query
    let query = {
      isDeleted: false,
      isListed: true,
    };

    // Search filter 
    let searchMatch = null;
    if (search.trim()) {
      const escapedSearch = escapeRegex(search.trim());
      searchMatch = {
        $or: [
          { name: { $regex: new RegExp("^" + escapedSearch, "i") } },
          { brand: { $regex: new RegExp(escapedSearch, "i") } },
        ],
      };
      query.$or = searchMatch.$or;
    }

    // Gender filter
    if (gender !== "ALL") {
      query.gender = gender;
    }

    // Brands and Concentrations - case insensitive
    if (selectedBrands.length > 0) {
      query.brand = { $in: selectedBrands.map(b => new RegExp('^' + escapeRegex(b) + '$', 'i')) };
    }
    if (selectedConcentrations.length > 0) {
      query.concentration = { $in: selectedConcentrations.map(c => new RegExp('^' + escapeRegex(c) + '$', 'i')) };
    }

    // Variant match object
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
                  in: { $lt: ["$$v.discountedPrice", "$$v.basePrice"] },
                },
              },
            },
          },
        },
        { $match: { hasDiscount: true } },
      ];

      // Reset base query for aggregation
      query = { isDeleted: false, isListed: true };
      if (searchMatch) {
        aggregatePipeline.unshift({ $match: searchMatch });
      }
      if (gender !== "ALL") {
        aggregatePipeline.unshift({ $match: { gender } });
      }
    }

    // Sorting options
    const sortOptions = {
      price_asc: { "variants.0.discountedPrice": 1 },
      price_desc: { "variants.0.discountedPrice": -1 },
      newest: { createdAt: -1 },
      popular: { views: -1 },
    };
    const sortObj = sortOptions[effectiveSort] || sortOptions.newest;

    // Pagination
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

    const totalPages = Math.ceil(total / parseInt(limit));
    const currentPage = parseInt(page);

    res.render("user/shop/shop", {
      products,
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
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("user/shop/shop", {
      products: [],
      error: "Something went wrong!",
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
    });
  }
};

const productDetail = async (req, res) => {
  try {
    const product = await Products.findById(req.params.id);
    if (!product || product.isDeleted) {
      return res.status(404).render("user/shop/productDetail", {
        product: null,
        suggestions: [],
        error: "Product not found!",
      });
    }
    const categoryId = product.category[0];
    const suggestions = await Products.find({
      category: categoryId,
      _id: { $ne: product._id },
      isDeleted: false,
      isListed: true,
    }).limit(3);
    res.render("user/shop/productDetail", {
      product,
      suggestions,
      error: req.query.error || null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("user/shop/productDetail", {
      product: null,
      suggestions: [],
      error: "Something went wrong!",
    });
  }
};

// Collection field

const getCollections = async (req, res) => {
  try {
    const categories = await Categories.find({
      isActive: true,
      isDeleted: false,
    });
    const products = await Products.find({ isDeleted: false, isListed: true });
    res.render("user/shop/collection", { products, categories });
  } catch (error) {
    console.log(error);
  }
};

const getMenShop = async (req, res) => {
  try {
    const name = "MEN";
    const {
      page = 1,
      limit = 12,
      search = "",
      sort = "newest",
      filter = "ALL",
    } = req.query;

    let query = {
      isDeleted: false,
      isListed: true,
      gender: "MEN",
    };

    // Search filter 
    if (search.trim()) {
      const escapedSearch = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: new RegExp('^' + escapedSearch, 'i') } },
        { brand: { $regex: new RegExp(escapedSearch, 'i') } },
      ];
    }

    // Sorting options
    const sortOptions = {
      price_asc: { "variants.0.discountedPrice": 1 },
      price_desc: { "variants.0.discountedPrice": -1 },
      newest: { createdAt: -1 },
      popular: { views: -1 },
    };
    const sortObj = sortOptions[sort] || sortOptions.newest;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Products.countDocuments(query);
    const products = await Products.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));
    res.render("user/shop/menShop", {
      products,
      name,
      search,
      sort,
      filter,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.log(error);
  }
};

const getWomenShop = async (req, res) => {
  try {
    const name = "WOMEN";
    const {
      page = 1,
      limit = 12,
      search = "",
      sort = "newest",
      filter = "ALL",
    } = req.query;

    let query = {
      isDeleted: false,
      isListed: true,
      gender: "WOMEN",
    };

    // Search filter -
    if (search.trim()) {
      const escapedSearch = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: new RegExp('^' + escapedSearch, 'i') } },
        { brand: { $regex: new RegExp(escapedSearch, 'i') } },
      ];
    }

    // Sorting options
    const sortOptions = {
      price_asc: { "variants.0.discountedPrice": 1 },
      price_desc: { "variants.0.discountedPrice": -1 },
      newest: { createdAt: -1 },
      popular: { views: -1 },
    };
    const sortObj = sortOptions[sort] || sortOptions.newest;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Products.countDocuments(query);
    const products = await Products.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));
    res.render("user/shop/womenShop", {
      products,
      name,
      search,
      sort,
      filter,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.log(error);
  }
};

const getUnisexShop = async (req, res) => {
  try {
    const name = "UNISEX";
    const {
      page = 1,
      limit = 12,
      search = "",
      sort = "newest",
      filter = "ALL",
    } = req.query;

    let query = {
      isDeleted: false,
      isListed: true,
      gender: "UNISEX",
    };

    // Search filter - starts with for name, contains for description
    if (search.trim()) {
      const escapedSearch = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: new RegExp('^' + escapedSearch, 'i') } },
        { brand: { $regex: new RegExp(escapedSearch, 'i') } },
      ];
    }

    // Sorting options
    const sortOptions = {
      price_asc: { "variants.0.discountedPrice": 1 },
      price_desc: { "variants.0.discountedPrice": -1 },
      newest: { createdAt: -1 },
      popular: { views: -1 },
    };
    const sortObj = sortOptions[sort] || sortOptions.newest;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Products.countDocuments(query);
    const products = await Products.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));
    res.render("user/shop/unisexShop", {
      products,
      name,
      search,
      sort,
      filter,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.log(error);
  }
};

const getCatogoryShop = async (req, res) => {
  try {
    const categorie = await Categories.findOne({ name: req.params.id });
    if (!categorie) {
      return res.status(404).render("user/shop/catogoryShop", {
        products: [],
        catName: "",
        error: "Category not found!",
      });
    }
    const catName = categorie.name.toUpperCase();
    const {
      page = 1,
      limit = 12,
      search = "",
      sort = "newest",
      filter = "ALL",
    } = req.query;
    let query = {
      _id: { $in: categorie.products },
      isDeleted: false,
      isListed: true,
    };

    // Search filter - starts with for name, contains for description
    if (search.trim()) {
      const escapedSearch = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: new RegExp('^' + escapedSearch, 'i') } },
        { brand: { $regex: new RegExp(escapedSearch, 'i') } },
      ];
    }

    // Sorting options
    const sortOptions = {
      price_asc: { "variants.0.discountedPrice": 1 },
      price_desc: { "variants.0.discountedPrice": -1 },
      newest: { createdAt: -1 },
      popular: { views: -1 },
    };
    const sortObj = sortOptions[sort] || sortOptions.newest;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Products.countDocuments(query);
    const products = await Products.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));
    res.render("user/shop/catogoryShop", {
      products,
      catName,
      search,
      sort,
      filter,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error(error);
  }
};

export {
  getShop,
  productDetail,
  getCollections,
  getMenShop,
  getWomenShop,
  getUnisexShop,
  getCatogoryShop,
};