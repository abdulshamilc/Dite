import { User } from "../../models/userModels.js";
import Cart from "../../models/cartModel.js";
import Products from "../../models/productsModels.js";
import Wishlist from "../../models/wishlistModel.js";
import Offer from "../../models/offerModel.js";
import { SUCCESS_MESSAGES, ERROR_MESSAGES, HTTP_STATUS } from "../../constants/index.js";
// Get cart
const getCart = async (req, res) => {
  try {
    const email = req.session.user;
    if (!email) {
        req.session.returnTo = req.originalUrl;
        return res.redirect("/login");
    }

    const user = await User.findOne({ email: email });
    if (!user) {
        req.session.returnTo = req.originalUrl;
        return res.redirect("/login"); // Ensure user exists
    }

    const success = req.session.success;
    const error = req.session.error;

    delete req.session.success;
    delete req.session.error;

    const cart = await Cart.findOne({ userId: user._id }).populate(
      "items.productId"
    );
    if (!cart) {
      return res.render("user/cart/cart", {
        cart: null,
        subtotal: 0,
        total: 0,
        success: success,
        error: error,
      });
    }

    // Validate Stock and Availability
    let cartUpdated = false;
    for (const item of cart.items) {
      const product = item.productId;
      // Check if product is available
      if (!product || product.isDeleted || !product.isListed) {
        if (item.stockStatus !== "Unavailable") {
          item.stockStatus = "Unavailable";
          cartUpdated = true;
        }
        continue;
      }

      // Check variant stock
      const variant = product.variants.find(v => v.mlSize === Number(item.size));
      if (!variant) {
         if (item.stockStatus !== "Out of Stock") {
           item.stockStatus = "Out of Stock"; // Variant gone
           cartUpdated = true;
         }
      } else {
        if (variant.stock < item.quantity || variant.stock === 0) {
           if (item.stockStatus !== "Out of Stock") {
             item.stockStatus = "Out of Stock";
             cartUpdated = true;
           }
        } else if (variant.stock < 5) {
           if (item.stockStatus !== "Limited Stock") {
             item.stockStatus = "Limited Stock";
             cartUpdated = true;
           }
        } else {
           if (item.stockStatus !== "In Stock") {
             item.stockStatus = "In Stock";
             cartUpdated = true;
           }
        }
        // Update price if changed (optional but good practice)
        if(item.basePrice !== variant.basePrice || item.discountedPrice !== variant.discountedPrice) {
            item.basePrice = variant.basePrice;
            item.discountedPrice = variant.discountedPrice;
            cartUpdated = true;
        }
      }
    }

    if (cartUpdated) {
      await cart.save();
    }

    const subtotal = cart.items.reduce(
      (acc, item) => {
         // Only sum available items? Usually cart shows total of all, but checkout validation prevents purchase.
         // Let's keep logic simple: Sum all, but view will visually indicate OOS.
         return acc + item.discountedPrice * item.quantity;
      },
      0
    );
    const total = subtotal; // Total is same as subtotal (sum of discounted prices)

    // Fetch active offers logic
    const offersMap = {};
    const currentDate = new Date();
    if (cart.items.length > 0) {
      const productIds = cart.items.map(item => item.productId ? item.productId._id : null).filter(id => id);
      const categoryIds = cart.items.map(item => item.productId ? item.productId.category : null).filter(id => id); // Assuming category is ObjectId field

      const offers = await Offer.find({
        $or: [
          { targetModel: 'Product', targetId: { $in: productIds } },
          { targetModel: 'Categories', targetId: { $in: categoryIds } }
        ],
        isActive: true,
        isDeleted: false,
        startDate: { $lte: currentDate },
        endDate: { $gte: currentDate }
      });

      cart.items.forEach(item => {
        const product = item.productId;
        // Find all offers applicable to this item
        const applicableOffers = offers.filter(offer => 
          (offer.targetModel === 'Product' && offer.targetId.toString() === product._id.toString()) ||
          (offer.targetModel === 'Categories' && offer.targetId.toString() === product.category.toString())
        );

        // Find the "best" offer (one giving max discount)
        let bestOffer = null;
        let maxDiscountAmount = 0;

        applicableOffers.forEach(offer => {
            let discount = 0;
            if (offer.discountType === 'flat') {
                discount = offer.discountValue;
            } else {
                discount = (item.basePrice * offer.discountValue) / 100;
            }
            if (discount > maxDiscountAmount) {
                maxDiscountAmount = discount;
                bestOffer = offer;
            }
        });

        if (bestOffer) {
            offersMap[item._id] = bestOffer;
        }
      });
    }

    res.render("user/cart/cart", {
      cart: cart,
      subtotal: subtotal,
      total: total,
      success: success,
      error: error,
      offersMap: offersMap, // Pass the map to the view
    });
  } catch (error) {
    console.error(error);
  }
};

