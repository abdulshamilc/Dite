import cron from "node-cron";
import Offer from "../models/offerModel.js";
import Products from "../models/productsModels.js";
import Categories from "../models/categories.js";
import Notification from "../models/notificationModel.js";

// Recalculate prices - NO LONGER SAVES TO DB
// Offer prices are calculated at runtime when displaying products
const recalculatePrices = async (targetIds, type) => {
  // Intentionally empty - offer prices are now calculated at runtime
  // The discountedPrice in DB is only for manual discounts set by admin
  console.log("Cron recalculatePrices called - prices calculated at runtime, no DB changes");
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
