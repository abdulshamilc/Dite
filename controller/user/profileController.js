import { User } from "../../models/userModels.js";
import {Address} from "../../models/addressModel.js";
import Order from "../../models/ordersModel.js";

const getProfile = async (req, res) => {
  try {
    const email = req.session.user;

    if (!email) {
      return res.redirect("/profile/login");
    }
    const user = await User.findOne({ email: email });
    res.render("user/profile/profile", { user, currentPath: req.path });
  } catch (error) {
    console.log(error);
  }
};

const postProfile = async (req, res) => {
  try {
    const { name, gender, email, phone } = req.body;

    const user = await User.findOne({ email: req.session.user });

    if (!user) {
      return res.status(404).send("User not found");
    }

    let imageUrl = user.image; // keep existing one
    if (req.file) {
      imageUrl = req.file.path;
    }

    // Update fields

    user.name = name;
    user.gender = gender;
    user.phone = phone || "";
    user.image = imageUrl;

    await user.save();

    res.redirect("/profile");
  } catch (error) {
    console.log(error);
    res.status(500).send("Something went wrong");
  }
};

const getAddress = async (req, res) => {
  try {
    const email = req.session.user;
    if (!email) {
      return res.redirect("/login");
    }
    const user = await User.findOne({ email: email });
    const address = await Address.find({ userId: user._id, isDeleted: false });

    res.render("user/profile/address", {
      address,
      currentPath: req.path,
      user,
    });
  } catch (error) {
    console.log(error);
  }
};

const postAddAddress = async (req, res) => {
  try {
    const email = req.session.user;
    const {
      fullName,
      hoNo,
      street,
      city,
      state,
      pin,
      country,
      phone,
      altPhone,
      isDefault,
    } = req.body;

    const user = await User.findOne({ email: email });

    if (isDefault) {
      await Address.updateMany(
        { userId: user._id, isDeleted: false },
        { $set: { isDefault: false } }
      );
    }

    const newAdress = new Address({
      userId: user._id,
      fullName,
      hoNo,
      street,
      city,
      state,
      pin,
      country,
      phone,
      altPhone,
      isDefault: !!isDefault,
    });

    await newAdress.save();

    res.redirect("/address");
  } catch (error) {
    console.log(error);
  }
};

const postEditAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    const {
      fullName,
      hoNo,
      street,
      city,
      state,
      pin,
      country,
      phone,
      altPhone,
      isDefault,
    } = req.body;

    const address = await Address.findOne({ _id: addressId });
    if (!address) return res.status(404).send("Address not found");

    if (isDefault) {
      await Address.updateMany(
        { userId: address.userId, isDeleted: false },
        { $set: { isDefault: false } }
      );
    }
    address.fullName = fullName;
    address.hoNo = hoNo;
    address.street = street;
    address.city = city;
    address.state = state;
    address.pin = pin;
    address.country = country;
    address.phone = phone;
    address.altPhone = altPhone;
    address.phone = phone;
    address.isDefault = !!isDefault;

    await address.save();

    res.redirect("/address");
  } catch (error) {
    console.log(error);
  }
};

const postsetDefaultAdress = async (req, res) => {
  try {
    const addressId = req.body.addressId;

    const address = await Address.findOne({ _id: addressId });
    if (!address) return res.status(404).send("Address not found");

    await Address.updateMany(
      { userId: address.userId, isDeleted: false },
      { $set: { isDefault: false } }
    );

    address.isDefault = true;
    await address.save();
    res.redirect("/address");
  } catch (error) {
    console.error(error);
  }
};
const postDeletetAdress = async (req, res) => {
  try {
    const addressId = req.params.id;

    const address = await Address.findOne({ _id: addressId });
    if (!address) return res.status(404).send("Address not found");

    address.isDeleted = true;
    await address.save();
    res.redirect("/address");
  } catch (error) {
    console.error(error);
  }
};
const getOrders = async (req, res) => {
  try {
    const userEmail = req.session.user;
    if (!userEmail) {
      return res.redirect('/login');
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.redirect('/login');
    }

    // Pagination
    let page = parseInt(req.query.page) || 1;
    if (page < 1) page = 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const totalOrders = await Order.countDocuments({ userId: user._id });
    const totalPages = Math.ceil(totalOrders / limit);

    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }

    const orders = await Order.find({ userId: user._id })
      .sort({ placedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();  // Faster reads

    // Pass raw orders (handle formatting in EJS)
    res.render('user/profile/orders', {
      orders: orders || [],  // Ensure array
      totalPages,
      currentPage: page,
      pages
    });
  } catch (error) {
    console.error('Error fetching order history:', error);
    res.status(500).send('Internal Server Error');
  }
};


const userlogOut = (req, res) => {
  try {
    delete req.session.user;
    return res.redirect("/");
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal server error");
  }
};

export {
  getProfile,
  postProfile,
  getAddress,
  postAddAddress,
  postEditAddress,
  postsetDefaultAdress,
  postDeletetAdress,
  getOrders,
  userlogOut,
};