// Add to cart
const addToCart = async (req, res) => {
  try {
    const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest' || req.xhr;
    const userEmail = req.session.user;
    const { productId, variantSize, quantity } = req.body;
    
    if (!userEmail) {
        req.session.returnTo = req.get('Referer') || "/";
        if (isAjax) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, redirect: "/login", message: ERROR_MESSAGES.LOGIN_REQUIRED });
        }
        return res.redirect("/login");
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) {
        req.session.returnTo = req.get('Referer') || "/";
        if (isAjax) {
             return res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, redirect: "/login", message: ERROR_MESSAGES.SESSION_INVALID });
        }
        return res.redirect("/login");
    }

    const product = await Products.findById(productId);
    
    if (!product || !product.isListed || product.isDeleted) {
        if (isAjax) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: ERROR_MESSAGES.PRODUCT_UNAVAILABLE });
        return res.redirect("/shop?error=Product Unavailable");
    }

    const selectedVarient = product.variants.find(
      (variant) => variant.mlSize === Number(variantSize)
    );

    if (!selectedVarient) {
      if (isAjax) return res.json({ success: false, message: ERROR_MESSAGES.VARIANT_NOT_FOUND });
      return res.redirect(`/shop/${productId}?error=Variant not found`);
    }

    if (selectedVarient.stock === 0) {
      if (isAjax) return res.json({ success: false, message: ERROR_MESSAGES.OUT_OF_STOCK });
      return res.redirect(`/shop/${productId}?error=Out of Stock`);
    }

    if (Number(quantity) > selectedVarient.stock) {
      const msg = `Not enough stock. Only ${selectedVarient.stock} available.`;
      if (isAjax) return res.json({ success: false, message: msg });
      return res.redirect(`/shop/${productId}?error=${msg}`);
    }

    let stockStatus = "In Stock";
    if (selectedVarient.stock < 5) stockStatus = "Limited Stock";

    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 7);

    let cart = await Cart.findOne({ userId: user._id });
    if (!cart) {
      cart = new Cart({
        userId: user._id,
        items: [
          {
            productId,
            name: product.name,
            size: selectedVarient.mlSize,
            quantity: quantity,
            basePrice: selectedVarient.basePrice,
            discountedPrice: selectedVarient.discountedPrice,
            image: product.images[0],
            stockStatus: stockStatus,
            deliveryDate: deliveryDate,
          },
        ],
      });
    } else {
      const itemIndex = cart.items.findIndex(
        (item) =>
          item.productId.toString() === productId &&
          item.size === String(selectedVarient.mlSize)
      );
      if (itemIndex > -1) {
        const existingQuantity = cart.items[itemIndex].quantity;
        const newQuantity = existingQuantity + Number(quantity);
        
        // Check total cart quantity limit (10 items max across all products)
        const currentTotalQuantity = cart.items.reduce((acc, ele) => acc + ele.quantity, 0);
        // We are adding 'quantity' to the cart.
        if (currentTotalQuantity + Number(quantity) > 10) {
           const remaining = 10 - currentTotalQuantity;
           const msg = `Cart limit is 10 units total. Only ${remaining} more can be added.`;
           if (isAjax) return res.json({ success: false, message: msg });
           return res.redirect(`/shop/${productId}?error=${msg}`);
        }

        if (newQuantity > selectedVarient.stock) {
          const remaining = selectedVarient.stock - existingQuantity;
          const msg = `Not enough stock. Only ${remaining} left for this item.`;
          if (isAjax) return res.json({ success: false, message: msg });
          return res.redirect(`/shop/${productId}?error=${msg}`);
        }
        cart.items[itemIndex].quantity = newQuantity;
      } else {
        
        if (cart.items.length >= 10) {
          const msg = ERROR_MESSAGES.CART_LIMIT_EXCEEDED;
          if (isAjax) return res.json({ success: false, message: msg });
          return res.redirect(`/shop/${productId}?error=${msg}`);
        }
        let currentTotalQuantity = cart.items.reduce(
          (acc, ele) => acc + ele.quantity,
          0
        );

        const newTotalQuantity = currentTotalQuantity + Number(quantity);
        if (newTotalQuantity > 10) {
          const remaining = 10 - currentTotalQuantity;
          const msg = `Cart limit is 10 units total. Only ${remaining} more can be added.`;
          if (isAjax) return res.json({ success: false, message: msg });
          return res.redirect(`/shop/${productId}?error=${msg}`);
        }

        cart.items.push({
          productId,
          name: product.name,
          size: selectedVarient.mlSize,
          quantity: quantity,
          basePrice: selectedVarient.basePrice,
          discountedPrice: selectedVarient.discountedPrice,
          image: product.images[0],
          stockStatus: stockStatus,
          deliveryDate: deliveryDate,
        });
      }
    }

    await cart.save();

    // Remove from wishlist if exists
    await Wishlist.updateOne(
      { userId: user._id },
      { $pull: { items: { productId: productId } } }
    );
    
    if (isAjax) {
        return res.json({ success: true, message: SUCCESS_MESSAGES.ADDED_TO_CART });
    }
    res.redirect(`/shop/${productId}`);
  } catch (error) {
    console.error(error);
    const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest' || req.xhr;
    if (isAjax) return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: ERROR_MESSAGES.INTERNAL_ERROR });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_ERROR);
  }
};

