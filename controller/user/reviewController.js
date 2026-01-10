import Review from "../../models/reviewModel.js";
import Order from "../../models/ordersModel.js";
import Products from "../../models/productsModels.js";
import { User } from "../../models/userModels.js";

const addReview = async (req, res) => {
  try {
    const { productId, orderId, rating, review } = req.body;
    const userEmail = req.session.user;
    if (!userEmail) {
        return res.status(401).json({ success: false, message: "Please login first", redirect: "/login" });
    }
    
    // Convert email to userId
    const user = await User.findOne({ email: userEmail });
    if (!user) {
        return res.status(401).json({ success: false, message: "User not found", redirect: "/login" });
    }
    const userId = user._id;

    if (!productId || !orderId || !rating || !review) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // specific validation: check if order exists, belongs to user, and is delivered
    const order = await Order.findOne({
      _id: orderId,
      userId: userId, // Order schema usually stores ObjectId, checking this. If it stores email, use userEmail. Assuming ObjectId as per standard.
      orderStatus: "Delivered", 
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found or not eligible for review" });
    }

    // Check if user already reviewed this product from this order
    const existingReview = await Review.findOne({
      userId,
      productId,
      orderId,
    });

    if (existingReview) {
      return res.status(400).json({ success: false, message: "You have already reviewed this product for this order" });
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

    res.status(201).json({ success: true, message: "Review submitted successfully" });

  } catch (error) {
    console.error("Error adding review:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export { addReview };
