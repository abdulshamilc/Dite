import Cart from '../models/cartModel.js';
import { User } from '../models/userModels.js';

const getCartCount = async (req, res, next) => {
  try {
    let cartLength = 0;
    if (req.session && req.session.user) {
      const user = await User.findOne({ email: req.session.user });
      if (user) {
        const cart = await Cart.findOne({ userId: user._id });
        if (cart && cart.items) {
          cartLength = cart.items.reduce((acc, item) => acc + item.quantity, 0);
        }
      }
    }
    res.locals.cartLength = cartLength;
    next();
  } catch (error) {
    console.error("Cart Count Middleware Error:", error);
    res.locals.cartLength = 0;
    next();
  }
};

export default getCartCount;
