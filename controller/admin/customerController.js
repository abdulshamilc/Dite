import { User } from "../../models/userModels.js";

// Get customers
const getcustomers = async (req, res) => {
  try {
    // Pagination

    const { page, limit, skip } = req.pagination;

    //fetch customers accoding to pagination

    const customers = await User.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Finding Newely Registed Customers
    const today = new Date();
    const past15Days = new Date();
    past15Days.setDate(today.getDate() - 15);

    const newCustomerCount = await User.countDocuments({
      createdAt: { $gte: past15Days, $lte: today },
    });

    // Finding Totel Orders
    const totelOrdersCount = await User.aggregate([
      {
        $group: { _id: null, totelOrders: { $sum: "$totalOrders" } },
      },
    ]);

    // Finding Totel Spend
    const totelSpentCount = await User.aggregate([
      {
        $group: { _id: null, totelSpent: { $sum: "$totalSpent" } },
      },
    ]);
    // Finding Totel customers
    const totalCustomers = await User.countDocuments();

    res.render("admin/customers/customers", {
      customers,
      newCustomerCount,
      totelOrdersCount,
      totelSpentCount,
      totalCustomers,
      limit,
      currentPage: page,
      totalPages: Math.ceil(totalCustomers / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
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
    res.status(500).send("Server Error");
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
    // We count orders where at least one item is returned or the main status is Returned
    // However, looking at the schema, we can check returndProduct array in Order model
    const returnedOrders = await import("../../models/ordersModel.js").then(mod => mod.default.find({ 
      userId: id,
      $or: [
          { orderStatus: "Returned" },
          { "returndProduct.0": { $exists: true } } // Checks if returndProduct array is not empty
      ]
    }));
    
    // Calculate total count of returned items or orders? 
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
    res.status(500).send("Server Error");
  }
};

export {
    getcustomers,
    blockUser,
    customerDetails
}
