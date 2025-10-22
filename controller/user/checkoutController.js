import Address from "../../models/addressModel.js";
import Cart from "../../models/cartModel.js";
import {User} from "../../models/userModels.js";

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


const getPaymentpage = async (req,res)=>{

 try {
   const userEmail = req.session.user ;
  const addressId = req.params.id ;

   if (!userEmail) return res.redirect("/login");

   const user = await User.findOne({email : userEmail}) ;
   const cart = await Cart.findOne({userId:user._id}) ;
   const selectedAddress  = await Address.findById(addressId) ;


   if (!selectedAddress) return res.status(404).send("Address not found");

  res.render("user/checkout/finalChekout", { user, cart, selectedAddress });

 } catch (error) {
  console.log(error) ;  
 }
}

export { getCheckout, addGeolocation, clearGeolocation , addNewAddress , getPaymentpage };
