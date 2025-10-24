import {Address} from "../../models/addressModel.js";
import Cart from "../../models/cartModel.js";
import { User } from "../../models/userModels.js";
import Order from "../../models/ordersModel.js";
import { nanoid } from "nanoid";

const getCheckout = async (req, res) => {
  const userEmail = req.session.user;
  if (!userEmail) return res.redirect("/login");

  const user = await User.findOne({ email: userEmail });
  const cart = await Cart.findOne({ userId: user._id });

  const addresses = await Address.find({ userId: user._id });

  let subtotal = 0;
  let total = 0;
  if (cart && cart.items.length > 0) {
    subtotal = cart.items.reduce(
      (acc, item) => acc + item.basePrice * item.quantity,
      0
    );
    total = subtotal; // Add shipping or discounts if any
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
      // Address already exists, redirect back
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
    if (!user) return res.redirect('/login');

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
        basePrice: item.basePrice,
        discoundedPrice: item.discoundedPrice,
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

    req.session.orderplaced = true ;
    await newOrder.save();
    


  } catch (error) {
    console.error("Error in placeOrder:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


const getSuccessPage = async(req,res)=>{
  
  const user = await User.findOne({email:req.session.user}) ;
  if(!user)res.redirect('/login') ;
  
  if(!req.session.orderplaced)res.redirect('/cart') ;
  
  await Cart.deleteMany({userId: user._id})

  res.render('user/checkout/succuss')
}


export {
  getCheckout,
  addGeolocation,
  clearGeolocation,
  addNewAddress,
  getPaymentpage,
  placeOrder,
  getSuccessPage,
};

