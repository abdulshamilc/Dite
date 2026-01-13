import Review from "../../models/reviewModel.js";
import Order from "../../models/ordersModel.js";
import Products from "../../models/productsModels.js";
import { User } from "../../models/userModels.js";
import { SUCCESS_MESSAGES, ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";

const addReview = async (req, res) => {
  try {
    const { productId, orderId, rating, review } = req.body;
    const userEmail = req.session.user;
    if (!userEmail) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, message: ERROR_MESSAGES.PLEASE_LOGIN, redirect: "/login" });
    }
    
    // Convert email to userId
    const user = await User.findOne({ email: userEmail });
    if (!user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, message: ERROR_MESSAGES.USER_NOT_FOUND, redirect: "/login" });
    }
    const userId = user._id;

    if (!productId || !orderId || !rating || !review) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: ERROR_MESSAGES.REQUIRED_FIELDS_MISSING });
    }

    // specific validation: check if order exists, belongs to user, and is delivered
    const order = await Order.findOne({
      _id: orderId,
      userId: userId, // Order schema usually stores ObjectId, checking this. If it stores email, use userEmail. Assuming ObjectId as per standard.
      orderStatus: "Delivered", 
    });

    if (!order) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: ERROR_MESSAGES.ORDER_NOT_ELIGIBLE_REVIEW });
    }

    // Check if user already reviewed this product from this order
    const existingReview = await Review.findOne({
      userId,
      productId,
      orderId,
    });

    if (existingReview) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: ERROR_MESSAGES.ALREADY_REVIEWED });
    }

    const newReview = new Review({
      userId,
      productId,
      orderId,
      rating,
      review,
      userName: user.name
    });

    await newReview.save();

    res.status(HTTP_STATUS.CREATED).json({ success: true, message: SUCCESS_MESSAGES.REVIEW_ADDED });

  } catch (error) {
    console.error("Error adding review:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: ERROR_MESSAGES.REVIEW_ERROR });
  }
};

export { addReview };
