import {User} from  '../../models/userModels.js'
import Product from '../../models/productsModels.js';
import Wishlist from '../../models/wishlistModel.js';
import Cart from '../../models/cartModel.js';
import { SUCCESS_MESSAGES, ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";

const getWishlist = async (req, res) => {
  try {
    const userEmail = req.session.user;

    if(!userEmail){
        req.session.returnTo = req.originalUrl;
        return res.redirect('/login') ;
    }

    const user = await User.findOne({email:userEmail}) ;
    
    if(!user){
        req.session.returnTo = req.originalUrl;
        return res.redirect('/login') ;
    }

    const userId = user._id ;

    let wishlist = await Wishlist.findOne({ userId }).populate({
      path: 'items.productId',
      select: 'name brand images variants'
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
      _id: { $nin: wishlist.items.map(item => item.productId) }, 
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
      error: ERROR_MESSAGES.WISHLIST_LOAD_ERROR
    });
  }
};


const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body || {};
    const productIdParam = req.params.id;
    const idToUse = productId || productIdParam;
    const userEmail = req.session.user;

    if (!idToUse) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: ERROR_MESSAGES.PRODUCT_ID_REQUIRED });
      }
      return res.redirect(`/shop?error=${ERROR_MESSAGES.PRODUCT_ID_REQUIRED}`);
    }

    if (!userEmail) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        req.session.returnTo = req.get('Referer') || "/";
        return res.json({ success: false, message: ERROR_MESSAGES.LOGIN_REQUIRED, redirect: '/login' });
      }
      req.session.returnTo = req.get('Referer') || "/";
      return res.redirect('/login');
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        req.session.returnTo = req.get('Referer') || "/";
        return res.json({ success: false, message: ERROR_MESSAGES.USER_NOT_FOUND, redirect: '/login' });
      }
      req.session.returnTo = req.get('Referer') || "/";
      return res.redirect('/login');
    }

    const userId = user._id;

    const product = await Product.findById(idToUse);
    if (!product || !product.isListed || product.isDeleted) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: ERROR_MESSAGES.PRODUCT_UNAVAILABLE });
      }
      return res.redirect(`/shop?error=${ERROR_MESSAGES.PRODUCT_UNAVAILABLE}`);
    }

    const cart = await Cart.findOne({ userId });
    if (cart && cart.items.some(item => item.productId.toString() === idToUse)) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: ERROR_MESSAGES.PRODUCT_IN_CART });
      }
      return res.redirect(`/shop?error=${ERROR_MESSAGES.PRODUCT_IN_CART}`);
    }

    let wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      wishlist = new Wishlist({ userId, items: [] });
    }

    const exists = wishlist.items.some(item => item.productId.toString() === idToUse);
    if (exists) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: ERROR_MESSAGES.ALREADY_IN_WISHLIST });
      }
      return res.redirect(`/shop?error=${ERROR_MESSAGES.ALREADY_IN_WISHLIST}`);
    }

    wishlist.items.push({ productId: idToUse });
    await wishlist.save();

    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      res.json({ success: true, message: SUCCESS_MESSAGES.ADDED_TO_WISHLIST });
    } else {
      req.session.success = SUCCESS_MESSAGES.ADDED_TO_WISHLIST;
      res.redirect(req.get('Referer') || '/shop');
    }

  } catch (error) {
    console.error('Error adding to wishlist:', error);
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      res.json({ success: false, message: ERROR_MESSAGES.INTERNAL_ERROR });
    } else {
      req.session.error = ERROR_MESSAGES.INTERNAL_ERROR;
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
        return res.json({ success: false, message: ERROR_MESSAGES.PRODUCT_ID_REQUIRED });
      }
      return res.redirect(`/wishlist?error=${ERROR_MESSAGES.PRODUCT_ID_REQUIRED}`);
    }

    if (!userEmail) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: ERROR_MESSAGES.LOGIN_REQUIRED });
      }
      req.session.returnTo = req.get('Referer') || "/";
      return res.redirect('/login') ;
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: ERROR_MESSAGES.USER_NOT_FOUND });
      }
      req.session.returnTo = req.get('Referer') || "/";
      return res.redirect('/login') ;
    }

    const userId = user._id;

    const wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: ERROR_MESSAGES.WISHLIST_NOT_FOUND });
      }
      return res.redirect(`/wishlist?error=${ERROR_MESSAGES.WISHLIST_NOT_FOUND}`);
    }

    const initialLength = wishlist.items.length;
    wishlist.items = wishlist.items.filter(item => item.productId.toString() !== productId);
    await wishlist.save();
    const successMsg = initialLength > wishlist.items.length ? SUCCESS_MESSAGES.REMOVED_FROM_WISHLIST : ERROR_MESSAGES.ITEM_NOT_IN_WISHLIST;
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      res.json({ success: true, message: successMsg });
    } else {
      req.session.success = successMsg;
      res.redirect('/wishlist');
    }
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      res.json({ success: false, message: ERROR_MESSAGES.INTERNAL_ERROR });
    } else {
      req.session.error = ERROR_MESSAGES.INTERNAL_ERROR;
      res.redirect('/wishlist');
    }
  }
};

