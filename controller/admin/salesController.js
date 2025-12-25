import Orders from "../../models/ordersModel.js";
import Products from "../../models/productsModels.js";
import moment from "moment";
import PDFDocument from "pdfkit";

const formatRevenue = (amount) => {
  if (amount >= 100000) {
    return (amount / 100000).toFixed(2) + "L";
  }
  return amount.toLocaleString();
};

const getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, period } = req.query.startDate
      ? req.query
      : req.body || {}; // Support GET filters
    const PRICE_FIELD = "$items.discoundedPrice"; // Fixed to match schema: discoundedPrice

    let totalRevenue = 0;
    let totalOrders = 0;
    let successfulOrders = 0;
    let deliveredCount = 0;
    let totalDeliveryDays = 0;
    const userSet = new Set();
    const monthlyRevenue = {}; // Keyed by "MMM YYYY" for cross-year accuracy
    const statusCounts = {
      Placed: 0,
      Shipped: 0,
      "Out for Delivery": 0,
      Delivered: 0,
      Cancelled: 0,
      Returned: 0,
    };

    // Build date filter
    const dateFilter = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      dateFilter.placedAt = { ...dateFilter.placedAt, $gte: start };
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.placedAt = { ...dateFilter.placedAt, $lte: end };
    }

    const orders = await Orders.find(dateFilter).populate("items.productId");

    orders.forEach((order) => {
      totalOrders++;
      if (order.orderStatus) {
        statusCounts[order.orderStatus] =
          (statusCounts[order.orderStatus] || 0) + 1;
      }

      const monthKey = moment(order.placedAt).format("MMM YYYY"); // Accurate key
      if (order.orderStatus === "Delivered") {
        totalRevenue += order.totalAmount || 0;
        successfulOrders++;
        monthlyRevenue[monthKey] =
          (monthlyRevenue[monthKey] || 0) + (order.totalAmount || 0);
        userSet.add(order.userId.toString());

        if (order.deliveredAt) {
          deliveredCount++;
          let diff = moment(order.deliveredAt).diff(
            moment(order.placedAt),
            "days"
          );
          if (diff < 0) diff = 0; // Clamp negatives
          totalDeliveryDays += diff;
        }
      }
    });

    const newCustomers = userSet.size;
    const avgOrderValue =
      successfulOrders > 0
        ? Math.round(totalRevenue / successfulOrders).toString()
        : "0";

    // Generate Chart Data based on Period
    let chartDataRaw = [];
   
    let chartLabels = [];
    let chartValues = [];

    if (period === "today") {
      // Show LAST 7 DAYS inclusive of today (Today is the last bar)
      const endOfToday = moment().endOf("day").toDate();
      const startOf7DaysAgo = moment()
        .subtract(6, "days")
        .startOf("day")
        .toDate();

      chartDataRaw = await Orders.aggregate([
        {
          $match: {
            orderStatus: "Delivered",
            placedAt: { $gte: startOf7DaysAgo, $lte: endOfToday },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$placedAt" } },
            total: { $sum: "$totalAmount" },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const days = [];
      let current = moment(startOf7DaysAgo);
      const endMoment = moment(endOfToday);
      while (current <= endMoment) {
        days.push(current.format("YYYY-MM-DD"));
        current.add(1, "days");
      }

      // Multiline label: [DayName, DateString]
      chartLabels = days.map((d) => {
        const m = moment(d);
        return [m.format("ddd"), m.format("DD MMM")];
      });
      chartValues = days.map((d) => {
        const found = chartDataRaw.find((r) => r._id === d);
        return found ? found.total : 0;
      });
    } else if (period === "week") {
      // Show LAST 4 WEEKS inclusive of current week
      const endOfCurrentWeek = moment().endOf("isoWeek").toDate();
      const startOf4WeeksAgo = moment()
        .subtract(3, "weeks")
        .startOf("isoWeek")
        .toDate(); // Current + 3 prev = 4 weeks

      chartDataRaw = await Orders.aggregate([
        {
          $match: {
            orderStatus: "Delivered",
            placedAt: { $gte: startOf4WeeksAgo, $lte: endOfCurrentWeek },
          },
        },
        {
          $addFields: {
            // Format as ISO year-week to handle year crossover correctly (e.g., 2024-52, 2025-01)
            weekYear: { $isoWeekYear: "$placedAt" },
            week: { $isoWeek: "$placedAt" },
          },
        },
        {
          $group: {
            _id: { year: "$weekYear", week: "$week" },
            total: { $sum: "$totalAmount" },
          },
        },
        { $sort: { "_id.year": 1, "_id.week": 1 } },
      ]);

      let weeks = [];
      for (let i = 3; i >= 0; i--) {
        const wStart = moment().subtract(i, "weeks").startOf("isoWeek");
        const wEnd = moment().subtract(i, "weeks").endOf("isoWeek");
        weeks.push({
          label: `Week ${wStart.isoWeek()}`,
          subLabel: `${wStart.format("MMM DD")} - ${wEnd.format("MMM DD")}`,
          year: wStart.isoWeekYear(),
          week: wStart.isoWeek(),
        });
      }

      chartLabels = weeks.map((w) => [w.label, w.subLabel]);
      chartValues = weeks.map((w) => {
        const found = chartDataRaw.find(
          (r) => r._id.year === w.year && r._id.week === w.week
        );
        return found ? found.total : 0;
      });
    } else if (period === "month") {
      // Show LAST 12 MONTHS inclusive of current month
      const endOfCurrentMonth = moment().endOf("month").toDate();
      const startOf12MonthsAgo = moment()
        .subtract(11, "months")
        .startOf("month")
        .toDate();

      chartDataRaw = await Orders.aggregate([
        {
          $match: {
            orderStatus: "Delivered",
            placedAt: { $gte: startOf12MonthsAgo, $lte: endOfCurrentMonth },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$placedAt" } },
            total: { $sum: "$totalAmount" },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const months = [];
      let current = moment(startOf12MonthsAgo);
      const endMoment = moment(endOfCurrentMonth);
      while (current <= endMoment) {
        months.push(current.format("YYYY-MM"));
        current.add(1, "month");
      }

      chartLabels = months.map((m) => moment(m).format("MMM YYYY"));
      chartValues = months.map((m) => {
        const found = chartDataRaw.find((r) => r._id === m);
        return found ? found.total : 0;
      });
    } else if (period === "year") {
      // Show from START of sales (first order) to Current Year
      const firstOrder = await Orders.findOne()
        .sort({ placedAt: 1 })
        .select("placedAt");
      const startYearVal = firstOrder
        ? moment(firstOrder.placedAt).year()
        : moment().year();
      const currentYearVal = moment().year();

      const startYearDate = moment()
        .year(startYearVal)
        .startOf("year")
        .toDate();
      const endYearDate = moment().endOf("year").toDate();

      chartDataRaw = await Orders.aggregate([
        {
          $match: {
            orderStatus: "Delivered",
            placedAt: { $gte: startYearDate, $lte: endYearDate },
          },
        },
        {
          $group: {
            _id: { $year: "$placedAt" },
            total: { $sum: "$totalAmount" },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const years = [];
      for (let y = startYearVal; y <= currentYearVal; y++) {
        years.push(y);
      }

      chartLabels = years.map((y) => y.toString());
      chartValues = years.map((y) => {
        const found = chartDataRaw.find((r) => r._id === y);
        return found ? found.total : 0;
      });
    } else {
      // Custom or Default logic
      if (startDate && endDate) {
        const startRange = moment(startDate).startOf("day");
        const endRange = moment(endDate).endOf("day");

        if (endRange.isBefore(startRange)) {
          chartLabels = [];
          chartValues = [];
        } else {
          chartDataRaw = await Orders.aggregate([
            {
              $match: {
                orderStatus: "Delivered",
                placedAt: {
                  $gte: startRange.toDate(),
                  $lte: endRange.toDate(),
                },
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$placedAt" },
                },
                total: { $sum: "$totalAmount" },
              },
            },
            { $sort: { _id: 1 } },
          ]);

          const days = [];
          let current = moment(startRange);
          while (current <= endRange) {
            days.push(current.format("YYYY-MM-DD"));
            current.add(1, "days");
          }

          chartLabels = days.map((d) => {
            const m = moment(d);
            return [m.format("ddd"), m.format("DD MMM")];
          });

          chartValues = days.map((d) => {
            const found = chartDataRaw.find((r) => r._id === d);
            return found ? found.total : 0;
          });
        }
      } else {
        const sortedMonths = Object.keys(monthlyRevenue)
          .map((key) => ({ key, date: moment(key, "MMM YYYY") }))
          .sort((a, b) => a.date - b.date);

        chartLabels = sortedMonths.map((m) => m.key);
        chartValues = sortedMonths.map((m) => monthlyRevenue[m.key] || 0);
      }
    }

    let backgroundColors = "#c5a987";
    let borderColors = "#c5a987";

    if (period === "today") {
       const endOfToday = moment().endOf("day").toDate();
       const startOf7DaysAgo = moment().subtract(6, "days").startOf("day").toDate();
       const days = [];
       let current = moment(startOf7DaysAgo);
       const endMoment = moment(endOfToday);
       while (current <= endMoment) {
         days.push(current.format("YYYY-MM-DD"));
         current.add(1, "days");
       }
       const todayStr = moment().format("YYYY-MM-DD");
       backgroundColors = days.map(d => d === todayStr ? "#e5e7eb" : "#c5a987");
       borderColors = "#c5a987";
    }

    const revenueData = {
      labels: chartLabels,
      datasets: [
        {
          label: "Revenue",
          data: chartValues,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 1,
        },
      ],
    };

    // Top Products
    const topProductsAgg = await Orders.aggregate([
      { $match: { ...dateFilter, orderStatus: "Delivered" } },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$items.productId",
          name: { $first: { $ifNull: ["$product.name", "$items.name"] } },
          totalUnits: { $sum: "$items.quantity" },
        },
      },
      { $sort: { totalUnits: -1 } },
      { $limit: 7 },
    ]);

    const topProductsData = {
      labels: topProductsAgg.map((p) =>
        p.name ? p.name.substring(0, 15) : "Unknown"
      ),
      datasets: [
        {
          label: "Units Sold",
          data: topProductsAgg.map((p) => p.totalUnits || 0),
          backgroundColor: "#c5a987",
          borderColor: "#c5a987",
          borderWidth: 1,
        },
      ],
    };

    // Category
    const categoryAgg = await Orders.aggregate([
      { $match: { ...dateFilter, orderStatus: "Delivered" } },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "categories",
          localField: "product.category",
          foreignField: "_id",
          as: "categoryDoc",
        },
      },
      { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ["$categoryDoc.name", "Uncategorized"] },
          totalSales: { $sum: { $multiply: ["$items.quantity", PRICE_FIELD] } },
        },
      },
      { $sort: { totalSales: -1 } },
      { $limit: 5 },
    ]);

    const categoryData = {
      labels: categoryAgg.map((c) => c._id || "Uncategorized"),
      datasets: [
        {
          data: categoryAgg.map((c) => c.totalSales || 0),
          backgroundColor: [
            "#3b82f6",
            "#10b981",
            "#f59e0b",
            "#ef4444",
            "#8b5cf6",
          ],
          borderColor: "#1f2937",
          borderWidth: 2,
        },
      ],
    };

    // Gender 
    const genderAgg = await Orders.aggregate([
      { $match: { ...dateFilter, orderStatus: "Delivered" } },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ["$product.gender", "unknown"] },
          totalSales: { $sum: { $multiply: ["$items.quantity", PRICE_FIELD] } },
        },
      },
    ]);

    let menSales = 0,
      womenSales = 0,
      unisexSales = 0;

    genderAgg.forEach((g) => {
      if (g._id === "MEN") menSales = g.totalSales || 0;
      if (g._id === "WOMEN") womenSales = g.totalSales || 0;
      if (g._id === "UNISEX") unisexSales = g.totalSales || 0;
    });

    const genderData = {
      labels: ["Men", "Women", "Unisex"],
      datasets: [
        {
          data: [menSales, womenSales, unisexSales],
          backgroundColor: ["#3b82f6", "#ec4899", "#10b981"],
          borderColor: ["#1f2937", "#1f2937", "#1f2937"],
          borderWidth: 1,
        },
      ],
    };

    // Status 
    const statusAgg = await Orders.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$orderStatus",
          count: { $sum: 1 },
        },
      },
    ]);
    statusAgg.forEach((stat) => {
      statusCounts[stat._id] = stat.count;
    });

    const statusData = {
      labels: [
        "Placed",
        "Shipped",
        "Out for Delivery",
        "Delivered",
        "Cancelled",
        "Returned",
      ],
      datasets: [
        {
          data: [
            statusCounts.Placed || 0,
            statusCounts.Shipped || 0,
            statusCounts["Out for Delivery"] || 0,
            statusCounts.Delivered || 0,
            statusCounts.Cancelled || 0,
            statusCounts.Returned || 0,
          ],
          backgroundColor: [
            "#f59e0b",
            "#3b82f6",
            "#10b981",
            "#10b981",
            "#ef4444",
            "#8b5cf6",
          ],
          borderColor: "#1f2937",
          borderWidth: 2,
        },
      ],
    };

    // Aggregates for sales data
    const deliveredAgg = await Orders.aggregate([
      { $match: { ...dateFilter, orderStatus: "Delivered" } },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            productId: "$items.productId",
            mlSize: "$items.mlSize",
          },
          productName: { $first: "$product.name" },
          mlSize: { $first: "$items.mlSize" },
          soldQuantity: { $sum: "$items.quantity" },
          revenue: {
            $sum: { $multiply: ["$items.quantity", PRICE_FIELD] },
          },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    const returnedAgg = await Orders.aggregate([
      { $match: { ...dateFilter, orderStatus: "Returned" } },
      { $unwind: "$returndProduct" },
      {
        $group: {
          _id: {
            productId: "$returndProduct.productId",
            mlSize: "$returndProduct.mlSize",
          },
          returns: { $sum: "$returndProduct.returndQuantity" },
        },
      },
    ]);

    const deliveredMap = new Map();
    deliveredAgg.forEach((item) => {
      const key = `${item._id.productId.toString()}_${item.mlSize}`;
      deliveredMap.set(key, {
        soldQuantity: item.soldQuantity || 0,
        revenue: item.revenue || 0,
      });
    });

    const returnsMap = new Map();
    returnedAgg.forEach((r) => {
      const key = `${r._id.productId.toString()}_${r._id.mlSize}`;
      returnsMap.set(key, r.returns || 0);
    });

    // Fetch all listed, non-deleted products
    const allProducts = await Products.find({
      isListed: true,
      isDeleted: false,
    });

    // Build groupedSalesData
    const groupedSalesData = [];
    for (const product of allProducts) {
      const productVariants = [];
      let productTotalRevenue = 0;

      for (const variant of product.variants) {
        if (variant.isListed && !variant.isDeleted) {
          const mlSizeStr = String(variant.mlSize);
          const key = `${product._id.toString()}_${mlSizeStr}`;
          const delivered = deliveredMap.get(key) || {
            soldQuantity: 0,
            revenue: 0,
          };
          const returns = returnsMap.get(key) || 0;

          const variantData = {
            mlSize: variant.mlSize,
            soldQuantity: delivered.soldQuantity,
            returns,
            revenue: delivered.revenue,
            stock: variant.stock || 0,
          };

          productVariants.push(variantData);
          productTotalRevenue += delivered.revenue;
        }
      }

      if (productVariants.length > 0) {
        // Sort variants by mlSize ascending
        productVariants.sort((a, b) => a.mlSize - b.mlSize);
        groupedSalesData.push({
          name: product.name || "Unknown",
          variants: productVariants,
          totalRevenue: productTotalRevenue,
        });
      }
    }

    // PAGINATION LOGIC
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalSalesOrders = await Orders.countDocuments(dateFilter);
    const totalPages = Math.ceil(totalSalesOrders / limit);

    const orderSalesData = await Orders.find(dateFilter)
      .populate("userId", "name email")
      .populate("items.productId", "name")
      .sort({ placedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const formattedOrders = orderSalesData.map((order) => {
      const itemsSummary = order.items
        .map((item) => {
          const productName = item.productId?.name || "Unknown Product";
          return `${productName} (${item.mlSize}ml x${item.quantity})`;
        })
        .join(", ");

      return {
        orderId:
          order.orderID || order._id.toString().substring(0, 8).toUpperCase(),
        date: moment(order.placedAt).format("DD MMM YYYY, hh:mm A"),
        customerName: order.userId?.name || "Guest",
        customerEmail: order.userId?.email || "N/A",
        items: itemsSummary,
        itemsCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        totalAmount: order.totalAmount || 0,
        paymentMethod: order.paymentMethod
          ? order.paymentMethod.toUpperCase()
          : "N/A",
        orderStatus: order.orderStatus || "N/A",
        transactionId:
          order.paymentInfo?.razorpayPaymentId ||
          order.paymentInfo?.razorpayOrderId ||
          "N/A",
        deliveredAt: order.deliveredAt
          ? moment(order.deliveredAt).format("DD MMM YYYY")
          : "N/A",
        isToday: moment(order.placedAt).isSame(moment(), "day"),
      };
    });

    res.render("admin/sales/salesReport", {
      totalRevenue: `₹${totalRevenue.toLocaleString()}`,
      avgOrderValue: `₹${avgOrderValue}`,
      totalOrders,
      newCustomers,

      revenueData,
      topProductsData,
      categoryData,
      genderData,
      statusData,

      menSales,
      womenSales,
      unisexSales,
      orderSalesData: formattedOrders,
      groupedSalesData,
      dateRange: { startDate, endDate },
      period: period || "all",

      currentPage: page,
      totalPages: totalPages,
      limit: limit,
    });
  } catch (error) {
    console.error("Sales Report Error:", error);
    res.status(500).send("Server Error");
  }
};

const exportSalesReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const PRICE_FIELD = "$items.discoundedPrice";

    // Build date filter
    const dateFilter = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      dateFilter.placedAt = {
        ...dateFilter.placedAt,
        $gte: start,
      };
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.placedAt = { ...dateFilter.placedAt, $lte: end };
    }

    const orders = await Orders.find(dateFilter).populate("items.productId");

    let totalRevenue = 0;
    let totalOrders = 0;
    let successfulOrders = 0;
    const userSet = new Set();
    
    // NOTE: If you need to fix the PRICE_FIELD logic for detailed export rows, make sure you use the aggregation logic instead of just finding.
    
    orders.forEach((order) => {
      totalOrders++;
      if (order.orderStatus === "Delivered") {
        totalRevenue += order.totalAmount || 0;
        successfulOrders++;
        userSet.add(order.userId.toString());
      }
    });

    const newCustomers = userSet.size;
    const avgOrderValue =
      successfulOrders > 0 ? Math.round(totalRevenue / successfulOrders) : 0;

    // Detailed data
    const deliveredAgg = await Orders.aggregate([
      { $match: { ...dateFilter, orderStatus: "Delivered" } },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            productId: "$items.productId",
            mlSize: "$items.mlSize",
          },
          productName: { $first: "$product.name" },
          mlSize: { $first: "$items.mlSize" },
          soldQuantity: { $sum: "$items.quantity" },
          revenue: {
            $sum: { $multiply: ["$items.quantity", PRICE_FIELD] },
          },
        },
      },
    ]);

    const deliveredMap = new Map();
    deliveredAgg.forEach((item) => {
      const key = `${item._id.productId.toString()}_${item.mlSize}`;
      deliveredMap.set(key, {
        soldQuantity: item.soldQuantity || 0,
        revenue: item.revenue || 0,
        productName: item.productName,
      });
    });

    const orderData = await Orders.find(dateFilter)
      .populate("userId", "name email")
      .populate("items.productId", "name")
      .sort({ placedAt: -1 })
      .lean();

    const exportData = orderData.map((order) => {
      const itemsSummary = order.items
        .map((item) => {
          const productName = item.productId?.name || "Unknown Product";
          return `${productName} (${item.mlSize}ml x${item.quantity})`;
        })
        .join("; ");

      return {
        orderId:
          order.orderID || order._id.toString().substring(0, 8).toUpperCase(),
        date: moment(order.placedAt).format("DD MMM YYYY, hh:mm A"),
        customerName: order.userId?.name || "Guest",
        customerEmail: order.userId?.email || "N/A",
        items: itemsSummary,
        itemsCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        totalAmount: order.totalAmount || 0,
        paymentMethod: order.paymentMethod
          ? order.paymentMethod.toUpperCase()
          : "N/A",
        orderStatus: order.orderStatus || "N/A",
        transactionId:
          order.paymentInfo?.razorpayPaymentId ||
          order.paymentInfo?.razorpayOrderId ||
          "N/A",
        deliveredAt: order.deliveredAt
          ? moment(order.deliveredAt).format("DD MMM YYYY")
          : "N/A",
      };
    });

    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Sales Report");

      worksheet.addRow(["SALES REPORT SUMMARY"]);
      worksheet.addRow([
        "Period",
        `${startDate || "All Time"} to ${endDate || "Now"}`,
      ]);
      worksheet.addRow([]);
      worksheet.addRow(["Total Revenue", `₹${totalRevenue.toLocaleString()}`]);
      worksheet.addRow([
        "Average Order Value",
        `₹${avgOrderValue.toLocaleString()}`,
      ]);
      worksheet.addRow(["Total Orders", totalOrders]);
      worksheet.addRow(["Total Customers", newCustomers]);
      worksheet.addRow([]);

      const headerRow = worksheet.addRow([
        "Order ID",
        "Date & Time",
        "Customer Name",
        "Customer Email",
        "Items",
        "Items Count",
        "Total Amount",
        "Payment Method",
        "Transaction ID",
        "Order Status",
        "Delivered Date",
      ]);

      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFC5A987" },
      };

      exportData.forEach((row) => {
        worksheet.addRow([
          row.orderId,
          row.date,
          row.customerName,
          row.customerEmail,
          row.items,
          row.itemsCount,
          row.totalAmount,
          row.paymentMethod,
          row.transactionId,
          row.orderStatus,
          row.deliveredAt,
        ]);
      });

      worksheet.columns = [
        { width: 15 }, 
        { width: 20 }, 
        { width: 20 }, 
        { width: 25 }, 
        { width: 40 }, 
        { width: 12 }, 
        { width: 15 }, 
        { width: 15 }, 
        { width: 25 }, 
        { width: 15 }, 
        { width: 15 }, 
      ];

      worksheet.getColumn(7).numFmt = '"₹"#,##0';

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=sales-report-${startDate || "all"}-to-${
          endDate || "now"
        }.xlsx`
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (excelError) {
      console.error("ExcelJS not available, using CSV fallback:", excelError);
      let csv =
        "Order ID,Date & Time,Customer Name,Customer Email,Items,Items Count,Total Amount,Payment Method,Transaction ID,Order Status,Delivered Date\n";
      exportData.forEach((row) => {
        csv += `${row.orderId},"${row.date}",${row.customerName},${row.customerEmail},"${row.items}",${row.itemsCount},₹${row.totalAmount},${row.paymentMethod},${row.transactionId},${row.orderStatus},${row.deliveredAt}\n`;
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=sales-report-${startDate || "all"}-to-${
          endDate || "now"
        }.csv`
      );
      res.send(csv);
    }
  } catch (error) {
    console.error("Export error:", error);
    res
      .status(500)
      .json({ success: false, message: "Export failed: " + error.message });
  }
};

