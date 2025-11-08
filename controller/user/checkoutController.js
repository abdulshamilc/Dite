import { Address } from "../../models/addressModel.js";
import Cart from "../../models/cartModel.js";
import { User } from "../../models/userModels.js";
import Order from "../../models/ordersModel.js";
import { nanoid } from "nanoid";
import Products from "../../models/productsModels.js";

const getCheckout = async (req, res) => {
  const userEmail = req.session.user;
  if (!userEmail) return res.redirect("/login");

  const user = await User.findOne({ email: userEmail });
  if (!user) return res.redirect("/login");
  const cart = await Cart.findOne({ userId: user._id });
  if (!cart) return res.redirect("/cart");
  if (cart.items.length <= 0) {
    req.session.error = "The Cart Does Not Have Any Product To CheckOut";
    return res.redirect("/cart");
  }
  const addresses = await Address.find({ userId: user._id });

  let subtotal = 0;
  let total = 0;
  if (cart && cart.items.length > 0) {
    subtotal = cart.items.reduce(
      (acc, item) => acc + item.basePrice * item.quantity,
      0
    );
    total = subtotal;
  }

  res.render("user/checkout/selectAddress", {
    cart,
    addresses,
    subtotal,
    total,
  });
};

const addGeolocation = async (req, res) => {
  try {
    const addressId = req.params.id;
    const { link } = req.body;

    const address = await Address.findById(addressId);
    address.geolocation = link;

    await address.save();
  } catch (error) {
    console.log(error);
  }
};

const clearGeolocation = async (req, res) => {
  try {
    const addressId = req.params.id;

    const address = await Address.findById(addressId);
    address.geolocation = "";

    await address.save();
  } catch (error) {
    console.log(error);
  }
};

const addNewAddress = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) res.redirect("/login");
    const {
      fullName,
      phone,
      altPhone,
      hoNo,
      street,
      city,
      state,
      pin,
      country,
    } = req.body;
    const user = await User.findOne({ email: userEmail });
    const existingAddress = await Address.findOne({
      userId: user._id,
      fullName,
      phone,
      altPhone,
      hoNo,
      street,
      city,
      state,
      pin,
      country,
    });

    if (existingAddress) {
      return res.redirect("/checkout/address");
    }

    const newAddress = new Address({
      userId: user._id,
      fullName,
      phone,
      altPhone: altPhone || null,
      hoNo,
      street,
      city,
      state,
      pin,
      country,
    });

    await newAddress.save();

    res.redirect("/checkout/address");
  } catch (error) {
    console.log(error);
  }
};

const getPaymentpage = async (req, res) => {
  try {
    const userEmail = req.session.user;
    const addressId = req.params.id;

    if (!userEmail) return res.redirect("/login");

    const user = await User.findOne({ email: userEmail });
    const cart = await Cart.findOne({ userId: user._id });
    const selectedAddress = await Address.findById(addressId);

    if (!selectedAddress) return res.status(404).send("Address not found");

    res.render("user/checkout/finalChekout", { user, cart, selectedAddress });
  } catch (error) {
    console.log(error);
  }
};

const placeOrder = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.session.user });
    if (!user) return res.redirect("/login");

    const { addressId, items, paymentMethod } = req.body;

    const selectedAddress = await Address.findById(addressId);

    if (!selectedAddress) {
      return res.status(400).json({ message: "Invalid address ID" });
    }

    const totalAmount = items.reduce((acc, item) => {
      const price = item.discoundedPrice ?? item.basePrice;
      return acc + price * item.quantity;
    }, 0);
    const newOrder = new Order({
      orderID: `ORD-${nanoid(8)}`,
      userId: user._id,
      address: selectedAddress,
      items: items.map((item) => ({
        productId: item.productId,
        name: item.name,
        mlSize: item.size,
        basePrice: item.basePrice,
        discoundedPrice: item.discountedPrice,
        quantity: item.quantity,
        image: item.image,
      })),
      paymentMethod,
      totalAmount,
      orderStatus: "Placed",
      tracking: [
        {
          status: "Placed",
          message: "Your order has been placed successfully",
        },
      ],
      placedAt: new Date(),
    });

    req.session.orderplaced = true;
    await newOrder.save();

    res.json({ success: true });
  } catch (error) {
    console.error("Error in placeOrder:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getSuccessPage = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.session.user });
    if (!user) return res.redirect("/login");

    if (!req.session.orderplaced) return res.redirect("/cart");

    // Decrease stock for the latest placed order
    const latestOrder = await Order.findOne({ userId: user._id }).sort({ placedAt: -1 });
    if (latestOrder && latestOrder.orderStatus === "Placed") {
      for (const item of latestOrder.items) {
        const product = await Products.findById(item.productId);
        if (product && product.variants) {
          const mlSizeNum = parseInt(item.mlSize);
          const variantIndex = product.variants.findIndex(v => v.mlSize === mlSizeNum);
          if (variantIndex !== -1) {
            product.variants[variantIndex].stock -= item.quantity;
            await product.save();
          }
        }
      }
    }

    await Cart.deleteMany({ userId: user._id });

    delete req.session.orderplaced;
    res.render("user/checkout/succuss");
  } catch (error) {
    console.log(error)
  }
};

const getFailedPage = async (req, res) => {
  const user = await User.findOne({ email: req.session.user });
  if (!user) res.redirect("/login");

  if (!req.session.orderplaced) res.redirect("/cart");

  await Cart.deleteMany({ userId: user._id });

  res.render("user/checkout/failed");
};

export {
  getCheckout,
  addGeolocation,
  clearGeolocation,
  addNewAddress,
  getPaymentpage,
  placeOrder,
  getSuccessPage,
  getFailedPage,
};
