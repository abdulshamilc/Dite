import Cart from '../models/cartModel.js';
import Wishlist from '../models/wishlistModel.js';
import { User } from '../models/userModels.js';

const getHeaderData = async (req, res, next) => {
  try {
    let cartLength = 0;
    let wishlistLength = 0;

    if (req.session && req.session.user) {
      const user = await User.findOne({ email: req.session.user });
      if (user) {
        // Fetch Cart Count
        const cart = await Cart.findOne({ userId: user._id });
        if (cart && cart.items) {
          cartLength = cart.items.reduce((acc, item) => acc + item.quantity, 0);
        }

        // Fetch Wishlist Count
        const wishlist = await Wishlist.findOne({ userId: user._id });
        if (wishlist && wishlist.items) {
          wishlistLength = wishlist.items.length;
        }
      }
    }
    res.locals.cartLength = cartLength;
    res.locals.wishlistLength = wishlistLength;
    next();
  } catch (error) {
    console.error("Header Data Middleware Error:", error);
    res.locals.cartLength = 0;
    res.locals.wishlistLength = 0;
    next();
  }
};

export default getHeaderData;
