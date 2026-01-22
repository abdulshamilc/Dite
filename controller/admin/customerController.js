import { ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";
import { User } from "../../models/userModels.js";

// Get customers
const getcustomers = async (req, res) => {
  try {
    // Pagination

    const { page, limit, skip } = req.pagination;

    //fetch customers accoding to pagination

    // Search, Filter & Sort
    const search = req.query.search || "";
    const status = req.query.status || "all";
    const sort = req.query.sort || "newest";

    const query = {};

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

    const totalCustomersQuery = await User.countDocuments(query); // Count filtered documents for pagination
    const totalPages = Math.ceil(totalCustomersQuery / limit);
    
    // Finding Newely Registed Customers
    const today = new Date();
    const past15Days = new Date();
    past15Days.setDate(today.getDate() - 15);

    const newCustomerCount = await User.countDocuments({
      createdAt: { $gte: past15Days, $lte: today },
    });

    // Finding Totel Orders
    const totelOrdersResult = await User.aggregate([
      {
        $group: { _id: null, totelOrders: { $sum: "$totalOrders" } },
      },
    ]);
    // Provide default value if aggregation returns empty array
    const totelOrdersCount = totelOrdersResult.length > 0 
      ? totelOrdersResult 
      : [{ totelOrders: 0 }];

    // Finding Totel Spend
    const totelSpentResult = await User.aggregate([
      {
        $group: { _id: null, totelSpent: { $sum: "$totalSpent" } },
      },
    ]);
    // Provide default value if aggregation returns empty array
    const totelSpentCount = totelSpentResult.length > 0 
      ? totelSpentResult 
      : [{ totelSpent: 0 }];
    // Finding Totel customers (Absolute total for stats)
    const totalCustomersStats = await User.countDocuments();

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
          { "returndProduct.0": { $exists: true } } // Checks if returndProduct array is not empty
      ]
    }));
    
    // Usually "Returned Orders" implies number of order documents containing returns.
    const returnedOrderCount = returnedOrders.length;

    // Fetch Customer Address (Default preferred, otherwise first found)
    const Address = (await import("../../models/addressModel.js")).Address;
    let customerAddress = await Address.findOne({ userId: id, isDefault: true, isDeleted: false });
    
    if (!customerAddress) {
       customerAddress = await Address.findOne({ userId: id, isDeleted: false });
    }

    res.render("admin/customers/customerDetails", {
      customer,
      customerAddress, // Pass address to view
      referredCustomers,
      referredCount,
      returnedOrderCount,
    });
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};


export {
    getcustomers,
    blockUser,
    customerDetails
}