const addToCartFromWishlist = async (req, res) => {
  try {
    const itemId = req.params.id; // Assuming this is the wishlist item's _id
    const userEmail = req.session.user;

    if (!itemId) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: ERROR_MESSAGES.WISHLIST_ITEM_ID_REQUIRED });
      }
      return res.redirect(`/wishlist?error=${ERROR_MESSAGES.WISHLIST_ITEM_ID_REQUIRED}`);
    }

    if (!userEmail) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        req.session.returnTo = req.get('Referer') || "/";
        return res.json({ success: false, message: ERROR_MESSAGES.LOGIN_REQUIRED, redirect: '/login' });
      }
      req.session.returnTo = req.get('Referer') || "/";
      return res.redirect('/login');
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        req.session.returnTo = req.get('Referer') || "/";
        return res.json({ success: false, message: ERROR_MESSAGES.USER_NOT_FOUND, redirect: '/login' });
      }
      req.session.returnTo = req.get('Referer') || "/";
      return res.redirect('/login');
    }

    const userId = user._id;

    // Fetch wishlist with populated product details
    const wishlist = await Wishlist.findOne({ userId }).populate({
      path: 'items.productId',
      select: 'name brand images variants isListed isDeleted'
    });

    if (!wishlist) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: ERROR_MESSAGES.WISHLIST_NOT_FOUND });
      }
      return res.redirect(`/wishlist?error=${ERROR_MESSAGES.WISHLIST_NOT_FOUND}`);
    }

    // Find the specific wishlist item
    const itemIndex = wishlist.items.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: ERROR_MESSAGES.WISHLIST_ITEM_NOT_FOUND });
      }
      return res.redirect(`/wishlist?error=${ERROR_MESSAGES.WISHLIST_ITEM_NOT_FOUND}`);
    }

    const item = wishlist.items[itemIndex];
    const product = item.productId;

    if (!product || !product.isListed || product.isDeleted) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: ERROR_MESSAGES.PRODUCT_UNAVAILABLE });
      }
      return res.redirect(`/wishlist?error=${ERROR_MESSAGES.PRODUCT_UNAVAILABLE}`);
    }

    if (!product.variants || product.variants.length === 0) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: ERROR_MESSAGES.NO_VARIANTS_AVAILABLE });
      }
      return res.redirect(`/wishlist?error=${ERROR_MESSAGES.NO_VARIANTS_AVAILABLE}`);
    }

    // Find the first available variant (isListed, !isDeleted, stock > 0), starting from index 0
    let selectedVariantIndex = -1;
    for (let i = 0; i < product.variants.length; i++) {
      const variant = product.variants[i];
      if (variant.isListed && !variant.isDeleted && variant.stock > 0) {
        selectedVariantIndex = i;
        break;
      }
    }

    if (selectedVariantIndex === -1) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ success: false, message: ERROR_MESSAGES.NO_STOCK_AVAILABLE });
      }
      return res.redirect(`/wishlist?error=${ERROR_MESSAGES.NO_STOCK_AVAILABLE}`);
    }

    const selectedVariant = product.variants[selectedVariantIndex];
    const price = selectedVariant.discountedPrice || selectedVariant.basePrice;

    // Check if product is already in cart (regardless of variant, to match existing logic)
    let cart = await Cart.findOne({ userId });
    
    // Create cart if not exists
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existingItemIndex = cart.items.findIndex(
      (cItem) => 
        cItem.productId.toString() === product._id.toString() && 
        cItem.size === selectedVariant.mlSize.toString()
    );

    if (existingItemIndex > -1) {
      // Item exists, increment quantity if stock allows
      const existingItem = cart.items[existingItemIndex];
      const newQuantity = existingItem.quantity + 1;

      if (newQuantity > selectedVariant.stock) {
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
          return res.json({ success: false, message: `Only ${selectedVariant.stock} items available in stock.` });
        }
        return res.redirect(`/wishlist?error=Only ${selectedVariant.stock} items available.`);
      }

      // Calculate total cart quantity
      const currentTotalQuantity = cart.items.reduce((acc, item) => acc + item.quantity, 0);
      
      if (currentTotalQuantity + 1 > 10) {
         if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
          return res.json({ success: false, message: ERROR_MESSAGES.CART_LIMIT_EXCEEDED });
        }
        return res.redirect(`/wishlist?error=${ERROR_MESSAGES.CART_LIMIT_EXCEEDED}`);
      }

      cart.items[existingItemIndex].quantity = newQuantity;
    } else {
      // Check total cart limit or other constraints if necessary
       if (cart.items.length >= 10) {
          if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
             return res.json({ success: false, message: ERROR_MESSAGES.CART_DISTINCT_LIMIT });
          }
           return res.redirect(`/wishlist?error=${ERROR_MESSAGES.CART_DISTINCT_LIMIT}`);
        }

       const currentTotalQuantity = cart.items.reduce((acc, item) => acc + item.quantity, 0);
       if (currentTotalQuantity + 1 > 10) {
          if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.json({ success: false, message: ERROR_MESSAGES.CART_LIMIT_EXCEEDED });
          }
          return res.redirect(`/wishlist?error=${ERROR_MESSAGES.CART_LIMIT_EXCEEDED}`);
       }

      // Add new item
      cart.items.push({
        productId: product._id,
        name: product.name,
        size: selectedVariant.mlSize.toString(),
        basePrice: selectedVariant.basePrice,
        discountedPrice: selectedVariant.discountedPrice,
        image: product.images[0] || '/default-image.jpg',
        stockStatus: 'In Stock',
        quantity: 1
      });
    }

    await cart.save();

    // Remove the item from wishlist (moving it to cart)
    wishlist.items.splice(itemIndex, 1);
    await wishlist.save();

    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      req.session.success = SUCCESS_MESSAGES.MOVED_TO_CART;
      res.json({ success: true, message: SUCCESS_MESSAGES.MOVED_TO_CART });
    } else {
      req.session.success = SUCCESS_MESSAGES.MOVED_TO_CART;
      res.redirect('/wishlist');
    }

  } catch (error) {
    console.error('Error adding to cart from wishlist:', error);
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      res.json({ success: false, message: ERROR_MESSAGES.INTERNAL_ERROR });
    } else {
      req.session.error = ERROR_MESSAGES.INTERNAL_ERROR;
      res.redirect('/wishlist');
    }
  }
};

export {
    getWishlist,
    addToWishlist,
    removeFromWishlist,
    addToCartFromWishlist
}