const exportSalesPdf = async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    const dateFilter = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      dateFilter.placedAt = { ...dateFilter.placedAt, $gte: start };
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.placedAt = { ...dateFilter.placedAt, $lte: end };
    }

    const orders = await Orders.find(dateFilter)
      .populate("userId", "name email")
      .populate("items.productId", "name")
      .sort({ placedAt: -1 })
      .lean();

    let totalRevenue = 0;
    let successfulOrders = 0;

    orders.forEach((order) => {
      if (order.orderStatus === "Delivered") {
        totalRevenue += order.totalAmount || 0;
        successfulOrders++;
      }
    });

    const avgOrderValue =
      successfulOrders > 0 ? Math.round(totalRevenue / successfulOrders) : 0;

    const doc = new PDFDocument({ margin: 30, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=sales_report_${startDate || "all"}_${
        endDate || "time"
      }.pdf`
    );

    doc.pipe(res);

    doc.fontSize(20).text("Sales Report", { align: "center" });
    doc.moveDown();

    doc
      .fontSize(12)
      .text(`Period: ${startDate || "All Time"} to ${endDate || "Now"}`);
    doc.text(`Total Revenue: Rs. ${totalRevenue.toLocaleString()}`);
    doc.text(`Average Order Value: Rs. ${avgOrderValue.toLocaleString()}`);
    doc.text(`Total Orders: ${orders.length}`);
    doc.moveDown();

    const tableTop = 200;
    let y = tableTop;

    doc.font("Helvetica-Bold");
    doc.text("Date", 30, y, { width: 70 });
    doc.text("Order ID", 100, y, { width: 60 });
    doc.text("Customer", 170, y, { width: 100 });
    doc.text("Items", 280, y, { width: 150 });
    doc.text("Amount", 440, y, { width: 70, align: "right" });
    doc.text("Status", 520, y, { width: 50 });

    doc
      .moveTo(30, y + 15)
      .lineTo(570, y + 15)
      .stroke();
    y += 25;
    doc.font("Helvetica");

    orders.forEach((order) => {
      if (y > 700) {
        doc.addPage();
        y = 30; 
        doc.font("Helvetica-Bold");
        doc.text("Date", 30, y, { width: 70 });
        doc.text("Order ID", 100, y, { width: 60 });
        doc.text("Customer", 170, y, { width: 100 });
        doc.text("Items", 280, y, { width: 150 });
        doc.text("Amount", 440, y, { width: 70, align: "right" });
        doc.text("Status", 520, y, { width: 50 });
        doc
          .moveTo(30, y + 15)
          .lineTo(570, y + 15)
          .stroke();
        y += 25;
        doc.font("Helvetica");
      }

      const dateStr = moment(order.placedAt).format("DD/MM/YYYY");
      const orderId =
        order.orderID || order._id.toString().substring(0, 6).toUpperCase();
      const customer = order.userId?.name || "Guest";
      const items = order.items
        .map(
          (i) =>
            `${i.quantity}x ${i.productId?.name?.substring(0, 15) || "Item"}`
        )
        .join(", ");
      const amount = `Rs. ${order.totalAmount}`;
      const status = order.orderStatus;

      doc.fontSize(10);
      doc.text(dateStr, 30, y, { width: 70 });
      doc.text(orderId, 100, y, { width: 60 });
      doc.text(customer, 170, y, { width: 100, ellipsis: true });
      doc.text(items, 280, y, { width: 150, ellipsis: true });
      doc.text(amount, 440, y, { width: 70, align: "right" });
      doc.text(status, 520, y, { width: 50 });

      y += 20;
    });

    doc.end();
  } catch (error) {
    console.error("Export PDF Error:", error);
    res.status(500).send("Error exporting PDF");
  }
};

export {
    getSalesReport,
    exportSalesReport,
    exportSalesPdf
}
