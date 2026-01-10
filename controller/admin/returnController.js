import Orders from "../../models/ordersModel.js";
import Products from "../../models/productsModels.js";
import Wallet from "../../models/walletModel.js";
import { nanoid } from "nanoid";

// Get return
const getReturn = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Prepare messages from session
    const successMessage = req.session.success;
    const errorMessage = req.session.error;
    delete req.session.success;
    delete req.session.error;

    // Total Returns Count (only those with returndProduct)
    const totalReturnsResult = await Orders.aggregate([
      {
        $unwind: { path: "$returndProduct", preserveNullAndEmptyArrays: false },
      },
      { $match: { "returndProduct.adminApproved": { $exists: true } } },
      { $count: "total" },
    ]);
    const totalReturns = totalReturnsResult[0]?.total || 0;

    // Requested Returns Count
    const requestedResult = await Orders.aggregate([
      {
        $unwind: { path: "$returndProduct", preserveNullAndEmptyArrays: false },
      },
      { $match: { "returndProduct.adminApproved": "Requested" } },
      { $count: "count" },
    ]);
    const requestedReturnsCount = requestedResult[0]?.count || 0;

    // Approved Returns Count
    const approvedResult = await Orders.aggregate([
      {
        $unwind: { path: "$returndProduct", preserveNullAndEmptyArrays: false },
      },
      { $match: { "returndProduct.adminApproved": "Approved" } },
      { $count: "count" },
    ]);
    const approvedReturnsCount = approvedResult[0]?.count || 0;

    // Total Refund Amount
    const totalRefundResult = await Orders.aggregate([
      {
        $unwind: { path: "$returndProduct", preserveNullAndEmptyArrays: false },
      },
      { $match: { "returndProduct.adminApproved": "Approved" } },
      {
        $group: {
          _id: null,
          totalRefund: {
            $sum: {
              $multiply: [
                "$returndProduct.discountedPrice",
                "$returndProduct.returndQuantity",
              ],
            },
          },
        },
      },
    ]);
    const totalRefundAmount =
      totalRefundResult.length > 0
        ? [{ totalRefund: totalRefundResult[0].totalRefund.toFixed(2) }]
        : [{ totalRefund: "0.00" }];

    // Returns Pipeline (fixed: unwind with preserve false, match exists, sort before skip/limit, project order_id for EJS link)
    const returnsPipeline = [
      {
        $unwind: { path: "$returndProduct", preserveNullAndEmptyArrays: false },
      },
      { $match: { "returndProduct.adminApproved": { $exists: true } } },
      { $sort: { "returndProduct.returnedAt": -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: "$returndProduct._id", // Subdoc _id for potential use
          order_id: "$_id", // Order's MongoDB _id for EJS link (/admin/return/<%= returnItem.order_id %>)
          returnID: { $concat: ["R-", { $toString: "$returndProduct._id" }] }, // Enhanced returnID for display
          orderID: "$orderID", // Original orderID (nanoid)
          address: "$address",
          returnedAt: "$returndProduct.returnedAt",
          refundAmount: {
            $multiply: [
              "$returndProduct.discountedPrice",
              "$returndProduct.returndQuantity",
            ],
          },
          name: "$returndProduct.name",
          mlSize: "$returndProduct.mlSize",
          quantity: "$returndProduct.returndQuantity",
          adminApproved: "$returndProduct.adminApproved",
          reason: "$returndProduct.reason",
          image: "$returndProduct.image",
          productId: "$returndProduct.productId",
          basePrice: "$returndProduct.basePrice",
          discountedPrice: "$returndProduct.discountedPrice",
        },
      },
    ];

    const returns = await Orders.aggregate(returnsPipeline);


    const totalPages = Math.ceil(totalReturns / limit);

    res.render("admin/returns/return", {
      title: "Returns Management",
      totalReturns,
      requestedReturnsCount,
      approvedReturnsCount,
      totalRefundAmount,
      returns,
      currentPage: page,
      totalPages,
      limit,
      successMessage,
      errorMessage,
    });
  } catch (error) {
    console.error("Error fetching returns:", error);
    req.session.error = "Failed to load returns data.";
    res.redirect("/admin/return");
  }
};

// Get return details
const getReturnDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Orders.findById(orderId).populate(
      "userId",
      "name email phone"
    );
    if (!order) {
      req.session.error = "Order not found";
      return res.redirect("/admin/returns");
    }

    const user = order.userId;
    let returnItem;

    if (req.query.returnId) {
      returnItem = order.returndProduct.find(
        (item) => item._id.toString() === req.query.returnId
      );
    }

    if (!returnItem) {
      // Fallback or error if ID invalid
      returnItem = order.returndProduct[0];
    }

    if (!returnItem) {
      req.session.error = "Return not found";
      return res.redirect("/admin/returns");
    }

    // Add missing fields virtually
    const enhancedReturnItem = {
      ...returnItem.toObject(),
      returnId: nanoid(6),
      images: [],
      rejectReason:
        returnItem.rejectReason ||
        (returnItem.adminApproved === "Rejected" ? "No reason provided" : ""),
      approvedAt: returnItem.adminApproved === "Approved" ? new Date() : null,
      rejectedAt: returnItem.adminApproved === "Rejected" ? new Date() : null,
      processingAt:
        returnItem.adminApproved === "Processing" ? new Date() : null,
      completedAt: returnItem.adminApproved === "Completed" ? new Date() : null,
      returndQuantity: returnItem.returndQuantity || 1,
    };

    const successMessage = req.session.success;
    const errorMessage = req.session.error;

    delete req.session.success;
    delete req.session.error;

    res.render("admin/returns/returnDetails", {
      order,
      returnItem: enhancedReturnItem,
      user,
      successMessage,
      errorMessage,
    });
  } catch (error) {
    console.error(error);
    req.session.error = "Failed to fetch return details";
    res.redirect("/admin/returns");
  }
};

