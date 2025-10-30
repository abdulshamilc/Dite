import {User} from "../../models/userModels.js";
import Cart from "../../models/cartModel.js";
import Products from "../../models/productsModels.js";
const getCart = async (req, res) => {
  try {
    const email = req.session.user;
    if (!email) return res.redirect("/login");

    const user = await User.findOne({ email: email });
    if (!user) return res.redirect("/login"); // Ensure user exists

    const success = req.session.success ;
    const error = req.session.error ;

    delete req.session.success ;
    delete req.session.error ;

    const cart = await Cart.findOne({ userId: user._id }).populate(
      "items.productId"
    );
    if (!cart) {
      return res.render("user/cart/cart", {
        cart: null,
        subtotal: 0,
        total: 0,
        success: success,
        error: error
      });
    }
    const subtotal = cart.items.reduce(
      (acc, item) => acc + item.basePrice * item.quantity,
      0
    );
    const total = cart.items.reduce(
      (acc, item) => acc + item.discountedPrice * item.quantity,
      0
    );
    res.render("user/cart/cart", {
      cart: cart,
      subtotal: subtotal,
      total: total,
      success:success,
      error:error
    });
  } catch (error) {
    console.error(error);
  }
};

const addToCart = async (req, res) => {
  try {
    const userEmail = req.session.user;
    const { productId, variantSize, quantity } = req.body;
    if (!userEmail) return res.redirect("/login");

    const user = await User.findOne({ email: userEmail });
    if (!user) return res.redirect("/login");

    const product = await Products.findById(productId);
    const selectedVarient = product.variants.find(
      (variant) => variant.mlSize === Number(variantSize)
    );

    let stockStatus = "In Stock";
    if (selectedVarient.stock == 0) stockStatus = "Out of Stock";
    else if (selectedVarient.stock < 5) stockStatus = "Limited Stock";

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
        cart.items[itemIndex].quantity += Number(quantity);
      } else {
        if (cart.items.length >= 10) {
          return res.redirect(
            `/shop/${productId}?error=Cart has reached the maximum limit of 10 products!`
          );
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
    res.redirect(`/shop/${productId}`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Something went wrong");
  }
};

const deleteCart = async (req, res) => {
  try {
    const userEmail = req.session.user;
    const itemId = req.params.id;

    if (!userEmail) {
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
    console.log(error);
  }
};

const updateQuatity = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) return res.status(401).json({ message: "Unauthorized" });
    
    const { action } = req.body;
    const { id: itemId } = req.params;
    
    if (!itemId || !action) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) return res.status(401).json({ message: "User not found" });
    
    const cart = await Cart.findOne({ userId: user._id });
    if (!cart) return res.status(404).json({ message: "Cart not found" });
    
    const item = cart.items.id(itemId);
    if (!item) return res.status(404).json({ message: "Item not found" });

    const product = await Products.findById(item.productId);
    if (!product) {
      return res.status(404).json({ message: "This product is missing" });
    }
    
    const selectedVariant = product.variants.find(v => v.mlSize === Number(item.size));
    if (!selectedVariant) {
      return res.status(400).json({ message: "Variant not found" });
    }

    let updated = false;

    if (action === "inc") {
      if (item.quantity >= 10) {
        return res.status(400).json({ message: "Maximum quantity of 10 reached" });
      }
      if (selectedVariant.stock < item.quantity + 1) {
        return res.status(400).json({ message: "The product is out of stock" });
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
      return res.status(400).json({ message: "Invalid action" });
    }

    if (updated) {
      await cart.save();
      return res.json({ success: true, message: "Quantity updated successfully" });
    } else {
      return res.status(400).json({ message: "No changes made" });
    }
  } catch (error) {
    console.log(error);
  }
};

export { getCart, addToCart, deleteCart, updateQuatity };
