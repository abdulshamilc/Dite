import {User} from  '../../models/userModels.js'
import Product from '../../models/productsModels.js';
import Wishlist from '../../models/wishlistModel.js';
import Cart from '../../models/cartModel.js';

const getWishlist = async (req, res) => {
  try {
    const userEmail = req.session.user;

    if(!userEmail)return res.redirect('/login') ;

    const user = await User.findOne({email:userEmail}) ;
    
    if(!user)return res.redirect('/login') ;

    const userId = user._id ;

    let wishlist = await Wishlist.findOne({ userId }).populate({
      path: 'items.productId',
      select: 'name brand images variants',
      populate: {
        path: 'variants',
        select: 'stock isListed isDeleted'
      }
    }).lean();

    if (!wishlist) {
      wishlist = { items: [] };
    } else if (!wishlist.items || !wishlist.items.length) {
      wishlist.items = [];
    }

    const processedItems = wishlist.items.map(item => {
      const product = item.productId;
      if (!product || !product.variants || product.variants.length === 0) {
        return null;
      }

      const listedVariants = product.variants.filter(v => v.isListed && !v.isDeleted);
      const numVariants = listedVariants.length;

      return {
        _id: item._id,
        productId: product._id,
        name: product.name,
        brand: product.brand,
        numVariants,
        image: product.images[0] || '/default-image.jpg'
      };
    }).filter(Boolean);

    wishlist.items = processedItems;

    const suggestedProducts = await Product.find({
      isListed: true,
      isDeleted: false
    }).sort({ createdAt: -1 }).limit(4).select(
      'name images brand concentration gender variants.mlSize variants.stock variants.basePrice variants.discountedPrice'
    ).lean();

    const success = req.session.success || req.query.success || null;
    const error = req.session.error || req.query.error || null;

    delete req.session.success;
    delete req.session.error;

    res.render('user/wishlist/wishlist', {
      wishlist,
      suggestedProducts,
      success,
      error
    });
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.render('user/wishlist/wishlist', {
      wishlist: { items: [] },
      suggestedProducts: null,
      error: 'Failed to load wishlist. Please try again.'
    });
  }
};


const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const productIdParam = req.params.id;
    const idToUse = productId || productIdParam;
    const userEmail = req.session.user;

    if (!idToUse) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: 'Product ID is required.' });
      }
      return res.redirect('/shop?error=Product ID is required.');
    }

    if (!userEmail) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: 'Please log in to add to wishlist.' });
      }
      return res.redirect('/login');
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: 'User not found.' });
      }
      return res.redirect('/login');
    }

    const userId = user._id;

    const product = await Product.findById(idToUse);
    if (!product || !product.isListed || product.isDeleted) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: 'Product not found or unavailable.' });
      }
      return res.redirect('/shop?error=Product not found or unavailable.');
    }

    const cart = await Cart.findOne({ userId });
    if (cart && cart.items.some(item => item.productId.toString() === idToUse)) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: 'Product is already in your cart.' });
      }
      return res.redirect('/shop?error=Product is already in your cart.');
    }

    let wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      wishlist = new Wishlist({ userId, items: [] });
    }

    const exists = wishlist.items.some(item => item.productId.toString() === idToUse);
    if (exists) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: 'Already in wishlist.' });
      }
      return res.redirect('/shop?error=Already in wishlist.');
    }

    wishlist.items.push({ productId: idToUse });
    await wishlist.save();

    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      res.json({ success: true, message: 'Added to wishlist!' });
    } else {
      req.session.success = 'Added to wishlist!';
      res.redirect('/wishlist');
    }

  } catch (error) {
    console.error('Error adding to wishlist:', error);
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      res.json({ success: false, message: 'Server error. Please try again.' });
    } else {
      req.session.error = 'Server error. Please try again.';
      res.redirect('/shop');
    }
  }
};

const removeFromWishlist = async (req, res) => {
  try {
    const productId = req.params.id;
    const userEmail = req.session.user;

    if (!productId) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: 'Product ID is required.' });
      }
      return res.redirect('/wishlist?error=Product ID is required.');
    }

    if (!userEmail) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: 'Please log in to manage your wishlist.' });
      }
      return res.redirect('/login') ;
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: 'User not found.' });
      }
      return res.redirect('/login') ;
    }

    const userId = user._id;

    const wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: 'Wishlist not found.' });
      }
      return res.redirect('/wishlist?error=Wishlist not found.');
    }

    const initialLength = wishlist.items.length;
    wishlist.items = wishlist.items.filter(item => item.productId.toString() !== productId);
    await wishlist.save();

    const successMsg = initialLength > wishlist.items.length ? 'Removed from wishlist!' : 'Item not found in wishlist.';

    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      res.json({ success: true, message: successMsg });
    } else {
      req.session.success = successMsg;
      res.redirect('/wishlist');
    }
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      res.json({ success: false, message: 'Server error. Please try again.' });
    } else {
      req.session.error = 'Server error. Please try again.';
      res.redirect('/wishlist');
    }
  }
};


export {
    getWishlist,
    addToWishlist,
    removeFromWishlist,
}