import Orders from "../../models/ordersModel.js";
import { User } from "../../models/userModels.js";
import PDFDocument from "pdfkit";
import moment from "moment";
import { SUCCESS_MESSAGES, ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";

// Get orders
const getOrders = async (req, res) => {
  try {
    if (!req.session.admin) return res.redirect("/login");
    const errorMessage = req.session.errorMessage;
    const successMessage = req.session.successMessage;
    req.session.errorMessage = null;
    req.session.successMessage = null;

    const { page, limit, skip } = req.pagination;

    const orders = await Orders.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalOrders = await Orders.countDocuments();

    const pendingOrdersCount = await Orders.countDocuments({
      orderStatus: { $in: ["Placed", "Shipped"] },
    });
    const completedOrdersCount = await Orders.countDocuments({
      orderStatus: "Delivered",
    });

    const revenueResult = await Orders.aggregate([
      { $match: { orderStatus: "Delivered" } },
      { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
    ]);
    const totalRevenueCount =
      revenueResult.length > 0 ? revenueResult : [{ totalRevenue: 0 }];

    const totalPages = Math.ceil(totalOrders / limit);
    const currentPage = page;

    res.render("admin/orders/orders", {
      orders,
      totalOrders,
      pendingOrdersCount,
      completedOrdersCount,
      totalRevenueCount,
      currentPage,
      totalPages,
      limit,
      errorMessage,
      successMessage,
    });
  } catch (error) {
    console.error("Error loading orders page:", error);
    return res.redirect("/admin");
  }
};

// Get view orders
const getViewOrders = async (req, res) => {
  try {
    const orderId = req.params.id;

    // Fetch the order with populated fields if needed (e.g., address if it's a ref, items with product details)
    const order = await Orders.findById(orderId);
    if (!order) {
      req.session.error = ERROR_MESSAGES.ORDER_NOT_FOUND;
      return res.redirect("/orders");
    }
    const user = await User.findById(order.userId);

    let subTotal = 0;
    let discountedPriceTotal = 0;

    if (order.items && order.items.length > 0) {
      // Base price subtotal
      subTotal = order.items
        .filter((item) => !item.canceled)
        .reduce(
          (sum, item) => sum + (item.basePrice || 0) * (item.quantity || 1),
          0
        );

      // Discounted price subtotal
      discountedPriceTotal = order.items
        .filter((item) => !item.canceled)
        .reduce(
          (sum, item) =>
            sum + (item.discoundedPrice || 0) * (item.quantity || 1),
          0
        );
    }

    const discount = subTotal - discountedPriceTotal || 0; // Or compute if needed

    const totalAmount =
      subTotal + (order.shipping || 0) + (order.tax || 0) - discount;

    res.render("admin/orders/orderDetails", {
      user,
      order,
      subTotal: subTotal.toFixed(2),
      discount: discount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
    });
  } catch (error) {
    console.error("Error fetching order:", error);
  }
};

// Update order status
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status against schema enum
    const validStatuses = [
      "Placed",
      "Shipped",
      "Out for Delivery",
      "Delivered",
      "Cancelled",
      "Returned",
    ];
    if (!validStatuses.includes(status)) {
      req.session.error = ERROR_MESSAGES.INVALID_ORDER_STATUS;
      return res.redirect(`/admin/orders/${id}`);
    }

    // Find and update order
    const updateData = {
      orderStatus: status,
      updatedAt: new Date(),
      // Add to tracking history
      $push: {
        tracking: {
          status: status,
          date: new Date(),
          message: `Status updated to ${status} by admin`,
        },
      },
    };

    // Handle special timestamps
    if (status === "Cancelled") {
      updateData.cancelledAt = new Date();
    } else if (status === "Delivered") {
      updateData.deliveredAt = new Date();
    }

    const order = await Orders.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("userId", "name email")
      .populate("items.productId"); // Populate as needed

    if (!order) {
      req.session.error = ERROR_MESSAGES.ORDER_NOT_FOUND;
      return res.redirect("/admin/orders");
    }

    if (status === "Cancelled" || status === "Returned") {
      // Optional: Set totalAmount to 0 or trigger refund
      order.totalAmount = 0;
      await order.save();
    }

    req.session.success = SUCCESS_MESSAGES.ORDER_STATUS_UPDATED;
    res.redirect(`/admin/orders/view/${id}`);
  } catch (error) {
    console.error("Error updating order status:", error);
    req.session.error = ERROR_MESSAGES.ORDER_STATUS_UPDATE_ERROR;
    res.redirect(`/admin/orders/${id}`);
  }
};



