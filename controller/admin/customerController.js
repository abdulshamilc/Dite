import { ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";
import { User } from "../../models/userModels.js";

// Get customers (excludes deleted users)
const getcustomers = async (req, res) => {
  try {
    const { page, limit, skip } = req.pagination;

    // Search, Filter & Sort
    const search = req.query.search || "";
    const status = req.query.status || "all";
    const sort = req.query.sort || "newest";

    // Base query - exclude deleted users
    const query = { isDeleted: { $ne: true } };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    if (status !== "all") {
      if (status === "active") query.isBlocked = false;
      if (status === "blocked") query.isBlocked = true;
    }

    let sortOptions = { createdAt: -1 };
    if (sort === "oldest") sortOptions = { createdAt: 1 };
    if (sort === "a_z") sortOptions = { name: 1 };
    if (sort === "z_a") sortOptions = { name: -1 };

    const customers = await User.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    const totalCustomersQuery = await User.countDocuments(query);
    const totalPages = Math.ceil(totalCustomersQuery / limit);
    
    // Finding Newly Registered Customers (excluding deleted)
    const today = new Date();
    const past15Days = new Date();
    past15Days.setDate(today.getDate() - 15);

    const newCustomerCount = await User.countDocuments({
      isDeleted: { $ne: true },
      createdAt: { $gte: past15Days, $lte: today },
    });

    // Finding Total Orders (excluding deleted users)
    const totelOrdersResult = await User.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: null, totelOrders: { $sum: "$totalOrders" } } },
    ]);
    const totelOrdersCount = totelOrdersResult.length > 0 
      ? totelOrdersResult 
      : [{ totelOrders: 0 }];

    // Finding Total Spend (excluding deleted users)
    const totelSpentResult = await User.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: null, totelSpent: { $sum: "$totalSpent" } } },
    ]);
    const totelSpentCount = totelSpentResult.length > 0 
      ? totelSpentResult 
      : [{ totelSpent: 0 }];
      
    // Total active customers
    const totalCustomersStats = await User.countDocuments({ isDeleted: { $ne: true } });

    res.render("admin/customers/customers", {
      customers,
      newCustomerCount,
      totelOrdersCount,
      totelSpentCount,
      totalCustomers: totalCustomersStats,
      limit,
      currentPage: page,
      totalPages,
      search,
      status,
      sort,
    });
  } catch (err) {
    console.error(err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Block user
const blockUser = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id });

    user.isBlocked = !user.isBlocked;
    await user.save();
    res.redirect("/admin/customers");
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Customer details
const customerDetails = async (req, res) => {
  try {
    const id = req.params.id;
    const customer = await User.findById(id);

    if (!customer) {
      return res.redirect("/admin/customers");
    }

    let referredCustomers = [];
    if (customer.referralCode) {
      referredCustomers = await User.find({ referredBy: customer.referralCode });
    }

    const referredCount = referredCustomers.length;

    // Calculate returned orders for this customer
    const returnedOrders = await import("../../models/ordersModel.js").then(mod => mod.default.find({ 
      userId: id,
      $or: [
          { orderStatus: "Returned" },
          { "returndProduct.0": { $exists: true } }
      ]
    }));
    
    const returnedOrderCount = returnedOrders.length;

    // Fetch Customer Address
    const Address = (await import("../../models/addressModel.js")).Address;
    let customerAddress = await Address.findOne({ userId: id, isDefault: true, isDeleted: false });
    
    if (!customerAddress) {
       customerAddress = await Address.findOne({ userId: id, isDeleted: false });
    }

    res.render("admin/customers/customerDetails", {
      customer,
      customerAddress,
      referredCustomers,
      referredCount,
      returnedOrderCount,
    });
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Get deleted users
const getDeletedUsers = async (req, res) => {
  try {
    const { page, limit, skip } = req.pagination;

    // Search & Sort
    const search = req.query.search || "";
    const sort = req.query.sort || "newest";

    // Query for deleted users only
    const query = { isDeleted: true };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    let sortOptions = { deletedAt: -1 };
    if (sort === "oldest") sortOptions = { deletedAt: 1 };
    if (sort === "a_z") sortOptions = { name: 1 };
    if (sort === "z_a") sortOptions = { name: -1 };

    const deletedUsers = await User.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    const totalDeletedUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalDeletedUsers / limit);

    // Calculate total spent by deleted users
    const totalSpentResult = await User.aggregate([
      { $match: { isDeleted: true } },
      { $group: { _id: null, totalSpent: { $sum: "$totalSpent" } } },
    ]);
    const totalSpent = totalSpentResult.length > 0 ? totalSpentResult[0].totalSpent : 0;

    // Calculate total orders by deleted users
    const totalOrdersResult = await User.aggregate([
      { $match: { isDeleted: true } },
      { $group: { _id: null, totalOrders: { $sum: "$totalOrders" } } },
    ]);
    const totalOrders = totalOrdersResult.length > 0 ? totalOrdersResult[0].totalOrders : 0;

    res.render("admin/customers/deletedUsers", {
      deletedUsers,
      totalDeletedUsers,
      totalSpent,
      totalOrders,
      limit,
      currentPage: page,
      totalPages,
      search,
      sort,
    });
  } catch (err) {
    console.error(err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Get deleted user details
const getDeletedUserDetails = async (req, res) => {
  try {
    const id = req.params.id;
    const deletedUser = await User.findOne({ _id: id, isDeleted: true });

    if (!deletedUser) {
      return res.redirect("/admin/customers/deleted");
    }

    // Fetch orders associated with the user
    const Order = (await import("../../models/ordersModel.js")).default;
    const orders = await Order.find({ userId: deletedUser._id })
      .sort({ createdAt: -1 })
      .limit(10);

    res.render("admin/customers/deletedUserDetails", {
      deletedUser,
      orders,
    });
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};


export {
    getcustomers,
    blockUser,
    customerDetails,
    getDeletedUsers,
    getDeletedUserDetails
}
