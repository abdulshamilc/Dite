import Orders from "../../models/ordersModel.js";
import Products from "../../models/productsModels.js";
import moment from "moment";
import PDFDocument from "pdfkit";
import { SUCCESS_MESSAGES, ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";

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
    let totalCouponDiscount = 0;
    let totalProductDiscount = 0;
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

    // NEW LOGIC: Sales Criteria
    // COD: Only when Delivered
    // Online/Wallet: When Payment is 'Paid' (Done)
    const isSale = (order) => {
        if (order.paymentMethod === 'cod') {
            return order.orderStatus === 'Delivered';
        } else {
            // Online or Wallet
            return order.paymentInfo && order.paymentInfo.paymentStatus === 'Paid';
        }
    };
    // Aggregation Matcher for Queries
    const salesMatchObj = {
        $or: [
            { paymentMethod: 'cod', orderStatus: 'Delivered' },
            { paymentMethod: { $ne: 'cod' }, "paymentInfo.paymentStatus": 'Paid' }
        ]
    };

    orders.forEach((order) => {
      totalOrders++;
      if (order.orderStatus) {
        statusCounts[order.orderStatus] =
          (statusCounts[order.orderStatus] || 0) + 1;
      }

      const monthKey = moment(order.placedAt).format("MMM YYYY"); // Accurate key
      
      // Apply New Sales Logic
      if (isSale(order)) {
        totalRevenue += order.totalAmount || 0;
        successfulOrders++;
        totalCouponDiscount += order.discountAmount || 0;

        // Calculate product level discounts
        order.items.forEach((item) => {
             const base = item.basePrice || 0;
             const sold = item.discoundedPrice || item.basePrice || 0;
             totalProductDiscount += (base - sold) * item.quantity;
        });

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

    // Calculate Returning Customers: Count aggregation for userIds in userSet
    let returningCustomers = 0;
    if (userSet.size > 0) {
      const uniqueUserIds = Array.from(userSet);
       const returningStats = await Orders.aggregate([
           { $match: { 
               userId: { $in: uniqueUserIds }, 
               $or: [
                    { paymentMethod: 'cod', orderStatus: 'Delivered' },
                    { paymentMethod: { $ne: 'cod' }, "paymentInfo.paymentStatus": 'Paid' }
               ]
           } },
           { $group: { _id: "$userId", count: { $sum: 1 } } },
           { $match: { count: { $gt: 1 } } },
           { $count: "returning" }
        ]);
        returningCustomers = returningStats[0]?.returning || 0;
    }

    // Calculate Total Returns and Return Customers
    let totalReturns = 0;
    const returnCustomerSet = new Set();
    orders.forEach((order) => {
      if (order.orderStatus === 'Returned') {
        totalReturns++;
        returnCustomerSet.add(order.userId.toString());
      } else if (order.returndProduct && order.returndProduct.length > 0) {
        // Count partial returns if needed, but 'Returned' status is usually full return
        // Assuming user wants count of orders with returns
        const hasApprovedReturn = order.returndProduct.some(rp => rp.adminApproved === 'Approved');
        if (hasApprovedReturn && order.orderStatus !== 'Returned') {
             // If partial return is not counted in status, we might count it here. 
             // For simplify, lets stick to orderStatus === 'Returned' primarily, 
             // but if user meant 'items returned', that's different. 
             // Based on request "Total Return", usually means returned orders.
        }
      }
    });
    // Re-scanning accurately for all returns (including partials if they don't change main status to Returned?)
    // Actually, let's stick to the statusCounts.Returned we already have for orders fully returned.
    // If we want "Total Returns" to mean "All Return Requests", we should check returndProduct array.
    
    // Revised logic: Count any order that has AT LEAST ONE approved return item as a "Return" interaction
    totalReturns = 0;
    returnCustomerSet.clear();
    
    orders.forEach(order => {
        const hasReturn = order.orderStatus === 'Returned' || 
                          (order.returndProduct && order.returndProduct.some(rp => rp.adminApproved === 'Approved'));
        
        if (hasReturn) {
            totalReturns++;
            returnCustomerSet.add(order.userId.toString());
        }
    });

    const returnCustomers = returnCustomerSet.size;

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
            placedAt: { $gte: startOf7DaysAgo, $lte: endOfToday },
            $or: [
                { paymentMethod: 'cod', orderStatus: 'Delivered' },
                { paymentMethod: { $ne: 'cod' }, "paymentInfo.paymentStatus": 'Paid' }
            ]
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
            placedAt: { $gte: startOf4WeeksAgo, $lte: endOfCurrentWeek },
             $or: [
                { paymentMethod: 'cod', orderStatus: 'Delivered' },
                { paymentMethod: { $ne: 'cod' }, "paymentInfo.paymentStatus": 'Paid' }
            ]
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
            placedAt: { $gte: startOf12MonthsAgo, $lte: endOfCurrentMonth },
             $or: [
                { paymentMethod: 'cod', orderStatus: 'Delivered' },
                { paymentMethod: { $ne: 'cod' }, "paymentInfo.paymentStatus": 'Paid' }
            ]
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
            placedAt: { $gte: startYearDate, $lte: endYearDate },
             $or: [
                { paymentMethod: 'cod', orderStatus: 'Delivered' },
                { paymentMethod: { $ne: 'cod' }, "paymentInfo.paymentStatus": 'Paid' }
            ]
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
                placedAt: {
                  $gte: startRange.toDate(),
                  $lte: endRange.toDate(),
                },
                 $or: [
                    { paymentMethod: 'cod', orderStatus: 'Delivered' },
                    { paymentMethod: { $ne: 'cod' }, "paymentInfo.paymentStatus": 'Paid' }
                ]
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
      { $match: { 
          ...dateFilter, 
          $or: [
            { paymentMethod: 'cod', orderStatus: 'Delivered' },
            { paymentMethod: { $ne: 'cod' }, "paymentInfo.paymentStatus": 'Paid' }
        ]
      } },
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
      { $match: { 
          ...dateFilter, 
          $or: [
            { paymentMethod: 'cod', orderStatus: 'Delivered' },
            { paymentMethod: { $ne: 'cod' }, "paymentInfo.paymentStatus": 'Paid' }
        ]
      } },
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
      { $match: { 
           ...dateFilter,
           $or: [
            { paymentMethod: 'cod', orderStatus: 'Delivered' },
            { paymentMethod: { $ne: 'cod' }, "paymentInfo.paymentStatus": 'Paid' }
           ]
      } },
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
      { $match: { 
           ...dateFilter, 
           $or: [
            { paymentMethod: 'cod', orderStatus: 'Delivered' },
            { paymentMethod: { $ne: 'cod' }, "paymentInfo.paymentStatus": 'Paid' }
           ]
      } },
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

    const totalSalesOrders = await Orders.countDocuments({ ...dateFilter, ...salesMatchObj });
    const totalPages = Math.ceil(totalSalesOrders / limit);

    const rawOrderData = await Orders.find({ ...dateFilter, ...salesMatchObj })
      .populate("userId", "name email")
      .populate("items.productId", "name")
      .sort({ placedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // FLATTEN ORDERS INTO TRANSACTIONS
    const formattedOrders = rawOrderData.flatMap((order) => {
      const rows = [];
      
      const commonData = {
          orderId: order.orderID || order._id.toString().substring(0, 8).toUpperCase(),
          date: moment(order.placedAt).format("DD MMM, hh:mm A"), // Shortened Date
          customerName: order.userId?.name || "Guest",
          customerEmail: order.userId?.email || "N/A",
          paymentMethod: order.paymentMethod ? order.paymentMethod.toUpperCase() : "N/A",
          discountAmount: order.discountAmount || 0,
          couponCode: order.couponCode || '',
      };

      // 1. CREDIT TRANSACTION (The Sale)
      // Calculate Original Amount (Immutable) to persist effectively even if totalAmount is reduced by cancellations
      let originalTotalAmount = 0;
      order.items.forEach(item => {
          // Use orderedQty (initial) if available, else standard quantity (which might be reduced? No, schema says quantity is legacy/active, orderedQty is immutable)
          // Actually activeQty is mutable. quantity might be mutable too in old logic.
          // Safest: Use orderedQty if exists, else item.quantity + (any cancelled quantity we can find? No, simpler to assume orderedQty exists for new logic).
          const qty = item.orderedQty !== undefined ? item.orderedQty : item.quantity; 
          const price = item.paidUnitPrice !== undefined ? item.paidUnitPrice : (item.discoundedPrice || item.basePrice);
          originalTotalAmount += (price * qty);
      });
      originalTotalAmount += (order.deliveryCharge || 0);

      // If it exists in this list, it qualifies as a sale (Paid Online or Delivered/Returned COD)
      let creditStatus = 'Placed';
      if (order.paymentMethod === 'cod') creditStatus = 'Delivered'; // COD implies Delivery for money in
      
      rows.push({
          ...commonData,
          type: 'Credit',
          status: creditStatus,
          amount: originalTotalAmount, // Use immutable original amount
          isDebit: false
      });

      // 2. DEBIT TRANSACTION - CANCELLATION
      // Only for Online/Wallet (Money was collected, then refunded)
      if (order.paymentMethod !== 'cod') {
          if (order.cancelProducts && order.cancelProducts.length > 0) {
              let cancelRefund = 0;
              order.cancelProducts.forEach(cp => {
                  const price = cp.paidUnitPrice !== undefined ? cp.paidUnitPrice : cp.discountedPrice;
                  cancelRefund += (price * cp.canceledQuantity);
              });
              
              if (cancelRefund > 0) {
                  rows.push({
                      ...commonData,
                      type: 'Debit',
                      status: 'Cancelled',
                      amount: cancelRefund,
                      isDebit: true
                  });
              }
          }
      }

      // 3. DEBIT TRANSACTION - RETURN
      // Valid for both COD and Online
      if (order.returndProduct && order.returndProduct.length > 0) {
          let returnRefund = 0;
          order.returndProduct.forEach(rp => {
              if (rp.adminApproved === 'Approved') {
                  const price = rp.paidUnitPrice !== undefined ? rp.paidUnitPrice : rp.discountedPrice;
                  returnRefund += (price * rp.returndQuantity);
              }
          });

          if (returnRefund > 0) {
              rows.push({
                  ...commonData,
                  type: 'Debit',
                  status: 'Returned',
                  amount: returnRefund,
                  isDebit: true
              });
          }
      }

      return rows;
    });

    res.render("admin/sales/salesReport", {
      totalRevenue: `₹${totalRevenue.toLocaleString()}`,
      avgOrderValue: `₹${avgOrderValue}`,
      totalOrders,
      newCustomers,
      returningCustomers,
      totalReturns,
      returnCustomers,
      totalCouponDiscount,
      totalProductDiscount,
      totalCouponDiscount,
      totalProductDiscount,

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
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
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

    const salesMatchObj = {
        $or: [
            { paymentMethod: 'cod', orderStatus: { $in: ['Delivered', 'Returned'] } },
            { paymentMethod: { $ne: 'cod' }, "paymentInfo.paymentStatus": 'Paid' }
        ]
    };

    const orders = await Orders.find({ 
        ...dateFilter,
        ...salesMatchObj
     })
      .populate("userId", "name email")
      .populate("items.productId", "name")
      .sort({ placedAt: -1 })
      .lean();

    let totalRevenue = 0;
    let successfulOrders = 0; // Using this as 'Total Orders' count
    const userSet = new Set();
    
    // Flatten Orders -> Transactions
    const transactionRows = [];
    orders.forEach((order) => {
      // Summary Stats Calculation
      totalRevenue += order.totalAmount || 0;
      successfulOrders++;
      if (order.userId) userSet.add(order.userId._id ? order.userId._id.toString() : order.userId.toString());

      const itemsSummary = order.items
        .map((item) => {
          const productName = item.productId?.name || "Unknown Product";
          return `${productName} (${item.mlSize}ml x${item.quantity})`;
        })
        .join("; ");

      const commonData = {
        orderId: order.orderID || order._id.toString().substring(0, 8).toUpperCase(),
        date: moment(order.placedAt).format("DD MMM YYYY, hh:mm A"),
        customerName: order.userId?.name || "Guest",
        customerEmail: order.userId?.email || "N/A",
        items: itemsSummary,
        paymentMethod: order.paymentMethod ? order.paymentMethod.toUpperCase() : "N/A",
        transactionId: order.paymentInfo?.razorpayPaymentId || order.paymentInfo?.razorpayOrderId || "N/A",
      };

       // 1. Credit (Sale)
       let originalTotalAmount = 0;
       order.items.forEach(item => {
          const qty = item.orderedQty !== undefined ? item.orderedQty : item.quantity; 
          const price = item.paidUnitPrice !== undefined ? item.paidUnitPrice : (item.discoundedPrice || item.basePrice);
          originalTotalAmount += (price * qty);
       });
       originalTotalAmount += (order.deliveryCharge || 0);

       let creditStatus = 'Placed';
       if (order.paymentMethod === 'cod') creditStatus = 'Delivered';

       transactionRows.push({
           ...commonData,
           status: creditStatus,
           amount: originalTotalAmount,
           isDebit: false
       });

       // 2. Cancel Refund
       if (order.paymentMethod !== 'cod' && order.cancelProducts && order.cancelProducts.length > 0) {
           let cancelRefund = 0;
           order.cancelProducts.forEach(cp => {
               const price = cp.paidUnitPrice !== undefined ? cp.paidUnitPrice : cp.discountedPrice;
               cancelRefund += (price * cp.canceledQuantity);
           });
           if (cancelRefund > 0) {
               transactionRows.push({
                   ...commonData,
                   status: 'Cancelled',
                   amount: cancelRefund,
                   isDebit: true
               });
           }
       }

        // 3. Return Refund
        if (order.returndProduct && order.returndProduct.length > 0) {
            let returnRefund = 0;
            order.returndProduct.forEach(rp => {
                if (rp.adminApproved === 'Approved') {
                    const price = rp.paidUnitPrice !== undefined ? rp.paidUnitPrice : rp.discountedPrice;
                    returnRefund += (price * rp.returndQuantity);
                }
            });
            if (returnRefund > 0) {
                transactionRows.push({
                    ...commonData,
                    status: 'Returned',
                    amount: returnRefund,
                    isDebit: true
                });
            }
        }
    });

    const newCustomers = userSet.size;
    const avgOrderValue = successfulOrders > 0 ? Math.round(totalRevenue / successfulOrders) : 0;

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
      worksheet.addRow(["Total Transactions", transactionRows.length]);
      worksheet.addRow(["Total Customers", newCustomers]);
      worksheet.addRow([]);

      const headerRow = worksheet.addRow([
        "Order ID",
        "Date & Time",
        "Customer Name",
        "Items",
        "Status",
        "Amount",
        "Payment Method",
        "Transaction ID"
      ]);

      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFC5A987" },
      };

      transactionRows.forEach((row) => {
        const amountVal = row.isDebit ? -row.amount : row.amount;
        const excelRow = worksheet.addRow([
          row.orderId,
          row.date,
          row.customerName,
          row.items,
          row.status,
          amountVal,
          row.paymentMethod,
          row.transactionId
        ]);
        
        // Color amount
        const amountCell = excelRow.getCell(6);
        amountCell.font = {
            color: { argb: row.isDebit ? 'FFFF0000' : 'FF008000' }, // Red if debit, Green if credit
            bold: true
        };
        amountCell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00';
      });

      worksheet.columns = [
        { width: 15 }, 
        { width: 20 }, 
        { width: 20 }, 
        { width: 40 }, 
        { width: 15 }, 
        { width: 15 }, 
        { width: 15 }, 
        { width: 25 }
      ];

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
        "Order ID,Date & Time,Customer Name,Items,Status,Amount,Payment Method,Transaction ID\n";
      transactionRows.forEach((row) => {
        const sign = row.isDebit ? '-' : '+';
        csv += `${row.orderId},"${row.date}",${row.customerName},"${row.items}",${row.status},${sign}₹${row.amount},${row.paymentMethod},${row.transactionId}\n`;
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

    const salesMatchObj = {
        $or: [
            { paymentMethod: 'cod', orderStatus: { $in: ['Delivered', 'Returned'] } },
            { paymentMethod: { $ne: 'cod' }, "paymentInfo.paymentStatus": 'Paid' }
        ]
    };

    const orders = await Orders.find({ ...dateFilter, ...salesMatchObj })
      .populate("userId", "name email")
      .populate("items.productId", "name")
      .sort({ placedAt: -1 })
      .lean();

    // Flatten logic similar to chart data to get accurate total revenue for header
    // Actually, just calculating it from the rows is easier.
    
    // Create Transaction Rows
    const transactionRows = [];
    let totalRevenue = 0;
    let totalCancelRefund = 0;
    let totalReturnRefund = 0;

    orders.forEach(order => {
         const commonData = {
           orderId: order.orderID || order._id.toString().substring(0, 8).toUpperCase(),
           date: moment(order.placedAt).format("DD/MM/YY"),
           paymentMethod: order.paymentMethod ? order.paymentMethod.toUpperCase() : "N/A"
         };

         // 1. Credit (Sale)
         let originalTotalAmount = 0;
         order.items.forEach(item => {
            const qty = item.orderedQty !== undefined ? item.orderedQty : item.quantity; 
            const price = item.paidUnitPrice !== undefined ? item.paidUnitPrice : (item.discoundedPrice || item.basePrice);
            originalTotalAmount += (price * qty);
         });
         originalTotalAmount += (order.deliveryCharge || 0);

         let creditStatus = 'Placed';
         if (order.paymentMethod === 'cod') creditStatus = 'Delivered';

         transactionRows.push({
             ...commonData,
             status: creditStatus,
             amount: originalTotalAmount,
             isDebit: false
         });
         totalRevenue += originalTotalAmount;

         // 2. Cancel Refund
         if (order.paymentMethod !== 'cod' && order.cancelProducts && order.cancelProducts.length > 0) {
             let cancelRefund = 0;
             order.cancelProducts.forEach(cp => {
                 const price = cp.paidUnitPrice !== undefined ? cp.paidUnitPrice : cp.discountedPrice;
                 cancelRefund += (price * cp.canceledQuantity);
             });
             if (cancelRefund > 0) {
                 transactionRows.push({
                     ...commonData,
                     status: 'Cancelled',
                     amount: cancelRefund,
                     isDebit: true
                 });
                 totalCancelRefund += cancelRefund;
             }
         }

          // 3. Return Refund
          if (order.returndProduct && order.returndProduct.length > 0) {
              let returnRefund = 0;
              order.returndProduct.forEach(rp => {
                  if (rp.adminApproved === 'Approved') {
                      const price = rp.paidUnitPrice !== undefined ? rp.paidUnitPrice : rp.discountedPrice;
                      returnRefund += (price * rp.returndQuantity);
                  }
              });
              if (returnRefund > 0) {
                  transactionRows.push({
                      ...commonData,
                      status: 'Returned',
                      amount: returnRefund,
                      isDebit: true
                  });
                  totalReturnRefund += returnRefund;
              }
          }
    });

    const netRevenue = totalRevenue - totalCancelRefund - totalReturnRefund;

    const doc = new PDFDocument({ margin: 30, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=sales_report_${startDate || "all"}_${
        endDate || "now"
      }.pdf`
    );

    doc.pipe(res);

    doc.fontSize(20).text("Sales Report", { align: "center" });
    doc.moveDown();

    doc.fontSize(10);
    doc.text(`Period: ${startDate || "All Time"} to ${endDate || "Now"}`);
    doc.text(`Starting Revenue (Gross): Rs. ${totalRevenue.toLocaleString()}`);
    doc.text(`Total Cancel Refunds: Rs. ${totalCancelRefund.toLocaleString()}`);
    doc.text(`Total Return Refunds: Rs. ${totalReturnRefund.toLocaleString()}`);
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").text(`Net Revenue: Rs. ${netRevenue.toLocaleString()}`);
    doc.font("Helvetica").text(`Total Transactions: ${transactionRows.length}`);
    doc.moveDown();

    // Table Config
    const startY = doc.y;
    // New Column Layout: Date, Order ID, Status, Amount, Method
    // Removing Customer and Items as requested to focus on ledgers.
    const colX = { date: 30, id: 100, status: 220, amt: 350, method: 480 };
    const colW = { date: 60, id: 110, status: 120, amt: 100, method: 80 };

    const drawHeader = (y) => {
        doc.font("Helvetica-Bold").fontSize(9).fillColor('black');
        doc.text("Date", colX.date, y, { width: colW.date });
        doc.text("Order ID", colX.id, y, { width: colW.id });
        doc.text("Status", colX.status, y, { width: colW.status });
        // Right align amount header?
        doc.text("Amount", colX.amt, y, { width: colW.amt, align: 'right' });
        doc.text("Method", colX.method, y, { width: colW.method, align: 'right' });
        
        doc.moveTo(30, y + 12).lineTo(570, y + 12).stroke();
    };

    let y = startY;
    drawHeader(y);
    y += 20;

    doc.font("Helvetica").fontSize(9); // Size 9 for better legibility

    transactionRows.forEach((row) => {
      if (y > 750) {
        doc.addPage();
        y = 30; 
        drawHeader(y);
        y += 20;
        doc.font("Helvetica").fontSize(9);
      }

      doc.fillColor('black'); // Default
      doc.text(row.date, colX.date, y, { width: colW.date });
      doc.text(row.orderId, colX.id, y, { width: colW.id });
      
      // Status Color Logic
      if (row.status === 'Cancelled') doc.fillColor('red');
      else if (row.status === 'Returned') doc.fillColor('purple');
      else if (row.status === 'Delivered') doc.fillColor('green');
      else if (row.status === 'Placed') doc.fillColor('blue');
      
      doc.text(row.status, colX.status, y, { width: colW.status });
      
      // Amount Color Logic
      if (row.isDebit) doc.fillColor('red');
      else doc.fillColor('green');
      
      const sign = row.isDebit ? '-' : '+';
      doc.text(`${sign}Rs.${row.amount.toLocaleString()}`, colX.amt, y, { width: colW.amt, align: 'right' });
      
      doc.fillColor('black');
      doc.text(row.paymentMethod, colX.method, y, { width: colW.method, align: 'right' });

      y += 18; // Increased row height slightly
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