// Export order PDF
const exportOrderPDF = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Orders.findById(orderId).populate("items.productId");
    
    if (!order) {
      return res.status(HTTP_STATUS.NOT_FOUND).send(ERROR_MESSAGES.ORDER_NOT_FOUND);
    }

    const doc = new PDFDocument({ margin: 50 });
    const filename = `Order-${order.orderID || order._id}.pdf`;

    res.setHeader("Content-disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-type", "application/pdf");

    doc.pipe(res);

    // --- Header ---
    doc
      .fontSize(20)
      .text("Dité", { align: "center" }) // Brand Name
      .fontSize(10)
      .text("Premium Fashion Store", { align: "center" })
      .moveDown();

    doc
      .fontSize(16)
      .text("Order Report", { align: "center" })
      .moveDown();

    // --- Order Details ---
    const startY = doc.y;
    doc.fontSize(10);
    
    doc.text(`Order ID: ${order.orderID || order._id}`, 50, startY);
    doc.text(`Date: ${moment(order.placedAt).format("DD MMM YYYY, hh:mm A")}`, 50, startY + 15);
    doc.text(`Status: ${order.orderStatus}`, 50, startY + 30);
    doc.text(`Payment: ${order.paymentMethod}`, 50, startY + 45);

    // --- Address ---
    const addressY = startY;
    const rightX = 300;
    doc.text("Shipping Address:", rightX, addressY);
    if (order.address) {
        doc.text(order.address.fullName || "", rightX, addressY + 15);
        doc.text((order.address.hoNo || "") + ", " + (order.address.street || ""), rightX, addressY + 30);
        doc.text(`${order.address.city || ""}, ${order.address.state || ""} - ${order.address.pin || ""}`, rightX, addressY + 45);
        doc.text(`${order.address.country || ""}`, rightX, addressY + 60);
        doc.text(`Phone: ${order.address.phone || ""}`, rightX, addressY + 75);
    }
    
    doc.moveDown(4);

    // --- Active Items ---
    const activeItems = order.items
        .filter(i => (i.quantity || 0) > 0);

    if (activeItems.length > 0) {
        doc.fontSize(12).text("Active Items", { underline: true });
        doc.moveDown(0.5);
        
        // Header
        const yStart = doc.y;
        doc.fontSize(10).font("Helvetica-Bold");
        doc.text("Product", 50, yStart);
        doc.text("Size", 250, yStart);
        doc.text("Qty", 300, yStart);
        doc.text("Price", 350, yStart);
        doc.text("Total", 450, yStart);
        doc.font("Helvetica");
        
        let y = yStart + 20;

        activeItems.forEach(item => {
            const name = item.name || item.productId?.name || "Product";
            const price = item.discoundedPrice || item.basePrice || 0;
            const total = price * item.quantity;
            
            doc.text(name.substring(0, 30), 50, y);
            doc.text((item.mlSize || "") + "ml", 250, y);
            doc.text(item.quantity.toString(), 300, y);
            doc.text(price.toFixed(2), 350, y);
            doc.text(total.toFixed(2), 450, y);
            y += 15;
        });
        doc.moveDown();
    }

    // --- Cancelled Items ---
    if (order.cancelProducts && order.cancelProducts.length > 0) {
        doc.moveDown();
        doc.fillColor('red').fontSize(12).text("Cancelled Items", { underline: true });
        doc.fillColor('black'); 
        doc.moveDown(0.5);
        
        order.cancelProducts.forEach(item => {
            doc.fontSize(10).text(`- ${item.name} (${item.mlSize}ml) x${item.canceledQuantity}`);
            if (item.reason) doc.fontSize(8).text(`  Reason: ${item.reason}`, { indent: 10 });
        });
    }

    // --- Returned Items ---
    if (order.returndProduct && order.returndProduct.length > 0) {
        doc.moveDown();
        doc.fillColor('orange').fontSize(12).text("Returned Items", { underline: true });
        doc.fillColor('black');
        doc.moveDown(0.5);
        
        order.returndProduct.forEach(item => {
            doc.fontSize(10).text(`- ${item.name} (${item.mlSize}ml) x${item.returndQuantity} [${item.adminApproved}]`);
            if (item.reason) doc.fontSize(8).text(`  Reason: ${item.reason}`, { indent: 10 });
        });
    }

    doc.moveDown(2);
    doc.fontSize(12).text(`Total Amount Paid: Rs. ${(order.totalAmount || 0).toFixed(2)}`, { align: 'right' });
    
    doc.end();

  } catch (error) {
    console.error("PDF Export Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }

};

export {
    getOrders,
    getViewOrders,
    updateOrderStatus,
    exportOrderPDF
};
