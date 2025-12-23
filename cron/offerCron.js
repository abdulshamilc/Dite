import cron from "node-cron";
import Offer from "../models/offerModel.js";

const offerCronJob = () => {

  // minute wise cron
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();

      //  Deactivate expired offers
      const deactivated = await Offer.updateMany(
        {
          isDeleted: false,
          isActive: true,
          endDate: { $lt: now },
        },
        {
          $set: { isActive: false },
        }
      );

    } catch (error) {
      console.error("Offer Cron Error:", error.message);
    }
  });
};

export default offerCronJob;
