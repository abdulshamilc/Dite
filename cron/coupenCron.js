import cron from "node-cron";
import Coupon from '../models/couponModel.js' ;

const couponCronJob = () => {
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();

      // Deactivate expired coupons
      await Coupon.updateMany(
        {
          isDeleted: false,
          isActive: true,
          endDate: { $lt: now },
        },
        { $set: { isActive: false } }
      );

    } catch (error) {
      console.error("Coupon Cron Error:", error.message);
    }
  });
};

export default couponCronJob;
