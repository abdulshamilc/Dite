import cron from "node-cron";
import Offer from "../models/offerModel.js";
import Products from "../models/productsModels.js";
import Categories from "../models/categories.js";
import Notification from "../models/notificationModel.js";

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
            return Math.max(0, discounted);
          });
          bestPrice = Math.min(variant.basePrice, ...prices);
        }

        variant.discountedPrice = Math.round(bestPrice);
      });

      await product.save();
    }
  } catch (error) {
    console.error("Error recalculating prices in cron:", error);
  }
};

const offerCronJob = () => {
  // minute wise cron
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();

      // Find offers that are expired but still marked active
      const expiredOffers = await Offer.find({
        isDeleted: false,
        isActive: true,
        endDate: { $lt: now },
      });

      if (expiredOffers.length > 0) {
        console.log(`Found ${expiredOffers.length} expired offers. Deactivating...`);
        
        for (const offer of expiredOffers) {
          // Deactivate the offer
          offer.isActive = false;
          await offer.save();

          // Create Notification
            await Notification.create({
                type: 'offer',
                message: `Offer "${offer.name}" has expired and been deactivated.`,
                metadata: { offerId: offer._id }
            });

          // Recalculate prices for the affected products/categories
          await recalculatePrices(offer.targetId, offer.targetModel);
        }
        
        console.log("Expired offers deactivated and prices updated.");
      }
    } catch (error) {
      console.error("Offer Cron Error:", error.message);
    }
  });
};

export default offerCronJob;
