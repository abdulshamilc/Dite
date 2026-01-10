import cron from "node-cron";
import Coupon from '../models/couponModel.js' ;
import Notification from "../models/notificationModel.js";

const couponCronJob = () => {
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();

      // Find expired coupons
      const expiredCoupons = await Coupon.find({
        isDeleted: false,
        isActive: true,
        endDate: { $lt: now },
      });

      if (expiredCoupons.length > 0) {
        for (const coupon of expiredCoupons) {
             coupon.isActive = false;
             await coupon.save();

             // Create Notification
             await Notification.create({
                 type: 'coupon',
                 message: `Coupon "${coupon.code}" has expired and been deactivated.`,
                 metadata: { couponId: coupon._id }
             });
        }
        console.log(`Deactivated ${expiredCoupons.length} expired coupons.`);
      }

    } catch (error) {
      console.error("Coupon Cron Error:", error.message);
    }
  });
};

export default couponCronJob;