// Return approve
const returnApprove = async (req, res) => {
  const { orderId } = req.params;
  try {
    const order = await Orders.findById(orderId);
    if (!order) {
      req.session.error = "Order not found";
      return res.redirect(`/admin/return/${orderId}`);
    }

    // Find the return request
    let returnItem;
    if (req.query.returnId) {
      returnItem = order.returndProduct.find(
        (item) => item._id.toString() === req.query.returnId
      );
    } else {
      // Fallback: Find the first pending return request
      returnItem = order.returndProduct.find(
        (item) => item.adminApproved === "Requested"
      );
    }

    if (!returnItem) {
      req.session.error = "Return request not found";
      return res.redirect(`/admin/return/${orderId}`);
    }

    if (returnItem.adminApproved !== "Requested") {
      req.session.error = "Return already processed";
      return res.redirect(
        `/admin/return/${orderId}?returnId=${returnItem._id}`
      );
    }

    // Update return status
    returnItem.adminApproved = "Approved";

    // Update original item status to Returned and reduce quantity
    let hasActiveItems = false;
    const originalItem = order.items.find(
      (item) =>
        item.productId.toString() === returnItem.productId.toString() &&
        item.mlSize === returnItem.mlSize
    );

    if (originalItem) {
      originalItem.quantity -= returnItem.returndQuantity;
      if (originalItem.quantity <= 0) {
        originalItem.productStatus = "Returned";
      }
    }

    // Check if any active items remain
    hasActiveItems = order.items.some((item) => item.quantity > 0);

    // Update order status only if no active items remain
    if (!hasActiveItems) {
      order.orderStatus = "Returned";
    }

    // Add tracking entry for return approval
    order.tracking.push({
      status: "Return Approved",
      date: new Date(),
      message: "Return approved by admin and stock updated",
    });

    // Increase stock in specific variant
    await Products.findOneAndUpdate(
      {
        _id: returnItem.productId,
        "variants.mlSize": returnItem.mlSize,
      },
      {
        $inc: { "variants.$.stock": returnItem.returndQuantity },
      }
    );

    await order.save();

    // Refund to wallet using the net-per-unit price stored during request creation
    const refundPerUnit = Math.max(0, returnItem.discountedPrice || 0);
    const totalRefundAmount = refundPerUnit * (returnItem.returndQuantity || 0);
    if (
      totalRefundAmount > 0 &&
      (order.paymentMethod === "online" ||
        order.paymentMethod === "Wallet" ||
        order.paymentMethod === "wallet" ||
        order.paymentMethod === "cod")
    ) {
      await Wallet.refundToWallet(
        order.userId,
        totalRefundAmount,
        `Refund (Return) for order ${order.orderID}: ${returnItem.name} (${returnItem.mlSize}ml)`,
        order._id.toString()
      );
    }

    req.session.success =
      "Return approved, order status updated, and stock restored successfully";
    res.redirect(`/admin/return/${orderId}`);
  } catch (error) {
    console.error(error);
    req.session.error = "Failed to approve return";
    res.redirect(`/admin/return/${orderId}`);
  }
};

// Return reject
const returnReject = async (req, res) => {
  const { orderId } = req.params;
  const { reason } = req.body; // In case we add a reason later
  try {
    const order = await Orders.findById(orderId);
    if (!order) {
      req.session.error = "Order not found";
      return res.redirect(`/admin/return/${orderId}`);
    }

    // Find the return request
    let returnItem;
    if (req.query.returnId) {
      returnItem = order.returndProduct.find(
        (item) => item._id.toString() === req.query.returnId
      );
    } else {
      // Fallback: Find the first pending return request
      returnItem = order.returndProduct.find(
        (item) => item.adminApproved === "Requested"
      );
    }

    if (!returnItem) {
      req.session.error = "Return request not found";
      return res.redirect(`/admin/return/${orderId}`);
    }

    if (returnItem.adminApproved !== "Requested") {
      req.session.error = "Return already processed";
      return res.redirect(
        `/admin/return/${orderId}?returnId=${returnItem._id}`
      );
    }

    // Update return status
    returnItem.adminApproved = "Rejected";

    // Set reject reason if provided
    if (reason) {
      returnItem.rejectReason = reason;
    } else {
      returnItem.rejectReason = "Rejected by Admin";
    }

    // Add tracking entry for return rejection
    order.tracking.push({
      status: "Return Rejected",
      date: new Date(),
      message: "Return rejected by admin",
    });

    await order.save();

    req.session.success = "Return rejected successfully";
    res.redirect(`/admin/return/${orderId}?returnId=${returnItem._id}`);
  } catch (error) {
    console.error(error);
    req.session.error = "Failed to reject return";
    res.redirect(`/admin/return/${orderId}`);
  }
};

export {
    getReturn,
    getReturnDetails,
    returnApprove,
    returnReject
}