// Delete cart
const deleteCart = async (req, res) => {
  try {
    const userEmail = req.session.user;
    const itemId = req.params.id;

    if (!userEmail) {
      req.session.returnTo = req.get('Referer') || "/";
      return res.redirect("/login");
    }

    const user = await User.findOne({ email: userEmail });
    const cart = await Cart.findOne({ userId: user._id });

    await Cart.updateOne(
      { _id: cart._id },
      { $pull: { items: { _id: itemId } } }
    );

    res.redirect("/cart");
  } catch (error) {
    console.error(error);
  }
};

// Update quantity
const updateQuantity = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: ERROR_MESSAGES.UNAUTHORIZED_ACCESS });

    const { action } = req.body;
    const { id: itemId } = req.params;

    if (!itemId || !action) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.INVALID_REQUEST });
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: ERROR_MESSAGES.USER_NOT_FOUND });

    const cart = await Cart.findOne({ userId: user._id });
    if (!cart) return res.status(HTTP_STATUS.NOT_FOUND).json({ message: ERROR_MESSAGES.CART_NOT_FOUND });

    const item = cart.items.id(itemId);
    if (!item) return res.status(HTTP_STATUS.NOT_FOUND).json({ message: ERROR_MESSAGES.ITEM_NOT_FOUND });

    const product = await Products.findById(item.productId);
    if (!product) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ message: ERROR_MESSAGES.MISSING_PRODUCT });
    }

    const selectedVariant = product.variants.find(
      (v) => v.mlSize === Number(item.size)
    );
    if (!selectedVariant) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.VARIANT_NOT_FOUND });
    }

    let updated = false;

    if (action === "inc") {
      // Check global limit
      const currentTotalQuantity = cart.items.reduce((acc, ele) => acc + ele.quantity, 0);
      if (currentTotalQuantity >= 10) {
        return res
          .status(400)
          .json({ message: "Cart cannot exceed 10 items total." });
      }

      if (item.quantity >= 10) {
        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .json({ message: ERROR_MESSAGES.ITEM_LIMIT_EXCEEDED });
      }
      
      // Stock Check
      if (selectedVariant.stock < item.quantity + 1) {
         return res.status(400).json({ 
             message: `Sorry, only ${selectedVariant.stock} items available in stock.` 
         });
      }
      
      item.quantity += 1;
      updated = true;
    } else if (action === "dec") {
      if (item.quantity > 1) {
        item.quantity -= 1;
        updated = true;
      } else {
        cart.items.pull({ _id: itemId });
        updated = true;
      }
    } else {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.INVALID_ACTION });
    }

    if (updated) {
      await cart.save();
      
      const savedItem = cart.items.id(itemId);
      const itemTotal = savedItem ? (savedItem.basePrice * savedItem.quantity) : 0;
      const itemDiscountedTotal = savedItem ? (savedItem.discountedPrice * savedItem.quantity) : 0;
      const itemSavings = savedItem ? (savedItem.basePrice - savedItem.discountedPrice) * savedItem.quantity : 0;
      
      const cartTotal = cart.items.reduce(
        (acc, item) => acc + item.discountedPrice * item.quantity,
        0
      ) + 40; // Add fixed delivery charge

      return res.json({
        success: true,
        message: SUCCESS_MESSAGES.QUANTITY_UPDATED,
        newQuantity: savedItem ? savedItem.quantity : 0,
        itemTotal: itemTotal, // Base Price Total
        itemDiscountedTotal: itemDiscountedTotal, // Discounted Total (Final)
        itemSavings: itemSavings,
        cartTotal: cartTotal
      });
    } else {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: ERROR_MESSAGES.NO_CHANGES });
    }
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: ERROR_MESSAGES.INTERNAL_ERROR });
  }
};

export { getCart, addToCart, deleteCart, updateQuantity };
